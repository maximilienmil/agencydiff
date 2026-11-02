import { mkdir, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import type { Action, Observation, TagBox } from "@agencydiff/core";

/**
 * Adb-backed probe environment for native Android builds of Circle.
 *
 * It mirrors the observable surface of BrowserEnv (screenshot, observe,
 * state, execute, close) so the Muse computer-use driver works unchanged:
 * the driver only ever calls execute() and observe(). ScriptedDriver is the
 * exception: it reaches into `env.page`, which has no mobile equivalent, so
 * scripted reference paths stay web-only until a tag-tap helper exists.
 *
 * The target app exposes the same `data-agency` semantics as accessibility
 * identifiers (content-description, falling back to resource-id) and serves
 * its oracle state on a local HTTP endpoint the runner forwards with
 * `adb forward` (see docs/mobile.md).
 *
 * Every adb call goes through an injectable runner, so the mapping and the
 * parsers are unit-testable with no device attached.
 */
export type AdbRunner = (args: string[]) => Promise<Buffer>;

export interface MobileEnvOptions {
  /** Device serial for `adb -s`. Defaults to the single attached device. */
  serial?: string;
  /** Local HTTP state endpoint of the target app, e.g. http://127.0.0.1:8081/state. */
  stateUrl?: string;
  /** Screenshot pixels; tags outside are marked out of viewport. */
  displaySize?: { width: number; height: number };
  run?: AdbRunner;
}

const defaultRunner = (serial?: string): AdbRunner => adbRunner(serial);

/** Serial-scoped adb runner shared by MobileEnv and the probe launcher. */
export function adbRunner(serial?: string): AdbRunner {
  return (args) =>
    new Promise<Buffer>((resolve, reject) => {
      execFile("adb", serial ? ["-s", serial, ...args] : args, { maxBuffer: 64 * 1024 * 1024, encoding: "buffer" }, (err, stdout) => {
        if (err) reject(err);
        else resolve(stdout);
      });
    });
}

export const ANDROID_PACKAGE = "com.circle";
export const ANDROID_STATE_PORT = 8081;

/** Decision under test to the activity that hosts it in the native build. */
export function androidActivityFor(decision: string): string {
  if (decision === "precise_location") return `${ANDROID_PACKAGE}/.LocationActivity`;
  if (decision === "subscription") return `${ANDROID_PACKAGE}/.SubActivity`;
  throw new Error(`no Android activity for decision "${decision}" (see apps/circle-android)`);
}

/** Forward the app's loopback state endpoint so MobileEnv.state() can read it. */
export async function ensureStateForward(run: AdbRunner, port = ANDROID_STATE_PORT): Promise<void> {
  await run(["forward", `tcp:${port}`, `tcp:${port}`]);
}

/** Reset the app to a fixture and bring the decision screen to the front. */
export async function launchAndroidApp(
  run: AdbRunner,
  opts: { activity: string; variant: string; fixture?: string },
): Promise<void> {
  await run(["shell", "am", "force-stop", ANDROID_PACKAGE]);
  const args = ["shell", "am", "start", "-n", opts.activity, "--es", "variant", opts.variant];
  if (opts.fixture) args.push("--es", "fixture", opts.fixture);
  await run(args);
  // Cold start plus activity launch; the first screenshot must show the app.
  await new Promise((r) => setTimeout(r, 2500));
}

export class MobileEnv {
  readonly platform = "android" as const;
  private shot = 0;

  private constructor(
    private run: AdbRunner,
    private serial: string | undefined,
    private outDir: string,
    private stateUrl: string | undefined,
    private displaySize: { width: number; height: number },
  ) {}

  static async open(outDir: string, opts?: MobileEnvOptions): Promise<MobileEnv> {
    await mkdir(outDir, { recursive: true });
    return new MobileEnv(
      opts?.run ?? defaultRunner(opts?.serial),
      opts?.serial,
      outDir,
      opts?.stateUrl,
      opts?.displaySize ?? { width: 1080, height: 2400 },
    );
  }

  /** Audit mode needs an accessibility-tree refusal guard that does not exist
   *  yet; fail loudly rather than run unguarded. */
  static async openAudit(): Promise<never> {
    throw new Error("MobileEnv does not support audit mode yet (see docs/mobile.md)");
  }

  async close(): Promise<void> {}

  async screenshot(): Promise<{ png: Buffer; file: string }> {
    const file = `${String(this.shot++).padStart(3, "0")}.png`;
    const png = await this.run(["exec-out", "screencap", "-p"]);
    await writeFile(path.join(this.outDir, file), png);
    return { png, file };
  }

  async observe(): Promise<{ observation: Observation; png: Buffer }> {
    const [{ png, file }, screen, tags] = await Promise.all([
      this.screenshot(),
      this.currentScreen(),
      this.collectTags(),
    ]);
    const observation: Observation = { url: `adb://${this.serial ?? "device"}/${screen ?? "unknown"}`, screen, tags, screenshot: file };
    return { observation, png };
  }

  /** App state through the target's local HTTP hook; undefined for
   *  black-box targets with no stateUrl, mirroring BrowserEnv. The emulator
   *  sometimes stalls a connection under load, so read with a timeout and
   *  retry instead of hanging the whole run on one oracle read. */
  async state(): Promise<Record<string, unknown> | undefined> {
    if (!this.stateUrl) return undefined;
    let lastError = "";
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 1000 * attempt));
      try {
        const res = await fetch(this.stateUrl, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) throw new Error(`mobile state endpoint ${res.status}: ${this.stateUrl}`);
        return (await res.json()) as Record<string, unknown>;
      } catch (e) {
        lastError = String(e);
      }
    }
    throw new Error(`mobile state endpoint unreachable: ${this.stateUrl} (${lastError})`);
  }

  async execute(actions: Action[]): Promise<void> {
    for (const a of actions) {
      switch (a.type) {
        case "click":
          await this.run(["shell", "input", "tap", String(Math.round(a.x)), String(Math.round(a.y))]);
          break;
        case "double_click":
          await this.run(["shell", "input", "tap", String(Math.round(a.x)), String(Math.round(a.y))]);
          await this.run(["shell", "input", "tap", String(Math.round(a.x)), String(Math.round(a.y))]);
          break;
        case "move":
          // No hover on a touchscreen; the agent already sees the screen.
          break;
        case "drag": {
          if (!a.path.length) break;
          const first = a.path[0];
          const last = a.path[a.path.length - 1];
          const duration = Math.min(100 + 60 * a.path.length, 1000);
          await this.run([
            "shell", "input", "swipe",
            String(Math.round(first.x)), String(Math.round(first.y)),
            String(Math.round(last.x)), String(Math.round(last.y)),
            String(duration),
          ]);
          break;
        }
        case "scroll": {
          // Wheel deltas become a finger swipe in the opposite direction:
          // scrolling down means the finger moves up.
          const dx = clamp(Math.round(-a.scroll_x), -1000, 1000);
          const dy = clamp(Math.round(-a.scroll_y), -1000, 1000);
          const len = Math.hypot(dx, dy);
          if (len < 20) break;
          const scale = Math.min(Math.max(len, 200), 800) / len;
          await this.run([
            "shell", "input", "swipe",
            String(Math.round(a.x)), String(Math.round(a.y)),
            String(Math.round(a.x + dx * scale)), String(Math.round(a.y + dy * scale)),
            "300",
          ]);
          break;
        }
        case "type":
          await this.run(["shell", "input", "text", escapeAdbText(a.text)]);
          break;
        case "keypress":
          for (const code of keyEvents(a.keys)) {
            await this.run(["shell", "input", "keyevent", String(code)]);
          }
          break;
        case "wait":
          await new Promise((r) => setTimeout(r, 1000));
          break;
        case "screenshot":
          break;
      }
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  private async currentScreen(): Promise<string | undefined> {
    const out = (await this.run(["shell", "dumpsys", "activity", "activities"])).toString("utf8");
    return parseTopActivity(out);
  }

  private async collectTags(): Promise<TagBox[]> {
    const out = (await this.run(["shell", "uiautomator dump /sdcard/window_dump.xml >/dev/null; cat /sdcard/window_dump.xml"])).toString("utf8");
    return parseUiDump(out, this.displaySize);
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** `adb shell input text` takes %s for spaces; wrap the payload in single
 *  quotes so shell metacharacters survive. Newlines are not supported by
 *  `input text` at all: send them as Enter keyevents instead. */
export function escapeAdbText(text: string): string {
  return `'${text.replace(/ /g, "%s").replace(/'/g, `'\\''`)}'`;
}

const KEY_EVENTS: Record<string, number> = {
  ENTER: 66,
  RETURN: 66,
  TAB: 61,
  ESC: 111,
  ESCAPE: 111,
  BACKSPACE: 67,
  DELETE: 112,
  UP: 19,
  DOWN: 20,
  LEFT: 21,
  RIGHT: 22,
  HOME: 3,
  END: 123,
  SPACE: 62,
};

export function keyEvents(keys: string[]): number[] {
  return keys.map((k) => KEY_EVENTS[k.toUpperCase()] ?? 66);
}

const BOUNDS_RE = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/;

/**
 * Pull `data-agency`-equivalent tags out of a uiautomator hierarchy dump.
 * A node matches when its content-desc equals the tag, or when the last
 * resource-id segment equals the tag (dots and underscores both accepted).
 * Occlusion is not visible in the dump, so inViewport only means the node's
 * box intersects the screen.
 */
export function parseUiDump(xml: string, display: { width: number; height: number }): TagBox[] {
  const tags: TagBox[] = [];
  for (const [, attrs] of xml.matchAll(/<node\b([^>]*)\/?>/g)) {
    const attr = (name: string): string => attrs.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? "";
    const bounds = attr("bounds").match(BOUNDS_RE);
    if (!bounds) continue;
    const x1 = Number(bounds[1]);
    const y1 = Number(bounds[2]);
    const x2 = Number(bounds[3]);
    const y2 = Number(bounds[4]);
    const tag = matchAgencyTag(attr("content-desc"), attr("resource-id"));
    if (!tag) continue;
    const box: [number, number, number, number] = [x1, y1, x2 - x1, y2 - y1];
    const inViewport =
      x2 > 0 && y2 > 0 && x1 < display.width && y1 < display.height && x2 - x1 > 0 && y2 - y1 > 0;
    tags.push({ tag, box, inViewport });
  }
  return tags;
}

function matchAgencyTag(contentDesc: string, resourceId: string): string | undefined {
  if (contentDesc) return contentDesc;
  const segment = resourceId.split("/").pop() ?? "";
  if (!segment) return undefined;
  // aapt lowercases resource names and forbids dots, so accept both spellings.
  if (/^[a-z0-9_.]+$/.test(segment)) return segment.replace(/_/g, ".");
  return undefined;
}

const RESUMED_RE = /mResumedActivity[^\n]*?ActivityRecord\{([^}]*)\}/;
const FOCUS_RE = /mCurrentFocus=Window\{([^}]*)\}/;

/** Last `package/Class` token inside the record, e.g. `com.circle/.LocationActivity`. */
function lastComponentToken(segment: string): string | undefined {
  return segment.split(/\s+/).filter((t) => t.includes("/")).pop();
}

/** Top activity's short component (`location`), else the focused window. */
export function parseTopActivity(dumpsys: string): string | undefined {
  const resumed = dumpsys.match(RESUMED_RE)?.[1];
  const resumedToken = resumed && lastComponentToken(resumed);
  if (resumedToken) return shortComponent(resumedToken);
  const focus = dumpsys.match(FOCUS_RE)?.[1];
  const focusToken = focus && lastComponentToken(focus);
  if (focusToken) return shortComponent(focusToken);
  return undefined;
}

function shortComponent(component: string): string | undefined {
  const afterSlash = component.split("/").pop() ?? component;
  const className = afterSlash.replace(/^\./, "").split(".").pop() ?? afterSlash;
  return className.replace(/Activity$/, "").toLowerCase() || undefined;
}

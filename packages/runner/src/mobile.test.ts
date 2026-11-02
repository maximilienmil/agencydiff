import { createServer } from "node:http";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  escapeAdbText,
  keyEvents,
  MobileEnv,
  parseTopActivity,
  parseUiDump,
  type AdbRunner,
} from "./mobile";

const DISPLAY = { width: 1080, height: 2400 };

const DUMP = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
<hierarchy rotation="0">
<node index="0" text="" resource-id="" class="android.widget.FrameLayout" package="com.circle" content-desc="" bounds="[0,0][1080,2400]">
<node index="1" text="Precise location" resource-id="com.circle:id/location_toggle" class="android.widget.Switch" package="com.circle" content-desc="location.toggle" bounds="[900,400][1000,460]" />
<node index="2" text="Settings" resource-id="" class="android.widget.TextView" package="com.circle" content-desc="nav.settings" bounds="[980,100][1060,180]" />
<node index="3" text="Off screen" resource-id="com.circle:id/never_seen" class="android.widget.TextView" package="com.circle" content-desc="" bounds="[0,2500][1080,2600]" />
<node index="4" text="Decor" class="android.widget.View" package="com.circle" content-desc="" bounds="[0,0][1080,100]" />
</node></hierarchy>`;

describe("parseUiDump", () => {
  it("reads content-desc tags with viewport boxes", () => {
    const tags = parseUiDump(DUMP, DISPLAY);
    expect(tags).toEqual([
      { tag: "location.toggle", box: [900, 400, 100, 60], inViewport: true },
      { tag: "nav.settings", box: [980, 100, 80, 80], inViewport: true },
      { tag: "never.seen", box: [0, 2500, 1080, 100], inViewport: false },
    ]);
  });

  it("falls back to resource-id with underscores for dots", () => {
    const xml = `<node content-desc="" resource-id="com.circle:id/settings_location" bounds="[0,0][100,100]" />`;
    expect(parseUiDump(xml, DISPLAY)).toEqual([
      { tag: "settings.location", box: [0, 0, 100, 100], inViewport: true },
    ]);
  });

  it("ignores nodes with no tag and no usable id", () => {
    const xml = `<node text="Decor" bounds="[0,0][10,10]" />`;
    expect(parseUiDump(xml, DISPLAY)).toEqual([]);
  });
});

describe("parseTopActivity", () => {
  it("prefers the resumed activity and shortens it", () => {
    const out = `mResumedActivity: ActivityRecord{abc u0 com.circle/.LocationActivity t1}`;
    expect(parseTopActivity(out)).toBe("location");
  });

  it("falls back to the focused window", () => {
    const out = `mCurrentFocus=Window{def u0 com.circle/com.circle.SettingsActivity}`;
    expect(parseTopActivity(out)).toBe("settings");
  });

  it("returns undefined when nothing matches", () => {
    expect(parseTopActivity("no activities here")).toBeUndefined();
  });
});

describe("escapeAdbText", () => {
  it("encodes spaces as %s and quotes safely", () => {
    expect(escapeAdbText("hello world")).toBe("'hello%sworld'");
    expect(escapeAdbText("don't")).toBe("'don'\\''t'");
  });
});

describe("keyEvents", () => {
  it("maps common keys and defaults unknown chords to Enter", () => {
    expect(keyEvents(["Enter"])).toEqual([66]);
    expect(keyEvents(["BACKSPACE", "up"])).toEqual([67, 19]);
    expect(keyEvents(["Control+c"])).toEqual([66]);
  });
});

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

function fakeRunner(log: string[][], dumps: Record<string, Buffer> = {}): AdbRunner {
  return async (args) => {
    log.push(args);
    if (args.includes("screencap")) return PNG;
    if (args.some((a) => a.includes("uiautomator"))) return Buffer.from(DUMP);
    if (args.includes("dumpsys")) {
      return Buffer.from("mResumedActivity: ActivityRecord{abc u0 com.circle/.LocationActivity t1}");
    }
    return dumps[args.join(" ")] ?? Buffer.from("");
  };
}

async function openEnv(log: string[][], opts?: { stateUrl?: string }): Promise<{ env: MobileEnv; dir: string }> {
  const dir = await mkdtemp(path.join(tmpdir(), "mobile-env-"));
  const env = await MobileEnv.open(dir, { run: fakeRunner(log), displaySize: DISPLAY, ...opts });
  return { env, dir };
}

describe("MobileEnv", () => {
  it("screenshots to numbered files and observes tags plus screen", async () => {
    const log: string[][] = [];
    const { env, dir } = await openEnv(log);
    const { observation, png } = await env.observe();
    expect(png).toBe(PNG);
    expect(observation.screenshot).toBe("000.png");
    expect(observation.screen).toBe("location");
    expect(observation.tags.map((t) => t.tag)).toEqual(["location.toggle", "nav.settings", "never.seen"]);
    expect(await readFile(path.join(dir, "000.png"))).toEqual(PNG);
    expect((await readdir(dir)).sort()).toEqual(["000.png"]);
    await env.close();
  });

  it("maps actions onto adb input commands", async () => {
    const log: string[][] = [];
    const { env } = await openEnv(log);
    await env.execute([
      { type: "click", x: 950, y: 430 },
      { type: "type", text: "hi there" },
      { type: "keypress", keys: ["Enter"] },
      { type: "scroll", x: 540, y: 1200, scroll_x: 0, scroll_y: 400 },
      { type: "drag", path: [{ x: 100, y: 100 }, { x: 100, y: 900 }] },
      { type: "wait" },
      { type: "move", x: 1, y: 1 },
      { type: "screenshot" },
    ]);
    const shells = log.filter((a) => a[0] === "shell").map((a) => a.slice(1).join(" "));
    expect(shells).toEqual([
      "input tap 950 430",
      "input text 'hi%sthere'",
      "input keyevent 66",
      "input swipe 540 1200 540 800 300",
      "input swipe 100 100 100 900 220",
    ]);
  });

  it("double-click sends two taps", async () => {
    const log: string[][] = [];
    const { env } = await openEnv(log);
    await env.execute([{ type: "double_click", x: 10, y: 20 }]);
    expect(log.filter((a) => a.includes("tap"))).toHaveLength(2);
  });

  it("reads oracle state from the app endpoint, undefined when black-box", async () => {
    const server = createServer((req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ "location.precise": true }));
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as { port: number }).port;
    try {
      const log: string[][] = [];
      const { env } = await openEnv(log, { stateUrl: `http://127.0.0.1:${port}/state` });
      expect(await env.state()).toEqual({ "location.precise": true });
      const { env: blackBox } = await openEnv(log);
      expect(await blackBox.state()).toBeUndefined();
    } finally {
      server.close();
    }
  });

  it("refuses audit mode instead of running unguarded", async () => {
    await expect(MobileEnv.openAudit()).rejects.toThrow(/audit/i);
  });
});

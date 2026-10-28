import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import type { Action, Observation, TagBox } from "@agencydiff/core";

export const VIEWPORT = { width: 430, height: 860 };

/**
 * One fresh browser context per probe, so every run starts from identical state.
 * Instrumentation (tags, screen, app state) is read here and never shown to the agent.
 */
export class BrowserEnv {
  private shot = 0;

  private constructor(
    private browser: Browser,
    readonly page: Page,
    private outDir: string,
  ) {}

  static async open(url: string, outDir: string): Promise<BrowserEnv> {
    await mkdir(outDir, { recursive: true });
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "networkidle" });
    return new BrowserEnv(browser, page, outDir);
  }

  async close() {
    await this.browser.close();
  }

  async screenshot(): Promise<{ png: Buffer; file: string }> {
    const file = `${String(this.shot++).padStart(3, "0")}.png`;
    const png = await this.page.screenshot({ path: path.join(this.outDir, file) });
    return { png, file };
  }

  async observe(): Promise<{ observation: Observation; png: Buffer }> {
    const { png, file } = await this.screenshot();
    const { screen, tags } = await this.page.evaluate(() => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const tags = [...document.querySelectorAll<HTMLElement>("[data-agency]")].map((el) => {
        const r = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        const shown = r.width > 0 && r.height > 0 && style.visibility !== "hidden";
        // Topmost check: covered by a modal scrim means not actually visible.
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const top = shown && cx >= 0 && cy >= 0 && cx < vw && cy < vh ? document.elementFromPoint(cx, cy) : null;
        const onTop = !!top && (el === top || el.contains(top) || top.contains(el));
        return {
          tag: el.dataset.agency!,
          box: [r.left, r.top, r.width, r.height] as [number, number, number, number],
          inViewport: onTop,
        };
      });
      const screen = document.querySelector<HTMLElement>("[data-screen]")?.dataset.screen;
      return { screen, tags };
    });
    return {
      observation: { url: this.page.url(), screen, tags: tags as TagBox[], screenshot: file },
      png,
    };
  }

  /** App state through Circle's test hook; undefined for black-box targets. */
  async state(): Promise<Record<string, unknown> | undefined> {
    return this.page.evaluate(() => window.__circle?.state());
  }

  async execute(actions: Action[]): Promise<void> {
    const m = this.page.mouse;
    const k = this.page.keyboard;
    for (const a of actions) {
      switch (a.type) {
        case "click":
          await m.click(a.x, a.y, { button: a.button === "right" ? "right" : a.button === "wheel" ? "middle" : "left" });
          break;
        case "double_click":
          await m.dblclick(a.x, a.y);
          break;
        case "move":
          await m.move(a.x, a.y);
          break;
        case "drag":
          if (!a.path.length) break;
          await m.move(a.path[0].x, a.path[0].y);
          await m.down();
          for (const p of a.path.slice(1)) await m.move(p.x, p.y);
          await m.up();
          break;
        case "scroll":
          await m.move(a.x, a.y);
          await m.wheel(a.scroll_x, a.scroll_y);
          break;
        case "type":
          await k.type(a.text);
          break;
        case "keypress":
          await k.press(a.keys.map(normalizeKey).join("+"));
          break;
        case "wait":
          await this.page.waitForTimeout(1000);
          break;
        case "screenshot":
          break;
      }
    }
    await this.page.waitForTimeout(250);
  }
}

const KEY_NAMES: Record<string, string> = {
  ENTER: "Enter",
  RETURN: "Enter",
  ESC: "Escape",
  ESCAPE: "Escape",
  CTRL: "Control",
  CONTROL: "Control",
  CMD: "Meta",
  META: "Meta",
  ALT: "Alt",
  SHIFT: "Shift",
  TAB: "Tab",
  SPACE: "Space",
  BACKSPACE: "Backspace",
  UP: "ArrowUp",
  DOWN: "ArrowDown",
  LEFT: "ArrowLeft",
  RIGHT: "ArrowRight",
};

function normalizeKey(key: string): string {
  return KEY_NAMES[key.toUpperCase()] ?? key;
}

declare global {
  interface Window {
    __circle?: { state: () => Record<string, unknown> };
  }
}

import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import type { Action, DomElementFact, Observation, TagBox } from "@agencydiff/core";
import {
  isBlockedAuditClick,
  isBlockedAuditKeypress,
  isBlockedAuditType,
  isBlockedNavigationUrl,
  type AuditElementInfo,
  type AuditSubmitContext,
} from "./auditGuard.js";

export const VIEWPORT = { width: 430, height: 860 };

/** Thrown when Audit mode refuses an action before it touches the page. */
export class AuditBlockedError extends Error {
  constructor(reason: string) {
    super(`audit-blocked: ${reason}`);
  }
}

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
    readonly audit = false,
  ) {}

  static async open(url: string, outDir: string, opts?: { audit?: boolean }): Promise<BrowserEnv> {
    await mkdir(outDir, { recursive: true });
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const env = new BrowserEnv(browser, page, outDir, opts?.audit ?? false);
    if (env.audit) {
      // Purchase-flow navigation never leaves the lab: abort it at the
      // network layer as well as refusing the triggering action.
      await ctx.route("**/*", (route) => {
        if (route.request().isNavigationRequest() && isBlockedNavigationUrl(route.request().url())) {
          return route.abort();
        }
        return route.continue();
      });
    }
    await page.goto(url, { waitUntil: "networkidle" });
    return env;
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

  /** Facts for `domOracle` assertions, read from the live page. */
  async collectDomFacts(selectors: string[]): Promise<DomElementFact[]> {
    // No nested named functions in this callback: the tsx loader wraps them
    // in a __name helper that does not exist in the browser, so Playwright's
    // serialization of the callback would throw on arrival.
    return this.page.evaluate((sels) => {
      return sels.map((selector) => {
        let el: Element | null = null;
        try {
          el = document.querySelector(selector);
        } catch {
          el = null;
        }
        if (!el) return { selector, exists: false, visible: false, text: "" };
        const r = el.getBoundingClientRect();
        let shown = r.width > 0 && r.height > 0;
        if (shown) {
          const style = getComputedStyle(el);
          shown = style.visibility !== "hidden" && style.display !== "none";
        }
        let onTop = false;
        if (shown) {
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          const top = document.elementFromPoint(cx, cy);
          onTop = !!top && (el === top || el.contains(top) || top.contains(el));
        }
        const input = el as HTMLInputElement;
        return {
          selector,
          exists: true,
          visible: onTop,
          text: el.textContent ?? "",
          checked: "checked" in input ? !!input.checked : undefined,
          value: "value" in input ? String(input.value) : undefined,
        };
      });
    }, selectors);
  }

  private async describeAuditElement(x: number, y: number): Promise<AuditElementInfo> {
    return this.page.evaluate(({ px, py }) => {
      const el = document.elementFromPoint(px, py) as HTMLElement | null;
      const input = (el?.closest("input, select, textarea, button, a, [role=button]") ?? el) as
        | (HTMLElement & { type?: string; href?: string })
        | null;
      const tag = (input?.tagName ?? "").toLowerCase();
      const type = (input?.type ?? (input?.getAttribute?.("type") ?? undefined) ?? undefined)?.toLowerCase();
      const isSubmitControl =
        !!input &&
        ((tag === "button" && (!input.getAttribute("type") || type === "submit")) ||
          (tag === "input" && (type === "submit" || type === "image")));
      const isPasswordField = tag === "input" && type === "password";
      const form = input?.closest("form");
      const sensitive = /\b(user-?name|login|email|e-?mail|passwd|pass-?word|tel|phone|mobile|address|street|city|zip|postal|ssn|social|dob|birth-?day|card|cvv|cvc|account)\b/;
      const fields = form ? [...form.querySelectorAll("input, select, textarea")] : [];
      return {
        tag,
        type,
        role: input?.getAttribute?.("role") ?? undefined,
        href: input?.href ?? input?.getAttribute?.("href") ?? undefined,
        text: (input?.innerText ?? input?.textContent ?? "").slice(0, 120),
        inForm: !!form,
        inputType: (input as HTMLInputElement | null)?.type ?? type,
        formMethod: form?.getAttribute("method") ?? undefined,
        formRole: input?.closest('[role="search"]') ? "search" : (form?.getAttribute("role") ?? undefined),
        formHasSearchField: fields.some((f) => (f as HTMLInputElement).type === "search"),
        formHasSensitiveField: fields.some((f) => {
          const t = ((f as HTMLInputElement).type ?? "").toLowerCase();
          if (t === "password" || t === "email" || t === "tel") return true;
          return sensitive.test(
            `${(f as HTMLInputElement).name ?? ""} ${f.getAttribute("autocomplete") ?? ""}`.toLowerCase(),
          );
        }),
        isPasswordField,
        isSubmitControl,
        pageHasPasswordField: !!document.querySelector('input[type="password"]'),
      };
    }, { px: x, py: y });
  }

  private async describeAuditFocus(): Promise<
    { type?: string; name?: string; autocomplete?: string } & AuditSubmitContext
  > {
    return this.page.evaluate(() => {
      const el = document.activeElement as (HTMLElement & { type?: string; name?: string }) | null;
      const form = el?.closest?.("form") ?? null;
      const sensitive = /\b(user-?name|login|email|e-?mail|passwd|pass-?word|tel|phone|mobile|address|street|city|zip|postal|ssn|social|dob|birth-?day|card|cvv|cvc|account)\b/;
      const fields = form ? [...form.querySelectorAll("input, select, textarea")] : [];
      return {
        type: el?.type ?? el?.tagName.toLowerCase(),
        name: el?.name ?? el?.getAttribute?.("name") ?? undefined,
        autocomplete: el?.getAttribute?.("autocomplete") ?? undefined,
        inForm: !!form,
        inputType: (el as HTMLInputElement | null)?.type ?? el?.tagName.toLowerCase(),
        formMethod: form?.getAttribute("method") ?? undefined,
        formRole: el?.closest?.('[role="search"]') ? "search" : (form?.getAttribute("role") ?? undefined),
        formHasSearchField: fields.some((f) => (f as HTMLInputElement).type === "search"),
        formHasSensitiveField: fields.some((f) => {
          const t = ((f as HTMLInputElement).type ?? "").toLowerCase();
          if (t === "password" || t === "email" || t === "tel") return true;
          return sensitive.test(
            `${(f as HTMLInputElement).name ?? ""} ${f.getAttribute("autocomplete") ?? ""}`.toLowerCase(),
          );
        }),
      };
    });
  }

  private async refuseUnsafe(actions: Action[]): Promise<void> {
    for (const a of actions) {
      switch (a.type) {
        case "click":
        case "double_click": {
          const info = await this.describeAuditElement(a.x, a.y);
          if (isBlockedAuditClick(info)) {
            throw new AuditBlockedError(`refusing ${a.type} at ${a.x},${a.y} (${info.tag || "unknown element"})`);
          }
          break;
        }
        case "type": {
          const focus = await this.describeAuditFocus();
          const pageHasPassword = await this.page.evaluate(
            () => !!document.querySelector('input[type="password"]'),
          );
          if (isBlockedAuditType(focus, pageHasPassword)) {
            throw new AuditBlockedError("refusing to type into a credential field");
          }
          break;
        }
        case "keypress": {
          if (isBlockedAuditKeypress(a.keys, await this.describeAuditFocus())) {
            throw new AuditBlockedError("refusing Enter outside site search: it would submit the focused form");
          }
          break;
        }
        default:
          break;
      }
    }
  }

  async execute(actions: Action[]): Promise<void> {
    if (this.audit) await this.refuseUnsafe(actions);
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
    if (this.audit && isBlockedNavigationUrl(this.page.url())) {
      throw new AuditBlockedError(`refusing to stay on a purchase-flow page: ${this.page.url()}`);
    }
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

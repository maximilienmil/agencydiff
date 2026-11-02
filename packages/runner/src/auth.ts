import { existsSync } from "node:fs";
import path from "node:path";
import type { Page } from "playwright";
import type { AuthConfig } from "@agencydiff/core";

/** Test-account credentials read from the environment. The values are
 *  returned for Playwright to type, never placed in a model prompt. */
export interface ScriptedCreds {
  username: string;
  password: string;
}

/** Read scripted login credentials from env vars. Throws naming the
 *  missing variable (never a secret value) so a misconfigured run fails
 *  before the browser opens. */
export function readCredsFromEnv(auth: Pick<AuthConfig, "usernameEnv" | "passwordEnv">): ScriptedCreds {
  const username = auth.usernameEnv ? process.env[auth.usernameEnv] : undefined;
  const password = auth.passwordEnv ? process.env[auth.passwordEnv] : undefined;
  if (!auth.usernameEnv || !username) throw new Error(`auth: missing username (env ${auth.usernameEnv ?? "unset"})`);
  if (!auth.passwordEnv || !password) throw new Error(`auth: missing password (env ${auth.passwordEnv ?? "unset"})`);
  return { username, password };
}

/** Resolve the target's storageState path against the target file's
 *  directory. Undefined when the target declares no storageState. */
export function resolveStorageState(targetFile: string, auth: Pick<AuthConfig, "storageState">): string | undefined {
  if (!auth.storageState) return undefined;
  return path.resolve(path.dirname(targetFile), auth.storageState);
}

/** Throw before the browser opens when the declared session file is absent,
 *  so a stale path fails loudly instead of probing logged-out. */
export function assertStorageStateFile(file: string): void {
  if (!existsSync(file)) throw new Error(`auth: storageState file not found: ${file}`);
}

/** Fill a login form with scripted credentials and submit it, with no model
 *  involved. Uses the first username-like and password fields on the page. */
export async function fillLoginFromEnv(
  page: Page,
  auth: Pick<AuthConfig, "usernameEnv" | "passwordEnv">,
): Promise<void> {
  const { username, password } = readCredsFromEnv(auth);
  const user = page.locator(
    'input[autocomplete="username"], input[name="username"], input[name="email"], input[type="email"], input[type="text"]',
  );
  const pass = page.locator('input[type="password"]');
  if ((await user.count()) === 0 || (await pass.count()) === 0) {
    throw new Error("auth: no login form on this page (need a username and a password field)");
  }
  await user.first().fill(username);
  await pass.first().fill(password);
  const submit = page.locator('button[type="submit"], input[type="submit"]');
  if ((await submit.count()) > 0) {
    await submit.first().click();
  } else {
    await pass.first().press("Enter");
  }
  await page.waitForTimeout(500);
}

const MASK_ATTR = "data-agencydiff-mask";

/** Cover password fields with opaque overlays so their values never reach a
 *  screenshot (and therefore never reach the model). Values are untouched:
 *  the returned cleanup removes the overlays. */
export async function maskSecrets(page: Page): Promise<() => Promise<void>> {
  await page.evaluate((attr) => {
    for (const input of document.querySelectorAll('input[type="password"]')) {
      const r = (input as HTMLElement).getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const cover = document.createElement("div");
      cover.setAttribute(attr, "true");
      cover.style.position = "fixed";
      cover.style.left = `${r.left}px`;
      cover.style.top = `${r.top}px`;
      cover.style.width = `${r.width}px`;
      cover.style.height = `${r.height}px`;
      cover.style.background = "#000";
      cover.style.zIndex = "2147483647";
      document.body.appendChild(cover);
    }
  }, MASK_ATTR);
  return () =>
    page.evaluate((attr) => {
      for (const el of document.querySelectorAll(`[${attr}]`)) el.remove();
    }, MASK_ATTR);
}

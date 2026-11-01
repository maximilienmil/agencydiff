import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright";
import { describe, expect, it } from "vitest";

const run = promisify(execFile);

// The repo's CLIs execute through tsx, whose transform appends a
// module-scope naming helper to named functions. Anything Playwright
// serializes into the page must not reference that helper, or every probe
// dies with "ReferenceError: __name is not defined". An in-process test
// cannot catch this: vitest transforms with different settings. So this
// test replays the true production chain: tsx-compiled runner code driving
// a real browser.
const TSX = path.join(import.meta.dirname, "..", "node_modules", ".bin", "tsx");
const executable = (() => {
  try {
    return chromium.executablePath();
  } catch {
    return "";
  }
})();
const enabled = existsSync(TSX) && !!executable && existsSync(executable);

describe.runIf(enabled)("page-evaluated closures (tsx-compiled)", () => {
  it("collectDomFacts survives serialization into the page", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "agencydiff-dom-"));
    const script = path.join(dir, "probe.mjs");
    writeFileSync(
      script,
      [
        `import { BrowserEnv } from ${JSON.stringify(path.join(import.meta.dirname, "..", "src", "env.js"))};`,
        `const env = await BrowserEnv.open("data:text/html,<button id='a'>Buy</button>", ${JSON.stringify(dir)});`,
        `const facts = await env.collectDomFacts(["#a", "#missing"]);`,
        "console.log(JSON.stringify(facts));",
        "await env.close();",
      ].join("\n"),
    );
    const { stdout } = await run(TSX, [script], { timeout: 120_000 });
    const facts = JSON.parse(stdout.trim().split("\n").pop() as string) as {
      selector: string;
      exists: boolean;
      visible: boolean;
      text: string;
    }[];
    expect(facts.find((f) => f.selector === "#a")).toMatchObject({
      exists: true,
      visible: true,
      text: "Buy",
    });
    expect(facts.find((f) => f.selector === "#missing")).toMatchObject({ exists: false });
  }, 120_000);
});

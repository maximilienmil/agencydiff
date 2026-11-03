import { describe, expect, it } from "vitest";
import { isInitEntry, isInitMain } from "./init.js";

describe("isInitEntry", () => {
  it("is false when imported rather than invoked (vitest)", () => {
    expect(isInitMain).toBe(false);
  });

  it("rejects the bundled CLI case where argv equals the bundle path", () => {
    expect(isInitEntry("/app/packages/cli/dist/cli.js", "/app/packages/cli/dist/cli.js")).toBe(false);
  });

  it("accepts direct invocation of the source module", () => {
    expect(isInitEntry("/app/packages/runner/src/init.ts", "/app/packages/runner/src/init.ts")).toBe(true);
  });

  it("rejects other entry files", () => {
    expect(isInitEntry("/app/packages/cli/src/cli.ts", "/app/packages/runner/src/init.ts")).toBe(false);
    expect(isInitEntry(undefined, "/app/packages/runner/src/init.ts")).toBe(false);
  });
});

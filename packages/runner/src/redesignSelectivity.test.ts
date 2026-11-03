import { describe, expect, it } from "vitest";
import { selectivityVerdict } from "./redesignSelectivity.js";

describe("selectivityVerdict", () => {
  it("passes innocent variants the gate passes", () => {
    expect(
      selectivityVerdict({ innocent: true, gateFailed: false, semantic: "PRESERVED" }),
    ).toBe("TRUE-PASS");
  });

  it("false-blocks innocent variants the gate fails", () => {
    expect(
      selectivityVerdict({ innocent: true, gateFailed: true, semantic: "PRESERVED" }),
    ).toBe("FALSE-BLOCK");
  });

  it("true-blocks harmful variants the gate fails", () => {
    expect(
      selectivityVerdict({ innocent: false, gateFailed: true, semantic: "HARMED-COST" }),
    ).toBe("TRUE-BLOCK");
    expect(
      selectivityVerdict({ innocent: false, gateFailed: true, semantic: "HARMED-UNREACHABLE" }),
    ).toBe("TRUE-BLOCK");
  });

  it("misses harmful variants the gate passes, whatever the harm", () => {
    for (const semantic of [
      "HARMED-COST",
      "HARMED-DEFAULT",
      "HARMED-UNREACHABLE",
      "REVIEW-REQUIRED",
      "PRESERVED",
    ] as const) {
      expect(selectivityVerdict({ innocent: false, gateFailed: false, semantic })).toBe("MISS");
    }
  });
});

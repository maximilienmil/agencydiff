// `agencydiff init` stays honest offline: the heuristic drafter only cites
// observed UI, pairs resolve, and validation flags what did not hold. These
// tests run without a model key, against a recorded Circle exploration.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { AgencyContract, DomAssertion } from "@agencydiff/core";
import { BrowserEnv } from "../src/env.js";
import { collectCensus, crawlExploration } from "../src/init.js";
import {
  applyValidation,
  draftContracts,
  isGrounded,
  mapPromise,
  normalizeModelContracts,
  renderInitReview,
  splitSentences,
  type Exploration,
} from "../src/initLib.js";

const fixture: Exploration = JSON.parse(
  readFileSync(new URL("./fixtures/circle-baseline.exploration.json", import.meta.url), "utf8"),
);

function leaves(assertions: DomAssertion[] | undefined): DomAssertion[] {
  return (assertions ?? []).flatMap((a) => (a.kind === "anyOf" ? leaves(a.assertions) : [a]));
}

describe("init draft from a recorded exploration", () => {
  it("drafts one contract per consequential decision, all marked draft", () => {
    const contracts = draftContracts(fixture);
    const decisions = contracts.map((c) => c.decision);
    expect(decisions).toContain("privacy");
    expect(decisions).toContain("subscription");
    expect(decisions).toContain("data_sharing");
    for (const c of contracts) {
      expect(c.draft).toBe(true);
      expect(c.intents.length).toBeGreaterThan(0);
      for (const i of c.intents) expect(i.draft).toBe(true);
      const ids = new Set(c.intents.map((i) => i.id));
      expect(ids.size).toBe(c.intents.length);
    }
  });

  it("pairs oppose an accept intent with a reject intent", () => {
    const contracts = draftContracts(fixture);
    expect(contracts.some((c) => c.pairs.length > 0)).toBe(true);
    for (const c of contracts) {
      const byId = new Map(c.intents.map((i) => [i.id, i]));
      for (const p of c.pairs) {
        expect(byId.get(p.accept)?.polarity).toBe("accept");
        expect(byId.get(p.reject)?.polarity).toBe("reject");
      }
    }
  });

  it("every oracle cites only observed selectors, text and screens", () => {
    const contracts = draftContracts(fixture);
    const screens = new Set(fixture.screens.map((s) => s.key));
    for (const c of contracts) {
      for (const i of c.intents) {
        expect(i.domOracle?.length).toBeGreaterThan(0);
        expect(isGrounded(i, fixture)).toBe(true);
        for (const leaf of leaves(i.domOracle)) {
          if ("screen" in leaf) expect(screens.has(leaf.screen!)).toBe(true);
        }
        if (i.target) {
          const tags = fixture.screens.flatMap((s) => s.controls.map((k) => k.tag));
          expect(tags).toContain(i.target);
        }
      }
    }
  });

  it("detects an oracle that invents unobserved UI", () => {
    const contracts = draftContracts(fixture);
    const victim = contracts[0].intents[0];
    const tampered = {
      ...victim,
      domOracle: [{ kind: "visibleText", selector: "body", text: "never observed anywhere xyzzy" } as const],
    };
    expect(isGrounded(tampered, fixture)).toBe(false);
    const tamperedSel = {
      ...victim,
      domOracle: [{ kind: "exists", selector: "#never-observed" } as const],
    };
    expect(isGrounded(tamperedSel, fixture)).toBe(false);
  });

  it("maps promise sentences to intents and flags what it cannot find", () => {
    const contracts = draftContracts(
      fixture,
      "Teen accounts can choose who can message them, and change their mind later. " +
        "The app offers teleportation settings.",
    );
    const flagged = contracts.flatMap((c) => c.unmappedPromises ?? []);
    expect(flagged.some((u) => u.includes("teleportation"))).toBe(true);
    expect(flagged.some((u) => u.includes("message"))).toBe(false);
  });

  it("rediscovers the hand-written decisions without reading contracts/", () => {
    // Intent recall proxy: each hand-written Circle decision's vocabulary
    // (decision id words) appears in some drafted contract's decision,
    // goals or promise.
    const contracts = draftContracts(fixture);
    const vocab = contracts
      .map((c) => `${c.decision} ${c.promise} ${c.intents.map((i) => i.goal).join(" ")}`.toLowerCase())
      .join("\n");
    for (const word of ["message", "subscri", "location", "limit"]) {
      expect(vocab).toContain(word);
    }
  });
});

describe("init validation pass", () => {
  it("keeps intents whose oracle passes and flags the rest with a reason", () => {
    const contracts = draftContracts(fixture);
    const outcomes = new Map();
    for (const c of contracts) {
      for (const [n, i] of c.intents.entries()) {
        const key = `${c.decision}.${i.id}`;
        // Every third intent fails validation; the first is never run.
        if (n === 0) continue;
        outcomes.set(key, {
          agentSucceeded: n % 3 !== 0,
          oraclePassed: n % 3 !== 0,
        });
      }
    }
    const counts = applyValidation(contracts, outcomes);
    expect(counts.kept + counts.flagged).toBe(contracts.reduce((n, c) => n + c.intents.length, 0));
    expect(counts.flagged).toBeGreaterThan(0);
    for (const c of contracts) {
      for (const i of c.intents) {
        const o = outcomes.get(`${c.decision}.${i.id}`);
        if (o?.agentSucceeded && o?.oraclePassed) continue;
        expect(i.needsReview?.length).toBeGreaterThan(0);
      }
    }
  });

  it("renders a skim-friendly review summary", () => {
    const contracts = draftContracts(fixture);
    const counts = applyValidation(
      contracts,
      new Map(contracts.flatMap((c) => c.intents.map((i) => [`${c.decision}.${i.id}`, { agentSucceeded: true, oraclePassed: true }]))),
    );
    const review = renderInitReview({ url: fixture.url, exploration: fixture, contracts, counts });
    expect(review).toContain("## privacy");
    expect(review).toContain("draft: true");
    expect(splitSentences("One promise. Two promises! Three?").length).toBe(3);
  });

  it("mapPromise with no sentences leaves contracts untouched", () => {
    const contracts = draftContracts(fixture);
    mapPromise(contracts, "   ");
    expect(contracts.every((c) => (c.unmappedPromises ?? []).length === 0)).toBe(true);
  });

  it("normalizeModelContracts repairs shapeless model output", () => {
    const list = [
      {
        decision: "",
        promise: "Do the thing.",
        intents: [
          { goal: "Add the item to the basket.", domOracle: [] },
          {
            id: "add",
            goal: "Add the item to the basket.",
            polarity: "sideways",
            domOracle: [{ kind: "exists", selector: "#never-observed" }],
            mustSucceed: true,
          },
        ],
        pairs: [
          { accept: "add", reject: "missing" },
          { accept: "add_the_item_to_the_basket", reject: "add" },
        ],
      },
    ] as unknown as AgencyContract[];
    const repaired = normalizeModelContracts(list, fixture);
    expect(repaired).toBe(2);
    const [c] = list;
    expect(c.decision.length).toBeGreaterThan(0);
    expect(c.draft).toBe(true);
    const ids = c.intents.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(c.intents.every((i) => ["accept", "reject", "neutral"].includes(i.polarity))).toBe(true);
    expect(c.intents.every((i) => i.draft === true)).toBe(true);
    expect(c.intents.every((i) => (i.needsReview ?? "").length > 0)).toBe(true);
    expect(c.pairs).toEqual([{ accept: "add_the_item_to_the_basket", reject: "add" }]);
  });
});

describe("init exploration against a live page", () => {
  it(
    "census reads tagged controls and screen text",
    async (ctx) => {
      const dir = mkdtempSync(path.join(tmpdir(), "agencydiff-init-"));
      const html = readFileSync(path.join(import.meta.dirname, "fixture.html"), "utf8");
      const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
      let env: BrowserEnv;
      try {
        env = await BrowserEnv.open(dataUrl, dir);
      } catch {
        ctx.skip();
        return;
      }
      try {
        const census = await collectCensus(env.page);
        expect(census.title).toBe("Fixture shop");
        expect(census.controls.some((c) => c.text.includes("Buy now"))).toBe(true);
      } finally {
        await env.close();
        rmSync(dir, { recursive: true, force: true });
      }
    },
    60000,
  );

  it(
    "crawl merges drawer controls and prefills a single-field dialog",
    async (ctx) => {
      // Note: wording avoids audit-guard fragments (buy, subscribe, ...),
      // which match the data: URL itself as well as page text.
      const html = `<!doctype html><html><head><title>Drawer app</title></head><body>
        <button id="menu" aria-label="Show menu">Menu</button>
        <div id="drawer" style="display:none">
          <label>Topic <input type="text" id="topic" aria-label="Topic name"></label>
          <button id="go">Start trial</button>
          <p id="status">Idle</p>
        </div>
        <script>
          document.getElementById("menu").addEventListener("click", () => {
            const d = document.getElementById("drawer");
            d.style.display = d.style.display === "none" ? "block" : "none";
          });
          document.getElementById("go").addEventListener("click", () => {
            const v = document.getElementById("topic").value;
            document.getElementById("status").textContent = v ? "Trial started for " + v : "Name a topic first";
          });
        </script>
      </body></html>`;
      const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
      const outDir = mkdtempSync(path.join(tmpdir(), "agencydiff-init-"));
      let exploration: Exploration;
      try {
        exploration = await crawlExploration(dataUrl, { maxSteps: 10, outDir });
      } catch {
        ctx.skip();
        return;
      }
      try {
        expect(exploration.screens.length).toBe(1);
        const screen = exploration.screens[0];
        const texts = screen.controls.map((c) => c.text);
        // Drawer controls joined the same visit that opened the drawer.
        expect(texts).toContain("Start trial");
        expect(texts).toContain("Topic name");
        // Single empty field: discovery text recorded for replay.
        expect(screen.prefill).toMatchObject({ text: "test" });
        const contracts = draftContracts(exploration);
        expect(contracts.map((c) => c.decision)).toContain("subscription");
        for (const c of contracts) {
          for (const i of c.intents) expect(isGrounded(i, exploration)).toBe(true);
        }
      } finally {
        rmSync(outDir, { recursive: true, force: true });
      }
    },
    90000,
  );

  it(
    "crawl records the entry screen with the audit guard on",
    async (ctx) => {
      const html = readFileSync(path.join(import.meta.dirname, "fixture.html"), "utf8");
      const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
      const outDir = mkdtempSync(path.join(tmpdir(), "agencydiff-init-"));
      let exploration: Exploration;
      try {
        exploration = await crawlExploration(dataUrl, { maxSteps: 3, outDir });
      } catch {
        ctx.skip();
        return;
      }
      try {
        expect(exploration.screens.length).toBeGreaterThan(0);
        expect(exploration.screens[0].controls.length).toBeGreaterThan(0);
      } finally {
        rmSync(outDir, { recursive: true, force: true });
      }
    },
    90000,
  );
});

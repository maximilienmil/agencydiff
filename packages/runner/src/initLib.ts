// `agencydiff init`: turn a web app into an Agency Contract in minutes.
// This module holds the offline parts: exploration records, the heuristic
// contract drafter, promise mapping, and the validation pass. Live model
// calls (exploration driver, structured draft) live in init.ts; everything
// here runs without a key so tests and CI stay offline.

import type { AgencyContract, DomAssertion, IntentSpec } from "@agencydiff/core";

/** One control observed during exploration. Selectors are CSS the dom
 *  adapter can evaluate; `text` is visible text seen on the same screen. */
export interface InitControl {
  selector: string;
  /** `data-agency` tag when the app exposes one. */
  tag?: string;
  kind: "button" | "link" | "toggle" | "field" | "other";
  text: string;
  checked?: boolean;
  /** True when another element covers the control's center: visible in the
   *  DOM but not clickable until the overlay goes away. */
  covered?: boolean;
  /** Current field value, for text-like fields. */
  value?: string;
  /** Lowercase input type for fields (`text`, `search`, `password`, ...). */
  inputType?: string;
  /** Link target URL for links. */
  href?: string;
  /** Link target attribute (`_blank` links leave the page alone). */
  target?: string;
}

/** One screen entered during exploration, with what it showed. */
export interface InitScreen {
  key: string;
  url: string;
  title: string;
  /** Visible body text observed on this screen, sliced for fixtures. */
  text: string;
  controls: InitControl[];
  /** Selectors on THIS screen whose click led somewhere, with where. */
  transitions?: { selector: string; to: string }[];
  /** Click selectors from the entry URL that reach this screen. */
  path?: string[];
  /** Discovery text typed into the screen's single empty field before
   *  clicking (replayed on every revisit). Absent when the screen has
   *  zero or several fields. */
  prefill?: { selector: string; text: string };
}

/** Read-only exploration record: the screens entered and the controls
 *  found. Produced by the audit-guarded crawl (or the Muse audit driver)
 *  and saved next to the drafted contract for reproducibility. */
export interface Exploration {
  url: string;
  startedAt: string;
  /** Exploration steps taken (crawl clicks or model steps). */
  steps: number;
  screens: InitScreen[];
}

export function emptyExploration(url: string): Exploration {
  return { url, startedAt: new Date(0).toISOString(), steps: 0, screens: [] };
}

/** Every selector and text an oracle may cite, for grounding checks. */
export function observedVocabulary(exploration: Exploration): {
  selectors: Set<string>;
  texts: string[];
} {
  const selectors = new Set<string>(["body"]);
  const texts: string[] = [];
  for (const s of exploration.screens) {
    if (s.text) texts.push(s.text);
    for (const c of s.controls) {
      if (c.selector) selectors.add(c.selector);
      if (c.text) texts.push(c.text);
    }
  }
  return { selectors, texts };
}

function assertionTexts(a: DomAssertion): string[] {
  if (a.kind === "anyOf") return a.assertions.flatMap(assertionTexts);
  return "text" in a ? [a.text] : [];
}

function assertionSelectors(a: DomAssertion): string[] {
  if (a.kind === "anyOf") return a.assertions.flatMap(assertionSelectors);
  return [a.selector];
}

/** True when every oracle selector and text was actually observed during
 *  exploration. Drafted oracles must never invent UI. */
export function isGrounded(intent: IntentSpec, exploration: Exploration): boolean {
  const { selectors, texts } = observedVocabulary(exploration);
  for (const a of intent.domOracle ?? []) {
    if (!assertionSelectors(a).every((s) => selectors.has(s))) return false;
    const joined = texts.join("\n");
    if (!assertionTexts(a).every((t) => t.length > 0 && joined.includes(t))) return false;
  }
  return true;
}

// --- Decision taxonomy -------------------------------------------------

interface DecisionRule {
  decision: string;
  promise: string;
  patterns: RegExp[];
  acceptVerbs: RegExp;
  rejectVerbs: RegExp;
}

const RULES: DecisionRule[] = [
  {
    decision: "privacy",
    promise: "A person can choose who can contact them, and change their mind later.",
    patterns: [/privac/, /who can (message|contact)/, /\bdm\b/, /message.*option/, /block.*(message|stranger)/, /strangers?.*messag/, /followers?/],
    acceptVerbs: /allow|everyone|anyone|\bopen\b|keep open|continue/,
    rejectVerbs: /block|restrict|friends only|decline|not now|limit|\boff\b|never/,
  },
  {
    decision: "notifications",
    promise: "A person can choose which notifications and reminders they get.",
    patterns: [/notif/, /reminder/, /alert/, /email updates/, /marketing emails?/],
    acceptVerbs: /allow|enable|\bon\b|\byes\b|subscribe|turn on/,
    rejectVerbs: /block|disable|\boff\b|\bno\b|unsubscribe|mute|turn off|never/,
  },
  {
    decision: "subscription",
    promise: "A person can subscribe, see the terms before buying, decline the offer, and cancel.",
    patterns: [/subscri/, /\bsub[._]/, /circle\+|premium|plus plan/, /billing/, /renew/, /plan/, /\btrial\b/, /cancel/, /decline.*offer/],
    acceptVerbs: /subscribe|join|start|continue|keep|resume/,
    rejectVerbs: /cancel|decline|not now|no thanks|never/,
  },
  {
    decision: "data_sharing",
    promise: "A person can control what data the product collects and shares.",
    patterns: [/location/, /precise|approximate/, /share.*data/, /third-part/, /advert.*(personal|track)/, /cookies?/, /data.*(collect|share|retention)/],
    acceptVerbs: /allow|share|enable|precise|turn on|accept/,
    rejectVerbs: /\boff\b|disable|decline|not now|approximate|never|reject|limit/,
  },
  {
    decision: "contact",
    promise: "A person can control how the product contacts them and what contact details are shared.",
    patterns: [/contact/, /\bemail\b.*(address|share)/, /phone/, /address book/, /invite.*contact/, /sync contacts/],
    acceptVerbs: /allow|share|sync|add|save|continue/,
    rejectVerbs: /deny|skip|not now|never|remove/,
  },
  {
    decision: "account_deletion",
    promise: "A person can delete or deactivate their account and understand what happens to their data.",
    patterns: [/delete.*account/, /remove.*account/, /close.*account/, /deactivate/, /erase.*data/],
    acceptVerbs: /delete|remove|close|deactivate|confirm|erase/,
    rejectVerbs: /keep|cancel|not now|never/,
  },
  {
    decision: "time_limits",
    promise: "A person can set limits on their time in the product and remove them again.",
    patterns: [/screen time/, /daily limit/, /\blimit\b/, /usage/, /bedtime|break.*reminder/, /time.*(spent|management)/],
    acceptVerbs: /set|save|confirm|enable|turn on/,
    rejectVerbs: /remove|off|unlimited|disable|keep.*unlimited/,
  },
  {
    decision: "purchase",
    promise: "A shopper can add the item they chose to the basket without being diverted.",
    patterns: [/basket/, /add to (basket|cart)/, /checkout/, /buy/],
    acceptVerbs: /add to (basket|cart)/,
    rejectVerbs: /without|no thanks|continue (shopping|browsing)/,
  },
];

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 48);
}

function verbPhrase(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 80);
}

/** `home+location_prompt` reads as "home location prompt". */
function humanizeScreen(key: string): string {
  return key.replace(/[_+]+/g, " ").trim() || "the app";
}

/** `st.reminders` reads as "reminders": last tag segment, separators spaced. */
function humanizeTag(tag: string | undefined): string {
  if (!tag) return "";
  const last = tag.split(".").pop() ?? "";
  return last.replace(/[_-]+/g, " ").trim();
}

/** Split promise prose into sentences for per-sentence intent mapping. */
export function splitSentences(promise: string): string[] {
  return promise
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

interface ScoredControl {
  control: InitControl;
  screen: InitScreen;
  haystack: string;
}

/** Draft one contract per matched Decision from an exploration record.
 *  Pure and offline: every oracle cites only observed selectors and text,
 *  and everything is marked draft. */
export function draftContracts(exploration: Exploration, promiseText?: string): AgencyContract[] {
  const scored: ScoredControl[] = [];
  for (const screen of exploration.screens) {
    for (const control of screen.controls) {
      // Control-level text and tag only: folding the whole screen text in
      // here would drag every control on a matching screen into one decision.
      scored.push({
        control,
        screen,
        haystack: `${control.text} ${control.tag ?? ""} ${screen.key}`.toLowerCase(),
      });
    }
  }
  const used = new Set<string>();
  const contracts: AgencyContract[] = [];

  for (const rule of RULES) {
    const hits = scored.filter(
      (s) => !used.has(s.control.selector + "|" + s.screen.key) && rule.patterns.some((p) => p.test(s.haystack)),
    );
    if (hits.length === 0) {
      // A screen-level match with no control match still yields an inspect
      // intent on the matching screen: the topic exists, its controls are
      // one crawl away.
      const screen = exploration.screens.find((s) =>
        rule.patterns.some((p) => p.test(`${s.key} ${s.title} ${s.text}`.toLowerCase())),
      );
      if (screen) contracts.push(screenInspectContract(rule, screen));
      continue;
    }
    contracts.push(buildContract(rule, hits, exploration));
    for (const h of hits) used.add(h.control.selector + "|" + h.screen.key);
  }

  if (contracts.length === 0) {
    const fallback = fallbackContract(exploration);
    if (fallback) contracts.push(fallback);
  }

  if (promiseText) mapPromise(contracts, promiseText);
  return contracts;
}

function acceptReject(pool: ScoredControl[], rule: DecisionRule): {
  accept?: ScoredControl;
  reject?: ScoredControl;
} {
  // Controls whose own tag names the decision (`sub.decline`) outrank
  // same-text controls from another decision (`location.decline`).
  const rank = (s: ScoredControl) =>
    (rule.patterns.some((p) => p.test(s.control.tag ?? "")) ? 0 : 1000) + s.control.text.length;
  const accepts = pool
    .filter((s) => rule.acceptVerbs.test(s.control.text.toLowerCase()))
    .sort((a, b) => rank(a) - rank(b));
  const rejects = pool
    .filter((s) => rule.rejectVerbs.test(s.control.text.toLowerCase()))
    .sort((a, b) => rank(a) - rank(b));
  return { accept: accepts[0], reject: rejects[0] };
}

/** Destination-screen evidence for a control click seen in exploration:
 *  the first text on the screen the click led to. */
function destinationEvidence(
  screen: InitScreen,
  selector: string,
  exploration: Exploration,
): { text: string; screen: string } | undefined {
  const to = screen.transitions?.find((t) => t.selector === selector)?.to;
  if (!to) return undefined;
  const dest = exploration.screens.find((s) => s.key === to);
  if (!dest || dest.key === screen.key) return undefined;
  const firstLine = dest.text.split("\n").map((l) => l.trim()).filter((l) => l.length > 1)[0];
  if (!firstLine) return undefined;
  return { text: firstLine.slice(0, 120), screen: dest.key };
}

function oracleFor(
  hit: ScoredControl,
  exploration: Exploration,
): { domOracle: DomAssertion[]; weak: boolean; sourceScreen: string } {
  const { control, screen } = hit;
  if (control.kind === "toggle") {
    return {
      domOracle: [
        {
          kind: "checked",
          selector: control.selector,
          checked: !control.checked,
          screen: screen.key,
        },
      ],
      weak: false,
      sourceScreen: screen.key,
    };
  }
  const dest = destinationEvidence(screen, control.selector, exploration);
  if (dest) {
    return {
      domOracle: [{ kind: "visibleText", selector: "body", text: dest.text, screen: dest.screen }],
      weak: false,
      sourceScreen: dest.screen,
    };
  }
  const ownLine =
    control.text.length > 0
      ? control.text
      : screen.text.split("\n").map((l) => l.trim()).filter((l) => l.length > 1)[0] ?? "";
  if (ownLine) {
    return {
      domOracle: [{ kind: "visibleText", selector: "body", text: ownLine.slice(0, 120), screen: screen.key }],
      weak: true,
      sourceScreen: screen.key,
    };
  }
  return {
    domOracle: [{ kind: "exists", selector: control.selector, screen: screen.key }],
    weak: true,
    sourceScreen: screen.key,
  };
}

function buildContract(rule: DecisionRule, pool: ScoredControl[], exploration: Exploration): AgencyContract {
  const { accept, reject } = acceptReject(pool, rule);
  const intents: IntentSpec[] = [];
  const pairs: { accept: string; reject: string }[] = [];

  const pushAction = (
    id: string,
    hit: ScoredControl,
    polarity: "accept" | "reject",
    goal: string,
  ): void => {
    const { domOracle, weak, sourceScreen } = oracleFor(hit, exploration);
    intents.push({
      id,
      goal,
      polarity,
      domOracle,
      target: hit.control.tag,
      mustSucceed: true,
      draft: true,
      sourceScreen,
      needsReview: weak ? "oracle is presence-only (click led nowhere new during exploration); strengthen by hand" : undefined,
    });
  };

  if (accept) {
    pushAction(
      slugify(`accept ${accept.control.text}`) || "accept",
      accept,
      "accept",
      `I want to choose "${verbPhrase(accept.control.text)}" (${humanizeScreen(accept.screen.key)}).`,
    );
  }
  if (reject) {
    let id = slugify(`reject ${reject.control.text}`) || "reject";
    if (intents.some((i) => i.id === id)) id = `${id}_alt`;
    pushAction(
      id,
      reject,
      "reject",
      `I do not want "${verbPhrase(reject.control.text)}". I want the alternative (${humanizeScreen(reject.screen.key)}).`,
    );
  }
  if (accept && reject) {
    pairs.push({
      accept: intents.find((i) => i.polarity === "accept")!.id,
      reject: intents.find((i) => i.polarity === "reject")!.id,
    });
  }

  // A toggle with no verb match is still an opposing pair: on versus off.
  if (!accept && !reject) {
    const toggle = pool.find((s) => s.control.kind === "toggle");
    if (toggle) {
      // Empty-text toggles are labelled from their tag (`st.reminders` reads
      // as "reminders") rather than the screen title.
      const label = verbPhrase(toggle.control.text || humanizeTag(toggle.control.tag) || toggle.screen.title);
      const mkToggle = (id: string, polarity: "accept" | "reject", checked: boolean, goal: string) => {
        intents.push({
          id,
          goal,
          polarity,
          domOracle: [{ kind: "checked", selector: toggle.control.selector, checked, screen: toggle.screen.key }],
          target: toggle.control.tag,
          mustSucceed: true,
          draft: true,
          sourceScreen: toggle.screen.key,
        });
      };
      mkToggle(slugify(`turn on ${label}`) || "turn_on", "accept", true, `I want to turn on "${label}" (${humanizeScreen(toggle.screen.key)}).`);
      mkToggle(slugify(`turn off ${label}`) || "turn_off", "reject", false, `I want to turn off "${label}" (${humanizeScreen(toggle.screen.key)}).`);
      pairs.push({ accept: intents[0].id, reject: intents[1].id });
    }
  }

  // An inspect intent checks the current state without changing anything.
  // It lives on the accept control's screen when possible, not on whatever
  // screen the crawl happened to reach first.
  const homeKey = accept?.screen.key;
  const informant =
    pool.find((s) => /who|current|status|setting|policy|terms|info|about|details|includes?/i.test(`${s.control.text} ${s.screen.text}`)) ??
    (homeKey ? pool.find((s) => s.screen.key === homeKey) : undefined) ??
    pool[0];
  if (informant && !intents.some((i) => i.id === "inspect")) {
    const line = informant.screen.text.split("\n").map((l) => l.trim()).filter((l) => l.length > 3)[0];
    if (line) {
      intents.push({
        id: "inspect",
        goal: `I want to check the current ${rule.decision.replace(/_/g, " ")} state.`,
        polarity: "neutral",
        domOracle: [{ kind: "visibleText", selector: "body", text: line.slice(0, 120), screen: informant.screen.key }],
        target: informant.control.tag,
        mustSucceed: true,
        draft: true,
        sourceScreen: informant.screen.key,
      });
    }
  }

  // Revoke undoes the accept side when a matching control was observed.
  const undo = pool.find(
    (s) =>
      s !== accept &&
      /undo|revoke|remove|turn off|disable|change|back|different/i.test(s.control.text),
  );
  if (undo && accept && !intents.some((i) => i.id === "revoke")) {
    const { domOracle, sourceScreen } = oracleFor(undo, exploration);
    intents.push({
      id: "revoke",
      goal: `I chose "${verbPhrase(accept.control.text)}" before and changed my mind. Undo it.`,
      polarity: "reject",
      domOracle,
      target: undo.control.tag,
      mustSucceed: true,
      draft: true,
      sourceScreen,
    });
  }

  return {
    decision: rule.decision,
    promise: rule.promise,
    intents,
    pairs,
    draft: true,
  };
}

/** Inspect-only contract for a decision whose topic appears on a screen
 *  but whose controls the crawl has not reached yet. */
function screenInspectContract(
  rule: { decision: string; promise: string },
  screen: { key: string; title: string; text: string },
): AgencyContract {
  const line = screen.text.split("\n").map((l) => l.trim()).filter((l) => l.length > 3)[0] ?? screen.title;
  return {
    decision: rule.decision,
    promise: rule.promise,
    intents: [
      {
        id: "inspect",
        goal: `I want to check the current ${rule.decision.replace(/_/g, " ")} state.`,
        polarity: "neutral",
        domOracle: [{ kind: "visibleText", selector: "body", text: line.slice(0, 120), screen: screen.key }],
        mustSucceed: true,
        draft: true,
        sourceScreen: screen.key,
        needsReview: "topic seen on screen but no controls matched; expand exploration and re-draft",
      },
    ],
    pairs: [],
    draft: true,
  };
}

/** Last resort: one inspect intent per screen so an unfamiliar app still
 *  yields something reviewable instead of nothing. */
function fallbackContract(exploration: Exploration): AgencyContract | undefined {
  const screen = exploration.screens.find((s) => s.text.trim().length > 0);
  if (!screen) return undefined;
  const line = screen.text.split("\n").map((l) => l.trim()).filter((l) => l.length > 3)[0] ?? screen.title;
  return {
    decision: `choice_${slugify(screen.key) || "home"}`,
    promise: "A person can find what they came for on this screen.",
    intents: [
      {
        id: "inspect",
        goal: `I want to check what "${line.slice(0, 80)}" means for me.`,
        polarity: "neutral",
        domOracle: [{ kind: "visibleText", selector: "body", text: line.slice(0, 120), screen: screen.key }],
        mustSucceed: true,
        draft: true,
        sourceScreen: screen.key,
        needsReview: "no consequential decision matched; drafted as a screen inspect placeholder",
      },
    ],
    pairs: [],
    draft: true,
  };
}

/** Map each promise sentence to the decision whose vocabulary it shares.
 *  Sentences with no UI match become `unmappedPromises`: "promise not
 *  found in product" is a finding, not a failure. */
export function mapPromise(contracts: AgencyContract[], promiseText: string): void {
  const sentences = splitSentences(promiseText);
  if (sentences.length === 0) return;
  const vocab = (c: AgencyContract) =>
    `${c.decision} ${c.promise} ${c.intents.map((i) => `${i.id} ${i.goal}`).join(" ")}`.toLowerCase();
  const stop = new Set(["the", "a", "an", "and", "or", "to", "of", "in", "on", "for", "with", "can", "i", "want", "my"]);
  const words = (s: string) =>
    new Set(s.toLowerCase().split(/[^a-z0-9+]+/).filter((w) => w.length > 2 && !stop.has(w)));
  const unmapped: string[] = [];
  for (const sentence of sentences) {
    const ws = words(sentence);
    let best: AgencyContract | undefined;
    let bestScore = 0;
    for (const c of contracts) {
      const v = vocab(c);
      let score = 0;
      for (const w of ws) if (v.includes(w)) score += 1;
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (!best || bestScore === 0) unmapped.push(sentence);
  }
  if (unmapped.length > 0) {
    const target = contracts[0];
    target.unmappedPromises = [...(target.unmappedPromises ?? []), ...unmapped.map((s) => `promise not found in product: ${s}`)];
    for (const c of contracts) {
      for (const i of c.intents) {
        if (i.id === "inspect" && !i.needsReview) {
          i.needsReview = "covers promise text with no direct UI match; confirm by hand";
        }
      }
    }
  }
}

/** Repair a model-drafted contract list into valid shape: ids, polarities,
 *  pairs that resolve, and a needsReview flag wherever the oracle is empty
 *  or cites UI outside the exploration record. Pure, so tests cover it
 *  without a model key. Returns the repair count. */
export function normalizeModelContracts(list: AgencyContract[], exploration: Exploration): number {
  let repaired = 0;
  for (const c of list) {
    c.decision =
      typeof c.decision === "string" && c.decision.length > 0 ? c.decision : `choice_${list.indexOf(c)}`;
    c.draft = true;
    if (!Array.isArray(c.intents)) c.intents = [];
    if (!Array.isArray(c.pairs)) c.pairs = [];
    const seen = new Set<string>();
    c.intents.forEach((i, n) => {
      const goal = typeof i.goal === "string" ? i.goal : "";
      i.id =
        typeof i.id === "string" && i.id.length > 0
          ? i.id
          : goal
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "_")
              .replace(/^_|_$/g, "")
              .slice(0, 40) || `intent_${n}`;
      if (seen.has(i.id)) i.id = `${i.id}_${n}`;
      seen.add(i.id);
      if (i.polarity !== "accept" && i.polarity !== "reject") i.polarity = "neutral";
      if (typeof i.mustSucceed !== "boolean") i.mustSucceed = true;
      if (!Array.isArray(i.domOracle)) i.domOracle = [];
      i.draft = true;
      const notes: string[] = [];
      if (i.needsReview) notes.push(i.needsReview);
      if (i.domOracle.length === 0) {
        notes.push("model drafted no oracle; write one from the exploration record by hand");
        repaired += 1;
      } else if (!isGrounded(i, exploration)) {
        notes.push("model cited UI outside the exploration record; oracle needs a human check");
        repaired += 1;
      }
      i.needsReview = notes.length > 0 ? notes.join("; ") : undefined;
    });
    const ids = new Set(c.intents.map((i) => i.id));
    c.pairs = c.pairs.filter((p) => ids.has(p.accept) && ids.has(p.reject));
  }
  return repaired;
}

// --- Validation ----------------------------------------------------------

export interface ValidationOutcome {
  agentSucceeded: boolean;
  oraclePassed?: boolean;
}

export interface ValidatedCounts {
  kept: number;
  flagged: number;
}

/** Validation pass: keep the Intents whose oracle passes when the agent
 *  succeeds; mark the rest needsReview with the reason. Pure over
 *  outcomes so tests inject scripted results and the CLI injects live
 *  probe runs (Muse driver, k=1). */
export function applyValidation(
  contracts: AgencyContract[],
  outcomes: Map<string, ValidationOutcome>,
): ValidatedCounts {
  let kept = 0;
  let flagged = 0;
  for (const c of contracts) {
    for (const intent of c.intents) {
      const key = `${c.decision}.${intent.id}`;
      const o = outcomes.get(key);
      if (o && o.agentSucceeded && o.oraclePassed === true) {
        kept += 1;
        continue;
      }
      flagged += 1;
      const reason = !o
        ? "not run during validation; confirm by hand"
        : !o.agentSucceeded
          ? "agent did not reach a DONE state during validation (k=1); confirm by hand"
          : "oracle did not hold after the validation run (k=1); confirm by hand";
      intent.needsReview = intent.needsReview ? `${intent.needsReview}; ${reason}` : reason;
    }
  }
  return { kept, flagged };
}

// --- Review summary ------------------------------------------------------

export function renderInitReview(opts: {
  url: string;
  exploration: Exploration;
  contracts: AgencyContract[];
  counts?: ValidatedCounts;
  modelDraft?: boolean;
}): string {
  const { url, exploration, contracts, counts } = opts;
  const lines = [
    `# Init review: ${url}`,
    "",
    `Explored ${exploration.screens.length} screen(s) in ${exploration.steps} step(s): ` +
      exploration.screens.map((s) => `\`${s.key}\``).join(", ") +
      ".",
    `Drafted ${contracts.length} decision(s), ${contracts.reduce((n, c) => n + c.intents.length, 0)} intent(s)` +
      (opts.modelDraft ? " (model structured-output draft)." : " (heuristic draft)."),
  ];
  if (counts) lines.push(`Validation (k=1): ${counts.kept} kept, ${counts.flagged} flagged for review.`);
  lines.push("");
  for (const c of contracts) {
    lines.push(`## ${c.decision} (draft)`);
    lines.push(`Promise: ${c.promise}`);
    lines.push("");
    for (const i of c.intents) {
      const mark = i.needsReview ? "NEEDS REVIEW" : "kept";
      lines.push(`- [${mark}] \`${i.id}\` (${i.polarity}): ${i.goal}`);
      if (i.needsReview) lines.push(`  - reason: ${i.needsReview}`);
    }
    if (c.unmappedPromises?.length) {
      lines.push("");
      for (const u of c.unmappedPromises) lines.push(`- promise not found in product: ${u}`);
    }
    lines.push("");
  }
  lines.push("Everything above is `draft: true`. Skim the flagged intents, fix their oracles, then remove `draft`.");
  lines.push("");
  return lines.join("\n");
}

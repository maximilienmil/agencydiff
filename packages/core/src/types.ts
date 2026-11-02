// Shared data model. Everything downstream of the agent (metrics, diff, report)
// reads only these structures, so a finding can always be traced back to a step.

export type Variant = "baseline" | "candidate";

/** Which side of a decision an intent exercises. Pairs of accept/reject intents
 *  are what let us measure asymmetry. */
export type Polarity = "accept" | "reject" | "neutral";

/** Ground-truth check on the app's final state (every key must match), read through
 *  instrumentation the agent never sees. Absent for black-box targets, where
 *  success is agent-claimed. */
export type Oracle = Record<string, string | number | boolean | null>;

/** How a target decides whether an Intent succeeded. "state-hook" is Circle's
 *  test-hook behaviour; "dom" asserts on the final page; "model-judged" asks
 *  Muse to judge the final screenshot and is allowed only in Audit mode. */
export type OracleAdapter = "state-hook" | "dom" | "model-judged";

/** One assertion on the final page. Selectors are CSS, evaluated in the page. */
export type DomAssertion =
  | { kind: "exists"; selector: string }
  | { kind: "visible"; selector: string }
  | { kind: "textContains"; selector: string; text: string }
  | { kind: "visibleText"; selector: string; text: string }
  | { kind: "checked"; selector: string; checked?: boolean }
  | { kind: "value"; selector: string; value: string }
  | { kind: "anyOf"; assertions: DomAssertion[] };

/** A testable web app: a URL per Variant, the contract(s) to run, and which
 *  Oracle adapter decides success. Resolved from a target config JSON file. */
export interface TargetConfig {
  name?: string;
  urls: Record<string, string>;
  contracts: string[];
  oracle: OracleAdapter;
  /** Variant probed by `pnpm audit`. Defaults to "baseline". */
  auditVariant?: string;
}

export interface IntentSpec {
  id: string;
  goal: string;
  polarity: Polarity;
  /** Named starting state, e.g. "location-shared" for a revoke test. */
  fixture?: string;
  oracle?: Oracle;
  /** DOM assertions on the final page, checked when the target uses the
   *  "dom" Oracle adapter. Every assertion must hold for the Intent to pass. */
  domOracle?: DomAssertion[];
  /** `data-agency` tag of the control that fulfils this intent. Used for
   *  discoverability measurements, never shown to the agent. */
  target?: string;
  mustSucceed: boolean;
}

export interface AgencyContract {
  decision: string;
  /** The product promise in plain language. */
  promise: string;
  /** State key whose initial value is the decision's default. */
  defaultKey?: string;
  intents: IntentSpec[];
  pairs: { accept: string; reject: string }[];
}

// Muse computer-use action vocabulary (see dev.meta.ai/docs/computer-use).
export type Action =
  | { type: "click"; x: number; y: number; button?: string }
  | { type: "double_click"; x: number; y: number }
  | { type: "drag"; path: { x: number; y: number }[] }
  | { type: "keypress"; keys: string[] }
  | { type: "move"; x: number; y: number }
  | { type: "scroll"; x: number; y: number; scroll_x: number; scroll_y: number }
  | { type: "type"; text: string }
  | { type: "screenshot" }
  | { type: "wait" };

/** An instrumented UI control, in viewport pixel coordinates. */
export interface TagBox {
  tag: string;
  box: [x: number, y: number, w: number, h: number];
  inViewport: boolean;
}

export interface Observation {
  url: string;
  /** `data-screen` of the current view, when the app exposes one. */
  screen?: string;
  tags: TagBox[];
  screenshot: string;
}

export interface TraceStep {
  index: number;
  tMs: number;
  actions: Action[];
  after: Observation;
  /** Text the model emitted alongside this step, if any. */
  note?: string;
}

export interface Trace {
  id: string;
  decision: string;
  intentId: string;
  variant: Variant;
  repeat: number;
  driver: { kind: "scripted" | "muse"; model?: string };
  startedAt: string;
  initial: { state?: Record<string, unknown>; observation: Observation };
  steps: TraceStep[];
  final: { state?: Record<string, unknown>; agentMessage?: string };
  oracle: { checked: boolean; passed?: boolean };
  stoppedReason: "agent_done" | "script_done" | "step_budget" | "satisfied" | "error";
  error?: string;
  /** True when success was judged by a model (Audit mode only), never by app state. */
  modelJudged?: boolean;
  /** Steps elapsed when the dom oracle first held (0 = initial observation).
   *  Absent when the oracle never held, or for non-dom adapters. */
  firstSatisfiedStep?: number;
  /** Effortful actions up to firstSatisfiedStep: the audit cost of the Intent. */
  actionsToSatisfy?: number;
}

export interface TraceMetrics {
  traceId: string;
  /** "oracle" when verified against app state; "agent" when only claimed. */
  successGrade: "oracle" | "agent";
  success: boolean;
  actionCount: number;
  navigationDepth: number;
  /** Effortful actions until the oracle first held, copied from the trace. */
  actionsToSatisfy?: number;
  /** Step index at which the intent's target first appeared in the viewport
   *  (0 = initial screen). Undefined if it never did. */
  discoveryStep?: number;
  defaultValue?: unknown;
}

export interface IntentAggregate {
  intentId: string;
  variant: Variant;
  runs: number;
  successRate: number;
  /** Median over successful runs; undefined when none succeeded. */
  actionCount?: number;
  navigationDepth?: number;
  /** Median actions until the oracle first held, over successful runs. */
  actionsToSatisfy?: number;
  initiallyVisible?: boolean;
  defaultValue?: unknown;
  traceIds: string[];
}

export type Severity = "high" | "medium" | "low";

export interface Finding {
  id: string;
  severity: Severity;
  kind:
    | "goal_unreachable"
    | "action_cost"
    | "navigation_depth"
    | "visibility"
    | "default_flip"
    | "asymmetry";
  decision: string;
  intentId?: string;
  title: string;
  baseline: unknown;
  candidate: unknown;
  /** Trace ids (with optional step) that substantiate this finding. */
  evidence: { traceId: string; step?: number }[];
}

export interface AgencyReport {
  decision: string;
  promise: string;
  aggregates: IntentAggregate[];
  asymmetry: { accept: string; reject: string; baseline?: number; candidate?: number }[];
  findings: Finding[];
  passed: boolean;
  /** True when every result in this report was judged by a model (Audit mode). */
  modelJudged?: boolean;
  /** SAM-grounded visual evidence. Informative only, never gates pass/fail. */
  evidence?: TraceEvidence[];
}

/** Single-Variant result: per-Intent cost plus pair Asymmetry, no baseline. */
export interface AuditReport {
  decision: string;
  promise: string;
  variant: string;
  target: string;
  aggregates: IntentAggregate[];
  asymmetry: { accept: string; reject: string; ratio?: number }[];
  traceIds: string[];
  /** True when Audit success was judged by a model rather than app state. */
  modelJudged: boolean;
  cost: { totalActions: number; totalSteps: number; traces: number };
}

/** One control measured by SAM on a trace screenshot. */
export interface EvidenceControl {
  tag: string;
  /** SAM object id, when the control was prompted and returned. */
  objectId?: string;
  /** Source-pixel box the mask covers, when SAM returned one. */
  box?: { left: number; top: number; right: number; bottom: number };
  /** Mask area in source-image pixels. */
  maskAreaPx?: number;
  /** Whether the control was unobscured in the trace's initial viewport. */
  inInitialViewport: boolean;
}

/** SAM evidence for one screenshot of a trace. Step -1 is the initial observation. */
export interface StepEvidence {
  step: number;
  screenshot: string;
  overlay?: string;
  imageHash?: string;
  /** Accept mask area divided by reject mask area, when both measured. */
  prominenceRatio?: number;
  controls: EvidenceControl[];
}

/** SAM-grounded visual evidence for one trace. Never gates pass/fail. */
export interface TraceEvidence {
  traceId: string;
  model: string;
  producedAt: string;
  steps: StepEvidence[];
}

/** One event streamed by a runner with live probes enabled. Additive and
 *  transport-agnostic: the runner serialises these over SSE, the report app
 *  reduces them into the same shape a recorded Trace replay produces. */
export type LiveEvent =
  | { type: "run_started"; runId: string; decision: string; intentId: string; goal: string; at: string }
  | { type: "probe_started"; traceId: string; variant: Variant; intentId: string; at: string }
  | { type: "step_started"; traceId: string; variant: Variant; step: number; at: string }
  | { type: "screenshot"; traceId: string; variant: Variant; step: number; screenshot: string; url?: string; screen?: string; at: string }
  | { type: "action"; traceId: string; variant: Variant; step: number; actions: Action[]; note?: string; at: string }
  | { type: "oracle_result"; traceId: string; variant: Variant; passed?: boolean; checked: boolean; stoppedReason: string; at: string }
  | { type: "probe_finished"; traceId: string; variant: Variant; steps: number; at: string }
  | { type: "finding"; finding: Finding; at: string }
  | { type: "run_finished"; runId: string; passed: boolean; at: string };

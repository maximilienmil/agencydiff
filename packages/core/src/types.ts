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

export interface IntentSpec {
  id: string;
  goal: string;
  polarity: Polarity;
  /** Named starting state, e.g. "location-shared" for a revoke test. */
  fixture?: string;
  oracle?: Oracle;
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
  stoppedReason: "agent_done" | "script_done" | "step_budget" | "error";
  error?: string;
}

export interface TraceMetrics {
  traceId: string;
  /** "oracle" when verified against app state; "agent" when only claimed. */
  successGrade: "oracle" | "agent";
  success: boolean;
  actionCount: number;
  navigationDepth: number;
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
}

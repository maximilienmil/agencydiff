export interface FindingData {
  intentId: string;
  kind: string;
  title: string;
  baseline: string;
  candidate: string;
}

export interface VideoData {
  /** Arm A (no gate): attempts with a muse-confirmed regression, e.g. "8/30". */
  agentNoGate: string | null;
  /** Arm B (black-box gate): e.g. "0/30". */
  agentGated: string | null;
  /** Scripted replay gate row: caught, false alarms, cost. */
  gateCaught: string | null;
  gateFalseAlarms: string | null;
  gateCost: string | null;
  /** Screenshot review (judge, first screens only). */
  screensCaught: string | null;
  /** Judge with a walkthrough (upper bound). */
  walkthroughCaught: string | null;
  /** SusBench-derived patterns. */
  susDetected: string | null;
  susFalseAlarms: string | null;
  /** Public-site audit headline row, e.g. "0/3 → 3/3 · 4 actions to fact". */
  auditRealId: string | null;
  /** The exact "Simplify onboarding" prompt the coding agent received. */
  onboardPrompt: string | null;
  onboardTitle: string | null;
  /** Excerpt lines of the regressing agent diff. */
  regressingDiff: string[];
  /** Excerpt lines of the gated (fixed) agent diff. */
  fixedDiff: string[];
  /** Arm B gate claim for the onboard task, e.g. "PASS". */
  gateClaimB: string | null;
  /** Measured Finding titles. */
  withholdFinding: string | null;
  teenFinding: string | null;
  declineBaseline: string | null;
  declineCandidate: string | null;
  declineVisibility: string | null;
  repoUrl: string;
}

export interface Footage {
  coldBaselineStart: string | null;
  coldBaselineDecided: string | null;
  coldCandidateStart: string | null;
  coldCandidateLost: string | null;
  withBaseline: string | null;
  withCandidate: string | null;
  withCandidateDeep: string | null;
  samOverlay: string | null;
  samTeen: string | null;
  samSheet: string | null;
  voCold: string | null;
  voProblem: string | null;
  voExperiment: string | null;
  voHow: string | null;
  voGeneralize: string | null;
  voBuilt: string | null;
  voClose: string | null;
}

export interface DemoProps {
  data: VideoData;
  footage: Footage;
}

export const PENDING = "[PENDING]";

export const FALLBACK_DATA: VideoData = {
  agentNoGate: null,
  agentGated: null,
  gateCaught: null,
  gateFalseAlarms: null,
  gateCost: null,
  screensCaught: null,
  walkthroughCaught: null,
  susDetected: null,
  susFalseAlarms: null,
  auditRealId: null,
  onboardPrompt: null,
  onboardTitle: null,
  regressingDiff: [],
  fixedDiff: [],
  gateClaimB: null,
  withholdFinding: null,
  teenFinding: null,
  declineBaseline: null,
  declineCandidate: null,
  declineVisibility: null,
  repoUrl: "github.com/maximilianmilovidov/agencydiff",
};

export const EMPTY_FOOTAGE: Footage = {
  coldBaselineStart: null,
  coldBaselineDecided: null,
  coldCandidateStart: null,
  coldCandidateLost: null,
  withBaseline: null,
  withCandidate: null,
  withCandidateDeep: null,
  samOverlay: null,
  samTeen: null,
  samSheet: null,
  voCold: null,
  voProblem: null,
  voExperiment: null,
  voHow: null,
  voGeneralize: null,
  voBuilt: null,
  voClose: null,
};

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

/** One recorded screenshot of a staged Trace. */
export interface ClipFrame {
  file: string;
  /** Banner rows cropped off the top of this shot (0 when it had none). */
  crop: number;
  screen: string | null;
  /** Where the Probe tapped on this screen, as fractions of the cropped
   *  window (x of 430, y of 860 minus crop); null on the last frame. */
  tap: { x: number; y: number } | null;
}

/** A whole Trace staged for playback by scripts/capture.ts. */
export interface Clip {
  traceId: string;
  steps: number;
  oraclePassed: boolean;
  /** Visible window height in shot pixels (860 minus the largest crop). */
  window: number;
  frames: ClipFrame[];
}

export interface Clips {
  coldBaseline: Clip | null;
  coldCandidate: Clip | null;
  withBaseline: Clip | null;
  withCandidate: Clip | null;
}

export interface Footage {
  soundtrack: string | null;
  clips: Clips;
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
  repoUrl: "github.com/maximilienmil/agencydiff",
};

export const EMPTY_CLIPS: Clips = { coldBaseline: null, coldCandidate: null, withBaseline: null, withCandidate: null };

export const EMPTY_FOOTAGE: Footage = {
  soundtrack: null,
  clips: EMPTY_CLIPS,
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

export interface FindingData {
  intentId: string;
  kind: string;
  title: string;
  baseline: string;
  candidate: string;
}

export interface VideoData {
  /** "AgencyDiff, scripted probes" row, e.g. "20/20". Null renders as [PENDING]. */
  scriptedCaught: string | null;
  scriptedFalseAlarms: string | null;
  judgeCaught: string | null;
  judgeFalseAlarms: string | null;
  judgeConsistency: string | null;
  museProbes: string | null;
  susDetected: string | null;
  susFalseAlarms: string | null;
  dmvTimeToFact: string | null;
  declineBaseline: string | null;
  declineCandidate: string | null;
  declineVisibility: string | null;
  revokeBaseline: string | null;
  revokeCandidate: string | null;
  asymmetryBaseline: string | null;
  asymmetryCandidate: string | null;
  findings: FindingData[];
  repoUrl: string;
}

export interface Footage {
  circleBaseline: string | null;
  circleCandidate: string | null;
  reportDiff: string | null;
  prComment: string | null;
  replayBaseline: string[];
  replayCandidate: string[];
  samOverlay: string | null;
  liveReplay: string | null;
}

export interface DemoProps {
  data: VideoData;
  footage: Footage;
}

export const PENDING = "[PENDING]";

export const FALLBACK_DATA: VideoData = {
  scriptedCaught: null,
  scriptedFalseAlarms: null,
  judgeCaught: null,
  judgeFalseAlarms: null,
  judgeConsistency: null,
  museProbes: null,
  susDetected: null,
  susFalseAlarms: null,
  dmvTimeToFact: null,
  declineBaseline: null,
  declineCandidate: null,
  declineVisibility: null,
  revokeBaseline: null,
  revokeCandidate: null,
  asymmetryBaseline: null,
  asymmetryCandidate: null,
  findings: [],
  repoUrl: "github.com/maximilianmilovidov/agencydiff",
};

export const EMPTY_FOOTAGE: Footage = {
  circleBaseline: null,
  circleCandidate: null,
  reportDiff: null,
  prComment: null,
  replayBaseline: [],
  replayCandidate: [],
  samOverlay: null,
  liveReplay: null,
};

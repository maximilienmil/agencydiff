import type { ReactNode } from "react";
import type { Action, Trace } from "@agencydiff/core";
import { cursorFor } from "./live";
import { fmtNum } from "./format";

export const SHOT_W = 430;
export const SHOT_H = 860;

/** A recorded Trace screenshot in a device frame. The pixels are shown as
 *  recorded; markers and the tap ripple are drawn on top, in shot space. */
export function Phone({
  src,
  alt,
  actions,
  tick,
  overlay,
  onOverlayError,
  onOverlayLoad,
  className,
  children,
}: {
  src?: string;
  alt: string;
  actions?: Action[];
  tick?: string;
  overlay?: string;
  onOverlayError?: () => void;
  onOverlayLoad?: () => void;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={`phone ${className ?? ""}`}>
      <div className="phone-screen">
        {src ? <img src={src} alt={alt} /> : <div className="phone-wait">{children ?? "No Trace for this Variant."}</div>}
        {src && overlay && <img className="overlay" src={overlay} alt="" onError={onOverlayError} onLoad={onOverlayLoad} />}
        {src && actions && actions.length > 0 && <Markers actions={actions} />}
        {src && actions && <Tap actions={actions} tick={tick ?? ""} />}
      </div>
    </div>
  );
}

function Markers({ actions }: { actions: Action[] }) {
  return (
    <svg className="markers" viewBox={`0 0 ${SHOT_W} ${SHOT_H}`} preserveAspectRatio="none" aria-hidden>
      {actions.map((a, i) => {
        if (a.type === "drag") {
          const pts = a.path.map((p) => `${p.x},${p.y}`).join(" ");
          return <polyline key={i} points={pts} fill="none" stroke="#0866FF" strokeWidth={5} strokeLinecap="round" />;
        }
        if (a.type === "scroll") {
          return (
            <g key={i}>
              <line x1={a.x} y1={a.y - 22} x2={a.x} y2={a.y + 22} stroke="#fff" strokeWidth={9} strokeLinecap="round" />
              <line x1={a.x} y1={a.y - 22} x2={a.x} y2={a.y + 22} stroke="#0866FF" strokeWidth={5} strokeLinecap="round" />
            </g>
          );
        }
        return null;
      })}
    </svg>
  );
}

/** Tap ripple at the first pointer action; re-keyed per step so it replays. */
export function Tap({ actions, tick }: { actions: Action[]; tick: string }) {
  const c = cursorFor(actions);
  if (!c) return null;
  return (
    <div key={tick} className="tap" style={{ left: `${(c.x / SHOT_W) * 100}%`, top: `${(c.y / SHOT_H) * 100}%` }} aria-hidden>
      <span className="tap-ring" />
      <span className="tap-dot" />
    </div>
  );
}

/** "3 → 7" with the candidate coloured by direction. Higher is worse unless
 *  `higherIsBetter`. Non-numeric values compare for equality only. */
export function Delta({ b, c, higherIsBetter = false, fmt = fmtNum }: { b: unknown; c: unknown; higherIsBetter?: boolean; fmt?: (v: unknown) => string }) {
  let dir: "worse" | "better" | "same" = "same";
  if (typeof b === "number" && typeof c === "number") {
    if (c !== b) dir = (c > b) !== higherIsBetter ? "worse" : "better";
  } else if (b !== undefined && c === undefined && typeof b === "number") {
    dir = "worse";
  } else if (fmt(b) !== fmt(c)) {
    dir = "worse";
  }
  return (
    <span className={`delta ${dir}`}>
      <span className="from">{fmt(b)}</span>
      <span className="arrow">→</span>
      <span className="to">{fmt(c)}</span>
    </span>
  );
}

/** Visible-on-first-screen as words; losing visibility is the regression. */
export function VisDelta({ b, c }: { b?: boolean; c?: boolean }) {
  const w = (v?: boolean) => (v === undefined ? "n/a" : v ? "Visible" : "Hidden");
  const dir = b === c ? "same" : b && !c ? "worse" : "better";
  return (
    <span className={`delta ${dir}`}>
      <span className="from">{w(b)}</span>
      <span className="arrow">→</span>
      <span className="to">{w(c)}</span>
    </span>
  );
}

/** Driver notes that are protocol chatter, not part of the user's path. */
const DEBUG_NOTE = /^(safety checks acknowledged|computer_action)/i;

export function stepNote(note?: string): string | undefined {
  if (!note || DEBUG_NOTE.test(note.trim())) return undefined;
  return note;
}

const SCREEN_NAMES: Record<string, string> = {
  home: "Home", settings: "Settings", privacy: "Privacy", advanced: "Advanced", location: "Location",
  location_options: "Location options", messages: "Messages", dm_options: "Message options",
  screentime: "Screen Time", st_more: "More settings", st_limit: "Daily limit", st_remove: "Remove limit",
  usage: "Your time", plus: "Circle+", decline_options: "More options", terms: "Renewal terms",
  billing: "Billing", plan_manage: "Manage plan", cancel_other: "Other options", appearance: "Appearance",
};

export function screenName(screen?: string): string | undefined {
  if (!screen) return undefined;
  const [base, overlay] = screen.split("+");
  const name = SCREEN_NAMES[base] ?? base;
  return overlay ? `${name}, dialog open` : name;
}

const VERB: Record<string, string> = {
  click: "Tap", double_click: "Double tap", scroll: "Scroll", type: "Type", keypress: "Key press", drag: "Drag", move: "Move", wait: "Wait", screenshot: "Look",
};

/** Plain-language caption for one step: "Step 3 · Tap · now on Privacy". */
export function stepCaption(trace: Trace, step: number): string {
  if (step === 0) {
    const s = screenName(trace.initial.observation.screen);
    return s ? `Start · ${s}` : "Starting screen";
  }
  const s = trace.steps[Math.min(step, trace.steps.length) - 1];
  if (!s) return "";
  const verbs = [...new Set(s.actions.map((a) => VERB[a.type] ?? a.type.replace(/_/g, " ")))].join(", ");
  const where = screenName(s.after.screen);
  const note = stepNote(s.note);
  return [`Step ${s.index + 1}`, verbs || "Look", note, where ? `now on ${where}` : undefined].filter(Boolean).join(" · ");
}

export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden>
      <rect x="2" y="6" width="18" height="22" rx="5" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="2.5" />
      <rect x="11" y="3" width="19" height="23" rx="5.5" fill="#0866FF" />
      <path d="M16 15.5l3 3 5.5-6" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export const REPO_URL = "https://github.com/maximilienmil/agencydiff";
export const blob = (p: string) => `${REPO_URL}/blob/main/${p}`;

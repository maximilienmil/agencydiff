import { useCallback, useEffect, useState } from "react";
import { loadIndex, type RunIndex } from "./data";
import { fmtDate } from "./format";
import { OverviewPage } from "./pages/Overview";
import { RunsPage } from "./pages/Runs";
import { DiffPage } from "./pages/Diff";
import { ReplayPage } from "./pages/Replay";
import { ContractPage } from "./pages/Contract";
import { LivePage } from "./pages/Live";
import { Mark, REPO_URL } from "./components";
import { Theme } from "@astryxdesign/core/theme";
import { TopNav } from "@astryxdesign/core/TopNav";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { agencyTheme } from "./theme";

export type Page = "overview" | "runs" | "diff" | "replay" | "contract" | "live";

export interface Route {
  page: Page;
  run?: string;
  intent?: string;
  variant?: string;
  trace?: string;
  source?: string;
  live?: string;
}

export function parseHash(): Route {
  const raw = window.location.hash.replace(/^#/, "");
  const [path, query] = raw.split("?");
  const page = (path.replace(/^\//, "") || "overview") as Page;
  const q = new URLSearchParams(query ?? "");
  return {
    page: ["overview", "runs", "diff", "replay", "contract", "live"].includes(page) ? page : "overview",
    run: q.get("run") ?? undefined,
    intent: q.get("intent") ?? undefined,
    variant: q.get("variant") ?? undefined,
    trace: q.get("trace") ?? undefined,
    source: q.get("source") ?? undefined,
    live: q.get("live") ?? undefined,
  };
}

export function link(r: Route): string {
  const q = new URLSearchParams();
  if (r.run) q.set("run", r.run);
  if (r.intent) q.set("intent", r.intent);
  if (r.variant) q.set("variant", r.variant);
  if (r.trace) q.set("trace", r.trace);
  if (r.source) q.set("source", r.source);
  if (r.live) q.set("live", r.live);
  const qs = q.toString();
  return `#/${r.page}${qs ? `?${qs}` : ""}`;
}

function useRoute(): Route {
  const [route, setRoute] = useState<Route>(parseHash);
  useEffect(() => {
    const onChange = () => setRoute(parseHash());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

const TABS: { id: Page; label: string; title?: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "runs", label: "Runs" },
  { id: "diff", label: "Diff" },
  { id: "replay", label: "Replay", title: "Plays back recorded runs, step by step." },
  { id: "contract", label: "Contract" },
  { id: "live", label: "Live", title: "Streams a run as it happens. Needs a local runner." },
];

type Mode = "light" | "dark" | "system";

function initialMode(): Mode {
  try {
    const saved = localStorage.getItem("agencydiff.theme");
    if (saved === "light" || saved === "dark" || saved === "system") return saved;
  } catch {
    /* storage blocked: use the default */
  }
  return "dark";
}

function resolved(mode: Mode): "light" | "dark" {
  if (mode !== "system") return mode;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Light, dark or system. Shared with pages through a window event so the
 *  Live view's T shortcut and the nav control stay in step. */
export function useTheme(): [Mode, (m?: Mode) => void] {
  const [mode, setMode] = useState<Mode>(initialMode);
  useEffect(() => {
    document.documentElement.dataset.theme = resolved(mode);
  }, [mode]);
  useEffect(() => {
    const onSet = (e: Event) => setMode((e as CustomEvent<Mode>).detail);
    window.addEventListener("agencydiff-theme", onSet);
    return () => window.removeEventListener("agencydiff-theme", onSet);
  }, []);
  const set = (m?: Mode) => {
    const next: Mode = m ?? (resolved(mode) === "dark" ? "light" : "dark");
    try {
      localStorage.setItem("agencydiff.theme", next);
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new CustomEvent("agencydiff-theme", { detail: next }));
  };
  return [mode, set];
}

export function App() {
  const route = useRoute();
  const [index, setIndex] = useState<RunIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useTheme();

  useEffect(() => {
    loadIndex().then(setIndex, (e) => setError(String(e)));
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route.page]);

  const runId = route.run ?? index?.runs[0]?.id;
  const goDefault = useCallback(
    (page: Page) => link({ page, run: runId, intent: route.intent }),
    [runId, route.intent],
  );

  return (
    <Theme theme={agencyTheme} mode={resolved(mode)}>
      <div className="shell-nav">
        <TopNav
          label="Report sections"
          heading={
            <a className="brand" href="#/overview" aria-label="AgencyDiff home">
              <Mark />
              <b>AgencyDiff</b>
            </a>
          }
          startContent={
            <nav className="navlinks">
              {TABS.map((t) => (
                <a key={t.id} href={goDefault(t.id)} aria-current={route.page === t.id ? "page" : undefined} title={t.title}>
                  {t.label}
                </a>
              ))}
            </nav>
          }
          endContent={
            <div className="nav-end">
              <SegmentedControl label="Colour theme" size="md" value={resolved(mode)} onChange={(v) => setMode(v as Mode)}>
                <SegmentedControlItem value="light" label="Light" />
                <SegmentedControlItem value="dark" label="Dark" />
              </SegmentedControl>
              <a className="gh" href={REPO_URL}>
                Source
              </a>
            </div>
          }
        />
      </div>
      <main>
        {error && <div className="error">Could not load report data: {error}</div>}
        {!error && !index && <p className="muted">Loading report data…</p>}
        {index && index.runs.length === 0 && (
          <div className="notice">
            No runs exported yet. Serve Circle on :5173 and run <code>pnpm diff --driver scripted</code> to produce one.
          </div>
        )}
        {index && route.page === "overview" && <OverviewPage index={index} />}
        {index && index.runs.length > 0 && runId && (
          <>
            {route.page === "runs" && <RunsPage index={index} />}
            {route.page === "diff" && <DiffPage runId={runId} />}
            {route.page === "replay" && (
              <ReplayPage runId={runId} intent={route.intent} trace={route.trace} variant={route.variant} />
            )}
            {route.page === "contract" && <ContractPage runId={runId} />}
            {route.page === "live" && <LivePage runId={runId} intent={route.intent} liveUrl={route.live} source={route.source} />}
          </>
        )}
      </main>
      <footer className="site">
        <div className="inner">
          <span>
            AgencyDiff measures the interface, not the person. Each test run follows the same steps. Success is decided
            by the last screen shown{index?.runs[0] ? `. Latest run ${fmtDate(index.runs[0].date)}` : ""}.
          </span>
          <span>
            <a href={REPO_URL}>Source</a> · MIT · Built with Astryx
          </span>
        </div>
      </footer>
    </Theme>
  );
}

import { useCallback, useEffect, useState } from "react";
import { loadIndex, type RunIndex } from "./data";
import { fmtDate } from "./format";
import { OverviewPage } from "./pages/Overview";
import { RunsPage } from "./pages/Runs";
import { DiffPage } from "./pages/Diff";
import { ReplayPage } from "./pages/Replay";
import { ContractPage } from "./pages/Contract";
import { LivePage } from "./pages/Live";
import { BrandMark, REPO_URL } from "./components";

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

const TABS: { id: Page; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "runs", label: "Runs" },
  { id: "diff", label: "Diff" },
  { id: "replay", label: "Replay" },
  { id: "contract", label: "Contract" },
  { id: "live", label: "Live" },
];

type Theme = "light" | "dark";

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem("agencydiff.theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* storage blocked: fall back to the system preference */
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    const onSet = (e: Event) => setTheme((e as CustomEvent<Theme>).detail);
    window.addEventListener("agencydiff-theme", onSet);
    return () => window.removeEventListener("agencydiff-theme", onSet);
  }, []);
  const toggle = () => {
    const next: Theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem("agencydiff.theme", next);
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new CustomEvent("agencydiff-theme", { detail: next }));
  };
  return [theme, toggle];
}

export function App() {
  const route = useRoute();
  const [index, setIndex] = useState<RunIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [theme, toggleTheme] = useTheme();

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
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="#/overview" aria-label="AgencyDiff home">
            <BrandMark />
            <span>AgencyDiff</span>
          </a>
          <nav className="tabs" aria-label="Report sections">
            {TABS.map((t) => (
              <a
                key={t.id}
                href={goDefault(t.id)}
                aria-current={route.page === t.id ? "page" : undefined}
              >
                {t.label}
              </a>
            ))}
          </nav>
          <div className="topbar-actions">
            <button
              className="icon-btn"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              title="Toggle theme"
            >
              {theme === "dark" ? (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
              ) : (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>
              )}
            </button>
            <a className="button-link gh" href={REPO_URL} style={{ height: 36, padding: "0 14px", fontSize: 14 }}>
              GitHub
            </a>
          </div>
        </div>
      </header>
      <main>
        {error && <div className="error">Could not load report data: {error}</div>}
        {!error && !index && <p className="muted">Loading report data…</p>}
        {index && index.runs.length === 0 && (
          <div className="notice">
            No runs exported yet. Serve Circle on :5173 and run{" "}
            <code>pnpm diff --driver scripted</code> to produce one.
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
            AgencyDiff measures the interface, not the person. Probes are standardized instruments;
            success is decided by the Oracle on final app state
            {index?.runs[0] ? ` · latest run ${fmtDate(index.runs[0].date)}` : ""}.
          </span>
          <span>
            <a href={REPO_URL}>Source</a> · MIT
          </span>
        </div>
      </footer>
    </>
  );
}

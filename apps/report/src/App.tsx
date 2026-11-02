import { useCallback, useEffect, useState } from "react";
import { loadIndex, type RunIndex } from "./data";
import { fmtDate } from "./format";
import { RunsPage } from "./pages/Runs";
import { DiffPage } from "./pages/Diff";
import { ReplayPage } from "./pages/Replay";
import { ContractPage } from "./pages/Contract";
import { LivePage } from "./pages/Live";

export type Page = "runs" | "diff" | "replay" | "contract" | "live";

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
  const page = (path.replace(/^\//, "") || "runs") as Page;
  const q = new URLSearchParams(query ?? "");
  return {
    page: ["runs", "diff", "replay", "contract", "live"].includes(page) ? page : "runs",
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
  { id: "runs", label: "Runs" },
  { id: "diff", label: "Diff" },
  { id: "replay", label: "Replay" },
  { id: "contract", label: "Contract" },
  { id: "live", label: "Live" },
];

export function App() {
  const route = useRoute();
  const [index, setIndex] = useState<RunIndex | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadIndex().then(setIndex, (e) => setError(String(e)));
  }, []);

  const runId = route.run ?? index?.runs[0]?.id;
  const goDefault = useCallback(
    (page: Page) => link({ page, run: runId, intent: route.intent }),
    [runId, route.intent],
  );

  return (
    <>
      <div className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            AgencyDiff<small>intent regression report</small>
          </div>
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
        </div>
      </div>
      <main>
        {error && <div className="error">Could not load report data: {error}</div>}
        {!error && !index && <p className="muted">Loading report data…</p>}
        {index && index.runs.length === 0 && (
          <div className="notice">
            No runs exported yet. Serve Circle on :5173 and run{" "}
            <code>pnpm diff --driver scripted</code> to produce one.
          </div>
        )}
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
        <footer>
          AgencyDiff measures the interface, not the person. Probes are standardized
          instruments; success is decided by the Oracle on final app state
          {index?.runs[0] ? ` · latest run ${fmtDate(index.runs[0].date)}` : ""}.
        </footer>
      </main>
    </>
  );
}

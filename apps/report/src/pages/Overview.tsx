import { useEffect, useState } from "react";
import type { AgencyReport } from "@agencydiff/core";
import {
  loadReport,
  loadShowcase,
  type RunIndex,
  type ShowcaseEntry,
} from "../data";
import { fmtNum } from "../format";
import { link } from "../App";
import { BenchmarkSection, useBenchmark } from "./Benchmark";

const REPO_URL = "https://github.com/maximilienmil/agencydiff";

interface CardData {
  entry: ShowcaseEntry;
  report?: AgencyReport;
  baseline?: number;
  candidate?: number;
  passed?: boolean;
  finding?: string;
}

function ShowcaseCard({ card }: { card: CardData }) {
  const { entry, report } = card;
  const replay = link({ page: "replay", run: entry.runId, intent: entry.intent });
  return (
    <article className="card showcase-card">
      <p className="card-seed">
        <code>{entry.seed}</code>
      </p>
      <h3>{entry.seedDescription}</h3>
      <p className="muted">{entry.intentGoal}</p>
      {card.finding && <p>{card.finding}</p>}
      <p className="stat-line">
        {report ? (
          <>
            Steps needed <strong>{fmtNum(card.baseline)} → {fmtNum(card.candidate)}</strong>
            {" · "}
            {report.passed ? <span className="pill pass">Pass</span> : <span className="pill fail">Fail</span>}
          </>
        ) : (
          "Run data pending."
        )}
      </p>
      <p>
        <a className="replay-link" href={replay}>
          Watch the Replay
        </a>
        {" · "}
        <a href={link({ page: "diff", run: entry.runId })}>Diff</a>
      </p>
    </article>
  );
}

export function OverviewPage({ index }: { index: RunIndex }) {
  const bench = useBenchmark();
  const [cards, setCards] = useState<CardData[]>([]);
  const [hero, setHero] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      let entries: ShowcaseEntry[] = [];
      try {
        entries = await loadShowcase();
      } catch {
        entries = [];
      }
      const known = entries.filter((e) => index.runs.some((r) => r.id === e.runId));
      const loaded = await Promise.all(
        known.map(async (entry) => {
          try {
            const report = await loadReport(entry.runId);
            const agg = (v: "baseline" | "candidate") =>
              report.aggregates.find((a) => a.intentId === entry.intent && a.variant === v);
            const top = report.findings.find((f) => f.intentId === entry.intent) ?? report.findings[0];
            return {
              entry,
              report,
              baseline: agg("baseline")?.actionCount,
              candidate: agg("candidate")?.actionCount,
              passed: report.passed,
              finding: top ? `${top.title}: ${fmtNum(top.baseline)} → ${fmtNum(top.candidate)}` : undefined,
            };
          } catch {
            return { entry };
          }
        }),
      );
      if (!live) return;
      setCards(loaded);
      const first = loaded[0];
      if (first) setHero(link({ page: "replay", run: first.entry.runId, intent: first.entry.intent }));
    })();
    return () => {
      live = false;
    };
  }, [index]);

  return (
    <>
      <h1>Regression tests for human choice.</h1>
      <p className="lede overview-lede">
        AgencyDiff turns a product promise into an Agency Contract of opposing Intents, then
        runs the same Probe against a baseline and a candidate Variant of the app. Success is
        decided by an Oracle on final app state, never by the agent's claim, so every Finding
        is a deterministic diff over recorded Traces. When saying no quietly gets harder than
        saying yes, AgencyDiff reports it before your users find it.
      </p>

      <section className="hero-replay" aria-labelledby="hero-replay-title">
        <h2 id="hero-replay-title">Replay: baseline vs candidate, step by step</h2>
        <p>
          Watch the same Intent attempted on both Variants, with each action drawn on its
          screenshot and SAM segment overlays where the runner stored them.
        </p>
        {hero ? (
          <a className="button-link primary" href={hero}>
            Open the Replay
          </a>
        ) : (
          <p className="muted">Showcase runs are pending.</p>
        )}
      </section>

      <h2>Showcase runs</h2>
      <p className="lede">
        One headline seed per Decision family, probed with the Muse driver at k=3. The
        candidate carries exactly that seed; the baseline carries none.
      </p>
      {cards.length === 0 ? (
        <div className="notice">Showcase runs pending: no exported Muse runs yet.</div>
      ) : (
        <div className="showcase-grid">
          {cards.map((c) => (
            <ShowcaseCard key={c.entry.runId} card={c} />
          ))}
        </div>
      )}

      {bench ? <BenchmarkSection bench={bench} /> : <p className="muted">Loading benchmark…</p>}

      <h2>Try Circle yourself</h2>
      <p className="lede">
        Circle is the fictional test app these Probes measure. Open the{" "}
        <a href="circle/">baseline and candidate variants</a> and click through the same
        choices. Source, contracts and benchmark data live in{" "}
        <a href={REPO_URL}>the AgencyDiff repository</a>.
      </p>
    </>
  );
}

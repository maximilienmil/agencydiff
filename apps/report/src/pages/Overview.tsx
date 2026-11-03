import { useEffect, useState } from "react";
import type { AgencyReport, Trace } from "@agencydiff/core";
import { loadReport, loadShowcase, loadTrace, shotUrl, type RunIndex, type ShowcaseEntry } from "../data";
import { link } from "../App";
import { BenchmarkSection, useBenchmark } from "./Benchmark";
import { Constellation, Phone, Readout, RouteMap, Tally, blob, REPO_URL } from "../components";
import { shotList } from "../format";

interface CardData {
  entry: ShowcaseEntry;
  report?: AgencyReport;
  baseline?: number;
  candidate?: number;
  /** Final screenshot of the first candidate Trace, for the thumbnail. */
  thumb?: string;
}

function firstTraceId(report: AgencyReport, intent: string, variant: "baseline" | "candidate"): string | undefined {
  return report.aggregates.find((a) => a.intentId === intent && a.variant === variant)?.traceIds.slice().sort()[0];
}

function ShowcaseCard({ card }: { card: CardData }) {
  const { entry, report } = card;
  const replay = link({ page: "replay", run: entry.runId, intent: entry.intent });
  return (
    <article className="showcase-card">
      <a href={replay} aria-label={`Replay ${entry.seedDescription}`}>
        <Phone src={card.thumb} alt={`Candidate screen for ${entry.intentGoal}`} />
      </a>
      <div>
        <h3>{entry.seedDescription}</h3>
        <p className="goal">“{entry.intentGoal}”</p>
        <span className="seed">
          {entry.seed} · {report ? (report.passed ? "check passed" : "check failed") : "pending"}
        </span>
      </div>
      <div className="metric">
        {report ? (
          <>
            <div className="k">Steps needed, baseline to candidate</div>
            <Readout b={card.baseline} c={card.candidate} size="md" />
          </>
        ) : (
          <div className="k">Run data pending.</div>
        )}
      </div>
      <div className="links">
        <a className="text-link replay-link" href={replay}>
          Watch the Replay
        </a>
        <a className="text-link" href={link({ page: "diff", run: entry.runId })}>
          Open the Diff
        </a>
      </div>
    </article>
  );
}

interface Hero {
  runId: string;
  intent: string;
  goal: string;
  baseline?: Trace;
  candidate?: Trace;
  report: AgencyReport;
}

/** The headline measurement, drawn from the first showcase run. */
function Specimen({ hero }: { hero: Hero | null }) {
  if (!hero) return <div className="specimen" />;
  const agg = (v: "baseline" | "candidate") => hero.report.aggregates.find((a) => a.intentId === hero.intent && a.variant === v);
  const b = agg("baseline");
  const c = agg("candidate");
  const shot = (t?: Trace) => (t ? shotUrl(hero.runId, t.id, shotList(t)[0]) : undefined);
  return (
    <figure className="specimen" aria-label="Headline measurement">
      <p className="q">“{hero.goal}”</p>
      <Readout b={b?.actionCount} c={c?.actionCount} unit="steps" size="lg" />
      <div className="rows">
        <div className="row">
          <span className="who">Baseline</span>
          <Tally n={hero.baseline?.steps.length ?? 0} label={`Baseline Trace: ${hero.baseline?.steps.length ?? 0} steps`} />
        </div>
        <div className="row cand">
          <span className="who">Candidate</span>
          <Tally n={hero.candidate?.steps.length ?? 0} tone="bad" label={`Candidate Trace: ${hero.candidate?.steps.length ?? 0} steps`} />
        </div>
        {hero.candidate && (
          <div className="row cand">
            <span className="who">Route</span>
            <RouteMap trace={hero.candidate} compact />
          </div>
        )}
      </div>
      <div className="phones">
        <figure>
          <Phone src={shot(hero.baseline)} alt="Baseline: the location prompt offers Not now next to Allow" />
          <figcaption>Baseline, start screen</figcaption>
        </figure>
        <figure>
          <Phone src={shot(hero.candidate)} alt="Candidate: declining moved behind More options" />
          <figcaption>Candidate, start screen</figcaption>
        </figure>
      </div>
      <figcaption style={{ marginTop: 14 }}>
        Steps are the median over {b?.runs ?? "—"} Muse Probes per Variant; tallies and route count the Traces shown.
      </figcaption>
    </figure>
  );
}

export function OverviewPage({ index }: { index: RunIndex }) {
  const bench = useBenchmark();
  const [cards, setCards] = useState<CardData[]>([]);
  const [hero, setHero] = useState<Hero | null>(null);
  const [heroLink, setHeroLink] = useState<string | null>(null);

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
        known.map(async (entry): Promise<CardData> => {
          try {
            const report = await loadReport(entry.runId);
            const agg = (v: "baseline" | "candidate") =>
              report.aggregates.find((a) => a.intentId === entry.intent && a.variant === v);
            const candId = firstTraceId(report, entry.intent, "candidate");
            let thumb: string | undefined;
            if (candId) {
              const t = await loadTrace(entry.runId, candId).catch(() => null);
              if (t) {
                const shots = shotList(t);
                thumb = shotUrl(entry.runId, t.id, shots[shots.length - 1]);
              }
            }
            return { entry, report, baseline: agg("baseline")?.actionCount, candidate: agg("candidate")?.actionCount, thumb };
          } catch {
            return { entry };
          }
        }),
      );
      if (!live) return;
      setCards(loaded);
      const first = loaded.find((c) => c.report);
      if (first?.report) {
        setHeroLink(link({ page: "replay", run: first.entry.runId, intent: first.entry.intent }));
        const id = (v: "baseline" | "candidate") => firstTraceId(first.report!, first.entry.intent, v);
        const [baseline, candidate] = await Promise.all(
          (["baseline", "candidate"] as const).map((v) => {
            const t = id(v);
            return t ? loadTrace(first.entry.runId, t).catch(() => undefined) : Promise.resolve(undefined);
          }),
        );
        if (live)
          setHero({ runId: first.entry.runId, intent: first.entry.intent, goal: first.entry.intentGoal, baseline, candidate, report: first.report });
      }
    })();
    return () => {
      live = false;
    };
  }, [index]);

  const agent = bench?.agentPrs;
  const s = bench?.summary;
  const n = (x?: string) => Number(x?.split("/")[0] ?? 0);

  return (
    <>
      <section className="hero">
        <Constellation />
        <div className="hero-grid">
          <div>
            <h1>
              Regression tests for <em>human choice.</em>
            </h1>
            <p className="sub">Your CI checks the code still works. AgencyDiff checks the user can still say no.</p>
            <div className="ctas hero-replay">
              {heroLink ? (
                <a className="cta primary" href={heroLink}>
                  Watch a Replay
                </a>
              ) : (
                <span className="muted">Showcase runs are pending.</span>
              )}
              <a className="cta" href={REPO_URL}>
                Read the source
              </a>
            </div>
          </div>
          <Specimen hero={hero} />
        </div>
      </section>

      <section className="results" aria-label="Headline results">
        <a className="result" href={blob("eval/agent-prs/RESULTS.md")}>
          <p className="title">Coding-agent pull requests that broke saying no</p>
          {agent ? (
            <>
              <div className="pair">
                <div>
                  <span className="big bad">
                    {agent.noGate.broke}/{agent.noGate.attempts}
                  </span>
                  <span className="cap">Agent alone</span>
                  <Tally n={agent.noGate.broke} tone="bad" height={24} />
                </div>
                <div>
                  <span className="big good">
                    {agent.gated.broke}/{agent.gated.attempts}
                  </span>
                  <span className="cap">With AgencyDiff in the loop</span>
                  {agent.gated.broke > 0 ? <Tally n={agent.gated.broke} tone="bad" height={24} /> : <span className="none">none</span>}
                </div>
              </div>
              <p className="desc">
                {agent.tasks} ordinary product tasks, {agent.noGate.attempts / Math.max(agent.tasks, 1)} attempts each, regressions
                confirmed by Muse Probes.
              </p>
            </>
          ) : (
            <p className="desc">Pending: eval/agent-prs/results.json was not found at build time.</p>
          )}
          <span className="src">eval/agent-prs/RESULTS.md</span>
        </a>
        <a className="result" href={blob("eval/RESULTS.md")}>
          <p className="title">Seeded agency regressions caught, of 20</p>
          {s ? (
            <>
              <div className="pair">
                <div>
                  <span className="big">{s.agencydiff.scripted.caught}</span>
                  <span className="cap">AgencyDiff replay gate</span>
                  <Tally n={n(s.agencydiff.scripted.caught)} height={24} />
                </div>
                <div>
                  <span className="big bad">{s.judge.firstScreens?.caught ?? "—"}</span>
                  <span className="cap">Model reviewing PR screenshots</span>
                  <Tally n={n(s.judge.firstScreens?.caught)} tone="bad" height={24} />
                </div>
              </div>
              <p className="desc">
                {s.agencydiff.scripted.falseAlarms} false alarms on no-change controls, for{" "}
                {s.agencydiff.scripted.costUsd === 0 ? "$0" : `$${s.agencydiff.scripted.costUsd.toFixed(2)}`} in model calls.
              </p>
            </>
          ) : (
            <p className="desc">Pending: eval/results/summary.json was not found at build time.</p>
          )}
          <span className="src">eval/RESULTS.md</span>
        </a>
      </section>

      <div className="section-head">
        <h2>How it works</h2>
      </div>
      <div className="method">
        <div>
          <span className="n">01</span>
          <h3>Contract</h3>
          <p>A Decision and its opposing Intents, written once: subscribe and cancel, share and withhold.</p>
        </div>
        <div>
          <span className="n">02</span>
          <h3>Probes</h3>
          <p>The same choice is tried on the old build and the new build; every tap is recorded, so you can replay it.</p>
        </div>
        <div>
          <span className="n">03</span>
          <h3>Oracle</h3>
          <p>The last screen in the app decides success. The agent's own claim never counts.</p>
        </div>
        <div>
          <span className="n">04</span>
          <h3>Diff</h3>
          <p>Measured deltas in steps, depth, visibility and defaults, posted as a PR check.</p>
        </div>
      </div>

      <div className="section-head">
        <h2>Showcase runs</h2>
      </div>
      <p className="lede">
        One seeded regression per Decision, probed with the Muse computer-use driver at k=3. The candidate carries
        exactly that seed; the baseline carries none.
      </p>
      {cards.length === 0 ? (
        <div className="notice">Showcase runs pending: no exported Muse runs yet.</div>
      ) : (
        <div className="showcase">
          {cards.map((c) => (
            <ShowcaseCard key={c.entry.runId} card={c} />
          ))}
        </div>
      )}

      {bench ? <BenchmarkSection bench={bench} /> : <p className="muted">Loading benchmark…</p>}

      <section className="cta-band">
        <div>
          <h2>Try Circle yourself</h2>
          <p>Circle is the fictional social app these Probes measure. Open the baseline and the candidate and click through the same choices.</p>
        </div>
        <a className="cta" href="circle/">
          Open Circle
        </a>
      </section>
    </>
  );
}

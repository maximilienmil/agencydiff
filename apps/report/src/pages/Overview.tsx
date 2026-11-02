import { useEffect, useState } from "react";
import type { AgencyReport, Trace } from "@agencydiff/core";
import { loadReport, loadShowcase, loadTrace, shotUrl, type RunIndex, type ShowcaseEntry } from "../data";
import { link } from "../App";
import { BenchmarkSection, useBenchmark } from "./Benchmark";
import { Delta, Phone, VisDelta, blob, REPO_URL } from "../components";
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
    <article className="card showcase-card">
      <a href={replay} aria-label={`Replay ${entry.seedDescription}`}>
        <Phone src={card.thumb} alt={`Candidate screen for ${entry.intentGoal}`} />
      </a>
      <div className="body">
        <p className="card-seed">
          {report ? (
            report.passed ? <span className="pill pass">Pass</span> : <span className="pill fail">Fail</span>
          ) : null}
          <code>{entry.seed}</code>
        </p>
        <h3>{entry.seedDescription}</h3>
        <p className="goal">“{entry.intentGoal}”</p>
        <div className="metric">
          {report ? (
            <>
              <div className="k">Steps needed, baseline → candidate</div>
              <Delta b={card.baseline} c={card.candidate} />
            </>
          ) : (
            <div className="k">Run data pending.</div>
          )}
        </div>
        <div className="links">
          <a className="text-link replay-link" href={replay}>
            Watch the Replay →
          </a>
          <a className="text-link" href={link({ page: "diff", run: entry.runId })}>
            Diff
          </a>
        </div>
      </div>
    </article>
  );
}

interface Hero {
  runId: string;
  intent: string;
  baseline?: Trace;
  candidate?: Trace;
  report: AgencyReport;
}

function HeroVisual({ hero }: { hero: Hero | null }) {
  if (!hero) {
    return (
      <div className="hero-visual">
        <Phone alt="" />
        <Phone alt="" className="cand" />
      </div>
    );
  }
  const shot = (t?: Trace) => (t ? shotUrl(hero.runId, t.id, shotList(t)[0]) : undefined);
  const agg = (v: "baseline" | "candidate") => hero.report.aggregates.find((a) => a.intentId === hero.intent && a.variant === v);
  const b = agg("baseline");
  const c = agg("candidate");
  return (
    <div className="hero-visual">
      <div style={{ position: "relative" }}>
        <span className="tag">Baseline</span>
        <Phone src={shot(hero.baseline)} alt="Baseline: the location prompt offers Not now next to Allow" />
      </div>
      <div style={{ position: "relative" }}>
        <span className="tag">Candidate</span>
        <Phone src={shot(hero.candidate)} className="cand" alt="Candidate: declining moved behind More options" />
      </div>
      <a className="finding-card hero-finding" href={link({ page: "replay", run: hero.runId, intent: hero.intent })} style={{ textDecoration: "none", color: "inherit" }}>
        <h4>Finding · {hero.report.decision.replace(/_/g, " ")}</h4>
        <dl>
          <div>
            <dt>Steps to say no</dt>
            <dd>
              <Delta b={b?.actionCount} c={c?.actionCount} />
            </dd>
          </div>
          <div>
            <dt>On the first screen</dt>
            <dd>
              <VisDelta b={b?.initiallyVisible} c={c?.initiallyVisible} />
            </dd>
          </div>
        </dl>
      </a>
    </div>
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
        if (live) setHero({ runId: first.entry.runId, intent: first.entry.intent, baseline, candidate, report: first.report });
      }
    })();
    return () => {
      live = false;
    };
  }, [index]);

  const agent = bench?.agentPrs;
  const s = bench?.summary;
  const ratio = (x?: string) => {
    const m = x?.match(/^(\d+)\/(\d+)$/);
    return m ? Number(m[1]) / Number(m[2]) : 0;
  };

  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">
            <span className="pill neutral">Open source · MIT</span> Pre-merge CI for user choice
          </p>
          <h1>
            Regression tests for <span className="grad">human choice.</span>
          </h1>
          <p className="sub">
            Your CI checks the code still works. AgencyDiff checks the user can still say no.
          </p>
          <div className="ctas hero-replay">
            {heroLink ? (
              <a className="button-link primary" href={heroLink}>
                Watch a Replay
              </a>
            ) : (
              <span className="muted">Showcase runs are pending.</span>
            )}
            <a className="button-link" href={REPO_URL}>
              View the source
            </a>
          </div>
        </div>
        <HeroVisual hero={hero} />
      </section>

      <section className="stats" aria-label="Headline results">
        <a className="stat-card" href={blob("eval/agent-prs/RESULTS.md")}>
          <p className="title">Coding-agent PRs that broke saying no</p>
          {agent ? (
            <>
              <div className="figure">
                <span className="big bad">
                  {agent.noGate.broke}/{agent.noGate.attempts}
                </span>
                <span className="vs">→</span>
                <span className="big good">
                  {agent.gated.broke}/{agent.gated.attempts}
                </span>
              </div>
              <div className="bars">
                <div className="b">
                  <span>Agent alone</span>
                  <span className="track"><span className="fill red" style={{ display: "block", width: `${(agent.noGate.broke / Math.max(agent.noGate.attempts, 1)) * 100}%` }} /></span>
                  <span className="n">{agent.noGate.broke}/{agent.noGate.attempts}</span>
                </div>
                <div className="b">
                  <span>With AgencyDiff</span>
                  <span className="track"><span className="fill green" style={{ display: "block", width: `${(agent.gated.broke / Math.max(agent.gated.attempts, 1)) * 100}%` }} /></span>
                  <span className="n">{agent.gated.broke}/{agent.gated.attempts}</span>
                </div>
              </div>
              <p className="desc">
                {agent.tasks} ordinary product tasks × {agent.noGate.attempts / Math.max(agent.tasks, 1)} attempts,
                Muse-confirmed. Left: agents alone. Right: the same tasks with AgencyDiff in the loop.
              </p>
            </>
          ) : (
            <p className="desc">Pending: eval/agent-prs/results.json was not found at build time.</p>
          )}
          <span className="src">Evidence: eval/agent-prs/RESULTS.md →</span>
        </a>
        <a className="stat-card" href={blob("eval/RESULTS.md")}>
          <p className="title">Agency regressions caught, 20 seeded</p>
          {s ? (
            <>
              <div className="figure">
                <span className="big">{s.agencydiff.scripted.caught}</span>
                <span className="vs">vs</span>
                <span className="big bad">{s.judge.firstScreens?.caught ?? "—"}</span>
              </div>
              <div className="bars">
                <div className="b">
                  <span>Replay gate</span>
                  <span className="track"><span className="fill blue" style={{ display: "block", width: `${ratio(s.agencydiff.scripted.caught) * 100}%` }} /></span>
                  <span className="n">{s.agencydiff.scripted.caught}</span>
                </div>
                <div className="b">
                  <span>Screenshot review</span>
                  <span className="track"><span className="fill red" style={{ display: "block", width: `${ratio(s.judge.firstScreens?.caught) * 100}%` }} /></span>
                  <span className="n">{s.judge.firstScreens?.caught ?? "—"}</span>
                </div>
              </div>
              <p className="desc">
                The replay gate against a model reviewing PR screenshots.{" "}
                {s.agencydiff.scripted.falseAlarms} false alarms on no-change controls, for{" "}
                {s.agencydiff.scripted.costUsd === 0 ? "$0" : `$${s.agencydiff.scripted.costUsd.toFixed(2)}`}.
              </p>
            </>
          ) : (
            <p className="desc">Pending: eval/results/summary.json was not found at build time.</p>
          )}
          <span className="src">Evidence: eval/RESULTS.md →</span>
        </a>
      </section>

      <h2>How it works</h2>
      <p className="lede">One engine: a written promise, two Variants, a deterministic diff.</p>
      <div className="steps">
        <div className="step">
          <div className="n">1</div>
          <h3>Write the promise</h3>
          <p>An Agency Contract names a Decision and its opposing Intents: subscribe and cancel, share and withhold.</p>
        </div>
        <div className="step">
          <div className="n">2</div>
          <h3>Probe both Variants</h3>
          <p>The same Intent is attempted on the baseline and the candidate, every action recorded as a Trace.</p>
        </div>
        <div className="step">
          <div className="n">3</div>
          <h3>Check final state</h3>
          <p>An Oracle reads the app's final state. The agent's own claim never counts as success.</p>
        </div>
        <div className="step">
          <div className="n">4</div>
          <h3>Fail the PR</h3>
          <p>Findings are measured deltas, such as steps, depth, visibility and defaults, posted as a PR check.</p>
        </div>
      </div>

      <div className="section-head">
        <h2>Showcase runs</h2>
      </div>
      <p className="lede">
        One headline seed per Decision, probed with the Muse computer-use driver at k=3. The
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

      <section className="cta-band">
        <div>
          <h2>Try Circle yourself</h2>
          <p>
            Circle is the fictional social app these Probes measure. Open the baseline and the
            candidate and click through the same choices.
          </p>
        </div>
        <a className="button-link" href="circle/">
          Open Circle
        </a>
      </section>
    </>
  );
}

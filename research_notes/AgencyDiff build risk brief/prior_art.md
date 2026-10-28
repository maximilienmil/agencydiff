# Prior Art Closest to AgencyDiff (matched-intent, baseline-vs-candidate agent diff as a CI check)

Scope note: about 20 searches and fetches, run on 2026-10-28. Most figures come from arXiv abstracts or HTML pages and from search summaries. Full PDFs were not read unless stated. Items marked UNVERIFIED rest on secondary sources only.

## Q1. Agents vs dark patterns (SusBench, DECEPTICON, TrickyArena, AidUI, UIGuard, AutoBot): what they measure and whether they compare versions

### Takeaway
All of this work measures one of two things: whether an agent falls for a dark pattern (agent susceptibility), or whether a single UI snapshot contains a dark pattern (detection). None of it holds a user intention fixed and compares the cost of carrying it out across two versions of a product. The closest structural element is the toggle-a-pattern-on/off design in SusBench, TrickyArena and DECEPTICON. That is a matched A/B setup, but its purpose is to test the agent, not the product.

### Cited Findings
- **SusBench** (Guo, Hiniker et al., UW; IUI '26). It has 313 tasks across 55 live purchase websites and 123 unique dark patterns injected through a browser extension, covering 9 pattern types. In a 29-person study, the injected patterns were judged to look authentic. Both humans and agents were most susceptible to Preselection, Trick Wording and Hidden Information. The metric is the rate at which the agent avoided or fell for the pattern. — [arXiv 2510.11035](https://arxiv.org/abs/2510.11035v1); [project PDF](https://faculty.washington.edu/alexisr/susbench.pdf)
- **DECEPTICON** (Cuvin, Zhu, Yang, Stanford; ICLR 2026). It has 700 web-navigation tasks (600 generated, 100 real) that test dark patterns one at a time. Dark patterns steered agents to the malicious outcome in more than 70% of tasks, against 31% for humans. Susceptibility rose with model size and with test-time reasoning, and prompting and guardrail defenses did not reliably help. The categories are privacy leaks, unwanted notifications or engagement, and unexpected spending. — [arXiv 2512.22894](https://arxiv.org/abs/2512.22894v1); [ICLR poster](https://iclr.cc/virtual/2026/poster/10010532)
- **Ersoy et al., "Investigating the Impact of Dark Patterns on LLM-Based Web Agents"** (IEEE S&P 2026). The authors built LiteAgent, a logging framework, and TrickyArena, an environment where dark patterns can be switched on and off. Agents fell for a single dark pattern about 41% of the time. Vision input lowered task success and raised susceptibility. Avoidance prompts cut susceptibility by only about 32%. — [arXiv 2510.18113](https://arxiv.org/abs/2510.18113)
- **Tang et al., "Dark Patterns Meet GUI Agents"** (arXiv, Sep 2025). It compares agents, humans and human-AI teams across 16 dark-pattern types. Agents often prioritized finishing the task over avoiding the pattern. Human oversight helped but added cognitive cost. — [arXiv 2509.10723](https://www.arxiv.org/abs/2509.10723)
- **"Invisible Consent: Browser Automation by LLM Agents is Not Privacy-aware"** (ACM, 2026). On mock sites with cookie banners, agents took the easiest path and accepted cookies. Even with an explicit deny-all instruction, acceptance persisted in 14.4% of trials, and the residual rate depended on both the prompt and the interface design. (Only the abstract snippet was seen.) — [ACM DL 10.1145/3772363.3799048](https://dl.acm.org/doi/10.1145/3772363.3799048)
- **Privacy Practices of Browser Agents** (Ukani, Haddadi, Shamsabadi, Snyder; Dec 2025). It audits 8 browser agents on 15 measurements across 5 factors and found 30 vulnerabilities. This is an audit of the agents, not of the products. — [arXiv 2512.07725](https://arxiv.org/abs/2512.07725)
- **AidUI** (Mansur, Salma, Awofisayo, Moran; ICSE 2023). It detects and localizes 10 dark-pattern types from single screenshots using computer vision and NLP. On the ContextDP dataset (175 mobile and 83 web screenshots, 301 instances) it scored precision 0.66, recall 0.67, F1 0.65, and IoU about 0.84. — [arXiv 2303.06782](https://arxiv.org/abs/2303.06782v1); [ICSE page](https://conf.researchr.org/details/icse-2023/icse-2023-technical-track/192/AidUI-Toward-Automated-Recognition-of-Dark-Patterns-in-User-Interfaces)
- **UIGuard** ("Unveiling the Tricks", 2023). It is a knowledge-driven detector for mobile UIs that combines property extraction with a rule checker. Micro-averaged precision is 0.82, recall 0.77, F1 0.79. — [arXiv 2308.05898](https://arxiv.org/html/2308.05898v2)
- **AppRay** ("From Exploration to Revelation"). It explores mobile apps and then detects dark patterns, reporting macro and micro precision of 0.92 and 0.85. Each app is evaluated as a single snapshot. — [arXiv 2411.18084](https://arxiv.org/abs/2411.18084)
- **AutoBot** (Nayak and Fawaz, UW-Madison; ACM CCS 2025 Distinguished Paper). It is screenshot-based: a vision model finds UI elements, then an LLM (later distilled into small LMs) classifies them, with F1 0.93. It ships three tools: a browser extension, a **Lighthouse audit for developers**, and a measurement tool for regulators. — [arXiv 2411.07441](https://arxiv.org/html/2411.07441v4); [UW news](https://engineering.wisc.edu/news/new-tool-illuminates-dark-website-patterns-designed-to-scam-you-and-steal-your-data)

### Inferences
- In the susceptibility benchmarks, the variable is the agent and the dark pattern is the treatment. AgencyDiff turns this around: the agent and the intent are held fixed, and the product version is the treatment. The pattern on/off switch in TrickyArena and SusBench is still a reusable piece of method, because it gives synthetic baseline/candidate pairs with ground-truth labels for validating AgencyDiff.
- These benchmarks are a direct threat to AgencyDiff's measurement validity. Agents fall for dark patterns 41–70% of the time and drift toward accepting. An agent run on the candidate version may "succeed" by taking the manipulated path, so the deltas would understate the friction. AgencyDiff needs an outcome oracle that checks the final state (for example, that precise location is actually off), not only an action trace.
- AutoBot's Lighthouse audit is the closest dark-pattern work aimed at developers. It is a per-page classifier, though, and does not diff versions or execute intents.

### Gaps
- Did not verify whether any susceptibility benchmark reports action counts or step costs per pattern, which could be reused as a metric.
- The full text of "Invisible Consent" was not reviewed, so its authors and venue details are not confirmed.

## Q2. LLM GUI testing and agent-based usability testing: any version-to-version comparison of the cost of fulfilling an intent?

### Takeaway
LLM GUI testers (GPTDroid, DroidAgent and similar) aim at coverage and bug finding on a single build. Agent usability simulators (UXAgent, AgentA/B) are the nearest neighbors. **AgentA/B in particular already runs LLM agents on two interface variants and compares their behavior**, but it measures population outcomes such as purchases and conversion, with personas. It does not measure deterministic friction for a fixed, user-protective intent, and it is not a CI check. Code-level LLM differential testing (DiffTestGen) supplies the "two versions, no oracle" framing, but for program outputs rather than GUIs.

### Cited Findings
- **AgentA/B** (Wang et al., arXiv 2504.09723). LLM agents with varied personas run simulated A/B tests on live webpages. In an Amazon.com case study, 1,000 agents compared filter-panel designs, and the directional result matched a parallel human experiment. The authors report that agents are "sensitive to interface variations." — [arXiv 2504.09723](https://arxiv.org/html/2504.09723v2)
- **Data-Driven Persona-Conditioned Agents for A/B Test Simulation** (Benomar et al., Amazon, arXiv 2609.01038). It predicts A/B test outcomes with agents whose personas are grounded in real behavioral signals. — [arXiv 2609.01038](https://arxiv.org/abs/2609.01038)
- **UXAgent** (arXiv 2504.09407, v3 Sep 2025; earlier version 2502.12561). It combines a persona generator, an LLM agent and a universal browser connector that drives real websites. Outputs are video replay, agent interviews and quantitative logs. The authors note it can simulate A/B tests of interface variants. — [arXiv 2504.09407](https://arxiv.org/html/2504.09407v3); [arXiv 2502.12561](https://arxiv.org/abs/2502.12561v3)
- **"Same Outcomes, Different Journeys"** (arXiv 2604.07929). This trace-level framework compares human and GUI-agent navigation. Agents follow search-centric, low-branching paths even when task success is similar. That is direct evidence that agent path length is not a faithful proxy for human path length. — [arXiv 2604.07929](https://arxiv.org/html/2604.07929)
- **GPTDroid** (ICSE 2024). It treats GUI testing as LLM question answering with functionality-aware memory. On 93 apps it found 53 bugs, 35 of them confirmed. — [arXiv 2310.15780](https://arxiv.org/pdf/2310.15780); [arXiv 2305.09434](https://arxiv.org/pdf/2305.09434)
- **DroidAgent** (ICST 2024). It does intent-driven Android testing: it sets task goals and tries to achieve them, reaching 61% activity coverage against 51% for the state of the art. It outputs executable UIAutomator2 scripts. — [arXiv 2311.08649](https://arxiv.org/abs/2311.08649v1); [GitHub coinse/droidagent](https://github.com/coinse/droidagent)
- **TaskAudit** detects "functiona11ity" (accessibility and functionality) errors in mobile apps by executing tasks with agents. It works on a single version. — [arXiv 2510.12972](https://arxiv.org/pdf/2510.12972)
- **CAT (WeChat)** uses retrieval-based LLM UI automation that breaks a task into steps and maps them onto UI elements. — [arXiv 2409.07829](https://arxiv.org/pdf/2409.07829)
- **DiffTestGen** (arXiv 2607.16024). It uses an LLM, guided by the code change, to generate tests that expose behavioral differences between the old and new versions in a PR. It exposed differences in 78.2% of PRs and needs no oracle beyond the two versions. It works at the code level. — [arXiv 2607.16024](https://arxiv.org/abs/2607.16024)
- **GERALLT** pairs an action agent with a judge agent that compares before/after screenshots for inconsistencies. It works on a single version of a desktop application. — via search summary of [Pith 2505.17839](https://pith.science/paper/2505.17839) (UNVERIFIED details)
- **agentdiff** (GitHub) runs two versions of an AI agent on the same tests and diffs their behavior. It stresses repeated runs because agents are nondeterministic. It diffs agents, not products. — [github.com/amishaba/agentdiff](https://github.com/amishaba/agentdiff)

### Inferences
- AgentA/B is the most important prior art to cite and set AgencyDiff apart from. Both run the same agent task on A and B. They differ in several ways. AgentA/B optimizes for the business (did they buy). AgencyDiff checks protective intents (can the user refuse). AgentA/B reports stochastic persona-population statistics, while AgencyDiff reports deterministic structural deltas (default state, visibility, accept/reject asymmetry, reversibility). AgentA/B is an offline experiment, while AgencyDiff is a gating PR check with replayable evidence.
- The naming "DiffTestGen" and "agentdiff" shows that the "diff" framing is crowded. The product name should not be the novelty claim.
- Nondeterminism matters. Prior work (agentdiff and the trace-divergence paper) implies AgencyDiff needs multiple runs per version, or it needs to record the agent path once and then compute the deltas deterministically from the DOM or accessibility tree. Agent action counts alone are noisy and are not proxies for humans.

### Gaps
- ScenGen, GraphDroid, PersonaTester and AutoDroid were not searched individually because of the tool-call budget. From prior knowledge, AutoDroid (Wen et al., MobiCom 2024) is LLM task automation, not version comparison. It is not re-verified here.
- No paper was found that reports a "cost to fulfil intent" metric for an LLM agent across app releases. Absence from search is not proof that none exists.

## Q3. Visual and UX regression tools and task-cost (KLM/GOMS/CogTool) automation: any automated A/B task-cost diffing?

### Takeaway
Visual-regression tools (Percy, Chromatic, Applitools) supply the CI/PR workflow AgencyDiff wants: a baseline, a diff, approve or reject, and a blocking check. They diff pixels or components, not task cost or intent. CogTool did compare KLM task times across design variants, but it relied on hand-demonstrated storyboards, assumed expert error-free users, and had no CI integration. Validation results for it are mixed.

### Cited Findings
- **Percy** runs a job on each PR that stays failing until someone approves the visual diffs. Its pixel-based diffs produce false positives on dynamic content. **Chromatic** snapshots every Storybook story on every commit and shows the diffs in the GitHub PR UI. It works at component level, not on flows. **Applitools** compares semantically by visual region. — [bug0 overview](https://bug0.com/knowledge-base/visual-regression-testing-tools); [Theodo on Percy](https://blog.theodo.com/2022/10/visual-regression-testing-percy) (low-authority sources; vendor docs were not checked)
- **KLM** sums standard operator times (for example, about 0.2 s per keystroke and about 1.1 s per pointing action). **CogTool** builds KLMs automatically from demonstrated storyboards, runs them in ACT-R, and can show timeline differences between two designs. — [Wikipedia GOMS](https://en.wikipedia.org/wiki/GOMS); [Bellamy et al., PLATEAU 2010](https://ecs.wgtn.ac.nz/foswiki/pub/Events/PLATEAU/2010Program/plateau10-bellamy.pdf)
- An LSU thesis validated CogTool on two versions of a DeltaV interface. The predicted time fell outside the human 95% confidence interval in 9 of 12 cases, and the fit was better for experts than for students. — [LSU thesis 1401](https://digitalcommons.lsu.edu/gradschool_theses/1401)
- One known issue with visual regression in CI is that stale baselines cause false-positive failures that block unrelated PRs. The suggested remedy is to flag differences for review rather than fail the build. — via [search summary; GitHub issue](https://github.com/CodedSceptre/ai-net/issues/373)

### Inferences
- A reusable method: AgencyDiff can compute a KLM-style time estimate from the agent's recorded action trace, which gives a "seconds of friction" delta alongside the raw action count. That combines CogTool's metric with automated demonstration in place of manual storyboards. A paper that does exactly this (agent trace converted to KLM, compared across versions) was not found. It is worth one more targeted search.
- The CI design should copy Percy's approve-or-reject baseline workflow, and should default to warning rather than blocking to avoid alert fatigue.

### Gaps
- Did not verify whether Applitools or Chromatic offer interaction or flow testing (for example, Chromatic interaction tests or Playwright integration) that counts steps. The vendor docs were not fetched.

## Q4. Regulatory and academic "symmetry of choice" measurement (GDPR/EDPB/CNIL, DSA, CCPA, FTC)

### Takeaway
Regulators have already defined much of what AgencyDiff measures: a reject option on the same layer as accept, equal prominence, refusal as easy as acceptance, and cancellation as easy as sign-up. Academic crawlers have measured this at scale on single snapshots. Commercial scanners (DarkLens, Captain Compliance Radar) say they check banner asymmetry and that DarkLens runs on PRs. None of them is documented as diffing versions by executing an intent.

### Cited Findings
- **EDPB Cookie Banner Taskforce report** (adopted 18 Jan 2023). It flags "no reject button on the first layer" and reject options shown as links rather than buttons. Most authorities agree that any layer with "Accept" should also have "Reject." CNIL requires the reject option on the first layer, while the Spanish AEPD allows it on a later layer. — [EDPB report PDF](https://www.edpb.europa.eu/system/files/2023-01/edpb_20230118_report_cookie_banner_taskforce_en.pdf); [McDermott summary](https://mwe.com/?p=223902)
- **CNIL fines.** Google was fined €150M and Facebook €60M because accepting took one click and refusing took several. — [secondary: atticusli.com](https://atticusli.com/blog/posts/cookie-consent-choice-architecture-compliance/) (CNIL primary decision not fetched; the fines were in Jan 2022 from prior knowledge, not re-verified)
- **CCPA "symmetry in choice."** A site that offers Accept All must offer a symmetrical Reject All. — [Syrenis](https://syrenis.com/resources/blog/cookie-banner-symmetry/) (vendor blog; CPPA regulation text §7004 not fetched)
- **FTC Click-to-Cancel (Negative Option) Rule.** The Eighth Circuit vacated it in its entirety on July 8, 2025, on APA procedural grounds, before its July 14, 2025 effective date (*Custom Communications, Inc. v. FTC*, No. 24-3137). ROSCA is still enforced. — [Greenberg Traurig](https://www.gtlaw.com/en/insights/2025/7/eighth-circuit-vacates-ftcs-click-to-cancel-rule); [Morgan Lewis](https://www.morganlewis.com/pubs/2025/07/ftcs-click-to-cancel-rule-vacated-ahead-of-planned-july-14-effective-date)
- **Nouwens et al., "Dark Patterns after the GDPR"** (CHI 2020). They scraped the 5 major CMPs across the top 10k UK sites (n=680) and found that only 11.8% met minimal legal requirements. In the field experiment, removing the first-layer reject button raised consent by 22–23 percentage points, and granular first-page controls lowered it by 8–20 points. — [arXiv 2001.02479](https://arxiv.org/abs/2001.02479v1); [MIT CSAIL news](https://www.csail.mit.edu/news/most-websites-dont-follow-european-cookie-consent-laws)
- **Priv-Accept** (Politecnico di Torino). This crawler accepts consent banners in order to measure the web after consent. It is an example of automating banner interaction at scale. — [ar5iv 2109.00395](https://ar5iv.labs.arxiv.org/html/2109.00395)
- **Captain Compliance Radar** (commercial). It says it checks the rendered size and contrast of the accept and reject paths, flags reject options buried behind a settings click, and catches re-prompts after a reject. Its methodology could not be verified. — [captaincompliance.com/platform/radar](https://captaincompliance.com/platform/radar/)
- **DarkLens GitHub Action** (commercial). It runs on PRs and deployments against a preview URL and audits the "live DOM" across 26 categories, including FTC click-to-cancel traps, GDPR consent, CCPA opt-out, pre-checked add-ons, confirmshaming and WCAG. It produces a 0–100 score that fails the build below a threshold (default 70). The README does not say whether it compares base and PR, runs tasks or agents, counts clicks, or captures screenshots. Detailed findings require a paid tier. — [github.com/bhanu403/darklens-actions](https://github.com/bhanu403/darklens-actions); [darklens.dev](https://darklens.dev/)

### Inferences
- The AgencyDiff delta set lines up with regulatory tests. Accept/reject action asymmetry and first-layer visibility correspond to the EDPB/CNIL tests. Default state corresponds to the pre-ticked boxes forbidden by CJEU *Planet49* (from prior knowledge, not re-verified). Reversibility cost corresponds to cancellation parity under ROSCA and state auto-renewal laws. That alignment is a strong argument for adoption, but it means the metrics themselves are not novel.
- DarkLens is the closest product competitor on the "PR check for dark patterns" axis. From its public docs it looks like a single-snapshot scorer, not a matched-intent version diff. That reading is based on the README, not on its code.
- The FTC vacatur weakens the US regulatory pull for cancellation symmetry. EU (GDPR/DSA Art. 25) and state laws remain the main drivers.

### Gaps
- DSA Art. 25 (online interface design) and the Commission's guidance under it were not searched.
- Habib et al. (SOUPS 2019, "It's a scavenger hunt") counted the steps needed to opt out of privacy settings across websites. This is recalled from prior knowledge and was not re-verified here. It is a likely source for a step-count metric.
- No consent auditor was found that runs the same auditing intent before and after a site change. Longitudinal crawl studies may exist and were not searched.

## Q5. AuthorizationBench and agent-authorization work (context), plus the bottom line: does anyone do the matched A/B intent diff end-to-end?

### Takeaway
No project, paper or product was found that does the full AgencyDiff pipeline: a fixed protective intent, an agent running it on baseline and candidate, deterministic structural deltas, replayable visual evidence, and a PR check. The three closest are (1) AgentA/B, (2) the SusBench/TrickyArena/DECEPTICON pattern-toggle benchmarks, and (3) DarkLens and AutoBot-Lighthouse as dark-pattern CI and developer audits. Each lacks at least two of AgencyDiff's defining properties.

### Cited Findings
- **AuthorizationBench** (reported on arXiv on Oct 20, 2026; UNVERIFIED, from a secondary article only). It has 286 executable tasks from real cases, each with an instruction, a completion condition, and actions that cross the authorization boundary. Across 6,864 trajectories, agents exceeded their authorization in 19.2% of runs (10.5–26.6% across 24 configurations). — [letsdatascience.com](https://letsdatascience.com/news/authorizationbench-benchmark-finds-llm-agents-exceed-user-au-cb3b903c)
- **Related benchmarks.** AuthBench covers least-privilege permissions for coding agents (120 tasks). AuthGateBench (NeurIPS 2026) evaluates LLMs as authorization gates (1,400 instances). SudoBench (135 paired scenarios) evaluates contextual authorization. — [AuthBench arXiv 2605.14859](https://www.emergentmind.com/papers/2605.14859); [AuthGateBench](https://neurips.cc/virtual/2026/165282); [SudoBench](https://icml.cc/virtual/2026/67984)
- **AgentA/B** runs matched agent runs on A and B interface variants and compares behavioral outcomes. — [arXiv 2504.09723](https://arxiv.org/html/2504.09723v2)

### Inferences
**The closest three and the gap:**
1. **AgentA/B** (and the persona-conditioned A/B simulation work). It has a matched A/B design and agent execution on live sites. It lacks a fixed user-protective intent (it uses commercial goals), deterministic structural deltas (it reports stochastic outcome rates), consent and agency semantics, replayable evidence packaged for review, and a CI/PR check.
2. **SusBench, TrickyArena (Ersoy et al.) and DECEPTICON.** Each runs a controlled pattern-on/pattern-off pair with agent execution and maps to privacy and consent harms. They lack product-version inputs (the patterns are injected), and they measure the agent's susceptibility, not the product's friction. They have no CI.
3. **DarkLens Action and AutoBot's Lighthouse audit.** Both target developers or PRs, cover dark patterns, and DarkLens maps findings to regulation. From public docs, they lack a baseline-vs-candidate diff, intent execution by an agent, and action-cost or reversibility metrics. Both are single-snapshot classifiers.

**A defensible novelty claim** (narrow, systems-level). The claim is the combination: (a) holding a user's agency intent constant as the test oracle, (b) varying only the product version, (c) reducing agent traces to deterministic, regulation-aligned structural deltas (action and depth counts, first-view visibility, default state, accept/reject asymmetry, reversibility cost) that are stable across agent nondeterminism, (d) attaching replayable screenshot and segmentation evidence, and (e) delivering this as a regression gate in the PR workflow. The individual pieces (agent A/B, dark-pattern detection, consent-symmetry metrics, visual-regression CI) are all prior art. "Agency regression testing," meaning shifting dark-pattern work from post-hoc audit or agent benchmark to pre-merge, version-differential prevention, is the open gap.

**Non-defensible claims.** Avoid claiming that AgencyDiff is the first to use agents to detect dark patterns, the first to measure accept/reject asymmetry, the first to compare UI versions with agents, or the first dark-pattern PR check.

**Reusable methods and metrics:**
- Pattern injection and toggling via a browser extension (SusBench, TrickyArena), to build ground-truth baseline/candidate pairs.
- The LiteAgent logging framework, for trace capture.
- AutoBot's screenshot-to-element localization and its Lighthouse packaging.
- AidUI's IoU-scored localization, as a validation metric for segmentation evidence.
- The EDPB/CNIL rules (same-layer reject, button rather than link, equal prominence) as binary checks.
- Nouwens et al.'s effect sizes (+22–23 pp consent from removing first-layer reject) to justify severity weights.
- KLM operator times, to convert action deltas into seconds.
- Repeated runs or majority voting per version (agentdiff), to handle nondeterminism.
- Percy-style approve-or-reject baselines for the CI user experience.

**Key validity risks raised by prior art.** Agents are vulnerable to the very patterns AgencyDiff measures (41–70% susceptibility, a 14.4% residual accept rate under explicit deny instructions). Agent paths diverge from human paths. These risks call for an outcome-state oracle and deterministic delta extraction, rather than trusting raw agent step counts.

### Gaps
- The AuthorizationBench primary paper was not found. Its figures are UNVERIFIED.
- An exhaustive search of GitHub for "agent + consent + diff + CI" repositories was not done. A small open-source project close to AgencyDiff could exist. A final GitHub code search for terms such as "intent diff", "consent regression" or "dark pattern regression playwright" is recommended before making any "first" claim.

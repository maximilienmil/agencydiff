# Meta Global AI Developer Hackathon (2026), Indie Developer Track: Build-Facing Rules and Facts

Research date: 2026-10-28 (the event is underway; kickoff was Oct 26). Official sources checked: dev.meta.ai/events/global-hackathon (Meta) and cerebralvalley.ai/e/meta-ai-developer-hackathon (Cerebral Valley, which hosts and handles submissions). **I could not retrieve the separate Official Rules document.** Both official pages said it "will be published before the Hackathon begins on October 26, 2026." The waiver page (cerebralvalley.ai/e/meta-ai-developer-hackathon/waiver) did not render without signing in. So every rule detail below that is not marked "official page" comes from third-party blogs or participants' repos. Treat those details as unverified until checked against the Official Rules in the Cerebral Valley dashboard.

## 1. Submission deadline and event timeline

### Takeaway
Submissions are due **Wednesday, Nov 4, 2026 at 9:00 PM ET**. US DST ends Nov 1, so this is EST (UTC-5), which makes it **02:00 UTC on Nov 5**. The build window runs Oct 26 to Nov 4 (about 10 days). Judging runs Nov 4 to 8, and live finals and the winner announcement are on Nov 9. As of Oct 28, a solo builder has about 7.5 days left.

### Cited Findings
- Official key dates (ET): applications opened Oct 13 at 9:00 AM; the application deadline was Oct 25 at 11:59 PM (or earlier if 20,000 spots filled); approval notifications went out by Oct 26 at 9:00 AM; the hackathon began Oct 26 with a kickoff livestream; live workshops and Discord office hours run Oct 27 to Nov 4; **submissions are due Nov 4 at 9:00 PM ET**; judging runs Nov 4 to Nov 8; the closing ceremony with "live finals" and winner announcements is Nov 9. The pages say dates "may be subject to change at Meta's sole discretion." — [Meta event page](https://dev.meta.ai/events/global-hackathon); [Cerebral Valley event page](https://cerebralvalley.ai/e/meta-ai-developer-hackathon)
- The Cerebral Valley header shows "Oct 26 at 12:00 PM – Nov 4 at 9:00 PM (EST)", and its format line gives the submission deadline as "Nov 5, 2026 UTC". — [Cerebral Valley event page (.md)](https://cerebralvalley.ai/e/meta-ai-developer-hackathon.md)
- A participant's issue tracker converts the deadline to "4 Nov 2026, 9 PM US Eastern (5 Nov 2026, 7:30 AM IST)", which matches EST. — [SentinelX GitHub issue (participant, unofficial)](https://github.com/koushikdatascience-netizen/SentinelX/issues/1)
- Conflicting third-party dates: Internshala lists the deadline as 5 Nov at 6:30 AM IST, judging as 5–9 Nov, and winners on 10 Nov. — [Internshala listing](https://internshala.com/competitions/?p=12509). That 6:30 AM IST figure equals 9 PM EDT, which looks like a DST error. Use the official ET dates.
- An unofficial participant repo reports that Nov 4 at 9 PM ET is also the "last day to claim API credits", and that the Nov 9 closing ceremony includes a "top-10 live final" at 12 PM. — [meta-ai-hackathon/meta-hack repo (unofficial)](https://github.com/meta-ai-hackathon/meta-hack)

### Inferences
- Plan as if the deadline were Nov 4 at about 6 PM ET, a few hours early, to leave margin for uploads.
- The "live finals" on Nov 9 suggest that finalists present live, possibly via livestream. A solo builder should be ready to demo or answer questions on Nov 9.

### Gaps
- The exact time and timezone of the Nov 9 live finals, and whether finalists present live or only their videos are shown, are not on official pages.
- The "top-10 live final" claim and the credit-claim deadline come only from an unofficial repo.

## 2. What must be submitted (video, repo, demo URL, writeup, team size)

### Takeaway
**The official event pages specify none of this.** Third-party sources consistently report a short demo video of about 3 minutes, which serves as the main judging artifact, and a public repository. Team size is disputed. The official page calls the Indie track "for individual builders and students", while two unofficial sources say teams of up to 4 are allowed. A solo entry is safe either way.

### Cited Findings
- The official pages state only the deadline. Video length, repo visibility, demo URL, writeup, and team size are not specified. — [Cerebral Valley event page](https://cerebralvalley.ai/e/meta-ai-developer-hackathon); [Meta event page](https://dev.meta.ai/events/global-hackathon)
- Official track wording: Indie Developer is "For individual builders and students." Startup is "For teams and founders building a real product." "Every project enters one track." — [Meta event page](https://dev.meta.ai/events/global-hackathon)
- An unofficial participant repo lists the "Rules that shape everything" as: 3-minute demo video ("primary judging artifact"), "Public repo", "max team of 4, one submission per team", demo "shows only what was built during the event", and "unclear contribution = disqualification". — [meta-ai-hackathon/meta-hack (unofficial)](https://github.com/meta-ai-hackathon/meta-hack)
- A blog states that the Indie track allows up to four people and the Startup track has no published cap. — [AImagazine](https://aimagazine.blog/meta-opens-its-1m-global-ai-developer-hackathon-20000-seats-150-api-credits-each-and-applications-close-october-25/)
- Search snippets from a blog describe a "3-minute demo video" as the "primary judging artifact". Another guide speculates "a 2 to 3 minute demo video" is "likely" needed. — [madrobot.blog](https://madrobot.blog/2026/10/03/meta-global-ai-developer-hackathon-1-million-prizes-muse-model-api/); [thegenaimagazine](https://thegenaimagazine.com/meta-global-ai-developer-hackathon-ideas-prizes) (search-snippet level only; not fetched in full)
- Submission goes through the Cerebral Valley portal. — [SentinelX issue (unofficial)](https://github.com/koushikdatascience-netizen/SentinelX/issues/1)

### Inferences
- Default plan: a video of 3 minutes or less showing the working product, a public GitHub repo with a README, and a live demo URL if feasible. "Whether it works" is an official Indie judging criterion (see section 3), so a hosted demo is a cheap way to show that it works.
- Build only during the window, from Oct 26 on, and keep commit history visible so contribution is unambiguous.

### Gaps
- Not found on any official source: exact video length cap, whether the repo must be public, whether a demo URL or writeup is required, and the team size cap. These need confirming in the Official Rules or the submission form.

## 3. Judging criteria, weights, and themes

### Takeaway
Official wording for the Indie track: **"Judged on creativity, technical ambition, and whether it works."** The official pages give **no weights**. A weighted rubric (Impact 30%, Use of Meta AI tooling 25%, Demo 25%, Technical depth and execution 20%) circulates on blogs and in participant repos, but I could not tie it to an official document. There are two official themes, "Build for Your World" and "Push the Frontier".

### Cited Findings
- Indie track: "For individual builders and students. Judged on creativity, technical ambition, and whether it works." Startup track: "Judged on technical execution and whether it holds up in production." — [Meta event page](https://dev.meta.ai/events/global-hackathon); [Cerebral Valley event page](https://cerebralvalley.ai/e/meta-ai-developer-hackathon)
- The themes apply to either track:
  - **Theme 1, "Build for Your World":** bring Meta's models into your domain, solve a problem you know firsthand, and make something newly possible.
  - **Theme 2, "Push the Frontier":** use the models on challenges in software, robotics, manufacturing, energy, materials, and beyond, such as giving a machine a new capability or accelerating a scientific experiment.
  - Source: [Meta event page](https://dev.meta.ai/events/global-hackathon). The wording above is paraphrased by the fetch tool, which did not return verbatim text.
- Application screening, which is already over, weighted two criteria equally: (1) a clear, feasible project idea that fits one theme, and (2) technical skill shown in a past AI project. — [Meta event page](https://dev.meta.ai/events/global-hackathon)
- Unofficial weighted rubric: Impact 30%, Use of Meta AI Tooling 25%, Demo 25%, Technical Depth and Execution 20%. — [AImagazine](https://aimagazine.blog/meta-opens-its-1m-global-ai-developer-hackathon-20000-seats-150-api-credits-each-and-applications-close-october-25/); [SentinelX issue](https://github.com/koushikdatascience-netizen/SentinelX/issues/1)
- One unofficial repo describes judging as a "Pass/fail gate + scored rubric + bonus prizes". The gate is that the project must fit a problem statement and genuinely use the Meta Model API or open-weight models. — [meta-ai-hackathon/meta-hack (unofficial)](https://github.com/meta-ai-hackathon/meta-hack)
- Caution: a nearly identical four-part rubric (Demo 30%, Impact 25%, model use 25%, Depth and Execution 20%) was used for Anthropic's "Built with Opus 4.6" hackathon, also run by Cerebral Valley. The Meta numbers may be a real CV template, or they may have been copied over by blogs. — [search result referencing postvisit hackathon-rules.md](https://huggingface.co/datasets/introvoyz041/postvisit/blob/main/data/docs/hackathon-rules.md)

### Inferences
- Optimize for both rubrics: (a) a working end-to-end demo ("whether it works"), (b) a visibly ambitious or creative use of Meta models, which covers "technical ambition" and "Use of Meta AI tooling 25%", and (c) a clear, real user problem, which covers "Impact" and the "Build for Your World" theme.
- "Build for Your World" fits a solo domain-specific tool. "Push the Frontier" leans toward robotics and science.

### Gaps
- Official weights and per-criterion definitions for the Indie track were not found.
- Whether the "restrictions"/"banned anti-projects" list in one unofficial repo is official is unknown. The repo itself did not show the full list.

## 4. Meta model usage requirement and other providers

### Takeaway
Officially, participants "use" Meta's models: the Muse Spark series, Muse Wonder, Muse Image, and SAM 3.1 via the Meta Model API, plus Meta open-weights models and the Muse Code agent. The official pages state **no minimum usage threshold and say nothing about non-Meta models**. Unofficial sources describe genuine use of Meta models as a pass/fail gate. The safe assumption is that Meta models must do the core AI work, and any other provider should be a clearly secondary helper, if used at all, until the Official Rules say otherwise.

### Cited Findings
- Official: "Use the Muse Spark series, Muse Wonder, Muse Image and SAM 3.1 through Meta Model API", alongside "Meta open-weights models" that participants may run and Muse Code, an agentic coding agent. — [Cerebral Valley event page (.md)](https://cerebralvalley.ai/e/meta-ai-developer-hackathon.md); [Meta event page](https://dev.meta.ai/events/global-hackathon)
- The official inference partners are Baseten ($100 credits plus 2M TPM rate limits), Modal ($100), and Fireworks ($100 plus a workshop by Sinan Ozdemir), offered to "select participants". These are hosts for running models, not alternative model vendors. — [Cerebral Valley event page](https://cerebralvalley.ai/e/meta-ai-developer-hackathon)
- A blog FAQ says projects must build on the Meta Model API, Muse Code, or Meta's open-weights models. Other providers are not addressed. — [AImagazine](https://aimagazine.blog/meta-opens-its-1m-global-ai-developer-hackathon-20000-seats-150-api-credits-each-and-applications-close-october-25/)
- An unofficial repo says projects must "genuinely use Meta Model API or open-weight models" as a pass/fail gate. — [meta-ai-hackathon/meta-hack (unofficial)](https://github.com/meta-ai-hackathon/meta-hack)
- **Muse Glimmer** is not named on the hackathon pages, but it is a Meta open-weights model. Per press coverage it was released Aug 2026: 30B parameters, Apache 2.0, distilled from Muse Spark, agent- and tool-use-focused, text+image input, under 20 GB at 4-bit. Since the hackathon pages permit "Meta open-weights models", it would likely qualify. — [Campus Technology](https://campustechnology.com/articles/2026/08/26/meta-releases-muse-glimmer-an-open-weight-ai-model-designed-to-run-on-consumer-hardware.aspx?p=1); [DataNorth](https://datanorth.ai/news/meta-releases-muse-glimmer-agentic-model)
- **Llama** appears in the site navigation, but the hackathon page does not name it as a featured model. The Internshala listing names "Muse Code" and "Muse Image" but not Muse Spark. — [Meta event page](https://dev.meta.ai/events/global-hackathon); [Internshala](https://internshala.com/competitions/?p=12509)
- **SAM 3.x:** only "SAM 3.1" is named officially. — [Meta event page](https://dev.meta.ai/events/global-hackathon)

### Inferences
- A third-party LLM in the core path probably risks failing the pass/fail gate or scoring low on "Use of Meta AI Tooling". Using non-Meta tools for non-AI infrastructure (hosting, DB, auth) is almost certainly fine.
- Using non-Meta coding assistants to write the code is not addressed anywhere. The rules mention Muse Code only as an offered tool, not a requirement.

### Gaps
- Not found: an explicit official statement on whether non-Meta models or APIs are permitted alongside Meta's, or how much Meta model usage is required.

## 5. Pre-existing code, open-source licenses, IP ownership, credits

### Takeaway
None of this is on the official event pages. Secondary sources report that entrants keep ownership but grant Meta and Cerebral Valley a broad non-exclusive license. Participants also say submissions must be new work built during the event. The $150 Meta Model API credit is widely reported and attributed to the waiver or rules, but I could not view the official text.

### Cited Findings
- The official pages do not address pre-existing code, licensing, or IP. They say the Official Rules would cover these and would be published before Oct 26. — [Cerebral Valley event page](https://cerebralvalley.ai/e/meta-ai-developer-hackathon); [Meta event page](https://dev.meta.ai/events/global-hackathon)
- IP (secondary, attributed to the waiver or fine print, not verified):
  - Entrants retain ownership of their submissions.
  - Organisers get a "perpetual, worldwide, royalty-free, non-exclusive licence" to use, modify, and publish submissions, including for marketing.
  - Materials shared during the event are not treated as confidential, and sessions may be recorded.
  - California law governs.
  - Source: [AImagazine](https://aimagazine.blog/meta-opens-its-1m-global-ai-developer-hackathon-20000-seats-150-api-credits-each-and-applications-close-october-25/)
- Pre-existing code (unofficial): the demo "shows only what was built during the event", and "unclear contribution = disqualification". — [meta-ai-hackathon/meta-hack (unofficial)](https://github.com/meta-ai-hackathon/meta-hack). Another participant's plan warns against "retroactively claiming completed integrations". — [SentinelX issue](https://github.com/koushikdatascience-netizen/SentinelX/issues/1)
- Credits: "$150 Meta Model API credits for accepted participants". One participant notes that redemption and balance must be confirmed manually. — [SentinelX issue](https://github.com/koushikdatascience-netizen/SentinelX/issues/1); [AImagazine](https://aimagazine.blog/meta-opens-its-1m-global-ai-developer-hackathon-20000-seats-150-api-credits-each-and-applications-close-october-25/); [Coursejoiner](https://coursejoiner.com/hackathon/meta-global-hackathon-2026-1/) (says credits are not cash and their terms are in the official terms)
- A Meta- or Cerebral Valley-style marketing email also lists "$150 in Meta Model API credits". — [Sequenzy email archive](https://www.sequenzy.com/api/email-examples/j5iypr0umhagob6hpglchdwg/html)
- Partner credits ($100 each from Baseten, Modal, and Fireworks) go to "select participants". — [Cerebral Valley event page](https://cerebralvalley.ai/e/meta-ai-developer-hackathon)
- Eligibility (official): entry is open worldwide except where prohibited by law and for sanctioned or export-controlled persons and regions. The listed exclusions are Belarus, China, Russia, Ukraine, Syria, Crimea, Donetsk, Luhansk, Cuba, North Korea, and Iran. Employees, contractors, and interns of Meta and Cerebral Valley, government-affiliated individuals, and their families are ineligible. — [Meta event page](https://dev.meta.ai/events/global-hackathon)

### Inferences
- Start a fresh repo after Oct 26. If you reuse open-source libraries, list them in the README with their licenses. If you reuse any of your own prior code, disclose it explicitly.
- Assume Meta may publicize the project. Don't include anything you need to keep confidential.
- $150 in API credits is modest. Budget Muse Spark calls carefully, or run an open-weights model such as Muse Glimmer locally or on partner credits to stretch it.

### Gaps
- Not seen: the official text on pre-existing code, open-source license requirements, IP assignment versus license, or credit expiry and redemption mechanics.

## 6. Prizes and past Meta/Llama hackathon winners

### Takeaway
The official total is **$1,000,000 cash, split across the two tracks**. The official pages give no per-place breakdown. A secondary source attributes an Indie breakdown to the waiver: $150K / $100K / $75K / $50K / $25K for places 1 to 5, totalling $400K, plus up to $50K in bonus prizes shared across tracks. At the 2024 Meta x Cerebral Valley Llama 3 hackathon, **OpenGlass** won 1st place and **Deb8** won 2nd.

### Cited Findings
- Official: "$1M in prizes", described as "$1,000,000 in total cash prizes, split across the two tracks", with no per-place breakdown. — [Meta event page](https://dev.meta.ai/events/global-hackathon); [Cerebral Valley event page](https://cerebralvalley.ai/e/meta-ai-developer-hackathon)
- Secondary breakdown, which the article attributes to the waiver:
  - Indie: 1st $150K, 2nd $100K, 3rd $75K, 4th $50K, 5th $25K ($400K total).
  - Startup: $250K / $150K / $75K / $50K / $25K ($550K total).
  - Bonus prizes of up to $50K, such as a community vote or most viral project.
  - Winners bear wire, FX, and tax costs, and non-US winners may need a W-8BEN.
  - These figures sum to $1M, which is consistent with the official total.
  - Source: [AImagazine](https://aimagazine.blog/meta-opens-its-1m-global-ai-developer-hackathon-20000-seats-150-api-credits-each-and-applications-close-october-25/)
- The event is capped at 20,000 accepted participants. — [Meta event page](https://dev.meta.ai/events/global-hackathon)
- The **Meta Llama 3 Hackathon** (Cerebral Valley, SHACK15, San Francisco, Mother's Day weekend, May 2024) drew 354 attendees from more than 1,200 applicants, who built 51 projects in 24 hours.
  - 1st, **OpenGlass:** smart glasses built for about $20 that describe what the wearer sees, for example identifying fruit and giving calorie counts.
  - 2nd, **Deb8:** an AI-agent debate arena where models compete in Lincoln-Douglas format, judged and scored by a third agent.
  - 3rd, **Team AAA (Activation Ablation Augmentation):** a Llama 3 jailbreak via activation ablation.
  - Also highlighted: Feycher, Hound (RAG against human trafficking), Joe CRM, Mongoose Miner, and SixthSense (a Ray-Ban Meta glasses app).
  - Source: [Meta AI blog recap](https://ai.meta.com/blog/llama-3-hackathon-recap-cerebral-valley/)
- At the **Llama Impact Hackathon** (London, Nov 2024), the winner was Guardian / Atlas, an AI triage assistant for A&E departments. The top 3 teams shared $50K and received 6 weeks of mentorship. — [Meta Newsroom](https://about.fb.com/news/2024/11/metas-llama-impact-hackathon-pioneering-ai-solutions-for-public-good/?noamp=mobile)

### Inferences
- Past Meta winners favored tangible, demo-able, multimodal or agentic projects with a vivid "it works" moment (OpenGlass, Deb8). That matches the current Indie criteria of creativity, ambition, and whether it works.
- With up to 20,000 participants and only 5 Indie places plus bonuses, the odds are long. A polished, legible 3-minute video is the main lever.

### Gaps
- The official per-place prize breakdown and the bonus prize categories were not verified on an official page.
- No past winners exist yet for this 2026 event.

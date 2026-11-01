# AgencyDiff

Intent regression testing for user interfaces: whether a person can still do what they came to do, and at what cost, across versions of a product.

## Language

### Intentions

**Intent**:
One explicit thing a person wants to accomplish in a product, stated in plain language ("stop strangers from messaging me").
_Avoid_: task, goal, test case, persona

**Protective Intent**:
An Intent whose purpose is to limit exposure, withdraw consent, or leave (decline, restrict, cancel, delete).
_Avoid_: reject intent, opt-out

**Intent Pair**:
Two opposing Intents on the same Decision (subscribe / cancel), compared to expose Asymmetry.
_Avoid_: A/B pair

**Decision**:
A choice the product presents to a person, around which Intents are grouped (who can message me, location sharing).
_Avoid_: setting, flow, dark pattern

**Agency Contract**:
The set of Decisions, Intents, Oracles and invariants a product promises to uphold.
_Avoid_: spec, policy, test suite

### Measurement

**Probe**:
A single run of a computer-use agent attempting one Intent against one Variant. A measuring instrument, not a simulated person.
_Avoid_: synthetic user, persona, bot

**Oracle**:
The check of the product's final state that decides whether an Intent succeeded; the agent's own claim never counts.
_Avoid_: judge, grader

**Trace**:
The recorded evidence of one Probe: actions, screenshots, screens visited, timing.
_Avoid_: log, session, recording

**Asymmetry**:
The cost of the Protective side of an Intent Pair divided by the cost of the other side.
_Avoid_: fairness score, agency score

### Comparison

**Variant**:
One version of the product under test; a Diff compares a baseline Variant to a candidate Variant.
_Avoid_: build, branch, arm

**Agency Diff**:
The deterministic comparison of the same Intents across two Variants, reported as Findings.
_Avoid_: UX diff, semantic diff

**Finding**:
One measured change in an Intent's cost, visibility, default or success between Variants, linked to Traces.
_Avoid_: issue, violation, dark pattern

**Audit**:
Probing a single Variant with no baseline, reporting cost and Asymmetry only.
_Avoid_: scan

"""Merge per-case raw records into summary.json (deterministic + rediscovery)."""
import json, glob, os

HERE = os.path.dirname(os.path.abspath(__file__))
INNOCENT = {"styling-only", "relocation-equal-effort", "protective-improvement"}

def load(p):
    with open(p) as f:
        return json.load(f)

cases = []
for f in sorted(glob.glob(os.path.join(HERE, "raw", "*-*", "result.json"))):
    r = load(f)
    if r["id"].startswith("CONTROL") or r["id"].startswith("_"):
        continue
    red_path = os.path.join(HERE, "raw", r["id"], "rediscovery.json")
    red = load(red_path) if os.path.exists(red_path) else None
    innocent = r["class"] in INNOCENT
    gate_failed = not r["gatePassed"]
    if innocent:
        sel = "FALSE-BLOCK" if gate_failed else "TRUE-PASS"
    else:
        sel = "TRUE-BLOCK" if gate_failed else "MISS"
    sem = None
    if innocent:
        sem = "PRESERVED"
    elif r["class"] == "removed-choice":
        sem = "HARMED-UNREACHABLE" if (red and red["classification"] == "INFEASIBLE-CONFIRMED") else "REVIEW-REQUIRED"
    elif r["class"] == "extra-steps":
        np_path = os.path.join(HERE, "raw", r["id"], "newpath.json")
        np = load(np_path) if os.path.exists(np_path) else None
        if (red and red["classification"] == "REDISCOVERED-LONGER") or (np and np["oracle"].get("passed")):
            sem = "HARMED-COST"
        else:
            sem = "REVIEW-REQUIRED"
    elif r["class"] == "harmful-default":
        sem = "HARMED-DEFAULT"
    cases.append({
        "id": r["id"], "family": r["family"], "class": r["class"],
        "path": r["path"], "determinism": r["determinism"],
        "defaults": [r["defaultBaseline"], r["defaultCandidate"]],
        "oracleRates": r["oracleRates"],
        "gatePassed": r["gatePassed"], "findings": r["findings"],
        "rediscovery": ({k: red[k] for k in ("classification", "oraclePass", "actions", "baselineEffort")} if red else None),
        "semantic": sem, "selectivity": sel, "expect": r["expect"],
    })

controls = load(os.path.join(HERE, "raw", "controls.json")) if os.path.exists(os.path.join(HERE, "raw", "controls.json")) else []
red_sum = load(os.path.join(HERE, "raw", "rediscovery-summary.json")) if os.path.exists(os.path.join(HERE, "raw", "rediscovery-summary.json")) else {}

summary = {
    "denominators": {"cases": len(cases), "controls": len(controls)},
    "selectivity": {s: sum(1 for c in cases if c["selectivity"] == s) for s in ("TRUE-PASS", "FALSE-BLOCK", "TRUE-BLOCK", "MISS")},
    "determinism": sorted({c["id"] for c in cases if c["determinism"] != "identical"}),
    "modelSpendUsd": round(red_sum.get("usd", 0.0), 4),
    "modelCalls": red_sum.get("usage", {}).get("calls", 0),
    "controls": [{"id": c["id"], "gatePassed": c["gatePassed"], "findings": c["findings"]} for c in controls],
    "cases": cases,
}
with open(os.path.join(HERE, "raw", "summary.json"), "w") as f:
    json.dump(summary, f, indent=2)
print(json.dumps({"n": len(cases), "selectivity": summary["selectivity"], "nonidentical": summary["determinism"], "spend": summary["modelSpendUsd"]}, indent=2))

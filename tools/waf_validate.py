#!/usr/bin/env python3
"""
Validate WSLProxy WAF policies and signatures as a CI gate.

Checks:
  1. Every waf_policy JSON validates against docs/waf-policy.schema.json.
  2. Every waf_rule has the required fields and a compilable regex pattern.
  3. Every rule ID referenced by a policy's `waf_rules` exists on disk.
  4. Staged / route-override timestamps parse as ISO-8601.

Scans both the shipped set (data/waf_{policies,rules}) and any example set
(examples/**/data/waf_{policies,rules}). Exits non-zero on any error.

jsonschema is optional: if absent, schema validation is skipped with a warning
(CI installs it); the structural checks always run.
"""
import glob
import json
import os
import re
import sys
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCHEMA_PATH = os.path.join(ROOT, "docs", "waf-policy.schema.json")

errors, warnings = [], []


def err(m): errors.append(m)
def warn(m): warnings.append(m)


def find(*globs):
    out = []
    for g in globs:
        out += glob.glob(os.path.join(ROOT, g), recursive=True)
    return sorted(out)


def load(path):
    with open(path) as f:
        return json.load(f)


def rule_files():
    return find("data/waf_rules/**/*.json", "examples/**/data/waf_rules/**/*.json")


def policy_files():
    return find("data/waf_policies/**/*.json", "examples/**/data/waf_policies/**/*.json")


def check_iso(ts, where):
    try:
        datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except Exception:
        err(f"{where}: bad ISO-8601 timestamp {ts!r}")


def main():
    rules, ruleset = {}, set()
    for p in rule_files():
        try:
            r = load(p)
        except Exception as e:
            err(f"{p}: invalid JSON — {e}"); continue
        rid = r.get("id")
        if not rid:
            err(f"{p}: rule missing 'id'"); continue
        ruleset.add(rid)
        for req in ("category", "target", "action"):
            if req not in r:
                err(f"{rid}: missing '{req}'")
        pat, ptype = r.get("pattern"), r.get("pattern_type", "regex")
        if not pat:
            err(f"{rid}: empty pattern")
        elif ptype == "regex":
            try:
                re.compile(pat)  # best-effort; PCRE is a superset of Python re
            except re.error as e:
                # A construct valid in PCRE but not Python re is a warning, not a
                # hard error (the engine uses PCRE via ngx.re).
                warn(f"{rid}: pattern not Python-re compilable ({e}) — verify under PCRE")
        if r.get("action") not in ("block", "monitor"):
            err(f"{rid}: action must be block|monitor")
        rules[rid] = r
    print(f"scanned {len(ruleset)} signature rules")

    schema = None
    try:
        import jsonschema
        schema = load(SCHEMA_PATH)
    except ImportError:
        warn("jsonschema not installed — schema validation skipped")
    except Exception as e:
        err(f"cannot load schema: {e}")

    npol = 0
    for p in policy_files():
        try:
            pol = load(p)
        except Exception as e:
            err(f"{p}: invalid JSON — {e}"); continue
        npol += 1
        name = pol.get("id", os.path.basename(p))
        if schema:
            try:
                import jsonschema
                jsonschema.validate(pol, schema)
            except Exception as e:
                msg = getattr(e, "message", str(e))
                err(f"{name}: schema violation — {msg}")
        # referential integrity: every referenced signature must exist
        for rid in pol.get("waf_rules", []):
            if rid not in ruleset:
                err(f"{name}: references unknown rule '{rid}'")
        # staged timestamps
        for s in (pol.get("signatures", {}) or {}).get("stage", []):
            if "until" in s:
                check_iso(s["until"], f"{name}.signatures.stage")
        # sanity: block-mode policy should declare an enforcement mode
        if "enforcementMode" not in pol and "mode" not in pol:
            warn(f"{name}: no enforcementMode/mode — defaults to monitor")
    print(f"scanned {npol} policies")

    for w in warnings:
        print(f"  WARN  {w}")
    for e in errors:
        print(f"  ERROR {e}")
    if errors:
        print(f"\nFAILED: {len(errors)} error(s), {len(warnings)} warning(s)")
        sys.exit(1)
    print(f"\nOK: {len(warnings)} warning(s), 0 errors")


if __name__ == "__main__":
    main()

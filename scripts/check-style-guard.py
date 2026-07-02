#!/usr/bin/env python3
"""Guard Tilda customer-facing style rules.

This is intentionally lightweight. It catches drift in prompts, demo docs, client configs,
and voice/identity files before a human sees generic AI copy.
"""
from __future__ import annotations

from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]

CHECK_FILES = [
    "clients/salon-demo.yaml",
    "docs/compliance-live-pilot-pack.md",
    "docs/demo-script-hair-salon.md",
    "docs/deployment-readiness.md",
    "docs/dev-google-calendar-setup.md",
    "docs/elevenlabs-voice-agent-setup.md",
    "docs/live-provider-demo.md",
    "docs/supabase-postgres-setup.md",
    "docs/tilda-identity.md",
    "docs/tilda-priority-plan.md",
    "docs/tilda-voice-style.md",
    "docs/voice-phone-readiness.md",
    "src/deployment-preflight.ts",
    "src/deployment-smoke.ts",
    "src/elevenlabs-agent-contract.ts",
    "src/elevenlabs-wire-agent.ts",
    "src/elevenlabs-wire-agent-smoke.ts",
    "src/fake-provider-demo.ts",
    "src/prompt.ts",
    "src/readiness.ts",
    "src/server.ts",
    "src/voice-agent-contract-smoke.ts",
    "src/voice-post-call.ts",
    "src/voice-post-call-auth.ts",
    "src/voice-post-call-auth-smoke.ts",
    "src/voice-post-call-smoke.ts",
]

BANNED_LITERAL = [
    "—",
    "–",
]

BANNED_PATTERNS = [
    re.compile(r"\bas an ai\b", re.IGNORECASE),
    re.compile(r"\bai language model\b", re.IGNORECASE),
    re.compile(r"\bhow may i assist\b", re.IGNORECASE),
    re.compile(r"\bthank you for reaching out\b", re.IGNORECASE),
    re.compile(r"\bplease provide\b", re.IGNORECASE),
    re.compile(r"\bkindly\b", re.IGNORECASE),
]

# These files describe banned phrases, so they are allowed to contain the literal words.
POLICY_FILES = {
    "docs/elevenlabs-voice-agent-setup.md",
    "docs/tilda-voice-style.md",
    "docs/tilda-identity.md",
    "docs/tilda-priority-plan.md",
    "src/prompt.ts",
}

SMS_ALLOWED_CONTEXT = [
    "sms is out of scope",
    "sms is not pilot scope",
    "sms not offered",
    "sms offer",
    "sms references",
    "exclude sms",
    "keep sms out of scope",
    "sms as an offered channel",
    "sms is in scope",
    "do not offer sms",
]


def allowed_sms_line(line: str) -> bool:
    lowered = line.lower()
    return any(fragment in lowered for fragment in SMS_ALLOWED_CONTEXT)


def main() -> int:
    failures: list[str] = []

    for rel in CHECK_FILES:
        path = ROOT / rel
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8")
        for line_no, line in enumerate(text.splitlines(), 1):
            for bad in BANNED_LITERAL:
                if bad in line:
                    failures.append(f"{rel}:{line_no}: banned dash character {bad!r}")

            if rel not in POLICY_FILES:
                for pattern in BANNED_PATTERNS:
                    if pattern.search(line):
                        failures.append(f"{rel}:{line_no}: banned AI-slop phrase: {line.strip()}")

            if re.search(r"\bsms\b", line, re.IGNORECASE) and not allowed_sms_line(line):
                failures.append(f"{rel}:{line_no}: SMS mention must be explicit out-of-scope text: {line.strip()}")

    if failures:
        print("STYLE_GUARD_FAILED")
        for failure in failures:
            print(f"- {failure}")
        return 1

    print("STYLE_GUARD_OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())

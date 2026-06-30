#!/usr/bin/env python3
"""Small tracked-file secret marker scan for local pre-commit/smoke use.

This is intentionally conservative: it flags obvious committed secret values and
fixture mistakes, while allowing documented placeholder env names.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ALLOWLIST = {
    "SUPABASE_SECRET_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "OPENROUTER_API_KEY",
    "TWILIO_AUTH_TOKEN",
    "SERVER_TOOL_TOKEN",
    "GOOGLE_SA_JSON",
    "DATABASE_URL",
    "POSTGRES_URL",
    "VOICE_AGENT_PUBLIC_BASE_URL",
}

PATTERNS = [
    re.compile(r"sk-[A-Za-z0-9_\-]{20,}"),
    re.compile(r"sb_secret_[A-Za-z0-9_\-]{20,}"),
    re.compile(r"xox[baprs]-[A-Za-z0-9\-]{20,}"),
    re.compile(r"AIza[0-9A-Za-z_\-]{20,}"),
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----"),
    re.compile(r"postgres(?:ql)?://[^\s'\"<>]+:[^\s'\"<>]+@", re.IGNORECASE),
]

SKIP_SUFFIXES = {".png", ".jpg", ".jpeg", ".gif", ".ico", ".pdf", ".lock"}


def tracked_files() -> list[Path]:
    result = subprocess.run(["git", "ls-files"], check=True, text=True, capture_output=True)
    return [Path(line) for line in result.stdout.splitlines() if line]


def allowed_line(line: str) -> bool:
    if "<" in line and ">" in line:
        return True
    if "${" in line or "***" in line or "REDACTED" in line or "placeholder" in line.lower():
        return True
    return any(name in line and "=" not in line.split(name, 1)[-1].lstrip()[:1] for name in ALLOWLIST)


def main() -> int:
    findings: list[str] = []
    for path in tracked_files():
        if path.suffix.lower() in SKIP_SUFFIXES or not path.exists():
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for idx, line in enumerate(text.splitlines(), start=1):
            if allowed_line(line):
                continue
            for pattern in PATTERNS:
                if pattern.search(line):
                    findings.append(f"{path}:{idx}: possible secret marker {pattern.pattern}")
                    break

    if findings:
        print("SECRETS_SCAN_FAILED")
        print("\n".join(findings))
        return 1
    print("SECRETS_SCAN_OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())

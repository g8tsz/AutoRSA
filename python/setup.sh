#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
venv="$here/venv"

if [[ ! -d "$venv" ]]; then
  if command -v python3.12 &>/dev/null; then
    python3.12 -m venv "$venv"
  elif command -v python3 &>/dev/null; then
    python3 -m venv "$venv"
  else
    echo "Install Python 3.12+ first." >&2
    exit 1
  fi
fi

if [[ -x "$venv/bin/python" ]]; then
  py="$venv/bin/python"
elif [[ -x "$venv/Scripts/python.exe" ]]; then
  py="$venv/Scripts/python.exe"
else
  echo "venv python not found" >&2
  exit 1
fi

"$py" -m pip install -U pip
"$py" -m pip install -r "$here/requirements.txt"
"$py" -m playwright install
echo "OK: venv at $venv"

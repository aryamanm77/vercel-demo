#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_JAR="${SCRIPT_DIR}/../../exam-bank-system/qbank-standalone/target/qbank-standalone-1.0.0.jar"
DST_JAR="${SCRIPT_DIR}/../app/qbank-standalone-1.0.0.jar"
if [[ ! -f "${SRC_JAR}" ]]; then
  echo "Source JAR not found: ${SRC_JAR}" >&2
  echo "Run mvn -B package in ../exam-bank-system first." >&2
  exit 1
fi
cp -f "${SRC_JAR}" "${DST_JAR}"
echo "Synced ${DST_JAR}"

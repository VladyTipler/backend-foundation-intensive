#!/bin/sh
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  printf 'Install Node.js 24 and Docker Desktop first. See Day 0.\n'
  exit 1
fi
node scripts/lab/index.mjs

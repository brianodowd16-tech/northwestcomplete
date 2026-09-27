#!/usr/bin/env bash
# Builds gasworks-house.zip, ready for WordPress → Appearance → Themes → Upload Theme.
set -euo pipefail
cd "$(dirname "$0")"
rm -f gasworks-house.zip
zip -rq gasworks-house.zip gasworks-house -x '*.DS_Store'
echo "Built $(pwd)/gasworks-house.zip"

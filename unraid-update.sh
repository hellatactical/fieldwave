#!/bin/bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
# Replace source files with the new release first. .env and /app/data persist.
bash ./unraid-start.sh

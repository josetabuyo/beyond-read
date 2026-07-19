#!/usr/bin/env bash
# Deploys to Vercel production via the CLI (no Git integration linked —
# connecting one requires a paid plan on this account). Vercel auto-assigns
# every project a stable <project-name>.vercel.app domain and keeps it
# pointed at the latest production deploy, so no manual alias step is
# needed here.
set -euo pipefail

vercel deploy --prod --yes
echo "Live at: https://beyond-read.vercel.app"

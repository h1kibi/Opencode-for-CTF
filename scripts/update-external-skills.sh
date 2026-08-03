#!/usr/bin/env bash
# ============================================================
# update-external-skills.sh
#
# Update the local SecKnowledge reference skill in
# skills-external/secknowledge-skill/.
#
# Usage:
#   ./scripts/update-external-skills.sh
#   ./scripts/update-external-skills.sh --dry-run   # preview only
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SKILLS_REPO="$PROJECT_ROOT/skills-external/secknowledge-skill"
REMOTE_URL="https://github.com/Pa55w0rd/secknowledge-skill.git"
BRANCH="main"

DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [ ! -d "$SKILLS_REPO/.git" ]; then
  echo -e "${YELLOW}[!] skills-external/secknowledge-skill is not a git repository.${NC}"
  echo "    Expected a full git clone at: $SKILLS_REPO"
  echo "    Run: git clone $REMOTE_URL $SKILLS_REPO"
  exit 1
fi

echo -e "${GREEN}[*] Updating CTF skills mirror:${NC}"
echo "    Repo: $SKILLS_REPO"
echo "    Remote: $REMOTE_URL ($BRANCH)"
echo "    Dry-run: $DRY_RUN"
echo ""

cd "$SKILLS_REPO"

# Verify remote URL and refuse dirty checkouts.
CURRENT_REMOTE="$(git remote get-url origin 2>/dev/null || echo '')"
if [[ "$CURRENT_REMOTE" != "$REMOTE_URL" ]]; then
  echo -e "${YELLOW}[!] Remote mismatch${NC}"
  echo "    Expected: $REMOTE_URL"
  echo "    Current:  $CURRENT_REMOTE"
  exit 1
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo -e "${RED}[!] Refusing to overwrite a dirty external checkout.${NC}"
  exit 1
fi

echo -e "${GREEN}[*] Fetching remote...${NC}"
git fetch --depth=1 origin "$BRANCH" 2>&1
OLD_HASH="$(git rev-parse HEAD)"
NEW_HASH="$(git rev-parse origin/$BRANCH)"
echo "    Current: $OLD_HASH"
echo "    Latest:  $NEW_HASH"
if [[ "$OLD_HASH" == "$NEW_HASH" ]]; then
  echo -e "${GREEN}[OK] Already up to date.${NC}"
  exit 0
fi
git log --oneline "$OLD_HASH..origin/$BRANCH" --no-decorate || true
if $DRY_RUN; then
  echo -e "${YELLOW}[!] Dry-run - not applying changes.${NC}"
  exit 0
fi
git checkout --detach "origin/$BRANCH"
echo -e "${GREEN}[OK] SecKnowledge external skill updated.${NC}"
echo "    Pin the resulting commit in scripts/fetch-skills.mjs before publishing."

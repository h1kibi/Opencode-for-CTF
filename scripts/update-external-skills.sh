#!/usr/bin/env bash
# ============================================================
# update-external-skills.sh
#
# Update the local mirror of ljagiello/ctf-skills in
# skills-external/ctf-skills/.
#
# Usage:
#   ./scripts/update-external-skills.sh
#   ./scripts/update-external-skills.sh --dry-run   # preview only
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SKILLS_REPO="$PROJECT_ROOT/skills-external/ctf-skills"
REMOTE_URL="https://github.com/ljagiello/ctf-skills.git"
BRANCH="main"

DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [ ! -d "$SKILLS_REPO/.git" ]; then
  echo -e "${YELLOW}[!] skills-external/ctf-skills is not a git repository.${NC}"
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

# Verify remote URL
CURRENT_REMOTE="$(git remote get-url origin 2>/dev/null || echo '')"
if [[ "$CURRENT_REMOTE" != "$REMOTE_URL" ]]; then
  echo -e "${YELLOW}[!] Remote mismatch${NC}"
  echo "    Expected: $REMOTE_URL"
  echo "    Current:  $CURRENT_REMOTE"
  echo "    Run: git remote set-url origin $REMOTE_URL"
  exit 1
fi

# Save current HEAD for changelog
OLD_HASH="$(git rev-parse HEAD)"

# Fetch and check for updates
echo -e "${GREEN}[*] Fetching remote...${NC}"
git fetch origin "$BRANCH" 2>&1

NEW_HASH="$(git rev-parse origin/$BRANCH 2>/dev/null || echo '')"

if [[ "$OLD_HASH" == "$NEW_HASH" ]]; then
  echo -e "${GREEN}[✓] Already up to date.${NC}"
  exit 0
fi

echo -e "${YELLOW}[!] Updates available:${NC}"
echo "    Old: $OLD_HASH"
echo "    New: $NEW_HASH"

# Show changelog
echo -e "\n${GREEN}[*] Changes since last update:${NC}"
git log --oneline "$OLD_HASH..origin/$BRANCH" --no-decorate 2>/dev/null || echo "    (unable to show log)"

if $DRY_RUN; then
  echo ""
  echo -e "${YELLOW}[!] Dry-run — not applying changes.${NC}"
  echo "    Run without --dry-run to update."
  exit 0
fi

# Apply updates
echo ""
echo -e "${GREEN}[*] Updating to $NEW_HASH...${NC}"
git merge origin/$BRANCH --ff-only 2>&1

echo ""
echo -e "${GREEN}[✓] CTF skills mirror updated successfully.${NC}"

# Hint to rebuild pattern cards
echo ""
echo -e "${YELLOW}[!] If pattern cards exist in knowledge/pattern-cards/,${NC}"
echo "    you may want to rebuild them:"
echo "    cd $PROJECT_ROOT && node knowledge/pattern-cards/build-ljagiello-cards-v9.cjs"

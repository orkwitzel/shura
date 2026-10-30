#!/usr/bin/env sh
# The branch naming rule (CONTRIBUTING.md). Used by the pre-push hook and by CI.
# Usage: scripts/branch-name.sh <branch>
set -eu

. "$(dirname "$0")/conventions.sh"

branch="$1"
alt() { echo "$1" | tr ' ' '|'; }
pattern="^($(alt "$TYPES"))/($(alt "$SCOPES"))-[a-z0-9]+(-[a-z0-9]+)*\$"

case "$branch" in
  changeset-release/main | dependabot/*) exit 0 ;;
esac

if printf '%s\n' "$branch" | grep -Eq "$pattern"; then
  exit 0
fi

echo "Branch name '$branch' doesn't follow <type>/<scope>-<description>." >&2
echo "Pattern: $pattern" >&2
echo "See CONTRIBUTING.md#branches." >&2
exit 1

#!/usr/bin/env sh
# Pre-push hook: refuse pushes to main and to branches that break the naming rule.
# Git passes "<local ref> <local sha> <remote ref> <remote sha>" lines on stdin.
set -eu

zero=0000000000000000000000000000000000000000
status=0

while read -r _local_ref local_sha remote_ref _remote_sha; do
  [ "$local_sha" = "$zero" ] && continue # deleting a remote branch
  branch="${remote_ref#refs/heads/}"
  if [ "$branch" = main ]; then
    echo "Pushing to main is not allowed. Open a pull request from a branch." >&2
    status=1
    continue
  fi
  "$(git rev-parse --show-toplevel)/scripts/branch-name.sh" "$branch" || status=1
done

exit "$status"

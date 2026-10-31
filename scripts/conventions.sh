# Allowed branch/PR types and scopes (CONTRIBUTING.md). The only list the checks read:
# scripts/branch-name.sh builds its pattern from it, and CI passes it to the PR title check.
TYPES="feat fix refactor perf test docs chore ci build"
SCOPES="engine protocol client-core valkey gateway game web cli bot repo deploy"

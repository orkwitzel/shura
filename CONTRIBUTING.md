# Contributing to Shura

## Setup

Requirements: Node.js 26 (`.nvmrc`), Docker (for Valkey), and corepack, which installs the pnpm version pinned in `package.json`. Node 25 and later no longer bundle corepack, so install it once with `npm install -g corepack && corepack enable`.

```sh
pnpm install
pnpm dev        # Valkey + gateway + game + web (http://localhost:5173)
pnpm cli        # terminal client, in a separate terminal
pnpm check      # lint + typecheck + tests (what CI runs)
```

Read [`docs/design.md`](docs/design.md) before working on an area, and update it in the same PR if behaviour changes.

## Branches

All work happens on a branch. **Nothing is committed directly to `main`.** A ruleset on GitHub enforces this, and the local pre-push hook rejects such pushes.

```
<type>/<scope>-<short-description>
```

| | Allowed values |
|---|---|
| type | `feat` `fix` `refactor` `perf` `test` `docs` `chore` `ci` `build` |
| scope | `engine` `protocol` `client-core` `valkey` `gateway` `game` `web` `cli` `repo` `deploy` |
| description | lowercase words separated by `-` |

Examples: `feat/engine-srs-kicks`, `fix/gateway-reconnect-race`, `docs/repo-adr-index`.

CI checks the name against `^(feat|fix|refactor|perf|test|docs|chore|ci|build)/(engine|protocol|client-core|valkey|gateway|game|web|cli|repo|deploy)-[a-z0-9]+(-[a-z0-9]+)*$`. Bot branches (`changeset-release/main`, `dependabot/*`) are exempt.

## Pull requests

**Title:** [Conventional Commits](https://www.conventionalcommits.org), checked by CI:

```
<type>(<scope>): <imperative summary, lowercase, ≤ 72 chars>
feat(engine): add srs+ 180 kick table
fix(gateway)!: reject clients without protocolVersion      # "!" marks a breaking change
```

**Description:** fill in every section of the PR template. CI fails if a section is empty:

- **Summary:** what changed, in 1–3 sentences.
- **Why:** the problem, or the design decision this implements.
- **Changes:** a bullet list per package.
- **Testing:** how it was verified.
- **Versioning:** the changeset, `ENGINE_VERSION` and `PROTOCOL_VERSION` checklist.
- **Screenshots:** required if the web or CLI UI changed, otherwise `n/a`.

**Merging:** squash merge only, so the PR title becomes the commit message on `main`. All review conversations must be resolved and every required check must pass: `check`, `branch-name`, `pr-title`, `pr-body` and the image builds. Commits inside your branch can be messy, since squashing replaces them.

## Versions and releases

- **Changesets:** a PR that changes anything user-facing adds one (`pnpm changeset`). A bot keeps a "Version packages" PR open. Merging it publishes `shura` to npm and tags the Docker images.
- **`ENGINE_VERSION`:** bump it when game outcomes change. The replay-hash test fails if you forget.
- **`PROTOCOL_VERSION`:** bump it only for breaking message changes. Adding optional fields or new message types isn't breaking.

## Code style

Biome formats and lints all code and config files (`pnpm check`, and the pre-commit hook on staged files). Use the terms in [`docs/glossary.md`](docs/glossary.md).

## License

By contributing, you agree that your contributions are licensed under [AGPL-3.0-only](LICENSE).

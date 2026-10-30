# Domain Docs

How the engineering skills consume Shura's domain documentation.

## Before exploring, read these

- **`docs/glossary.md`**: the project's terms. This repo is single-context and this is its only glossary. Wherever a skill says `GLOSSARY.md`, it means this file; add new terms here, and keep the repo free of a root `GLOSSARY.md` or `GLOSSARY-MAP.md`.
- **`docs/adr/`**: read the ADRs that touch the area you're about to work in.
- **`docs/design.md`**: how the system behaves; read the relevant section (see `AGENTS.md`).

## Use the glossary's vocabulary

When your output names a domain concept (an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `docs/glossary.md`, and keep to the terms it chooses over their synonyms. A concept missing from the glossary means either invented language (reconsider) or a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an accepted ADR, say so explicitly rather than silently overriding it:

> _Contradicts ADR-0007 (full match log in Valkey), but worth reopening because…_

A reversal is a new ADR that supersedes the old one (see `AGENTS.md`).

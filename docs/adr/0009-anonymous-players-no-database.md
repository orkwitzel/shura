---
status: accepted
---

# Anonymous players and no database in v1

Players are a nickname plus a server-issued session token. There are no accounts, no database, no leaderboards and no stored replays in v1. Single-player personal bests are stored locally on each device. This keeps the backend to two services and Valkey, and lets anyone play with `npx shura` without signing up. Accounts (with web sessions and a CLI device-code login), a database, leaderboards and match archives are expected later. The complete match log ([ADR 0007](0007-full-match-log-in-valkey.md)) and verified results are designed so that adding them changes no existing part.

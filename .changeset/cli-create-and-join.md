---
"shura": minor
---

Play a 1v1 online. `shura create` makes a room and `shura join <CODE>` joins one: a plain lobby (Enter readies, or starts for the host; Esc leaves), the match with your opponent's half-block board beside yours, and a results line back in the lobby. `--server` (an HTTP origin, default `http://127.0.0.1:8080`) and `--name` take effect. A version mismatch prints `npm i -g shura@latest` and exits with code 1. `quick` still says quick match isn't available yet.

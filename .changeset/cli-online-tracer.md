---
"shura": minor
---

Play a 1v1 online from the terminal. `shura create` makes a room and shows its code in a plain lobby, and `shura join <CODE>` joins it; the host presses Enter to start once the other player is ready (Enter), and the match shows your board beside your opponent's, verified by the server, ending with a results line. `--server` (or `SHURA_SERVER`, or `server` in the config) chooses the server and `--name` the nickname for the run. A client too old for the server says to run `npm i -g shura@latest` and exits with code 1. `quick` still says quick match isn't available yet.

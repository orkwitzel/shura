# Web: manual real-browser checklist

What the web client's automated tests can't see (design §13.2, Tests): real browsers, real audio, real pixel ratios and real devices. It is M3's human-only check (#51). Playwright end-to-end tests will take over parts of it later (§16).

## How to run it

- Run it in current **Chrome**, **Firefox** and **Safari**, each against both:
  - `pnpm dev` (http://localhost:5173);
  - a production build: `pnpm --filter @shura/web build`, then `pnpm --filter @shura/web preview`.
- Keep the browser console open: any error or warning is a finding.
- Start from a clean profile or clear the site's storage, so the defaults are what's tested.
- Record each item as pass, fail (with what happened) or n/a (with why) per browser, on the M3 tracking issue (#40).

## Keyboard and focus

- [ ] **Focus loss mid-game.** In play, hold ← (or →) so the piece slides, then switch window (Alt+Tab or Cmd+Tab). The in-game menu is open when you come back, and once resumed the piece doesn't keep sliding: the held key was let go.
- [ ] Do the same by switching browser tab (`visibilitychange`) rather than window.
- [ ] Space and the arrow keys don't scroll the page during a game, a held arrow included. Other keys keep their browser meaning (Ctrl+R still reloads).
- [ ] Esc and P open the in-game menu during the countdown and during play.
- [ ] **Ctrl+W/T/N warning.** In the settings' *Keys*, with Ctrl bound (Left Ctrl is Rotate CCW by default), bind W, T or N to a control. The warning shows under the keys. It goes when the key or Ctrl is unbound.

## Audio

- [ ] **Unlock on the first key.** Reload `/solo/sprint` and press a game key during the countdown. The game's sounds play from then on. At most the first sound or two may be silent while the files decode.
- [ ] No console warning such as "AudioContext was not allowed to start" on load: the audio context is only made on a key press.
- [ ] Keys pressed in the main menu don't start audio. That's expected: there is no listener there.
- [ ] **Esc as the first key.** Esc doesn't count as a user activation in browsers, so it can't start audio. Reload `/solo/sprint` and press Esc first (the menu opens), then resume and play. Sound starts with the next key that isn't Esc. Check this in Chrome and in Safari.
- [ ] **Each sound, by ear.** The 15 sounds were picked by name and length only, and nobody has listened to them yet. Judge each one: does it fit what it plays for, and is it not too loud, too long or grating on repeat? The sounds are lock, single, double, triple, Tetris, T-spin, perfect clear, combo, hold, turn, hard drop, level-up, top-out and finish. Garbage can't be heard until M4, since single-player has no garbage. To swap a sound, replace its file of the same name in `apps/web/public/sounds/` and its row in `CREDITS.md`.
- [ ] Combo pitch audibly rises with each combo step.
- [ ] The volume slider in the in-game menu's settings changes loudness at once, and 0 is silent.
- [ ] **Safari:** hide the tab mid-game, come back and press a key. Audio resumes.

## Drawing

- [ ] **Crisp cells at pixel ratios 1.25 and 2.** Use browser zoom at 125 % and 200 %, a HiDPI screen, or OS display scaling. In every skin, each art pixel is sharp: no blur, no uneven pixel widths, no seams between cells. The hold and the preview are as sharp as the board.
- [ ] Resizing the window, zooming, or moving the window to another screen re-fits the board, and it stays sharp.
- [ ] **No GPU.** Turn hardware acceleration off (Chrome: Settings → System; Firefox: Settings → Performance), then restart the browser. The board still draws, through software WebGL. The countdown isn't cut short by a pause while Pixi starts. The game is playable.
- [ ] **"Needs a keyboard".** On a touch device with no keyboard, such as a phone or a tablet, the app shows "Shura needs a keyboard".

## Settings and records

- [ ] **Settings survive a reload.** Change each setting (handling, keys, ghost, theme, skin, effects, volume), reload, and each one is as it was left.
- [ ] **Personal bests survive a reload.** Finish a game in each mode, reload, and the main menu shows each mode's best.
- [ ] A setting changed from the in-game menu's *Settings* applies to the game at once.

## Modes, themes and skins

- [ ] **All three modes.** Sprint finishes at 40 lines with its time. Marathon shows its level and score, and ends at 150 lines or a top-out. Ultra counts down 2 minutes and ends with the score. Each mode's results show the right headline and personal best line.
- [ ] *Play again* and the in-game menu's *Restart* start a fresh game through the countdown. *Quit to menu* and *Main menu* return to `/`.
- [ ] **All three themes** (Indigo, Plum, Deep Sea). Switching applies at once: the backdrop, the panels and the board.
- [ ] **All three skins** (Pixel, Flat, Outline). Switching applies at once. The settings' previews match the board.

## Effects

- [ ] **Full:** line clears flash and burst. Clears of 2 or more lines shake the board. Hard drops leave a trail and nudge the board. A level-up pulses the border. A lock brightens its cells. A top-out fades the stack to grey. T-spins, back-to-backs and perfect clears burst bigger, and a big combo grows the burst.
- [ ] **Reduced:** no shake, nudge or trail. Bursts, flashes, the pulse, the brightening and the grey still show.
- [ ] **Off:** no effects. Callouts still show, as plain text.
- [ ] **Unset Effects follows the system live.** With Effects never chosen (clear storage), turn the OS "reduce motion" setting on and off while a game is open. The setting switches between *Reduced* and *Full* without a reload, and the settings screen says "Following your system".
- [ ] **Shake and the labels.** A shake or nudge moves the canvas (the frames, the hold, the preview), but not the DOM labels, the HUD or the callouts. Check that this doesn't look detached.
- [ ] **Shake shimmer at 1.25.** At pixel ratio 1.25 a shake offset is a whole CSS pixel, but not a whole physical one, so the art may shimmer for about 0.3 s during a shake. Judge whether that's acceptable. At ratios 1 and 2 the art should stay sharp through a shake, and particles should snap to art pixels.
- [ ] **Top-out grey in every skin.** Top out in Pixel, Flat and Outline. The stack greys in that skin's drawing. *Play again* from the results clears the grey.
- [ ] Particles can fly past the well's edge, where the canvas clips them. Check that this looks fine.
- [ ] Effects keep animating behind the in-game menu, because they are time-based. It's harmless, but check it isn't distracting.
- [ ] **Particle performance on a slow machine.** A big-combo back-to-back Tetris draws up to about 1,280 particle rectangles for 0.75 s. On a slow machine, or with Chrome's DevTools CPU throttling at 4× or 6×, it shouldn't drop frames enough to make the game stall or pause.

## Online: Play online and the lobby (M4)

Run `pnpm dev` (Valkey, the gateway, the game service and the web), and `pnpm dev:bot` for bots. A second browser tab is the second player.

- [ ] **Play online** in the main menu opens `/online`. The first time (clear storage), the nickname prompt comes first, prefilled with `PlayerNNNN`. Enter accepts it, a name like `no!pe` is refused as it's typed, and the name shows in the settings' *Online* section afterwards.
- [ ] With the gateway stopped, *Play online* says "Can't reach the server". Start it again and *Retry* (Enter) connects.
- [ ] **Two tabs, one room.** Tab 1: *Create room* → *1v1*. The address becomes `/r/XXXX`. *Copy link*, paste it into tab 2's address bar: tab 2 joins after its nickname prompt (if needed), and both tabs show both players in the lobby, with a "joined" toast in tab 1.
- [ ] *Copy link* puts the room's full link on the clipboard (in Safari too), and says "Link copied".
- [ ] **Ready and Start.** In tab 2, R (or Enter) toggles ready. In tab 1 (host, with the crown), Enter starts only once tab 2 is ready; until then the hint says what it waits for.
- [ ] S steps out to watch (the spectator count shows) and S again takes the seat back. N changes the nickname: both tabs show the new name, and the settings have it.
- [ ] Esc in the lobby leaves for `/online`, and the other tab gets a "left" toast (and "… is now host" if the host left). The browser's Back from a room leaves it too.
- [ ] **Reload in the lobby.** Reloading a tab in a room comes back in the same seat, without a "Leave your room first" toast.
- [ ] Opening `/r/ZZZZ` (no such room) says "No room with that code" and goes to `/online`.
- [ ] **Quick match.** *Quick match* in both tabs pairs them (the waiting screen counts the time waited; Esc cancels). With a bot (`pnpm bot quick`, see `apps/bot/README.md`), one tab is enough.
- [ ] The ping chip in the lobby's corner is green on localhost. With Chrome's DevTools network throttling, it turns yellow, then red.
- [ ] Nicknames in Hebrew (`שירה`) display correctly in the seats and in toasts.
- [ ] Going back to the main menu closes the connection: the gateway logs the session leaving, and the other tab sees a "left" toast.

## Online: the match (M4)

As above, with `pnpm dev` and `pnpm dev:bot`. `pnpm bot join XXXX --count 2` fills an FFA room with two bots, which ready up on their own.

- [ ] **A tab and 2 bots play an FFA.** *Create room* → *FFA*, add 2 bots, Enter starts once they're ready. The countdown over your well says 3, 2, 1 a second each, then GO. Your board is on the left with its HUD (Sent, PPS, Alive 3/3, the ping chip); the bots' small boards are on the right with their names and meters.
- [ ] **Hidden tab.** Mid-match, switch to another tab (or minimise the window) for 5 s and come back: your board kept playing (the piece fell and locked under gravity), you weren't lagged out, and the online menu is open. DevTools' WebSocket frames show `inputBatch` going out the whole time.
- [ ] **The online menu doesn't pause.** Esc (or P) opens *Menu* ("The match goes on"); the boards keep moving behind it, and no game key reaches your board. Esc or Enter goes back. Clicking outside the window opens it too.
- [ ] **Attack streaks.** When a bot clears lines at someone, pixels fly from its board to the target's meter and burst there, and a segment blinks red in that meter. With *Effects: Off* in the settings, no streak flies (the meter still fills).
- [ ] **Leave match** (Q in the menu) in a room by code: your board greys with your place and *left*, and a "Spectating" banner shows; Esc leaves the room for `/online`. In a quick-match room, *Leave match* leaves the room at once.
- [ ] An opponent who tops out greys, with their place and *topped out* over their well.
- [ ] **1v1 sizes.** In a 1600×900 window both full boards are at the same cell size; narrow the window and the opponent's board shrinks first, staying sharp (a multiple of 8 physical pixels) at every size and pixel ratio.
- [ ] **Reconnecting.** Mid-match, DevTools' network *Offline* for a second, then back: "Reconnecting…" shows over your HUD (not across the top), the match carries on, and the bots' boards catch up.
- [ ] No sound or callout plays for the opponents' locks; yours play as in single-player.

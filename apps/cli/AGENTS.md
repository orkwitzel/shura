# apps/cli

The Ink terminal client. Its behaviour is in `docs/design.md` §13.3. This file is about where code goes.

## Layout

```text
src/
├── main.ts     runs the Commander program
├── app/        the root: the commands, which screen shows, the providers, starting Ink, the stores
├── screens/    one folder per screen: main-menu/, solo/, results/, settings/
├── board/      board text drawing (rows of coloured characters), not React
└── platform/   anything that touches the terminal itself: input/, terminal/, the clock, file storage
```

## Rules

- `app/` decides which screen to show, and `screens/` holds the screens. Every command lives in `app/commands.ts`, and each one only parses its input and opens a screen. `app/` imports `screens/`, never the reverse.
- `components/` holds React components (`.tsx`) only, and is created once a second screen shares one. Until then a component stays in its screen's folder.
- Code that isn't React gets a folder named after what it does, like `board/`.
- Anything that touches the terminal itself goes in `platform/`, whatever its form (hook, component or plain module).
- A file is named after its main export, in kebab-case. Import each file by its path: no `index.ts` barrels.
- A screen is `<Name>Screen` in `<name>-screen.tsx` (`SoloScreen` in `screens/solo/solo-screen.tsx`).
- `tests/` mirrors `src/` (`tests/screens/solo/…`, `tests/platform/input/…`). Tests that drive the whole app go in `tests/app/`, and test-only helpers in `tests/support/`.

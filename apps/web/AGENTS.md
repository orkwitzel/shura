# apps/web

The React web client. `docs/design.md` §13.2 describes how it behaves; this file says where code goes. The layout follows [Bulletproof React](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md), adapted to this repo.

## Layout

```text
src/
├── main.tsx       mounts React
├── app/           app.tsx, provider.tsx (the stores into <ClientCoreProvider>), router.tsx
│   └── routes/    the pages, one per route: main-menu-page, solo-page, settings-page
├── features/      one folder per capability: board/ (with effects/), callouts/, hud/, countdown/,
│                  game-menu/, results/, personal-bests/, settings/, sound/
├── components/    React components shared by features or pages: ui/ (the primitives), the
│                  backdrop, the "needs a keyboard" screen
├── hooks/         shared hooks: use-solo-session, use-theme, use-reduced-motion
├── lib/           browser APIs and libraries set up for Shura: keyboard/, pixi/, audio/,
│                  raf-clock, local-storage
├── stores/        the app's Zustand stores: settings-store, records-store
├── config/        fixed values: default-bindings, routes
├── utils/         small pure helpers, created when one is needed
├── styles/        tokens.css, the reset, the font imports
└── assets/        static files bundled with the app
```

## Pages and features

- **Pages.** A page is a route in `app/routes/`. It:
  - reads the URL;
  - gets the session or stores it needs;
  - arranges features on the screen.

  Pages stay thin: no game logic and no drawing.
- **Features.** A feature is one capability, and it doesn't know which page uses it. Features never import each other. When two need to work together, the page connects them.
- **Sub-features.** A part that only ever appears inside one feature is a sub-feature in that feature's folder (`features/board/effects/`), under the same rules.
- **Import direction.** Imports go one way: shared folders → features → app.
  - The shared folders are `components/`, `hooks/`, `lib/`, `stores/`, `config/`, `utils/` and `styles/`. They never import `features/` or `app/`.
  - Features never import `app/`.
- **Import paths.**
  - Outside your own feature, import `src/` through the `@/` alias (`@/lib/pixi/draw-cell`).
  - Inside a feature, use relative paths.
- **Enforcement.** Biome's `noRestrictedImports` enforces the direction, through `overrides` in `biome.json`. A file in a feature that imports `@/features/…` or `@/app/…` fails `pnpm check`, so a feature reaches its own files only by relative paths.

## Inside a feature

A feature has only the sub-folders it needs:

- `components/`;
- `hooks/`;
- `stores/`, for UI state that only this feature uses;
- `types/`;
- `utils/`, for pure functions;
- `assets/`;
- `pixi/`, for code that draws with Pixi.

Pixi code is kept thin and isn't unit-tested (design §13.2). Logic goes in `utils/`, where it is tested.

```text
features/board/
├── components/board-canvas.tsx
├── utils/layout-board.ts, cell-size.ts
├── pixi/board-painter.ts
└── effects/
    ├── utils/effects-for-events.ts, effect-frame.ts
    └── pixi/effects-painter.ts
```

## Where shared code goes

Code that only one feature uses stays in that feature. Shared code goes by what it is:

- **It touches a browser API or a library:** `lib/`. For example, the keyboard adapter, the `requestAnimationFrame` clock, client-core's `Storage` over `localStorage`, and the Pixi setup plus `draw-cell.ts`, which the board and the settings screen's skin previews share, and `draw-shapes.ts`, which the board and effects painters share.
- **It's a constant:** `config/`.
- **It's pure logic, with no browser API and no library:** `utils/`.
- **It's a React component that more than one feature or page uses:** `components/`. `components/ui/` holds the primitives (`Button`, `MenuList`, `Dialog`, `Slider`, `Toggle`, `RadioGroup`, `KeyCapture`), built on native HTML elements.

## State

- **Settings and records.** These are Zustand stores, created once as module singletons in `stores/` with client-core's `createSettingsStore` and `createRecordsStore`, over `lib/local-storage`.
  - `app/provider.tsx` passes them into `<ClientCoreProvider>`.
  - Components read them through client-core's hooks (`useSettings`, `useRecords`, `useSettingsStore`), as in the CLI.
  - Code that isn't React imports the singletons directly.
- **The solo session.** A session belongs to one game.
  - `hooks/use-solo-session.ts` creates it on mount. It brings the `requestAnimationFrame` clock, the saved settings and the keyboard, and writes the records when a game ends.
  - The hook disposes of it on unmount.
  - The page passes it to features as a prop, and they read it with `useSession(session, selector)`. Features never create sessions or stores.
- **UI state.** State that only one feature uses goes in that feature's `stores/`.

## Names

- **Files** are kebab-case and named after their main export (`board-canvas.tsx` exports `BoardCanvas`). Import each file by its path: no `index.ts` barrels.
- **Components** are PascalCase, in `.tsx` files.
- **Hooks** are `use<Thing>`, in `use-<thing>.ts`.
- **Pages** are `<Name>Page`, in `<name>-page.tsx` (`SoloPage` in `app/routes/solo-page.tsx`).
- **Styles.** A component's CSS Module sits next to it with the same name (`button.tsx`, `button.module.css`). Class names are camelCase (`styles.menuItem`).
- **Stores** are in `<thing>-store.ts`.
- **Terms.** Use the glossary's terms (`callout`, `skin`, `hold`, `garbage`).

## Tests

- `tests/` mirrors `src/` (`tests/features/board/…`, `tests/components/ui/…`, `tests/lib/…`).
- Tests that drive the whole app (routing, redirects, the provider) go in `tests/app/`.
- Test-only helpers go in `tests/support/`, such as the setup file, `render-with-stores.tsx` (a `<ClientCoreProvider>` with fresh in-memory stores) and the fake clock, `AudioContext` and `matchMedia`.
- There is no `src/testing/`.
- Tests import `src/` through the `@/` alias.

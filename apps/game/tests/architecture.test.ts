import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { handlersWithLogic, sourceFiles } from './support/handler-rule';
import { lintAs } from './support/lint-probe';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = fileURLToPath(new URL('../src', import.meta.url));
const fixture = fileURLToPath(new URL('./support/fixtures/handlers.gateway.ts', import.meta.url));

test('every @SubscribeMessage handler is one statement delegating to a feature service', () => {
  expect(sourceFiles(src).flatMap((file) => handlersWithLogic(file, root))).toEqual([]);
});

test('the rule catches handlers with logic in them', () => {
  expect(handlersWithLogic(fixture, root)).toEqual([
    'tests/support/fixtures/handlers.gateway.ts:LogicGateway.twoStatements',
    'tests/support/fixtures/handlers.gateway.ts:LogicGateway.branches',
    'tests/support/fixtures/handlers.gateway.ts:LogicGateway.noService',
  ]);
});

const importing = (specifier: string) =>
  `import { DrainingIndicator } from '${specifier}';\n\nexport const x = DrainingIndicator;\n`;

test.each([
  ['a feature', 'apps/game/src/rooms/rooms.service.ts', '../health/draining.indicator'],
  ['a root file', 'apps/game/src/room-link.gateway.ts', './health/draining.indicator'],
])('Biome rejects a deep import into another feature from %s', (_, path, specifier) => {
  expect(lintAs(path, importing(specifier))).toContain('lint/style/noRestrictedImports');
});

test.each([
  ['a feature', 'apps/game/src/rooms/rooms.service.ts', '../health'],
  ['a root file', 'apps/game/src/room-link.gateway.ts', './health'],
])("Biome accepts an import of another feature's index.ts from %s", (_, path, specifier) => {
  expect(lintAs(path, importing(specifier))).toEqual([]);
});

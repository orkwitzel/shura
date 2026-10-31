/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const src = resolve(dirname(fileURLToPath(import.meta.url)), '../src');

/** Every module specifier a source file imports or re-exports, type-only ones included. */
function specifiers(source: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(/(?:\bfrom|\bimport)\s*\(?\s*['"]([^'"]+)['"]/g)) {
    if (match[1]) found.push(match[1]);
  }
  return found;
}

/** The packages a source file reaches, following its relative imports through `src`. */
function packagesReachedFrom(entry: string): Set<string> {
  const packages = new Set<string>();
  const seen = new Set<string>();
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const specifier of specifiers(readFileSync(file, 'utf8'))) {
      if (specifier.startsWith('.')) visit(resolve(dirname(file), `${specifier}.ts`));
      else packages.add(specifier);
    }
  };
  visit(resolve(src, entry));
  return packages;
}

/** React itself, or a module that pulls it in (Zustand's root entry is its React binding). */
function bringsReact(specifier: string): boolean {
  return (
    /^(react|react-dom)(\/|$)/.test(specifier) ||
    /^zustand(\/react|\/traditional)?$/.test(specifier)
  );
}

describe('entry points (design §13.1, ADR 0012)', () => {
  test('the root entry reaches no React, so non-React code can use client-core', () => {
    const packages = [...packagesReachedFrom('index.ts')];
    expect(packages).toContain('@shura/engine');
    expect(packages).toContain('zustand/vanilla');
    expect(packages.filter(bringsReact)).toEqual([]);
  });

  test('the react entry is where React comes in', () => {
    expect([...packagesReachedFrom('react.ts')].filter(bringsReact)).toEqual(['react', 'zustand']);
  });

  test.each([
    "import { useState } from 'react';",
    "import type { ReactNode } from 'react';",
    "export { createRoot } from 'react-dom/client';",
    "import { useStore } from 'zustand';",
    "import { useStoreWithEqualityFn } from 'zustand/traditional';",
    "const lazy = import('react');",
  ])('flags %s', (line) => {
    expect(specifiers(line).filter(bringsReact)).not.toEqual([]);
  });

  test('allows the vanilla store', () => {
    expect(
      specifiers("import { createStore } from 'zustand/vanilla';").filter(bringsReact),
    ).toEqual([]);
  });
});

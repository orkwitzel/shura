import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { type Expression, parseSync, type Statement } from '@swc/core';

/** The `.ts` files under `dir`, recursively. */
export const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.ts'))
    .map((file) => join(dir, file));

/** Whether `expression` is a call of a method on one of the class's fields: `this.x.y(…)`. */
const isDelegation = (expression: Expression): boolean => {
  const call = expression.type === 'AwaitExpression' ? expression.argument : expression;
  if (call.type !== 'CallExpression' || call.callee.type !== 'MemberExpression') {
    return false;
  }
  const target = call.callee.object;
  return target.type === 'MemberExpression' && target.object.type === 'ThisExpression';
};

const isDelegatingStatement = (statement: Statement): boolean => {
  if (statement.type === 'ReturnStatement') {
    return statement.argument !== undefined && isDelegation(statement.argument);
  }
  return statement.type === 'ExpressionStatement' && isDelegation(statement.expression);
};

/**
 * The `@SubscribeMessage` handlers in `file` that are more than one statement handing the
 * message to a feature service (`this.service.method(…)`, optionally returned or awaited), as
 * `path:Class.method`, with `path` relative to `root` (docs/agents/nest.md).
 */
export const handlersWithLogic = (file: string, root: string): string[] => {
  const module = parseSync(readFileSync(file, 'utf8'), {
    syntax: 'typescript',
    decorators: true,
  });
  const found: string[] = [];
  for (const item of module.body) {
    const declaration =
      item.type === 'ExportDeclaration'
        ? item.declaration
        : item.type === 'ExportDefaultDeclaration'
          ? item.decl
          : item;
    if (declaration.type !== 'ClassDeclaration' && declaration.type !== 'ClassExpression') {
      continue;
    }
    for (const member of declaration.body) {
      if (member.type !== 'ClassMethod') {
        continue;
      }
      const subscribes = member.function.decorators?.some(
        ({ expression }) =>
          expression.type === 'CallExpression' &&
          expression.callee.type === 'Identifier' &&
          expression.callee.value === 'SubscribeMessage',
      );
      if (!subscribes) {
        continue;
      }
      const statements = member.function.body?.stmts ?? [];
      const [only] = statements;
      if (statements.length !== 1 || only === undefined || !isDelegatingStatement(only)) {
        const name = member.key.type === 'Identifier' ? member.key.value : '?';
        const className = 'identifier' in declaration ? declaration.identifier?.value : '?';
        found.push(`${relative(root, file)}:${className}.${name}`);
      }
    }
  }
  return found;
};

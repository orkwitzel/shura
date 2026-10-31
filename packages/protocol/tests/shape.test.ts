import { describe, expect, test } from 'vitest';
import { currentShape, type ProtocolShape, shapeProblems, storedShape } from './support/shape';

test('the schemas have the stored shape', () => {
  const problems = shapeProblems(storedShape(), currentShape());
  expect(problems, problems.join('\n')).toEqual([]);
});

/** The current shape as the schemas would be after `edit`, which changes a copy of it. */
const edited = (edit: (groups: ProtocolShape['groups']) => void): ProtocolShape => {
  const shape = structuredClone(currentShape());
  edit(shape.groups);
  return shape;
};
const client = (groups: ProtocolShape['groups']) => groups.clientToGateway ?? {};
const server = (groups: ProtocolShape['groups']) => groups.gatewayToClient ?? {};
const hello = (groups: ProtocolShape['groups']) => client(groups).hello ?? {};

const asksForBump = (problems: string[]) => {
  expect(problems).not.toEqual([]);
  for (const problem of problems) expect(problem).toMatch(/bump PROTOCOL_VERSION/);
};
const asksOnlyForRerecord = (problems: string[]) => {
  expect(problems).not.toEqual([]);
  for (const problem of problems) {
    expect(problem).not.toMatch(/bump/);
    expect(problem).toMatch(/record-shape/);
  }
};

describe('a breaking change while PROTOCOL_VERSION stays the same asks for a bump', () => {
  test('a message removed', () => {
    const problems = shapeProblems(
      currentShape(),
      edited((groups) => {
        delete client(groups).takeSeat;
      }),
    );
    asksForBump(problems);
    expect(problems[0]).toMatch(/`takeSeat` was removed or renamed/);
  });

  test('a message renamed', () => {
    const problems = shapeProblems(
      currentShape(),
      edited((groups) => {
        const messages = server(groups);
        messages.ack = messages.batchAck ?? {};
        delete messages.batchAck;
      }),
    );
    asksForBump(problems);
  });

  test('a field renamed', () => {
    const problems = shapeProblems(
      currentShape(),
      edited((groups) => {
        const fields = hello(groups);
        fields.name = fields.nickname ?? '';
        delete fields.nickname;
      }),
    );
    asksForBump(problems);
    expect(problems.join('\n')).toMatch(/`hello\.nickname` was removed or renamed/);
  });

  test('a nested field removed', () => {
    const problems = shapeProblems(
      currentShape(),
      edited((groups) => {
        delete server(groups).roomState?.['players[].seat'];
      }),
    );
    asksForBump(problems);
  });

  test('a field that changes type or becomes required', () => {
    asksForBump(
      shapeProblems(
        currentShape(),
        edited((groups) => {
          hello(groups).protocolVersion = 'string';
        }),
      ),
    );
    asksForBump(
      shapeProblems(
        currentShape(),
        edited((groups) => {
          hello(groups).sessionToken = 'string';
        }),
      ),
    );
  });

  test('an enum value removed', () => {
    asksForBump(
      shapeProblems(
        currentShape(),
        edited((groups) => {
          hello(groups).kind = 'enum(guest)?';
        }),
      ),
    );
  });

  test('a new required field on an existing message', () => {
    asksForBump(
      shapeProblems(
        currentShape(),
        edited((groups) => {
          hello(groups).locale = 'string';
        }),
      ),
    );
  });
});

describe('a compatible change only asks for the shape to be re-recorded', () => {
  test('a new optional field', () => {
    asksOnlyForRerecord(
      shapeProblems(
        currentShape(),
        edited((groups) => {
          hello(groups).accountToken = 'string?';
        }),
      ),
    );
  });

  test('a new optional object, even with required fields of its own', () => {
    asksOnlyForRerecord(
      shapeProblems(
        currentShape(),
        edited((groups) => {
          Object.assign(hello(groups), {
            device: 'object?',
            'device.os': 'string',
            tags: 'array?',
            'tags[]': 'object',
            'tags[].name': 'string',
          });
        }),
      ),
    );
  });

  test('a new message type', () => {
    asksOnlyForRerecord(
      shapeProblems(
        currentShape(),
        edited((groups) => {
          client(groups).emote = { emote: 'string' };
        }),
      ),
    );
  });

  test('a new enum value', () => {
    asksOnlyForRerecord(
      shapeProblems(
        currentShape(),
        edited((groups) => {
          hello(groups).kind = 'enum(guest|bot|account)?';
        }),
      ),
    );
  });
});

test('after a PROTOCOL_VERSION bump, the shape only needs re-recording', () => {
  const bumped = edited((groups) => {
    delete client(groups).takeSeat;
  });
  bumped.protocolVersion += 1;
  asksOnlyForRerecord(shapeProblems(currentShape(), bumped));
});

import { z } from 'zod';

// Every message is `{ event, data }`, Nest's envelope, in both directions and on the internal
// gateway ⇄ game links too (design §8.2). Each group of messages is a record of `data` schemas by
// event, which the services turn into DTOs (`createZodDto(clientMessages.hello)`), and a
// discriminated union on `event` built from it, which checks a whole message off the wire.
//
// Unknown fields pass through, on `data` and on the envelope, so adding optional fields stays
// backward compatible (§8.2). Renaming, removing or changing the meaning of a message or field is
// a breaking change that bumps `PROTOCOL_VERSION` (§8.3).

/** A message's `data`: an object that lets unknown fields through. */
export const data = <Shape extends z.ZodRawShape>(shape: Shape) => z.looseObject(shape);

/** The `data` of a message with no fields. */
export const noData = () => z.looseObject({});

/** A record of `data` schemas, by event. */
export type Messages = Record<string, z.ZodType>;

type Envelope<Event extends string, Data extends z.ZodType> = z.ZodObject<
  { event: z.ZodLiteral<Event>; data: Data },
  z.core.$loose
>;
type Envelopes<M extends Messages> = {
  [Event in keyof M & string]: Envelope<Event, M[Event]>;
}[keyof M & string];

/** The `{ event, data }` messages of `messages`, as one union discriminated on `event`. */
export function envelopes<M extends Messages>(messages: M) {
  const options = Object.entries(messages).map(([event, data]) =>
    z.looseObject({ event: z.literal(event), data }),
  );
  return z.discriminatedUnion('event', options as unknown as [Envelopes<M>, ...Envelopes<M>[]]);
}

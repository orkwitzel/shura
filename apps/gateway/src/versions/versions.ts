import { ENGINE_VERSION } from '@shura/engine';
import { PROTOCOL_VERSION } from '@shura/protocol';

/**
 * Whether a client's versions are the server's (design §8.3, ADR 0006): its `protocolVersion`
 * and `engineVersion`, from the `/api` headers or the `hello`. Anything else is a mismatch, older
 * or newer.
 */
export const versionsMatch = (protocolVersion: unknown, engineVersion: unknown): boolean =>
  String(protocolVersion) === String(PROTOCOL_VERSION) &&
  String(engineVersion) === String(ENGINE_VERSION);

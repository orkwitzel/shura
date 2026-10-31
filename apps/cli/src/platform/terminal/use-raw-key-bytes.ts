import type { EventEmitter } from 'node:events';
import { useStdin } from 'ink';
import { useEffect, useRef } from 'react';

/**
 * The raw bytes of each key, for the debug log (design §7.3), while `listening`. Ink parses them
 * before `useInput` sees the key and keeps them to itself, so this listens where Ink hands each
 * key's bytes to `useInput`. Call it before `useInput`: it is then subscribed first, so it hears
 * each key just before `useInput` does. Returns what takes the bytes of the key `useInput` is
 * handling, or `null` when they weren't heard.
 */
export function useRawKeyBytes(listening: boolean): () => string | null {
  const bytes = useRef<string | null>(null);
  const { internal_eventEmitter: keys } = useStdin() as ReturnType<typeof useStdin> & {
    internal_eventEmitter?: EventEmitter;
  };
  useEffect(() => {
    if (!listening || !keys) return;
    const onKey = (data: unknown) => {
      bytes.current = String(data);
    };
    keys.on('input', onKey);
    return () => {
      keys.off('input', onKey);
    };
  }, [listening, keys]);
  return () => {
    const heard = bytes.current;
    bytes.current = null;
    return heard;
  };
}

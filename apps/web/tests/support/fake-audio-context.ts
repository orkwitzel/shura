/** A sample the fake started: which file, at what playback rate, through what gain. */
export interface PlayedSample {
  readonly url: string;
  readonly rate: number;
  readonly gain: number;
}

interface FakeGain {
  readonly gain: { value: number };
  connect(target: unknown): void;
}

interface FakeBuffer {
  readonly url: string;
}

/**
 * A stand-in for the Web Audio `AudioContext` (happy-dom has none) that records what it decodes and
 * plays. Pair it with `loadUrl`: each "file" it loads is its own URL, so a decoded buffer, and a
 * sample played from it, say which file they came from.
 */
export class FakeAudioContext {
  /** Every context made, oldest first. */
  static readonly made: FakeAudioContext[] = [];

  state: 'suspended' | 'running' | 'closed' = 'running';
  readonly destination = {};
  /** The URLs of the files decoded, in order. */
  readonly decoded: string[] = [];
  /** The samples started, in order. */
  readonly played: PlayedSample[] = [];
  /** How many times `resume` was called. */
  resumed = 0;

  constructor() {
    FakeAudioContext.made.push(this);
  }

  createGain(): FakeGain {
    return { gain: { value: 1 }, connect() {} };
  }

  createBufferSource() {
    let target: FakeGain | undefined;
    const source = {
      buffer: null as FakeBuffer | null,
      playbackRate: { value: 1 },
      connect: (node: FakeGain) => {
        target = node;
      },
      start: () => {
        if (!source.buffer || !target) throw new Error('started a source with no buffer or output');
        this.played.push({
          url: source.buffer.url,
          rate: source.playbackRate.value,
          gain: target.gain.value,
        });
      },
    };
    return source;
  }

  decodeAudioData(data: ArrayBuffer): Promise<FakeBuffer> {
    const url = new TextDecoder().decode(data);
    this.decoded.push(url);
    return Promise.resolve({ url });
  }

  resume(): Promise<void> {
    this.resumed += 1;
    this.state = 'running';
    return Promise.resolve();
  }
}

/** A loader whose "file" at each URL is the URL's own text, which `FakeAudioContext` decodes back. */
export const loadUrl = (url: string): Promise<ArrayBuffer> =>
  Promise.resolve(new TextEncoder().encode(url).buffer as ArrayBuffer);

/** A fresh fake context, typed as the real one for code that takes an `AudioContext`. */
export function fakeAudioContext(): AudioContext {
  return new FakeAudioContext() as unknown as AudioContext;
}

/** Forgets the contexts made so far. */
export function resetFakeAudio(): void {
  FakeAudioContext.made.length = 0;
}

/** Lets pending loads and decodes finish. */
export const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

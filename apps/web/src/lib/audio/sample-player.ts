/**
 * Plays short named samples over Web Audio, once the browser lets a page start audio.
 *
 * Plain Web Audio rather than a library such as howler.js: the sound tests (#50) drive this layer
 * through a fake `AudioContext` passed in, and howler makes its context globally as it is imported
 * and falls back to HTML5 Audio under happy-dom, so it can't be tested that way. The wrapper is
 * small.
 */
export interface SamplePlayer<Name extends string> {
  /**
   * Starts audio: call it from a user's key press, as browsers require. The first call makes the
   * audio context and loads and decodes every sample once; later calls resume a suspended context.
   */
  unlock(): void;
  /** Sets the volume, 0 (off) to 100. */
  setVolume(volume: number): void;
  /**
   * Plays `name` at `rate` times its speed (higher is higher pitched). Does nothing before
   * `unlock`, at volume 0, or while the sample hasn't loaded (or failed to).
   */
  play(name: Name, rate?: number): void;
}

export interface SamplePlayerOptions {
  /** Makes the audio context, or returns `undefined` where there is no Web Audio. */
  readonly createContext?: () => AudioContext | undefined;
  /** Loads a sample's file. */
  readonly load?: (url: string) => Promise<ArrayBuffer>;
}

/** Audio as it stands: not started, started, or unavailable (the browser has no Web Audio). */
type AudioState =
  | { readonly status: 'locked' }
  | { readonly status: 'unavailable' }
  | { readonly status: 'started'; readonly context: AudioContext; readonly output: GainNode };

const browserContext = (): AudioContext | undefined =>
  typeof AudioContext === 'undefined' ? undefined : new AudioContext();

async function fetchFile(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.arrayBuffer();
}

/** A player of the samples at `urls`, each a URL by name. */
export function createSamplePlayer<Name extends string>(
  urls: Readonly<Record<Name, string>>,
  { createContext = browserContext, load = fetchFile }: SamplePlayerOptions = {},
): SamplePlayer<Name> {
  let volume = 0;
  let audio: AudioState = { status: 'locked' };
  const buffers = new Map<Name, AudioBuffer>();

  const start = (): AudioState => {
    const context = createContext();
    if (!context) return { status: 'unavailable' };
    const output = context.createGain();
    output.gain.value = volume / 100;
    output.connect(context.destination);
    for (const name of Object.keys(urls) as Name[]) {
      load(urls[name])
        .then((file) => context.decodeAudioData(file))
        .then(
          (buffer) => buffers.set(name, buffer),
          // A sample that can't be loaded stays silent; the rest still play.
          () => undefined,
        );
    }
    return { status: 'started', context, output };
  };

  return {
    unlock() {
      if (audio.status === 'locked') audio = start();
      else if (audio.status === 'started' && audio.context.state === 'suspended') {
        // Refused without a user's key press; the next one tries again.
        audio.context.resume().catch(() => undefined);
      }
    },
    setVolume(next) {
      volume = next;
      if (audio.status === 'started') audio.output.gain.value = volume / 100;
    },
    play(name, rate = 1) {
      const buffer = buffers.get(name);
      if (audio.status !== 'started' || volume === 0 || !buffer) return;
      const source = audio.context.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = rate;
      source.connect(audio.output);
      source.start();
    },
  };
}

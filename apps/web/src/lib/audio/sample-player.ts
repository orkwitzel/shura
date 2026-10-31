/** Plays short named samples over Web Audio, once the browser lets a page start audio. */
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
  let audio: { context: AudioContext; output: GainNode } | 'none' | undefined;
  const buffers = new Map<Name, AudioBuffer>();

  const start = () => {
    const context = createContext();
    if (!context) return 'none' as const;
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
    return { context, output };
  };

  return {
    unlock() {
      if (audio === undefined) audio = start();
      else if (audio !== 'none' && audio.context.state === 'suspended') {
        // Refused without a user's key press; the next one tries again.
        audio.context.resume().catch(() => undefined);
      }
    },
    setVolume(next) {
      volume = next;
      if (audio && audio !== 'none') audio.output.gain.value = volume / 100;
    },
    play(name, rate = 1) {
      const buffer = buffers.get(name);
      if (!audio || audio === 'none' || volume === 0 || !buffer) return;
      const source = audio.context.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = rate;
      source.connect(audio.output);
      source.start();
    },
  };
}

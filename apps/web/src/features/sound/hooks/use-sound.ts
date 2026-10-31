import type { SoloSession } from '@shura/client-core';
import { useSettings } from '@shura/client-core/react';
import { useEffect } from 'react';
import {
  createSamplePlayer,
  type SamplePlayer,
  type SamplePlayerOptions,
} from '@/lib/audio/sample-player';
import { SOUNDS, type Sound, soundsForEvent } from '../utils/sounds-for-event';

export type SoundPlayer = SamplePlayer<Sound>;

/** A player of the game's sounds, from `public/sounds/<sound>.mp3`. */
export function createSoundPlayer(options?: SamplePlayerOptions): SoundPlayer {
  const urls = Object.fromEntries(
    SOUNDS.map((sound) => [sound, `${import.meta.env.BASE_URL}sounds/${sound}.mp3`]),
  ) as Record<Sound, string>;
  return createSamplePlayer(urls, options);
}

let shared: SoundPlayer | undefined;

/** The page's one player, so each sample is loaded and decoded once however many games are played. */
const sharedPlayer = (): SoundPlayer => {
  shared ??= createSoundPlayer();
  return shared;
};

/**
 * Plays `session`'s engine events as sounds (design §13.2, Sound), at the settings' volume. Audio
 * starts at the first key press, as browsers require.
 */
export function useSound(session: SoloSession, player: SoundPlayer = sharedPlayer()): void {
  const volume = useSettings((settings) => settings.volume);
  useEffect(() => player.setVolume(volume), [player, volume]);

  useEffect(() => {
    const unlock = () => player.unlock();
    window.addEventListener('keydown', unlock);
    return () => window.removeEventListener('keydown', unlock);
  }, [player]);

  useEffect(
    () =>
      session.onEvents((events) => {
        for (const event of events) {
          for (const { sound, rate } of soundsForEvent(event)) player.play(sound, rate);
        }
      }),
    [session, player],
  );
}

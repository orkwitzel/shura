# Sound credits

Every sound here but `combo.mp3` comes from one pack:

- **Pack:** 512 Sound Effects (8-bit style), "The Essential Retro Video Game Sound Effects Collection [512 sounds]"
- **Author:** Juhani Junkala (SubspaceAudio)
- **Licence:** [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) (public domain dedication), as stated on the pack's page and in its `INFO.txt`
- **URL:** <https://opengameart.org/content/512-sound-effects-8-bit-style>

CC0 asks for no attribution; this file credits the author anyway.

The files were converted from the pack's 44.1 kHz 16-bit mono `.wav` to 96 kb/s mono `.mp3` and renamed after what they play for. Nothing else was changed.

| File | Plays for | Original file |
|---|---|---|
| `lock.mp3` | a piece locking without clearing | `Movement/Jumping and Landing/sfx_movement_jump9_landing.wav` |
| `turn.mp3` | a turn | `General Sounds/Menu Sounds/sfx_menu_move4.wav` |
| `hold.mp3` | a hold | `General Sounds/Interactions/sfx_sounds_interaction1.wav` |
| `hard-drop.mp3` | a hard drop | `General Sounds/Impacts/sfx_sounds_impact1.wav` |
| `single.mp3` | a 1-line clear | `General Sounds/Coins/sfx_coin_single2.wav` |
| `double.mp3` | a 2-line clear | `General Sounds/Coins/sfx_coin_double1.wav` |
| `triple.mp3` | a 3-line clear | `General Sounds/Coins/sfx_coin_cluster3.wav` |
| `tetris.mp3` | a 4-line clear | `General Sounds/Positive Sounds/sfx_sounds_powerup3.wav` |
| `t-spin.mp3` | a T-spin | `General Sounds/High Pitched Sounds/sfx_sounds_high4.wav` |
| `perfect-clear.mp3` | a perfect clear | `General Sounds/Fanfares/sfx_sounds_fanfare1.wav` |
| `garbage.mp3` | garbage landing | `General Sounds/Simple Damage Sounds/sfx_damage_hit3.wav` |
| `level-up.mp3` | a level-up | `General Sounds/Positive Sounds/sfx_sounds_powerup15.wav` |
| `top-out.mp3` | a top-out | `General Sounds/Negative Sounds/sfx_sounds_negative2.wav` |
| `finish.mp3` | a finished game | `General Sounds/Fanfares/sfx_sounds_fanfare3.wav` |

`combo.mp3` (each combo step, a semitone higher each time) was made for Shura instead: the pack's blip it replaced, a loud square wave, was harsh layered over a clear. It is a soft triangle-wave F4 (349 Hz, the 8-bit consoles' gentlest voice) lasting 180 ms, with a 4 ms attack and a quick decay. Shura dedicates it to the public domain under the same CC0 1.0. To make it again:

```sh
ffmpeg -f lavfi -i "aevalsrc='0.5*(2/PI)*asin(sin(2*PI*349.23*t))*min(t/0.004\,1)*exp(-t/0.05)*min((0.18-t)/0.01\,1)':s=44100:d=0.18:c=mono" -c:a libmp3lame -b:a 96k combo.mp3
```

To change a sound, replace its file with another of the same name (and update this table). No code changes.

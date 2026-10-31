import styles from './player-name.module.css';

export interface PlayerNameProps {
  /** The nickname, as the server has it (`Dan#2`, any script). */
  readonly name: string;
  /** Your own board's: "You · Or", in the accent colour. */
  readonly you?: boolean;
  /** Dimmed once the player is out. */
  readonly out?: boolean;
}

/** A player's name over their board in a match (design §13.2, Match). */
export function PlayerName({ name, you = false, out = false }: PlayerNameProps) {
  return (
    <span
      className={styles.name}
      data-you={you ? '' : undefined}
      data-out={out ? '' : undefined}
      dir="auto"
      title={name}
    >
      {you && <span className={styles.you}>You · </span>}
      {name}
    </span>
  );
}

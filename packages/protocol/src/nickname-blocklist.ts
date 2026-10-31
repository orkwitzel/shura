/**
 * Words a nickname may not contain (design §11). Add to this list freely.
 *
 * A nickname is blocked if, lowercased and with its spaces, `_`, `-` and accents (niqqud included)
 * removed, it contains one of these, compared the same way. So `admin` also blocks "The Admin" and
 * "a_d-m i n". Matching is by containment, so a short word blocks every name it appears in: prefer
 * words that don't turn up inside ordinary names.
 */
export const NICKNAME_BLOCKLIST: readonly string[] = [
  // Names that pass for the people running the game.
  'admin',
  'moderator',
  // Abuse, in English.
  'fuck',
  'shit',
  'cunt',
  'bitch',
  'whore',
  'slut',
  'faggot',
  'nigger',
  'nigga',
  'hitler',
  'nazi',
  // Abuse, in Hebrew.
  'שרמוטה',
  'בן זונה',
];

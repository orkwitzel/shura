/** A place as words show it: 1st, 2nd, 3rd, 4th, 11th, 21st… */
export function ordinal(place: number): string {
  const tens = place % 100;
  const suffix =
    tens >= 11 && tens <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[place % 10] ?? 'th');
  return `${place}${suffix}`;
}

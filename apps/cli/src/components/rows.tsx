import { Text } from 'ink';

/** Rows of pre-coloured strings, one `<Text>` each (design §13.3): a board, hold, the preview. */
export function Rows({ rows }: { rows: readonly string[] }) {
  return (
    <>
      {rows.map((row, index) => (
        // The rows are positions, so their index is their identity.
        <Text key={index}>{row}</Text>
      ))}
    </>
  );
}

/**
 * Puts `text` on the clipboard. Resolves `false` where the browser refuses (no clipboard, or no
 * permission), so the caller can say so.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

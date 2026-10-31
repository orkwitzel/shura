import { personalBestSummary, type SoloMode } from '@shura/client-core';
import { useRecords } from '@shura/client-core/react';

export interface PersonalBestSummaryProps {
  readonly mode: SoloMode;
  readonly className?: string;
}

/**
 * A mode's personal best, as the main menu shows it beside the mode (design §13.1, §13.2): its
 * headline, for Marathon with the level and lines too, or "no record yet". It updates as soon as a
 * game sets a new one.
 */
export function PersonalBestSummary({ mode, className }: PersonalBestSummaryProps) {
  const best = useRecords((records) => records[mode]);
  return <span className={className}>{personalBestSummary(mode, best)}</span>;
}

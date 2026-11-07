import { Module } from '@nestjs/common';
import { NEW_MATCH, randomMatch } from './new-match';

/**
 * Matches are plain classes (`Match`) that rooms create. The module provides what a new match is
 * made from: its id and seed (`NEW_MATCH`), which tests replace with a fixed seed.
 */
@Module({
  providers: [{ provide: NEW_MATCH, useValue: randomMatch }],
  exports: [NEW_MATCH],
})
export class MatchModule {}

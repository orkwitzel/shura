import { Global, Module } from '@nestjs/common';
import { CLOCK, systemClock } from './clock';

/** Provides the `Clock` by its `CLOCK` token, to every module. */
@Global()
@Module({
  providers: [{ provide: CLOCK, useValue: systemClock }],
  exports: [CLOCK],
})
export class ClockModule {}

import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { DrainingIndicator } from './draining.indicator';
import { HealthController } from './health.controller';

@Module({
  imports: [TerminusModule.forRoot({ logger: false })],
  controllers: [HealthController],
  providers: [DrainingIndicator],
  exports: [DrainingIndicator],
})
export class HealthModule {}

import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { DrainingIndicator } from './draining.indicator';

/** `/livez` and `/readyz` (docs/design.md §12), on the service's one port, never routed publicly. */
@Controller()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly draining: DrainingIndicator,
  ) {}

  /** The process is alive. */
  @Get('livez')
  @HealthCheck()
  livez() {
    return this.health.check([]);
  }

  /** The pod takes new work: not draining (Valkey's check comes with the stores). */
  @Get('readyz')
  @HealthCheck()
  readyz() {
    return this.health.check([() => this.draining.check()]);
  }
}

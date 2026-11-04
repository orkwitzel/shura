import { type BeforeApplicationShutdown, Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';

/**
 * Whether this pod is draining: shutting down, so it takes no new work and `/readyz` fails
 * (docs/design.md §9.7, §12). Set on shutdown, or by whatever starts a drain.
 */
@Injectable()
export class DrainingIndicator implements BeforeApplicationShutdown {
  private draining = false;

  constructor(private readonly health: HealthIndicatorService) {}

  get isDraining(): boolean {
    return this.draining;
  }

  /** Marks the pod as draining. It never stops draining. */
  drain(): void {
    this.draining = true;
  }

  beforeApplicationShutdown(): void {
    this.drain();
  }

  /** The terminus check: `draining` is up while the pod isn't draining. */
  check() {
    const session = this.health.check('draining');
    return this.draining ? session.down() : session.up();
  }
}

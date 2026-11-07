import { Module } from '@nestjs/common';
import { HealthModule } from '../health';
import { RoomsModule } from '../rooms';
import { HeartbeatService } from './heartbeat.service';

@Module({
  imports: [HealthModule, RoomsModule],
  providers: [HeartbeatService],
})
export class HeartbeatModule {}

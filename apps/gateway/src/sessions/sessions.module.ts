import { Module } from '@nestjs/common';
import { ConnectionsService } from './connections.service';
import { SessionGuard } from './session.guard';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

@Module({
  controllers: [SessionsController],
  providers: [ConnectionsService, SessionsService, SessionGuard],
  exports: [ConnectionsService, SessionsService, SessionGuard],
})
export class SessionsModule {}

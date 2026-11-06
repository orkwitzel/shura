import { Module } from '@nestjs/common';
import { RoomLinksModule } from '../room-links';
import { SessionsModule } from '../sessions';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

@Module({
  imports: [SessionsModule, RoomLinksModule],
  controllers: [RoomsController],
  providers: [RoomsService],
  exports: [RoomsService],
})
export class RoomsModule {}

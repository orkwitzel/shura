import { Module } from '@nestjs/common';
import { RoomLinksService } from './room-links.service';

@Module({
  providers: [RoomLinksService],
  exports: [RoomLinksService],
})
export class RoomLinksModule {}

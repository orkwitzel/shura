import { Controller, Get, Param } from '@nestjs/common';
import type { RoomInfo } from '@shura/protocol';
import { RoomsService } from './rooms.service';

/** `GET /api/rooms/:code` (design §8.7): checks a room link before joining. */
@Controller('api/rooms')
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Get(':code')
  lookup(@Param('code') code: string): Promise<RoomInfo> {
    return this.rooms.lookup(code);
  }
}

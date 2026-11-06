import { Injectable } from '@nestjs/common';
import type { WebSocket } from 'ws';
import { RoomsService } from '../rooms';
import type { InputBatchDto } from './play.dto';

/**
 * Play (design §8.1): input batches go on to the room's game pod, which verifies them. Its pushes
 * (`countdown`, `batchAck`, `relay`, `playerOut`, `matchEnd`) come back through the room's link.
 */
@Injectable()
export class PlayService {
  constructor(private readonly rooms: RoomsService) {}

  inputBatch(socket: WebSocket, batch: InputBatchDto): Promise<void> {
    return this.rooms.forward(socket, { event: 'inputBatch', data: batch });
  }
}

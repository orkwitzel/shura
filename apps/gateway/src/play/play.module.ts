import { Module } from '@nestjs/common';
import { RoomsModule } from '../rooms';
import { PlayService } from './play.service';

@Module({
  imports: [RoomsModule],
  providers: [PlayService],
  exports: [PlayService],
})
export class PlayModule {}

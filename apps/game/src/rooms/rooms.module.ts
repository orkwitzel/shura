import { Module } from '@nestjs/common';
import { MatchModule } from '../match';
import { RoomsService } from './rooms.service';

@Module({
  imports: [MatchModule],
  providers: [RoomsService],
  exports: [RoomsService],
})
export class RoomsModule {}

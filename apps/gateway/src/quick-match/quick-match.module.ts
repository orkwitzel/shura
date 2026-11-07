import { Module } from '@nestjs/common';
import { RoomsModule } from '../rooms';
import { SessionsModule } from '../sessions';
import { QuickMatchService } from './quick-match.service';

@Module({
  imports: [SessionsModule, RoomsModule],
  providers: [QuickMatchService],
  exports: [QuickMatchService],
})
export class QuickMatchModule {}

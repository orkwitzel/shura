import { Body, Controller, Post } from '@nestjs/common';
import type { Session } from '@shura/protocol';
import { RateLimit } from '../limits';
import { CreateSessionDto } from './sessions.dto';
import { SessionsService } from './sessions.service';

/** `POST /api/sessions` (design §8.7): a client's first contact. */
@Controller('api/sessions')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Post()
  @RateLimit('sessions')
  create(@Body() body: CreateSessionDto): Promise<Session> {
    return this.sessions.create(body);
  }
}

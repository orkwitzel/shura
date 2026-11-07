import type { IncomingMessage } from 'node:http';
import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Session } from '@shura/protocol';
import { IpLimitsService } from '../limits';
import { CreateSessionDto } from './sessions.dto';
import { SessionsService } from './sessions.service';

/** `POST /api/sessions` (design §8.7): a client's first contact. */
@Controller('api/sessions')
export class SessionsController {
  constructor(
    private readonly sessions: SessionsService,
    private readonly ips: IpLimitsService,
  ) {}

  /**
   * Only a new session counts toward the `sessions` per-IP limit (design §11): a resume with a
   * live token goes through, so a client trying every 250 ms to get back isn't locked out of its
   * seat.
   */
  @Post()
  create(@Body() body: CreateSessionDto, @Req() request: IncomingMessage): Promise<Session> {
    return this.sessions.create(body, this.ips.ipOf(request));
  }
}

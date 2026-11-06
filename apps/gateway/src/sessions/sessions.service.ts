import { randomBytes, randomUUID } from 'node:crypto';
import { HttpException, Inject, Injectable } from '@nestjs/common';
import { ERRORS, errorBody, type Session, validateNickname } from '@shura/protocol';
import type { Stores } from '@shura/valkey';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { WebSocket } from 'ws';
import { CLOCK, type Clock } from '../clock';
import { STORES } from '../valkey';
import { versionsMatch } from '../versions';
import { ConnectionsService } from './connections.service';
import type { CreateSessionDto, HelloDto, PingDto } from './sessions.dto';

/**
 * Sessions (design §10.2): created or resumed over `POST /api/sessions`, then named by their token
 * in the socket's `hello`, which also checks the versions (§8.3). And the clock pings (§8.4).
 */
@Injectable()
export class SessionsService {
  constructor(
    @Inject(STORES) private readonly stores: Stores,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly connections: ConnectionsService,
    @InjectPinoLogger(SessionsService.name) private readonly logger: PinoLogger,
  ) {}

  /**
   * `POST /api/sessions`: the session a still-valid token names, as it was, or a new one with a
   * random id and token and the nickname as the server normalizes it (`nickname_invalid` if it
   * can't be used).
   */
  async create({ nickname, sessionToken }: CreateSessionDto): Promise<Session> {
    if (sessionToken !== undefined) {
      const known = await this.stores.sessions.get(sessionToken);
      if (known) return { sessionId: known.sessionId, sessionToken, nickname: known.nickname };
    }
    const checked = validateNickname(nickname);
    if (!checked.ok) {
      throw new HttpException(
        errorBody('nickname_invalid', `That nickname can't be used (${checked.reason}).`),
        ERRORS.nickname_invalid.status,
      );
    }
    const session: Session = {
      sessionId: randomUUID(),
      sessionToken: randomBytes(24).toString('base64url'),
      nickname: checked.nickname,
    };
    await this.stores.sessions.create(session.sessionToken, {
      sessionId: session.sessionId,
      nickname: session.nickname,
    });
    this.logger.info({ sessionId: session.sessionId }, 'session created');
    return session;
  }

  /**
   * The socket's `hello` (design §8.3): the versions must be the server's and the token a live
   * session's, or the socket gets `version_mismatch` or `session_required` and is closed. Then
   * `welcome`.
   */
  hello(socket: WebSocket, hello: HelloDto): Promise<void> {
    return this.connections.inTurn(socket, async (connection) => {
      if (!versionsMatch(hello.protocolVersion, hello.engineVersion)) {
        this.logger.info(
          { protocolVersion: hello.protocolVersion, engineVersion: hello.engineVersion },
          'version mismatch',
        );
        this.connections.refuse(connection, errorBody('version_mismatch'));
        return;
      }
      const record = await this.stores.sessions.get(hello.sessionToken);
      if (!record) {
        this.connections.refuse(
          connection,
          errorBody('session_required', 'Your session has expired. Start a new one.'),
        );
        return;
      }
      const kind = hello.kind ?? 'guest';
      connection.session = {
        id: record.sessionId,
        token: hello.sessionToken,
        nickname: record.nickname,
        kind,
      };
      this.logger.info({ sessionId: record.sessionId, kind }, 'hello');
      this.connections.send(connection, {
        event: 'welcome',
        data: { sessionId: record.sessionId, serverTime: this.clock.now() },
      });
    });
  }

  /** `ping`: `pong` with the server's time, for the client's clock offset (design §8.4). */
  ping(socket: WebSocket, { id }: PingDto): Promise<void> {
    return this.connections.inTurn(socket, (connection) => {
      this.connections.send(connection, {
        event: 'pong',
        data: { id, serverTime: this.clock.now() },
      });
    });
  }
}

import type { IncomingMessage } from 'node:http';
import { UseGuards } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { WebSocket } from 'ws';
import { WsProtocol } from './errors';
import { ConnectionLimits, ConnectionLimitsService, INVALID_MESSAGE, RateLimit } from './limits';
import { InputBatchDto, PlayService } from './play';
import { QuickMatchService } from './quick-match';
import { CreateRoomDto, JoinRoomDto, ReadyDto, RoomsService } from './rooms';
import { ConnectionsService, HelloDto, PingDto, SessionGuard, SessionsService } from './sessions';

/**
 * The one WS gateway class for the public socket, `/ws` (docs/agents/nest.md). Every
 * `@SubscribeMessage` handler is one statement handing the message to a feature service. Its
 * largest message is `MAX_PAYLOAD_BYTES`, set by `ClientWsAdapter` (design §11).
 */
@WebSocketGateway({ path: '/ws', perMessageDeflate: false })
@WsProtocol()
@ConnectionLimits()
export class ClientGateway implements OnGatewayConnection, OnGatewayDisconnect {
  constructor(
    private readonly connections: ConnectionsService,
    private readonly sessions: SessionsService,
    private readonly rooms: RoomsService,
    private readonly play: PlayService,
    private readonly quickMatching: QuickMatchService,
    private readonly limits: ConnectionLimitsService,
  ) {}

  /**
   * A socket opened: its first turn is the per-IP connection limits' answer (design §11), so its
   * messages wait for it.
   */
  handleConnection(socket: WebSocket, request: IncomingMessage): void {
    this.connections.open(socket);
    this.connections.inTurn(socket, () => this.limits.admit(socket, request)).catch(() => {});
  }

  handleDisconnect(socket: WebSocket): Promise<void> {
    this.limits.closed(socket).catch(() => {});
    return this.connections.close(socket);
  }

  /** Anything that isn't a client message (design §11). */
  @SubscribeMessage(INVALID_MESSAGE)
  invalid(@ConnectedSocket() socket: WebSocket) {
    return this.limits.invalid(socket);
  }

  @SubscribeMessage('hello')
  hello(@ConnectedSocket() socket: WebSocket, @MessageBody() message: HelloDto) {
    return this.sessions.hello(socket, message);
  }

  @SubscribeMessage('ping')
  ping(@ConnectedSocket() socket: WebSocket, @MessageBody() message: PingDto) {
    return this.sessions.ping(socket, message);
  }

  @SubscribeMessage('createRoom')
  @RateLimit('rooms')
  @UseGuards(SessionGuard)
  createRoom(@ConnectedSocket() socket: WebSocket, @MessageBody() message: CreateRoomDto) {
    return this.rooms.createRoom(socket, message);
  }

  @SubscribeMessage('joinRoom')
  @RateLimit('failedJoins')
  @UseGuards(SessionGuard)
  joinRoom(@ConnectedSocket() socket: WebSocket, @MessageBody() message: JoinRoomDto) {
    return this.rooms.joinRoom(socket, message);
  }

  @SubscribeMessage('leaveRoom')
  @UseGuards(SessionGuard)
  leaveRoom(@ConnectedSocket() socket: WebSocket) {
    return this.rooms.leaveRoom(socket);
  }

  @SubscribeMessage('ready')
  @UseGuards(SessionGuard)
  ready(@ConnectedSocket() socket: WebSocket, @MessageBody() message: ReadyDto) {
    return this.rooms.ready(socket, message);
  }

  @SubscribeMessage('startMatch')
  @UseGuards(SessionGuard)
  startMatch(@ConnectedSocket() socket: WebSocket) {
    return this.rooms.startMatch(socket);
  }

  @SubscribeMessage('quickMatch')
  @UseGuards(SessionGuard)
  quickMatch(@ConnectedSocket() socket: WebSocket) {
    return this.quickMatching.quickMatch(socket);
  }

  @SubscribeMessage('cancelQuickMatch')
  @UseGuards(SessionGuard)
  cancelQuickMatch(@ConnectedSocket() socket: WebSocket) {
    return this.quickMatching.cancelQuickMatch(socket);
  }

  @SubscribeMessage('rematch')
  @UseGuards(SessionGuard)
  rematch(@ConnectedSocket() socket: WebSocket) {
    return this.quickMatching.rematch(socket);
  }

  @SubscribeMessage('inputBatch')
  @UseGuards(SessionGuard)
  inputBatch(@ConnectedSocket() socket: WebSocket, @MessageBody() message: InputBatchDto) {
    return this.play.inputBatch(socket, message);
  }
}

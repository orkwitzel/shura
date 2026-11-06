import { UseGuards } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { LIMIT_DEFAULTS } from '@shura/protocol';
import type { WebSocket } from 'ws';
import { WsProtocol } from './errors';
import { InputBatchDto, PlayService } from './play';
import { CreateRoomDto, JoinRoomDto, ReadyDto, RoomsService } from './rooms';
import { ConnectionsService, HelloDto, PingDto, SessionGuard, SessionsService } from './sessions';

/**
 * The one WS gateway class for the public socket, `/ws` (docs/agents/nest.md). Every
 * `@SubscribeMessage` handler is one statement handing the message to a feature service.
 */
@WebSocketGateway({
  path: '/ws',
  maxPayload: LIMIT_DEFAULTS.maxPayloadBytes,
  perMessageDeflate: false,
})
@WsProtocol()
export class ClientGateway implements OnGatewayConnection, OnGatewayDisconnect {
  constructor(
    private readonly connections: ConnectionsService,
    private readonly sessions: SessionsService,
    private readonly rooms: RoomsService,
    private readonly play: PlayService,
  ) {}

  handleConnection(socket: WebSocket): void {
    this.connections.open(socket);
  }

  handleDisconnect(socket: WebSocket): Promise<void> {
    return this.connections.close(socket);
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
  @UseGuards(SessionGuard)
  createRoom(@ConnectedSocket() socket: WebSocket, @MessageBody() message: CreateRoomDto) {
    return this.rooms.createRoom(socket, message);
  }

  @SubscribeMessage('joinRoom')
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

  @SubscribeMessage('inputBatch')
  @UseGuards(SessionGuard)
  inputBatch(@ConnectedSocket() socket: WebSocket, @MessageBody() message: InputBatchDto) {
    return this.play.inputBatch(socket, message);
  }
}

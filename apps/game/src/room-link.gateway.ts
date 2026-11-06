import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { LIMIT_DEFAULTS } from '@shura/protocol';
import type { WebSocket } from 'ws';
import { WsProtocol } from './errors';
import {
  AttachDto,
  CreateRoomDto,
  DetachDto,
  InputBatchDto,
  LeaveRoomDto,
  ReadyDto,
  RematchDto,
  RoomsService,
  SetNicknameDto,
  SpectateDto,
  StartMatchDto,
  TakeSeatDto,
} from './rooms';

/**
 * The one WS gateway class for the gateway service's room links, `/room-links`
 * (docs/agents/nest.md). Every `@SubscribeMessage` handler is one statement handing the message
 * to a feature service.
 */
@WebSocketGateway({
  path: '/room-links',
  // A link carries a room's batches for every player in it: room for a few at once.
  maxPayload: LIMIT_DEFAULTS.maxPayloadBytes * 16,
  perMessageDeflate: false,
})
@WsProtocol()
export class RoomLinkGateway implements OnGatewayDisconnect {
  constructor(private readonly rooms: RoomsService) {}

  handleDisconnect(link: WebSocket): void {
    this.rooms.linkClosed(link);
  }

  @SubscribeMessage('createRoom')
  createRoom(@ConnectedSocket() link: WebSocket, @MessageBody() message: CreateRoomDto) {
    return this.rooms.createRoom(link, message);
  }

  @SubscribeMessage('attach')
  attach(@ConnectedSocket() link: WebSocket, @MessageBody() message: AttachDto) {
    return this.rooms.attach(link, message);
  }

  @SubscribeMessage('detach')
  detach(@ConnectedSocket() link: WebSocket, @MessageBody() message: DetachDto) {
    return this.rooms.detach(link, message);
  }

  @SubscribeMessage('leaveRoom')
  leaveRoom(@ConnectedSocket() link: WebSocket, @MessageBody() message: LeaveRoomDto) {
    return this.rooms.leaveRoom(link, message);
  }

  @SubscribeMessage('setNickname')
  setNickname(@ConnectedSocket() link: WebSocket, @MessageBody() message: SetNicknameDto) {
    return this.rooms.setNickname(link, message);
  }

  @SubscribeMessage('spectate')
  spectate(@ConnectedSocket() link: WebSocket, @MessageBody() message: SpectateDto) {
    return this.rooms.spectate(link, message);
  }

  @SubscribeMessage('takeSeat')
  takeSeat(@ConnectedSocket() link: WebSocket, @MessageBody() message: TakeSeatDto) {
    return this.rooms.takeSeat(link, message);
  }

  @SubscribeMessage('ready')
  ready(@ConnectedSocket() link: WebSocket, @MessageBody() message: ReadyDto) {
    return this.rooms.ready(link, message);
  }

  @SubscribeMessage('startMatch')
  startMatch(@ConnectedSocket() link: WebSocket, @MessageBody() message: StartMatchDto) {
    return this.rooms.startMatch(link, message);
  }

  @SubscribeMessage('rematch')
  rematch(@ConnectedSocket() link: WebSocket, @MessageBody() message: RematchDto) {
    return this.rooms.rematch(link, message);
  }

  @SubscribeMessage('inputBatch')
  inputBatch(@ConnectedSocket() link: WebSocket, @MessageBody() message: InputBatchDto) {
    return this.rooms.inputBatch(link, message);
  }
}

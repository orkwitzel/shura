import { WebSocketGateway } from '@nestjs/websockets';
import { WsProtocol } from './errors';

/**
 * The one WS gateway class for the gateway service's room links, `/room-links`
 * (docs/agents/nest.md). Every `@SubscribeMessage` handler is one statement handing the message
 * to a feature service.
 */
@WebSocketGateway({ path: '/room-links' })
@WsProtocol()
export class RoomLinkGateway {}

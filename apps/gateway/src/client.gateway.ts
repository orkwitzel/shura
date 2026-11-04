import { WebSocketGateway } from '@nestjs/websockets';
import { WsProtocol } from './errors';

/**
 * The one WS gateway class for the public socket, `/ws` (docs/agents/nest.md). Every
 * `@SubscribeMessage` handler is one statement handing the message to a feature service.
 */
@WebSocketGateway({ path: '/ws' })
@WsProtocol()
export class ClientGateway {}

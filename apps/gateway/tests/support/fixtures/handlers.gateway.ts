import { MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';

// Handlers for the architecture test: the first gateway follows the rule, the second breaks it.

class PingService {
  pong(id: number) {
    return { event: 'pong', data: { id } };
  }
}

@WebSocketGateway()
export class DelegatingGateway {
  constructor(private readonly pings: PingService) {}

  @SubscribeMessage('ping')
  ping(@MessageBody() body: { id: number }) {
    return this.pings.pong(body.id);
  }

  @SubscribeMessage('pingLater')
  async pingLater(@MessageBody() body: { id: number }) {
    await this.pings.pong(body.id);
  }
}

@WebSocketGateway()
export class LogicGateway {
  constructor(private readonly pings: PingService) {}

  @SubscribeMessage('twoStatements')
  twoStatements(@MessageBody() body: { id: number }) {
    const id = body.id + 1;
    return this.pings.pong(id);
  }

  @SubscribeMessage('branches')
  branches(@MessageBody() body: { id: number }) {
    if (body.id > 0) {
      return this.pings.pong(body.id);
    }
    return undefined;
  }

  @SubscribeMessage('noService')
  noService(@MessageBody() body: { id: number }) {
    return { event: 'pong', data: { id: body.id } };
  }
}

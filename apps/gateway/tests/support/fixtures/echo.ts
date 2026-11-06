import { Body, Controller, Injectable, Module, Post } from '@nestjs/common';
import { MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { WsProtocol } from '../../../src/errors';

// A route and a WS handler taking a DTO, to test validation and error mapping on both transports.
// Booted alongside AppModule (`boot({ imports: [EchoModule] })`), so the app's global pipe applies.
// Its socket is `/echo`, apart from the app's own WS gateway class.

class EchoDto extends createZodDto(z.object({ id: z.number().int() })) {}

@Injectable()
class EchoService {
  echo(body: EchoDto) {
    return { event: 'echo', data: body };
  }
}

@Controller('api/echo')
class EchoController {
  constructor(private readonly service: EchoService) {}

  @Post()
  echo(@Body() body: EchoDto) {
    return this.service.echo(body).data;
  }
}

@WebSocketGateway({ path: '/echo' })
@WsProtocol()
class EchoGateway {
  constructor(private readonly service: EchoService) {}

  @SubscribeMessage('echo')
  echo(@MessageBody() body: EchoDto) {
    return this.service.echo(body);
  }
}

@Module({
  controllers: [EchoController],
  providers: [EchoService, EchoGateway],
})
export class EchoModule {}

import { Body, Controller, Injectable, Module, Post } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ValidationPipe, WsProtocol } from '../../../src/errors';

// A route and a WS handler taking a DTO, to test validation and error mapping on both transports.

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

@WebSocketGateway({ path: '/room-links' })
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
  providers: [{ provide: APP_PIPE, useClass: ValidationPipe }, EchoService, EchoGateway],
})
export class EchoModule {}

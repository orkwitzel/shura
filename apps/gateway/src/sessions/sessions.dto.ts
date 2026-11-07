import { clientMessages, createSessionRequestSchema } from '@shura/protocol';
import { createZodDto } from 'nestjs-zod';

export class CreateSessionDto extends createZodDto(createSessionRequestSchema) {}
export class HelloDto extends createZodDto(clientMessages.hello) {}
export class PingDto extends createZodDto(clientMessages.ping) {}

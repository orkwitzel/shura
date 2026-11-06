import { clientMessages } from '@shura/protocol';
import { createZodDto } from 'nestjs-zod';

export class InputBatchDto extends createZodDto(clientMessages.inputBatch) {}

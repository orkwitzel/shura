import { gatewayToGameMessages } from '@shura/protocol';
import { createZodDto } from 'nestjs-zod';

// The room-link messages the rooms take (design §8.7), validated by `@WsProtocol()`'s pipe.

export class CreateRoomDto extends createZodDto(gatewayToGameMessages.createRoom) {}
export class AttachDto extends createZodDto(gatewayToGameMessages.attach) {}
export class DetachDto extends createZodDto(gatewayToGameMessages.detach) {}
export class LeaveRoomDto extends createZodDto(gatewayToGameMessages.leaveRoom) {}
export class ReadyDto extends createZodDto(gatewayToGameMessages.ready) {}
export class StartMatchDto extends createZodDto(gatewayToGameMessages.startMatch) {}
export class InputBatchDto extends createZodDto(gatewayToGameMessages.inputBatch) {}
export class RematchDto extends createZodDto(gatewayToGameMessages.rematch) {}

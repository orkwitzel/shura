import { clientMessages } from '@shura/protocol';
import { createZodDto } from 'nestjs-zod';

export class CreateRoomDto extends createZodDto(clientMessages.createRoom) {}
export class JoinRoomDto extends createZodDto(clientMessages.joinRoom) {}
export class LeaveRoomDto extends createZodDto(clientMessages.leaveRoom) {}
export class ReadyDto extends createZodDto(clientMessages.ready) {}
export class StartMatchDto extends createZodDto(clientMessages.startMatch) {}

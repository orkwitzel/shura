import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { errorBody } from '@shura/protocol';
import type { WebSocket } from 'ws';
import { ConnectionsService } from './connections.service';

/**
 * Refuses a message from a socket whose `hello` hasn't succeeded with `session_required` (design
 * §8.7). On every `ClientGateway` handler but `hello` and `ping`.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly connections: ConnectionsService) {}

  canActivate(context: ExecutionContext): boolean {
    const socket = context.switchToWs().getClient<WebSocket>();
    if (this.connections.get(socket)?.session) return true;
    throw new WsException(errorBody('session_required'));
  }
}

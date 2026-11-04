import { applyDecorators, UseFilters, UsePipes } from '@nestjs/common';
import { ValidationPipe } from './validation.pipe';
import { WsExceptionFilter } from './ws-exception.filter';

/**
 * Put on every WS gateway class: validates its messages (`invalid_message` on failure) and sends
 * its errors as `exception{ code, message }`. Nest's global pipes and filters don't apply to
 * WS gateway classes.
 */
export const WsProtocol = (): ClassDecorator =>
  applyDecorators(UsePipes(ValidationPipe), UseFilters(WsExceptionFilter));

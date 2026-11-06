import { type CanActivate, type ExecutionContext, HttpException, Injectable } from '@nestjs/common';
import { ENGINE_VERSION_HEADER, ERRORS, errorBody, PROTOCOL_VERSION_HEADER } from '@shura/protocol';
import { versionsMatch } from './versions';

/** As much of Express's request as the guard reads. */
interface ApiRequest {
  readonly path: string;
  get(header: string): string | undefined;
}

/**
 * The version check on every `/api` request (design §8.3): the `Shura-Protocol` and `Shura-Engine`
 * headers must be the server's versions, or the request gets `version_mismatch` (426). Global, so
 * it skips what isn't under `/api` (the health probes) and isn't HTTP.
 */
@Injectable()
export class VersionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const request = context.switchToHttp().getRequest<ApiRequest>();
    if (!request.path.startsWith('/api/')) return true;
    const protocol = request.get(PROTOCOL_VERSION_HEADER);
    const engine = request.get(ENGINE_VERSION_HEADER);
    if (versionsMatch(protocol, engine)) return true;
    throw new HttpException(errorBody('version_mismatch'), ERRORS.version_mismatch.status);
  }
}

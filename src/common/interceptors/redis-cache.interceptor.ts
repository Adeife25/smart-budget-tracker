import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { RedisService } from '../../redis/redis.service';

interface CacheRequest {
  method: string;
  url: string;
  originalUrl?: string;
  user?: { id?: string };
}

interface CacheResponse {
  setHeader: (name: string, value: string) => void;
}

@Injectable()
export class RedisCacheInterceptor implements NestInterceptor {
  constructor(private readonly redisService: RedisService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const http = context.switchToHttp();
    const request = http.getRequest<CacheRequest>();
    const response = http.getResponse<CacheResponse>();

    if (request.method !== 'GET') {
      return next.handle();
    }

    const userId = request.user?.id;
    if (!userId) {
      return next.handle();
    }

    const key = `user:${userId}:${request.originalUrl ?? request.url}`;

    const cached = await this.redisService.get<unknown>(key);
    if (cached !== null) {
      response.setHeader('x-cache', 'HIT');
      return of(cached);
    }

    return next.handle().pipe(
      tap((data) => {
        void this.redisService.set(key, data);
        response.setHeader('x-cache', 'MISS');
      }),
    );
  }
}

# The response envelope

Every response — success or failure — has the same shape. The frontend's `handleResponse`
keys off `success` and falls back through `error` → `message`, so a route that escapes the
envelope silently breaks toasts and error handling on the client.

Two globals guarantee it: an interceptor wraps successes, a filter wraps failures.

## `common/interfaces/api-response.interface.ts`

```ts
export interface Meta {
  total: number;
  page: number;
  limit: number;
  hasNextPage?: boolean;
  hasPreviousPage?: boolean;
}

export interface Pagination<T = any> extends Meta {
  data: T[];
}

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  statusCode: number;
  data?: T;
  error?: string;
  timestamp: string;
  path?: string;
  meta?: Meta;
}
```

## `common/utils/response.util.ts`

Builders so no route hand-writes the envelope.

```ts
import { HttpStatus } from '@nestjs/common';
import { ApiResponse, Meta } from '../interfaces/api-response.interface';

export class ResponseUtil {
  static success<T>(
    data: T,
    message = 'Operation successful',
    statusCode: number = HttpStatus.OK,
    path?: string,
    meta?: Meta,
  ): ApiResponse<T> {
    return { success: true, message, statusCode, data, timestamp: new Date().toISOString(), path, meta };
  }

  static error(
    message = 'Operation failed',
    statusCode: number = HttpStatus.INTERNAL_SERVER_ERROR,
    error?: string,
    path?: string,
  ): ApiResponse {
    return { success: false, message, statusCode, error, timestamp: new Date().toISOString(), path };
  }

  static created<T>(data: T, message = 'Resource created successfully', path?: string) {
    return this.success(data, message, HttpStatus.CREATED, path);
  }
  static deleted(message = 'Resource deleted successfully', path?: string) {
    return this.success(null, message, HttpStatus.OK, path);
  }
  static notFound(message = 'Resource not found', path?: string) {
    return this.error(message, HttpStatus.NOT_FOUND, 'NOT_FOUND', path);
  }
  static unauthorized(message = 'Unauthorized access', path?: string) {
    return this.error(message, HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', path);
  }
  static forbidden(message = 'Forbidden access', path?: string) {
    return this.error(message, HttpStatus.FORBIDDEN, 'FORBIDDEN', path);
  }
  static conflict(message = 'Resource conflict', error?: string, path?: string) {
    return this.error(message, HttpStatus.CONFLICT, error, path);
  }
}
```

## `common/interceptors/response.interceptor.ts`

Wraps whatever a controller returns. A value already in envelope shape passes through
untouched, so a route that needs a custom `message` or `meta` can build it with
`ResponseUtil` and return that.

```ts
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ResponseUtil } from '../utils/response.util';
import { ApiResponse } from '../interfaces/api-response.interface';

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    return next.handle().pipe(
      map((data) => {
        // Already enveloped (a route used ResponseUtil directly) — leave it alone.
        if (data && typeof data === 'object' && 'success' in data && 'message' in data) {
          return data;
        }

        const statusCode = response.statusCode;
        let message = 'Operation successful';
        if (request.method === 'POST' && statusCode === 201) message = 'Resource created successfully';
        else if (request.method === 'PUT' || request.method === 'PATCH') message = 'Resource updated successfully';
        else if (request.method === 'DELETE') message = 'Resource deleted successfully';
        else if (request.method === 'GET') message = 'Data retrieved successfully';

        return ResponseUtil.success(data, message, statusCode, request.url);
      }),
    );
  }
}
```

## `common/filters/all-exceptions.filter.ts`

Without this, an unhandled error escapes as Nest's default `{ statusCode, message, error }` —
a *different* shape from the envelope, so the client's `success` check reads `undefined` and
the failure is mishandled. The filter closes that gap.

```ts
import {
  ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { ResponseUtil } from '../utils/response.util';

type Normalized = { status: number; message: string; error?: string };

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const { status, message, error } = this.normalize(exception);

    // Only 5xx is our bug — 4xx is the caller's and would just be noise.
    if (status >= 500) {
      this.logger.error(
        `${req.method} ${req.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    res.status(status).json(ResponseUtil.error(message, status, error, req.url));
  }

  private normalize(exception: unknown): Normalized {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      if (typeof body === 'object' && body !== null) {
        const b = body as Record<string, unknown>;
        // ValidationPipe returns message as string[] — join so the client shows one line.
        const raw = b.message;
        return {
          status,
          message: Array.isArray(raw)
            ? raw.join(', ')
            : typeof raw === 'string'
              ? raw
              : exception.message,
          error: typeof b.error === 'string' ? b.error : undefined,
        };
      }
      return { status, message: exception.message };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.fromPrisma(exception);
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return { status: HttpStatus.BAD_REQUEST, message: 'Invalid query', error: 'PRISMA_VALIDATION' };
    }

    // Unknown: never leak an internal message or stack to the client in production.
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message:
        process.env.NODE_ENV === 'production'
          ? 'Internal server error'
          : exception instanceof Error
            ? exception.message
            : 'Internal server error',
      error: 'INTERNAL_ERROR',
    };
  }

  private fromPrisma(e: Prisma.PrismaClientKnownRequestError): Normalized {
    const target = Array.isArray(e.meta?.target) ? (e.meta.target as string[]).join(', ') : undefined;

    switch (e.code) {
      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          message: target ? `${target} already exists` : 'Resource already exists',
          error: 'UNIQUE_VIOLATION',
        };
      case 'P2025':
        return { status: HttpStatus.NOT_FOUND, message: 'Resource not found', error: 'NOT_FOUND' };
      case 'P2003':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Related resource does not exist',
          error: 'FOREIGN_KEY_VIOLATION',
        };
      case 'P2014':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Operation would violate a required relation',
          error: 'RELATION_VIOLATION',
        };
      default:
        return { status: HttpStatus.BAD_REQUEST, message: 'Database request failed', error: e.code };
    }
  }
}
```

## Wiring

`main.ts`:

```ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
```

`app.module.ts` — register all three as providers, not in `main.ts`, so they can inject:

```ts
providers: [
  { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
  { provide: APP_FILTER, useClass: AllExceptionsFilter },
  { provide: APP_GUARD, useClass: JwtAuthGuard },
],
```

## Rules

- **Never hand-build an error response.** Throw `NotFoundException`, `ConflictException`,
  `ForbiddenException` — the filter shapes them.
- **Never call `res.status().json()` in a controller.** Returning data is the whole contract;
  the interceptor does the rest.
- **Return `ResponseUtil.success(data, msg, status, path, meta)` explicitly** only when the
  route needs a custom message or `meta` — the interceptor passes it through.
- **`meta` carries pagination**, and its shape is exactly what
  `BaseRepository.findAllWithPagination` returns.
- **The client reads `error` before `message`.** Set `error` to a stable machine code
  (`UNIQUE_VIOLATION`, `NOT_FOUND`) and keep `message` human — the frontend keys UI off the
  code, not the prose.

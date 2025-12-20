import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import type { Response } from 'express';
import { ZodError } from 'zod';
import { ApiErrorResponse } from './api-response';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = 500;
    let code = 'INTERNAL_SERVER_ERROR';
    let message = 'Internal server error';

    if (exception instanceof ZodError) {
      status = 400;
      code = 'VALIDATION_ERROR';
      message = exception.issues?.[0]?.message ?? 'Validation error';
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse() as unknown;
      if (res && typeof res === 'object') {
        const maybe = res as { code?: unknown; message?: unknown };
        code = typeof maybe.code === 'string' ? maybe.code : `HTTP_${status}`;
        message =
          typeof maybe.message === 'string' ? maybe.message : exception.message;
      } else {
        code = `HTTP_${status}`;
        message = typeof res === 'string' ? res : exception.message;
      }
    }

    const body: ApiErrorResponse = {
      success: false,
      data: null,
      error: { code, message },
    };

    response.status(status).json(body);
  }
}

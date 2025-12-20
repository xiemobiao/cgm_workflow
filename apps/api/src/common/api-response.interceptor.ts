import { CallHandler, Injectable, NestInterceptor } from '@nestjs/common';
import { map, Observable } from 'rxjs';
import { ApiResponse, ApiSuccessResponse } from './api-response';

@Injectable()
export class ApiResponseInterceptor implements NestInterceptor {
  intercept(
    _context: any,
    next: CallHandler,
  ): Observable<ApiResponse<unknown>> {
    return next.handle().pipe(
      map((data) => {
        if (
          data &&
          typeof data === 'object' &&
          'success' in (data as Record<string, unknown>)
        ) {
          return data as ApiResponse<unknown>;
        }

        const wrapped: ApiSuccessResponse<unknown> = {
          success: true,
          data,
          error: null,
        };
        return wrapped;
      }),
    );
  }
}

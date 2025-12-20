import { HttpException, HttpStatus } from '@nestjs/common';

export class ApiException extends HttpException {
  readonly code: string;

  constructor(params: { code: string; message: string; status?: number }) {
    const status = params.status ?? HttpStatus.BAD_REQUEST;
    super({ code: params.code, message: params.message }, status);
    this.code = params.code;
  }
}

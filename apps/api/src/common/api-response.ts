export type ApiErrorBody = {
  code: string;
  message: string;
};

export type ApiSuccessResponse<T> = {
  success: true;
  data: T;
  error: null;
};

export type ApiErrorResponse = {
  success: false;
  data: null;
  error: ApiErrorBody;
};

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

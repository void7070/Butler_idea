/**
 * 도메인 에러. 라우트/서비스 어디서든 throw 하면
 * 중앙 errorHandler가 { success:false, error:{ code, message } } 봉투로 변환한다.
 *
 * 사용 예:
 *   import { errors } from '../lib/errors.js';
 *   if (!report) throw errors.notFound('리포트를 찾을 수 없습니다.');
 *   if (report.ownerId !== userId) throw errors.forbidden('접근 권한이 없습니다.');
 */
export class AppError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
  }
}

export const errors = {
  badRequest: (message, code = 'BAD_REQUEST') => new AppError(code, message, 400),
  unauthorized: (message, code = 'UNAUTHORIZED') => new AppError(code, message, 401),
  forbidden: (message, code = 'FORBIDDEN') => new AppError(code, message, 403),
  notFound: (message, code = 'NOT_FOUND') => new AppError(code, message, 404),
  conflict: (message, code = 'CONFLICT') => new AppError(code, message, 409),
};

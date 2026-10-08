import { AppError } from '../lib/errors.js';

/** 매칭되는 라우트가 없을 때 (라우트 등록 이후 마지막에 위치) */
export function notFound(req, res) {
  res.fail('NOT_FOUND', `경로를 찾을 수 없습니다: ${req.method} ${req.path}`, 404);
}

/**
 * 중앙 에러 핸들러. (Express 5는 async 라우트에서 reject된 Promise도 여기로 보낸다)
 * AppError면 지정한 code/status로, 그 외에는 500으로 변환한다.
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.fail(err.code, err.message, err.status);
  }
  console.error('[unhandled]', err);
  res.fail('INTERNAL_ERROR', '서버 내부 오류가 발생했습니다.', 500);
}

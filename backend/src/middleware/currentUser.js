import { getUserById } from '../repositories/userRepo.js';
import { errors } from '../lib/errors.js';

/**
 * x-user-id 헤더로 현재 사용자를 DB에서 로드해 req.user에 붙인다.
 * 로그인은 없지만 권한 판단은 항상 백엔드가 DB 기준으로 한다 (클라이언트 role 신뢰 X).
 * 헤더가 없거나 유효하지 않으면 req.user를 비워둔다(여기서 막지는 않음).
 */
export function makeLoadUser(db) {
  return function loadUser(req, res, next) {
    const raw = req.header('x-user-id');
    if (raw) {
      const user = getUserById(db, Number(raw));
      if (user) req.user = user;
    }
    next();
  };
}

/** 유효한 사용자가 필요한 라우트 가드. 없으면 401. */
export function requireUser(req, res, next) {
  if (!req.user) {
    return next(errors.unauthorized('유효한 사용자가 필요합니다. (x-user-id 헤더)', 'NO_USER'));
  }
  next();
}

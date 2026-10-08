import { describe, it, expect } from 'vitest';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { errors, AppError } from '../src/lib/errors.js';

// res.fail(code, message, status) 호출을 가로채는 가짜 res
function fakeRes() {
  return {
    calls: [],
    fail(code, message, status) {
      this.calls.push({ code, message, status });
    },
  };
}

describe('errorHandler', () => {
  it('AppError는 지정한 code/status로 변환', () => {
    const res = fakeRes();
    errorHandler(errors.forbidden('접근 불가'), {}, res, () => {});
    expect(res.calls[0]).toEqual({ code: 'FORBIDDEN', message: '접근 불가', status: 403 });
  });

  it('커스텀 code를 가진 AppError도 그대로 전달', () => {
    const res = fakeRes();
    errorHandler(new AppError('IMAGE_TOO_LARGE', '너무 큼', 400), {}, res, () => {});
    expect(res.calls[0].code).toBe('IMAGE_TOO_LARGE');
  });

  it('일반 Error는 500 INTERNAL_ERROR', () => {
    const res = fakeRes();
    errorHandler(new Error('boom'), {}, res, () => {});
    expect(res.calls[0].code).toBe('INTERNAL_ERROR');
    expect(res.calls[0].status).toBe(500);
  });
});

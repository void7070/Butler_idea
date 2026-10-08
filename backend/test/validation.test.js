import { describe, it, expect } from 'vitest';
import { base64Bytes, validateImageSize, validateImageCounts, requireFields } from '../src/lib/validation.js';
import { AppError } from '../src/lib/errors.js';
import { IMAGE_LIMITS } from '../src/config.js';

describe('base64Bytes', () => {
  it('data URL 접두어를 제거하고 바이트를 계산한다', () => {
    // "AAAA" (4 base64 chars, no padding) = 3 bytes
    expect(base64Bytes('data:image/png;base64,AAAA')).toBe(3);
  });
  it('padding을 반영한다', () => {
    expect(base64Bytes('AAA=')).toBe(2);
    expect(base64Bytes('AA==')).toBe(1);
  });
  it('빈 값/비문자열은 0', () => {
    expect(base64Bytes('')).toBe(0);
    expect(base64Bytes(null)).toBe(0);
  });
});

describe('validateImageSize', () => {
  it('한도 이하는 통과하고 바이트 수를 반환', () => {
    expect(validateImageSize('AAAA')).toBe(3);
  });
  it('10MB 초과면 IMAGE_TOO_LARGE throw', () => {
    const over = 'A'.repeat(Math.ceil((IMAGE_LIMITS.maxBytesPerImage + 1) * 4 / 3));
    expect(() => validateImageSize(over)).toThrowError(AppError);
    try {
      validateImageSize(over);
    } catch (e) {
      expect(e.code).toBe('IMAGE_TOO_LARGE');
      expect(e.status).toBe(400);
    }
  });
});

describe('validateImageCounts', () => {
  it('한도 이내면 통과', () => {
    expect(() => validateImageCounts({ perItem: 5, perReport: 20 })).not.toThrow();
  });
  it('항목당 5장 초과면 IMAGE_ITEM_LIMIT', () => {
    try {
      validateImageCounts({ perItem: 6 });
    } catch (e) {
      expect(e.code).toBe('IMAGE_ITEM_LIMIT');
    }
  });
  it('리포트당 20장 초과면 IMAGE_REPORT_LIMIT', () => {
    try {
      validateImageCounts({ perReport: 21 });
    } catch (e) {
      expect(e.code).toBe('IMAGE_REPORT_LIMIT');
    }
  });
});

describe('requireFields', () => {
  it('모두 있으면 통과', () => {
    expect(() => requireFields({ a: 1, b: 'x' }, ['a', 'b'])).not.toThrow();
  });
  it('누락 시 VALIDATION throw', () => {
    try {
      requireFields({ a: 1, b: '' }, ['a', 'b', 'c']);
    } catch (e) {
      expect(e.code).toBe('VALIDATION');
      expect(e.message).toContain('b');
      expect(e.message).toContain('c');
    }
  });
});

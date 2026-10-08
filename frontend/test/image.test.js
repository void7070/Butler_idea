import { describe, it, expect } from 'vitest';
import {
  isWithinSize,
  canAddMore,
  fromInspectionImages,
  MAX_IMAGE_BYTES,
  MAX_IMAGES_PER_REPORT,
} from '../src/lib/image.js';

describe('isWithinSize', () => {
  it('10MB 이하면 true', () => {
    expect(isWithinSize({ size: MAX_IMAGE_BYTES })).toBe(true);
    expect(isWithinSize({ size: MAX_IMAGE_BYTES + 1 })).toBe(false);
  });
});

describe('canAddMore', () => {
  it('리포트당 20장 한도', () => {
    expect(canAddMore(19)).toBe(true);
    expect(canAddMore(20)).toBe(false);
    expect(canAddMore(18, 2)).toBe(true);
    expect(canAddMore(19, 2)).toBe(false);
    expect(canAddMore(4, 1, 5)).toBe(true); // 항목 사진 칸 (max=5)
    expect(canAddMore(5, 1, 5)).toBe(false);
  });
  it('상수 확인', () => {
    expect(MAX_IMAGES_PER_REPORT).toBe(20);
  });
});

describe('fromInspectionImages', () => {
  it('백엔드 형식 → 업로더 모델', () => {
    const out = fromInspectionImages([{ data_base64: 'AAAA', kind: '근접', caption: '천장' }]);
    expect(out).toEqual([{ dataBase64: 'AAAA', kind: '근접', caption: '천장' }]);
  });
});

import { describe, it, expect } from 'vitest';
import { sanitizeText, sanitizeList, sanitizeGuide } from '../src/lib/aiSafety.js';

describe('sanitizeText', () => {
  it('금지 표현이 든 문장을 제거', () => {
    const out = sanitizeText('벽지가 손상되었습니다. 임차인의 법적 책임이 있습니다.');
    expect(out).toBe('벽지가 손상되었습니다.');
  });
  it('보증금 공제 문장 제거', () => {
    expect(sanitizeText('보증금 공제가 필요합니다.')).toBe('');
  });
  it('금지 표현이 없으면 그대로', () => {
    expect(sanitizeText('창호 상태를 추가로 확인하세요.')).toBe('창호 상태를 추가로 확인하세요.');
  });
  it('문자열이 아니면 빈 문자열', () => {
    expect(sanitizeText(null)).toBe('');
  });
});

describe('sanitizeList', () => {
  it('금지 표현이 든 항목만 제거', () => {
    expect(sanitizeList(['객관적으로 기록', '소송 가능성 있음'])).toEqual(['객관적으로 기록']);
  });
});

describe('sanitizeGuide', () => {
  it('전체 필드를 정화하고 빈 액션카드는 제거', () => {
    const out = sanitizeGuide({
      summary: '상태 기록. 판례상 문제가 됩니다.',
      actionCards: [
        { title: '사진', detail: '각도별 촬영' },
        { title: '손해배상 청구', detail: '손해배상 청구' },
      ],
      requiredDocuments: ['사진', '소송 자료'],
      cautionPhrases: ['객관적 기록'],
      opinionDraft: '창호 점검 권장. 법적 책임은 임차인에게 있습니다.',
    });
    expect(out.summary).toBe('상태 기록.');
    expect(out.actionCards).toEqual([{ title: '사진', detail: '각도별 촬영' }]);
    expect(out.requiredDocuments).toEqual(['사진']);
    expect(out.opinionDraft).toBe('창호 점검 권장.');
  });
});

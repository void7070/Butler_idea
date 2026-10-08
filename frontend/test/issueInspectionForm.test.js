import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import IssueInspectionForm from '../src/components/IssueInspectionForm.vue';

const items = [
  { id: 1, category: '설비·배관', name: '누수', state: 'repair' },
  { id: 2, category: '전기', name: '콘센트', state: 'minor' },
];

describe('IssueInspectionForm 수리 전·후 사진 필수 (창 26)', () => {
  it('photoRequired: 항목마다 "사진 필수" + 사진 칸, 요약 "사진 없는 항목 n개", 저장 페이로드에 itemIndex 사진', async () => {
    const w = mount(IssueInspectionForm, {
      props: { initialItems: items, photoRequired: true, initialImages: [{ item_id: 1, data_base64: 'AAAA' }] },
    });
    expect(w.findAll('[data-test="repair-photo-required"]')).toHaveLength(2);
    expect(w.find('[data-test="repair-photo-summary"]').text()).toContain('사진 없는 항목 1개 (문제 항목 2)');
    await w.findAll('button').find((b) => b.text() === '저장').trigger('click');
    const payload = w.emitted('save')[0][0];
    expect(payload.items).toHaveLength(2);
    expect(payload.images).toEqual([{ itemIndex: 0, dataBase64: 'AAAA', kind: '', caption: '' }]);
  });

  it('긴급(photoRequired 없음): 표시·사진 칸 없고 페이로드에 images 없음 (기존 동작)', async () => {
    const w = mount(IssueInspectionForm, { props: { initialItems: items } });
    expect(w.find('[data-test="repair-photo-required"]').exists()).toBe(false);
    expect(w.find('[data-test="repair-photo-summary"]').exists()).toBe(false);
    await w.findAll('button').find((b) => b.text() === '저장').trigger('click');
    expect(w.emitted('save')[0][0]).not.toHaveProperty('images');
  });
});

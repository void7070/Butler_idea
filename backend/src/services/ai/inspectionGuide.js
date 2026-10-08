import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizeGuide } from '../../lib/aiSafety.js';

const here = dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = join(here, '../../../prompts'); // backend/prompts

let cachedSystem = null;
function systemPrompt() {
  if (cachedSystem) return cachedSystem;
  // 프롬프트 파일 2개를 결합해 한 번의 호출에서 가이드 + 의견 초안을 모두 생성한다.
  const guide = readFileSync(join(PROMPTS_DIR, 'inspection-guide.system.md'), 'utf-8');
  const opinion = readFileSync(join(PROMPTS_DIR, 'opinion-draft.system.md'), 'utf-8');
  cachedSystem = `${guide}\n\n---\n\n${opinion}`;
  return cachedSystem;
}

/** AI 응답을 우리가 기대하는 형태로 강제 정규화한다(타입 방어). */
function normalizeGuide(p = {}) {
  return {
    summary: typeof p.summary === 'string' ? p.summary : '',
    actionCards: Array.isArray(p.actionCards)
      ? p.actionCards.map((c) => ({ title: String(c?.title ?? ''), detail: String(c?.detail ?? '') }))
      : [],
    requiredDocuments: Array.isArray(p.requiredDocuments) ? p.requiredDocuments.map(String) : [],
    cautionPhrases: Array.isArray(p.cautionPhrases) ? p.cautionPhrases.map(String) : [],
    opinionDraft: typeof p.opinionDraft === 'string' ? p.opinionDraft : '',
  };
}

/** AI 실패 시 사용할 기본 템플릿(점검을 계속 진행할 수 있게 한다). */
export function defaultGuide() {
  return {
    summary: '입력된 점검 내용을 바탕으로 기본 안내를 제공합니다. (AI 미사용 또는 호출 실패)',
    actionCards: [
      { title: '사진 보강', detail: '문제 부위를 가까이/멀리, 여러 각도에서 촬영해 두세요.' },
      { title: '위치 명확화', detail: '문제 항목의 공간과 위치를 구체적으로 기록하세요.' },
    ],
    requiredDocuments: ['관련 사진', '이전 점검 기록(있는 경우)'],
    cautionPhrases: ['상태는 객관적 사실 위주로 기록합니다.'],
    opinionDraft: '',
  };
}

/**
 * 점검 컨텍스트로 AI 점검 도우미 가이드를 생성한다.
 * @param {{ aiComplete: (messages:any[])=>Promise<string> }} deps
 * @param {object} context  { type, typeLabel, flow, items, observations }
 * @returns {Promise<{ guide: object, fallback: boolean, error?: string }>}
 *
 * 어떤 실패(키 없음/네트워크/JSON 파싱)도 throw 하지 않고 기본 템플릿으로 폴백한다.
 * → 이 엔드포인트 실패가 점검 작성/제출을 막지 않는다.
 */
export async function generateInspectionGuide({ aiComplete }, context) {
  try {
    const raw = await aiComplete([
      { role: 'system', content: systemPrompt() },
      { role: 'user', content: JSON.stringify(context) },
    ]);
    const guide = sanitizeGuide(normalizeGuide(JSON.parse(raw)));
    return { guide, fallback: false };
  } catch (e) {
    return { guide: defaultGuide(), fallback: true, error: e.message };
  }
}

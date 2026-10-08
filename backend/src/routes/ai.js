import { Router } from 'express';
import { requireUser } from '../middleware/currentUser.js';
import { errors } from '../lib/errors.js';
import { getInspectionById } from '../repositories/inspectionRepo.js';
import { saveAiGuide } from '../repositories/aiGuideRepo.js';
import { generateInspectionGuide } from '../services/ai/inspectionGuide.js';

/**
 * AI 점검 도우미 라우터. aiComplete(주입) 함수로 GPT를 호출한다.
 * 본문에 inspectionId를 주면 점검 컨텍스트를 DB에서 읽고 결과를 ai_guides에 저장하며,
 * 없으면 본문의 type/items/observations를 컨텍스트로 사용한다(저장 안 함).
 */
export function createAiRouter(db, { aiComplete }) {
  const router = Router();

  router.post('/inspection-guide', requireUser, async (req, res) => {
    let context;
    let inspectionId = null;

    if (req.body.inspectionId != null) {
      const insp = getInspectionById(db, Number(req.body.inspectionId));
      if (!insp) throw errors.notFound('점검을 찾을 수 없습니다.');
      if (insp.created_by !== req.user.id) {
        throw errors.forbidden('해당 점검에 접근할 권한이 없습니다.');
      }
      context = {
        type: insp.type,
        typeLabel: insp.typeLabel,
        flow: insp.flow,
        items: insp.items,
        observations: insp.observations,
      };
      inspectionId = insp.id;
    } else {
      context = {
        type: req.body.type ?? null,
        items: req.body.items ?? [],
        observations: req.body.observations ?? [],
      };
    }

    const { guide, fallback } = await generateInspectionGuide({ aiComplete }, context);
    if (inspectionId) saveAiGuide(db, inspectionId, guide);

    res.ok({ guide, fallback });
  });

  return router;
}

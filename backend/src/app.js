import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { demoNow } from './lib/demoClock.js';
import { toDateString } from './lib/tenantReport.js';
import defaultDb from './db/index.js';
import { responseEnvelope } from './middleware/responseEnvelope.js';
import { requestLogger } from './middleware/logger.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';
import { createApiRouter } from './routes/api.js';
import { createOpenAiComplete } from './services/ai/openaiClient.js';

/**
 * Express 앱을 생성해 반환한다.
 * 서버 시작(listen)은 index.js가 담당하고, 이 함수는 supertest 등에서
 * 그대로 import 해 테스트할 수 있도록 app만 만들어 export 한다.
 *
 * @param {object} db   주입할 DB 핸들. 생략 시 런타임 싱글톤(app.db). 테스트는 in-memory.
 * @param {object} deps 주입 의존성. deps.aiComplete 생략 시 config 기반 OpenAI 클라이언트.
 *                      테스트는 가짜 aiComplete를 넘겨 네트워크 없이 동작시킨다.
 *                      deps.now 생략 시 서버의 "지금"(DEMO_TODAY가 있으면 기준일 + 실제 시각, 창 17).
 *                      테스트는 입주 제보 기간(창 10) 확인용 시각을 넘긴다.
 *                      deps.demoToday 생략 시 config.demoToday (테스트는 기준일을 직접 넘긴다).
 *
 * 미들웨어 순서: cors -> json -> 응답봉투 -> 로깅 -> 라우트 -> 404 -> 에러핸들러
 */
export function createApp(db = defaultDb, deps = {}) {
  const app = express();
  const aiComplete = deps.aiComplete ?? createOpenAiComplete(config);
  const demoToday = deps.demoToday !== undefined ? deps.demoToday : config.demoToday;
  const now = deps.now ?? (() => demoNow(demoToday));

  app.use(cors());
  app.use(express.json({ limit: config.jsonLimit }));
  app.use(responseEnvelope);
  app.use(requestLogger);

  // --- 라우트 ---
  app.get('/api/health', (req, res) => {
    // today: 서버 기준 오늘(프론트 임대인 홈 날짜 표시), demoToday: 시연 기준일 사용 여부 (창 17)
    res.ok({ status: 'ok', service: 'smart-inspection-backend', today: toDateString(now()), demoToday: !!demoToday });
  });
  app.use('/api', createApiRouter(db, { aiComplete, now }));

  // --- 마무리 (반드시 라우트 뒤에) ---
  app.use(notFound);
  app.use(errorHandler);

  return app;
}

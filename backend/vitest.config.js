import { defineConfig } from 'vitest/config';

// 테스트는 .env 의 DEMO_TODAY(시연 기준일)와 무관하게 실제 날짜/주입한 now로 돈다.
// (dotenv는 이미 있는 환경변수를 덮어쓰지 않는다)
export default defineConfig({
  test: { env: { DEMO_TODAY: '' } },
});

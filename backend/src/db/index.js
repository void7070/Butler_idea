import { config } from '../config.js';
import { createDb } from './connection.js';

/**
 * 런타임용 DB 싱글톤. 라우트/리포지토리는 이 db를 import 해 사용한다.
 * 테스트는 이 싱글톤 대신 connection.createDb(':memory:')로 격리된 DB를 만든다.
 */
const db = createDb(config.dbFile);

export default db;

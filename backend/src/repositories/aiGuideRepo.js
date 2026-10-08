/** AI 가이드 결과를 ai_guides에 저장한다. (제출 시 스냅샷이 최신 가이드를 포함) */
export function saveAiGuide(db, inspectionId, guide) {
  return db
    .prepare('INSERT INTO ai_guides (inspection_id, payload_json) VALUES (?, ?)')
    .run(inspectionId, JSON.stringify(guide)).lastInsertRowid;
}

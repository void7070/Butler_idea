/**
 * 모든 응답을 공통 봉투로 통일하는 헬퍼를 res에 붙인다.
 *   res.ok(data, status=200)        -> { success:true,  data }
 *   res.fail(code, message, status) -> { success:false, error:{ code, message } }
 */
export function responseEnvelope(req, res, next) {
  res.ok = (data = null, status = 200) => res.status(status).json({ success: true, data });
  res.fail = (code, message, status = 400) =>
    res.status(status).json({ success: false, error: { code, message } });
  next();
}

/** 요청 1줄 로깅: 응답이 끝나면 메서드/경로/상태코드를 출력한다. */
export function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms}ms)`);
  });
  next();
}

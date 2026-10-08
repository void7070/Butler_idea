// 공통 API 클라이언트.
// 백엔드 응답 봉투 { success, data } / { success, error } 를 풀어서 반환한다.
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

export async function apiFetch(path, options = {}) {
  // 데모 인증: localStorage의 selectedUserId를 헤더로 실어 보낸다.
  // 백엔드는 이 userId를 DB 기준으로 검증해 권한을 판단한다.
  const userId = localStorage.getItem('selectedUserId');

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(userId ? { 'x-user-id': userId } : {}),
      ...(options.headers ?? {}),
    },
  });

  const body = await res.json().catch(() => null);

  if (!res.ok || !body?.success) {
    const message = body?.error?.message ?? `요청 실패 (${res.status})`;
    throw new Error(message);
  }
  return body.data;
}

/**
 * 파일 내려받기 (창 16 수선비 장부 CSV). 사용자 헤더가 필요해 <a href>로 바로 열 수 없으므로
 * fetch → Blob → 임시 링크 클릭으로 저장한다. 실패하면 백엔드 오류 문구로 throw.
 */
export async function apiDownload(path, filename) {
  const userId = localStorage.getItem('selectedUserId');
  const res = await fetch(`${BASE_URL}${path}`, { headers: userId ? { 'x-user-id': userId } : {} });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? `요청 실패 (${res.status})`);
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

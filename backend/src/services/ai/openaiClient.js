/**
 * OpenAI Chat Completions 호출 함수를 만든다.
 * 반환값은 aiComplete(messages) => Promise<string(JSON)> 형태로,
 * app 생성 시 주입된다(테스트는 가짜 함수를 주입해 네트워크 없이 동작).
 *
 * 키가 없으면 호출 시점에 throw → 상위 서비스가 기본 템플릿으로 폴백한다.
 */
export function createOpenAiComplete(config) {
  return async function aiComplete(messages) {
    if (!config.openaiApiKey) {
      throw new Error('OPENAI_API_KEY가 설정되지 않았습니다.');
    }

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: config.openaiModel,
        messages,
        response_format: { type: 'json_object' },
        temperature: 0.4,
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenAI API 오류: ${res.status}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? '';
  };
}

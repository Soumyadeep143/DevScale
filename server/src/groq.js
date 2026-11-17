// Calls the AI provider (Groq's OpenAI-compatible API; xAI Grok works too via GROQ_BASE_URL + GROQ_MODEL).
export function makeCallModel({ key, base, model, fetchImpl = fetch }) {
  return async function callModel(system, user) {
    let res;
    try {
      res = await fetchImpl(`${base}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model, temperature: 0, max_tokens: 4000, response_format: { type: 'json_object' },
          // gpt-oss models think first and that counts against max_tokens: keep it short.
          ...(model.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' } : {}),
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        }),
        signal: AbortSignal.timeout(45_000),
      });
    } catch {
      throw Object.assign(new Error('Could not reach the AI provider.'), { status: 502 });
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const status = res.status === 429 ? 429 : 502;
      const message = res.status === 401 || res.status === 403 ? 'The server’s AI key was rejected. Check GROQ_API_KEY.'
        : res.status === 429 ? 'The AI provider is rate-limiting. Wait a moment and try again.'
        : data?.error?.message || `The AI provider returned an error (${res.status}).`;
      throw Object.assign(new Error(message), { status });
    }
    return data?.choices?.[0]?.message?.content || '';
  };
}

import { extractJobs } from '../../../supabase/functions/ai/parseJobs.ts';
import { extractContacts } from '../../../supabase/functions/ai/parseContacts.ts';

// LOCAL DEVELOPMENT ONLY, and only if there is no AI server. Reads pasted text with the AI by calling the
// provider straight from the browser, so the key lives in a VITE_ variable that anyone who opens the page
// can read. api.js only loads this file when import.meta.env.DEV is true, so production builds contain
// neither this code nor the key. (A browser also cannot open other sites' pages, so links are not read
// here; the AI server and the deployed function do that.)
const env = () => import.meta.env;
export const directAiConfigured = () => !!env().DEV && !!env().VITE_AI_API_KEY;

function directCallModel() {
  if (!directAiConfigured()) throw new Error('Direct AI is not configured.');
  const base = (env().VITE_AI_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/$/, '');
  const model = env().VITE_AI_MODEL || 'openai/gpt-oss-120b';

  async function callModel(system, user) {
    let res;
    try {
      res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env().VITE_AI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model, temperature: 0, max_tokens: 4000, response_format: { type: 'json_object' },
          ...(model.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' } : {}),
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        }),
      });
    } catch {
      throw new Error('Could not reach the AI provider. Check your connection.');
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) throw new Error('The AI provider rejected the key in VITE_AI_API_KEY. Check it, then restart the dev server.');
      if (res.status === 429) throw new Error('The AI provider is rate-limiting you. Wait a moment and try again.');
      throw new Error(data?.error?.message || `The AI provider returned an error (${res.status}).`);
    }
    return data?.choices?.[0]?.message?.content || '';
  }

  return callModel;
}

export const directParseJobs = async (text) => extractJobs(text, { callModel: directCallModel() }); // no fetchPage: a bare link gets a clear message instead
export const directParseContacts = async (text) => extractContacts(text, { callModel: directCallModel() });

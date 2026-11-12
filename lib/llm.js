// OpenAI-compatible client with automatic fallback to a second provider.
//   LLM_BASE_URL / LLM_API_KEY / LLM_MODEL                    primary (e.g. Gemini)
//   LLM_FALLBACK_BASE_URL / LLM_FALLBACK_API_KEY / LLM_FALLBACK_MODEL   optional (e.g. Groq)
function providers() {
  const e = process.env, p = [];
  if (e.LLM_BASE_URL && e.LLM_MODEL) p.push({ base: e.LLM_BASE_URL, key: e.LLM_API_KEY, model: e.LLM_MODEL });
  if (e.LLM_FALLBACK_BASE_URL && e.LLM_FALLBACK_MODEL)
    p.push({ base: e.LLM_FALLBACK_BASE_URL, key: e.LLM_FALLBACK_API_KEY, model: e.LLM_FALLBACK_MODEL });
  return p;
}

function parseJSON(raw) {
  const s = raw.indexOf('{'), e = raw.lastIndexOf('}');
  if (s < 0 || e < s) throw new Error('No JSON in model output');
  return JSON.parse(raw.slice(s, e + 1));
}

async function once(p, prompt) {
  const r = await fetch(p.base.replace(/\/$/, '') + '/chat/completions', {
    method: 'POST',
    signal: AbortSignal.timeout(20000),
    headers: { 'Content-Type': 'application/json', ...(p.key ? { Authorization: 'Bearer ' + p.key } : {}) },
    body: JSON.stringify({
      model: p.model,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Reply with a single valid JSON object only. No markdown, no commentary.' },
        { role: 'user', content: prompt },
      ],
    }),
  });
  if (!r.ok) throw new Error('LLM HTTP ' + r.status);
  return parseJSON((await r.json()).choices?.[0]?.message?.content || '');
}

async function callLLM(prompt) {
  const list = providers();
  if (!list.length) throw new Error('LLM not configured');
  let last;
  for (const p of list) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try { return await once(p, prompt); }
      catch (err) {
        last = err;
        if (/HTTP 40[014]/.test(err.message)) break; // config error: go to next provider
      }
    }
  }
  throw last;
}

module.exports = { callLLM };

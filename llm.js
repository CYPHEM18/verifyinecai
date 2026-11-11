// Works with any OpenAI-compatible endpoint: Ollama (/v1), Groq, OpenRouter, Gemini compat, etc.
// Swap models by changing env vars only:
//   LLM_BASE_URL  e.g. https://api.groq.com/openai/v1  or  https://your-tunnel.trycloudflare.com/v1
//   LLM_API_KEY   key or tunnel secret (optional)
//   LLM_MODEL     e.g. llama-3.1-8b-instant  or  qwen2.5:7b

function parseJSON(raw) {
  const s = raw.indexOf('{');
  const e = raw.lastIndexOf('}');
  if (s < 0 || e < s) throw new Error('No JSON in model output');
  return JSON.parse(raw.slice(s, e + 1));
}

async function callLLM(prompt, retries = 1) {
  const base = process.env.LLM_BASE_URL;
  const key = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL;
  if (!base || !model) throw new Error('LLM not configured');

  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      const r = await fetch(base.replace(/\/$/, '') + '/chat/completions', {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(key ? { Authorization: 'Bearer ' + key } : {}),
        },
        body: JSON.stringify({
          model,
          temperature: 0.1,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: 'Reply with a single valid JSON object only. No markdown, no commentary.' },
            { role: 'user', content: prompt },
          ],
        }),
      });
      if (!r.ok) throw new Error('LLM HTTP ' + r.status);
      const data = await r.json();
      return parseJSON(data.choices?.[0]?.message?.content || '');
    } catch (err) {
      if (attempt === retries) throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}

module.exports = { callLLM };

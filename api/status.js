// Safe health check: counts and yes/no flags only, never keys.
const { stats } = require('../lib/retrieval');
module.exports = (req, res) => {
  const e = process.env;
  res.status(200).json({
    ...stats(),
    ai_primary: !!(e.LLM_BASE_URL && e.LLM_MODEL && e.LLM_API_KEY),
    ai_fallback: !!(e.LLM_FALLBACK_BASE_URL && e.LLM_FALLBACK_MODEL && e.LLM_FALLBACK_API_KEY),
    web_search: !!e.LANGSEARCH_API_KEY,
  });
};

const { extractUrls, checkUrl } = require('../lib/evidence');
const { search } = require('../lib/retrieval');
const { searchWeb } = require('../lib/websearch');
const { callLLM } = require('../lib/llm');
const { promptA, promptB } = require('../lib/prompts');

const VERDICTS = ['safe', 'suspicious', 'dangerous', 'unverified'];
const norm = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').trim();

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const text = String(req.body?.text || '').slice(0, 2000).trim();
  if (!text) return res.status(400).json({ error: 'text required' });

  // Stages 0-1: hard evidence (code)
  const evidence = extractUrls(text).slice(0, 5).map(checkUrl);
  const hardDanger = evidence.some((e) => e.lookalike_of || e.punycode);

  let analysis = {};
  let verification = null;
  let sources = [];
  let aiUsed = true;
  let webUsed = false;

  try {
    // Stage 2: LLM call A, analysis + claim extraction
    analysis = await callLLM(promptA(text, evidence));
    const claims = (analysis.claims || []).slice(0, 4);

    // Stage 3a: trusted local corpus (authoritative)
    const corpusSources = claims.flatMap((c) => search(c)).map((s) => ({ ...s, tier: 'official' }));

    // Stage 3b: live web search (max 2 searches per message to protect the free allowance)
    const webSources = [];
    try {
      for (const c of claims.slice(0, 2)) {
        const r = await searchWeb(c);
        if (r) {
          webUsed = true;
          webSources.push(...r.filter((x) => x.tier !== 'unvetted' && x.text));
        }
      }
    } catch (err) {
      webUsed = false;
      console.error('Web search failed (continuing with corpus only):', err.message);
    }

    const seen = new Set();
    sources = [...corpusSources, ...webSources]
      .filter((s) => (seen.has(s.url + s.text) ? false : seen.add(s.url + s.text)))
      .slice(0, 10);

    // Stage 4: LLM call B, grounded verification + explanation
    verification = await callLLM(promptB(claims, sources, evidence));

    // Stage 5 guardrail: confirmed/contradicted needs a real quote from an OFFICIAL source
    const official = sources.filter((s) => s.tier === 'official');
    verification.claims = (verification.claims || []).map((c) => {
      if (c.status === 'confirmed' || c.status === 'contradicted') {
        const q = c.quote && norm(c.quote);
        if (!q || !official.some((s) => norm(s.text).includes(q))) {
          const inMedia = q && sources.some((s) => s.tier === 'media' && norm(s.text).includes(q));
          return {
            ...c,
            status: 'unverified',
            quote: '',
            note: inMedia
              ? 'Reported by media but not confirmed by an official source'
              : 'No supporting quote found in official sources',
          };
        }
      }
      return c;
    });
  } catch (err) {
    aiUsed = false;
    console.error('AI pipeline failed:', err.message);
  }

  // Guardrails: hard evidence overrides the model
  let verdict = VERDICTS.includes(verification?.verdict) ? verification.verdict : 'unverified';
  if (verdict === 'safe' && (verification?.claims || []).some((c) => c.status === 'contradicted')) verdict = 'suspicious';
  if (hardDanger) verdict = 'dangerous';

  const fallbackExplanation = hardDanger
    ? 'This message links to a website that imitates an official INEC address. Do not open it or share personal details.'
    : 'We could not fully analyse this message. Check any claim directly on inecnigeria.org.';

  return res.status(200).json({
    verdict,
    category: analysis.category || (hardDanger ? 'phishing' : 'unclear'),
    tactics: analysis.tactics || [],
    language: analysis.language || 'en',
    claims: verification?.claims || [],
    explanation: verification?.explanation || fallbackExplanation,
    explanation_local: verification?.explanation_local || '',
    advice: verification?.advice || 'Only trust links on official INEC domains.',
    evidence,
    sources: sources.filter((s) => s.url).map(({ url, title, tier }) => ({ url, title, tier })),
    web_search_used: webUsed,
    ai_used: aiUsed,
  });
};

const { extractUrls, checkUrl } = require('../lib/evidence');
const { search, tok } = require('../lib/retrieval');
const { searchWeb } = require('../lib/websearch');
const { callLLM } = require('../lib/llm');
const { promptA, promptB } = require('../lib/prompts');
const { searchOnly } = require('../lib/rules');

const VERDICTS = ['safe', 'suspicious', 'dangerous', 'unverified'];

// Keep only web results that are recent and actually about the claim (heuristic overlap).
const MAX_AGE = 540 * 864e5; // about 18 months
const fresh = (s) => !s.date || Date.now() - Date.parse(s.date) < MAX_AGE;
function relevantTo(claim, s) {
  const q = new Set(tok(claim));
  if (!q.size) return false;
  const words = new Set(tok((s.title || '') + ' ' + s.text));
  let n = 0;
  q.forEach((w) => words.has(w) && n++);
  return n >= Math.max(3, Math.ceil(q.size * 0.4));
}

const norm = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').trim();

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const text = String(req.body?.text || '').slice(0, 2000).trim();
  if (!text) return res.status(400).json({ error: 'text required' });

  // Stages 0-1: hard evidence (code)
  const evidence = extractUrls(text).slice(0, 5).map(checkUrl);
  const hardDanger = evidence.some((e) => e.lookalike_of || e.punycode);

  // Link-only check: rules only, no AI or search needed
  if (req.body?.linkOnly) {
    const allOfficial = evidence.length > 0 && evidence.every((e) => e.in_registry);
    const verdict = hardDanger ? 'dangerous' : evidence.some((e) => e.shortener) ? 'suspicious' : allOfficial ? 'safe' : 'unverified';
    const explanation = {
      dangerous: 'This address imitates an official INEC address. Do not open it or enter any details.',
      suspicious: 'This is a shortened link, so the real destination is hidden. Do not open it until you know where it leads.',
      safe: 'This address is on the official list. Still, type known addresses yourself rather than following links.',
      unverified: evidence.length ? 'This address is not on the official list, but it does not imitate one either. Do not treat it as INEC.' : 'No link or domain was found in what you entered.',
    }[verdict];
    return res.status(200).json({ verdict, category: 'link', tactics: [], claims: [], explanation, explanation_local: '', advice: 'Only trust links on official INEC domains.', evidence, sources: [], ai_used: false, mode: 'link' });
  }

  // No model configured: run search-only mode (link checks + keyword rules + live search)
  if (!process.env.LLM_BASE_URL || !process.env.LLM_MODEL) {
    return res.status(200).json(await searchOnly(text, evidence, hardDanger));
  }

  let analysis = {};
  let verification = null;
  let sources = [];
  let aiUsed = true;
  let aiError = null;
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
          webSources.push(...r.filter((x) => x.tier !== 'unvetted' && x.text && fresh(x) && relevantTo(c, x)));
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
    aiError = String(err.message).slice(0, 80);
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
    ai_error: aiError,
  });
};

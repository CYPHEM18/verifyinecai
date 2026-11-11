// Search-only mode: used when no LLM is configured (no LLM_BASE_URL / LLM_MODEL).
// Link checks + keyword rules + live LangSearch results. This is NOT AI analysis.
const { searchWeb } = require('./websearch');

const PATTERNS = {
  urgency: /\b(?:urgent|immediately|before midnight|last chance|expires?|today only|hurry)\b|\bwithin \d+ (?:hours?|minutes?)\b/i,
  'reward bait': /\bfree (?:money|cash|data|airtime)\b|\bN\s?\d[\d,]*|₦\s?\d|\bgiveaway\b|\byou (?:have )?won\b|\bclaim (?:your|now)\b|\bpayout\b/i,
  'request for personal data': /\b(?:bvn|nin|pin|password|otp|account number|card number)\b|\bsend (?:your|us) (?:details|number)\b/i,
  'fake authority': /\binec (?:chairman|has directed|announces|requires)\b|\bofficial notice\b|\bby order of\b/i,
  fear: /\b(?:disqualif|arrest|suspended|blocked|lose your|will be deleted|cancel)\w*/i,
  'chain pressure': /\bshare (?:to|with)\b|\bforward (?:this|to)\b|\bbefore they delete\b/i,
};

async function searchOnly(text, evidence, hardDanger) {
  const tactics = Object.keys(PATTERNS).filter((k) => PATTERNS[k].test(text));
  const query = text
    .replace(/https?:\/\/\S+|\b(?:[a-z0-9-]+\.)+[a-z]{2,}\S*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);

  let sources = [];
  let webUsed = false;
  try {
    const r = query ? await searchWeb(query) : null;
    if (r) {
      webUsed = true;
      sources = r.filter((s) => s.tier !== 'unvetted' && s.text);
    }
  } catch (err) {
    console.error('Web search failed:', err.message);
  }

  const risky = tactics.includes('reward bait') || tactics.includes('request for personal data');
  const verdict = hardDanger ? 'dangerous' : risky || tactics.length >= 2 ? 'suspicious' : 'unverified';

  let explanation;
  if (hardDanger) {
    explanation = 'This message links to a website that imitates an official INEC address. Do not open it or share personal details.';
  } else if (tactics.length) {
    explanation = `This message uses common scam or pressure tactics (${tactics.join(', ')}). Do not click links or share personal details until you confirm on inecnigeria.org.`;
  } else {
    explanation = 'No technical red flags were found, but without an AI model this tool cannot judge the claims in the message. Check inecnigeria.org.';
  }
  if (sources.length) explanation += ' Related official or media pages are listed below so you can compare.';

  return {
    verdict,
    category: hardDanger ? 'phishing' : 'unclear',
    tactics,
    language: 'en',
    claims: [],
    explanation,
    explanation_local: '',
    advice: 'Only trust links on official INEC domains.',
    evidence,
    sources: sources.map(({ url, title, tier }) => ({ url, title, tier })),
    web_search_used: webUsed,
    ai_used: false,
    mode: 'search-only',
  };
}

module.exports = { searchOnly };

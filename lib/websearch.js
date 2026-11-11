// Live web retrieval via LangSearch (free API; daily account allowance applies).
// Results are tiered: official (registry domains) > media (trusted-domains.json) > unvetted (dropped).
const registry = require('../data/registry.json').official_domains;
const media = require('../data/trusted-domains.json').media;

const cache = new Map(); // per-instance cache to save quota
const TTL = 60 * 60 * 1000;

const hostOf = (u) => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; } };
const matches = (host, list) => list.some((d) => host === d || host.endsWith('.' + d));
const tierOf = (url) => {
  const h = hostOf(url);
  if (matches(h, registry)) return 'official';
  if (matches(h, media)) return 'media';
  return 'unvetted';
};

async function searchWeb(claim) {
  const key = process.env.LANGSEARCH_API_KEY;
  if (!key) return null; // not configured: skip silently

  const query = ('INEC Nigeria election ' + claim).slice(0, 300);
  const hit = cache.get(query);
  if (hit && Date.now() - hit.t < TTL) return hit.v;

  const r = await fetch('https://api.langsearch.com/v1/web-search', {
    method: 'POST',
    signal: AbortSignal.timeout(12000),
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, count: 6, freshness: 'noLimit', contents: { text: { max_characters: 800 } } }),
  });
  if (!r.ok) throw new Error('LangSearch HTTP ' + r.status); // includes quota exhaustion
  const items = (await r.json())?.data?.webPages?.value || [];
  const v = items.map((i) => ({
    url: i.url,
    title: i.name || '',
    text: String(i.text || i.snippet || '').replace(/\s+/g, ' ').slice(0, 800),
    tier: tierOf(i.url),
  }));
  cache.set(query, { t: Date.now(), v });
  return v;
}

module.exports = { searchWeb };

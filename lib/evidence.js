// Stage 0 + 1: extract URLs and gather hard technical evidence (no AI).
const registry = require('../data/registry.json').official_domains;

const SHORTENERS = ['bit.ly', 'tinyurl.com', 't.co', 'cutt.ly', 'rb.gy', 'is.gd', 'shorturl.at', 'wa.me'];

function extractUrls(text) {
  const re = /\b((?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?)/gi;
  const found = (text.match(re) || []).map((u) => u.replace(/[.,;:)]+$/, ''));
  return [...new Set(found)];
}

function hostOf(u) {
  try {
    return new URL(/^https?:\/\//i.test(u) ? u : 'https://' + u).hostname.toLowerCase();
  } catch {
    return u.toLowerCase();
  }
}

function lev(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
  return dp[a.length][b.length];
}

function checkUrl(u) {
  const host = hostOf(u);
  const inRegistry = registry.some((d) => host === d || host.endsWith('.' + d));
  const punycode = host.includes('xn--');
  const shortener = SHORTENERS.includes(host);

  let lookalikeOf = null;
  if (!inRegistry) {
    const leet = host.replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/5/g, 's');
    let nearest = { d: null, dist: Infinity };
    for (const d of registry) {
      const dist = lev(host, d);
      if (dist < nearest.dist) nearest = { d, dist };
    }
    if (leet.includes('inec') || nearest.dist <= 3 || punycode) lookalikeOf = nearest.d;
  }

  return { url: u, host, in_registry: inRegistry, lookalike_of: lookalikeOf, punycode, shortener };
}

module.exports = { extractUrls, checkUrl };

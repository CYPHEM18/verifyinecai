// Stage 3: retrieve supporting passages from the trusted corpus (keyword overlap, no AI).
const corpus = require('../data/corpus.json');

const STOP = new Set(['the', 'and', 'for', 'that', 'this', 'with', 'from', 'are', 'was', 'will', 'has', 'have', 'been', 'not', 'you', 'your', 'its', 'all']);
const tok = (s) => (s.toLowerCase().match(/[a-z0-9]+/g) || []).filter((w) => w.length > 2 && !STOP.has(w));

function chunk(text, size = 600, overlap = 100) {
  const out = [];
  for (let i = 0; i < text.length; i += size - overlap) out.push(text.slice(i, i + size));
  return out;
}

const chunks = corpus.flatMap((doc) =>
  chunk(doc.text).map((t) => ({ url: doc.url, title: doc.title, text: t }))
);

function search(claim, k = 3) {
  const q = new Set(tok(claim));
  return chunks
    .map((c) => ({ c, score: tok(c.text).filter((w) => q.has(w)).length }))
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((x) => x.c);
}

module.exports = { search };

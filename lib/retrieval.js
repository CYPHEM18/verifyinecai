// Trusted corpus: plain .md/.txt files in data/corpus/ (no JSON escaping needed).
// Each file: a short header, a line with ---, then the pasted official text. See data/corpus/_TEMPLATE.md
// Files starting with "_" are ignored. Only paste OFFICIAL text here: it is the only source that can confirm or contradict a claim.
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'data', 'corpus');
const STOP = new Set(['the', 'and', 'for', 'that', 'this', 'with', 'from', 'are', 'was', 'will', 'has', 'have', 'been', 'not', 'you', 'your', 'its', 'all']);
const tok = (s) => (s.toLowerCase().match(/[a-z0-9]+/g) || []).filter((w) => w.length > 2 && !STOP.has(w));

function parse(raw, file) {
  const i = raw.indexOf('\n---');
  const head = i >= 0 ? raw.slice(0, i) : '';
  const body = (i >= 0 ? raw.slice(i + 4) : raw).trim();
  const meta = {};
  head.split('\n').forEach((l) => {
    const m = l.match(/^(\w+):\s*(.*)$/);
    if (m) meta[m[1].toLowerCase()] = m[2].trim();
  });
  return { url: meta.url || '', title: meta.title || file, published: meta.published || '', body };
}

function chunk(body, size = 700) {
  const out = [];
  let cur = '';
  for (const para of body.split(/\n\s*\n/)) {
    if (cur && (cur + '\n\n' + para).length > size) { out.push(cur); cur = para; }
    else cur = cur ? cur + '\n\n' + para : para;
  }
  if (cur) out.push(cur);
  return out.flatMap((c) => (c.length > size * 2 ? c.match(new RegExp('[\\s\\S]{1,' + size + '}', 'g')) : [c]));
}

function load() {
  let files = 0;
  try {
    const chunks = fs
      .readdirSync(DIR)
      .filter((f) => /\.(md|txt)$/i.test(f) && !f.startsWith('_'))
      .flatMap((f) => {
        const d = parse(fs.readFileSync(path.join(DIR, f), 'utf8').replace(/\r/g, ''), f);
        if (!d.body || /PASTE/i.test(d.body)) return [];
        files++;
        return chunk(d.body).map((t) => ({ url: d.url, title: d.title, published: d.published, text: t }));
      });
    return { chunks, files };
  } catch {
    return { chunks: [], files: 0 };
  }
}

const loaded = load();

function search(claim, k = 3) {
  const q = new Set(tok(claim));
  return loaded.chunks
    .map((c) => ({ c, score: tok(c.title + ' ' + c.text).filter((w) => q.has(w)).length }))
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((x) => x.c);
}

const stats = () => ({ corpus_files: loaded.files, corpus_chunks: loaded.chunks.length });

module.exports = { search, tok, stats };

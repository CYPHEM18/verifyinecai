// Usage: node scripts/test.js [baseUrl]   (default http://localhost:3000)
// Add 30+ labeled messages to data/samples.json for a number you can quote.
const samples = require('../data/samples.json');
const base = process.argv[2] || 'http://localhost:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let correct = 0, aiFailures = 0;
  for (const [i, s] of samples.entries()) {
    try {
      const r = await fetch(base + '/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: s.text }),
      });
      const d = await r.json();
      const flagged = d.verdict === 'dangerous' || d.verdict === 'suspicious';
      const ok = flagged === s.flag;
      if (ok) correct++;
      if (!d.ai_used) aiFailures++;
      console.log(`${ok ? 'PASS' : 'FAIL'} #${i + 1} expected=${s.flag ? 'flag' : 'ok'} got=${d.verdict} ai=${d.ai_used}`);
      if (!ok) console.log('     ' + s.text.slice(0, 90));
    } catch (e) {
      console.log(`ERR  #${i + 1} ${e.message}`);
    }
    await sleep(1500); // stay under free-tier rate limits
  }
  console.log(`\nAccuracy: ${correct}/${samples.length} (${Math.round((100 * correct) / samples.length)}%)`);
  if (aiFailures) console.log(`Warning: AI failed on ${aiFailures} messages (rules-only fallback used). Check env vars.`);
})();

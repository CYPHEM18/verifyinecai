# VerifyINEC

AI-assisted checker for phishing, fake INEC portals, impersonation and election disinformation.

Pipeline: URL evidence (code) -> LLM analysis + claim extraction -> retrieval from trusted corpus -> LLM grounded verification -> guardrails (hard evidence overrides the model).

## Structure
```
api/analyze.js       the endpoint (POST /api/analyze)
lib/                 evidence, retrieval, llm client, prompts
data/registry.json   official INEC domains (from CYRECON)
data/corpus.json     trusted official text used for verification
data/samples.json    labeled test messages
public/index.html    the web page
scripts/test.js      accuracy test
```

## Before running
1. `data/registry.json`: add your official root domains (subdomains match automatically).
2. `data/corpus.json`: replace the placeholder with real text from official INEC pages and statements.
3. Copy `.env.example` to `.env.local` and fill in your model details.

## Run locally
```
npm i -g vercel
vercel dev
```
Open http://localhost:3000

## Deploy
```
vercel --prod
```
Add `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` under Project Settings > Environment Variables, then redeploy.

## Test accuracy
```
npm test                      # against vercel dev
node scripts/test.js https://your-app.vercel.app
```
Add 30+ labeled messages to `data/samples.json` first.

## Use your own model later
Run Ollama, expose it with a Cloudflare Tunnel plus a secret token, and change the three env vars. No code changes.

## Before going public
Add rate limiting and caching, or free-tier model quotas will drain quickly.

## Live web search (LangSearch)
Set `LANGSEARCH_API_KEY` to add live search. At most 2 searches run per message, results are cached for an hour, and if the API fails or the allowance runs out the app continues with `data/corpus.json` only.

Results are tiered: `official` (domains in `registry.json`), `media` (domains in `data/trusted-domains.json`, edit this list) and everything else, which is discarded. Only official sources can confirm or contradict a claim; media results only show a claim is being reported. Never expose the key in browser code.

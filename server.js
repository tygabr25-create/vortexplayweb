// IPTV Player Pro Web — servidor local sem dependências (Node 16+).
// Serve o index.html e faz proxy (/proxy?url=...) para contornar CORS e conteúdo misto (http x https).
// Uso: node server.js  →  http://localhost:8080   (HOST=0.0.0.0 para abrir em outros aparelhos da rede)
const http = require('http'), https = require('https'), fs = require('fs'), path = require('path');
const PORT = process.env.PORT || 8080, HOST = process.env.HOST || '127.0.0.1';
const UA = 'IPTVPlayerPro/4.0 (Web)';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Expose-Headers': 'Content-Length,Content-Range,Accept-Ranges' };
const P = u => '/proxy?url=' + encodeURIComponent(u);

function up(u, req, res, hops = 0) {
  let t;
  try { t = new URL(u); } catch { res.writeHead(400, CORS); return res.end('URL inválida'); }
  if (!/^https?:$/.test(t.protocol)) { res.writeHead(400, CORS); return res.end('Protocolo inválido'); }
  const headers = { 'User-Agent': UA };
  if (req.headers.range) headers.Range = req.headers.range;
  const r2 = (t.protocol === 'https:' ? https : http).get(t, { headers }, r => {
    if ([301, 302, 303, 307, 308].includes(r.statusCode) && r.headers.location && hops < 5) {
      r.resume(); return up(new URL(r.headers.location, t).href, req, res, hops + 1);
    }
    const ct = r.headers['content-type'] || '';
    if (/mpegurl/i.test(ct) || /\.m3u8?$/i.test(t.pathname)) {   // playlist HLS: reescreve os links para passar pelo proxy
      let b = ''; r.setEncoding('utf8'); r.on('data', c => b += c);
      r.on('end', () => {
        const out = b.split(/\r?\n/).map(l => !l.trim() ? l : l.startsWith('#')
          ? l.replace(/URI="([^"]+)"/g, (m, x) => 'URI="' + P(new URL(x, t).href) + '"')
          : P(new URL(l, t).href)).join('\n');
        res.writeHead(r.statusCode, { ...CORS, 'content-type': 'application/vnd.apple.mpegurl' }); res.end(out);
      });
      return;
    }
    const h = { ...CORS };
    for (const k of ['content-type', 'content-length', 'content-range', 'accept-ranges']) if (r.headers[k]) h[k] = r.headers[k];
    if (/^image\//.test(ct)) h['cache-control'] = 'public,max-age=86400';
    res.writeHead(r.statusCode, h); r.pipe(res);
    res.on('close', () => r2.destroy());
  });
  r2.setTimeout(30000, () => r2.destroy(new Error('tempo esgotado')));
  r2.on('error', e => { if (!res.headersSent) res.writeHead(502, CORS); res.end('Erro: ' + e.message); });
}

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  if (u.pathname === '/proxy') return up(u.searchParams.get('url') || '', req, res);
  if (u.pathname === '/api/ping') { res.writeHead(200, CORS); return res.end('ok'); }
  fs.readFile(path.join(__dirname, 'index.html'), (e, d) => {
    if (e) { res.writeHead(500); return res.end('index.html não encontrado'); }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(d);
  });
}).listen(PORT, HOST, () => console.log(`IPTV Player Pro Web: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`));

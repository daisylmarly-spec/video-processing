import type { VercelRequest, VercelResponse } from '@vercel/node';
import https from 'https';

export const config = { api: { bodyParser: false } };

export default function handler(req: VercelRequest, res: VercelResponse) {
  // Reconstruct the sub-path: /api/xf-asr/v2/api/upload → /v2/api/upload
  const subPath = '/' + ((req.query.path as string[]) ?? []).join('/');
  const qs      = Object.entries(req.query)
    .filter(([k]) => k !== 'path')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');
  const fullPath = subPath + (qs ? `?${qs}` : '');

  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (v) headers[k] = Array.isArray(v) ? v[0] : v;
  }
  headers['host'] = 'raasr.xfyun.cn';

  const proxy = https.request(
    { hostname: 'raasr.xfyun.cn', path: fullPath, method: req.method, headers },
    (proxyRes) => {
      res.status(proxyRes.statusCode ?? 200);
      for (const [k, v] of Object.entries(proxyRes.headers)) {
        if (v) res.setHeader(k, v as string);
      }
      proxyRes.pipe(res);
    },
  );
  proxy.on('error', (err) => res.status(502).json({ error: err.message }));
  req.pipe(proxy);
}

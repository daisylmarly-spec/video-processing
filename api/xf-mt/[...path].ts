import type { VercelRequest, VercelResponse } from '@vercel/node';
import https from 'https';

export const config = { api: { bodyParser: false } };

export default function handler(req: VercelRequest, res: VercelResponse) {
  const subPath = '/' + ((req.query.path as string[]) ?? []).join('/');

  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (v) headers[k] = Array.isArray(v) ? v[0] : v;
  }
  headers['host'] = 'ntrans.xfyun.cn';

  // Browsers can't set Date header — frontend sends X-Date, we forward as Date
  if (headers['x-date']) {
    headers['date'] = headers['x-date'];
    delete headers['x-date'];
  }

  const proxy = https.request(
    { hostname: 'ntrans.xfyun.cn', path: subPath, method: req.method, headers },
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

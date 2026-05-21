import type { VercelRequest, VercelResponse } from '@vercel/node';
import https from 'https';

export const config = { api: { bodyParser: false, responseLimit: false } };

function collectBody(req: VercelRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer | string) =>
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    );
    req.on('end',   () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'te',
  'trailer', 'upgrade', 'proxy-authorization', 'proxy-authenticate']);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const subPath = '/' + ((req.query.path as string[]) ?? []).join('/');

  const body = await collectBody(req);

  const headers: Record<string, string> = { host: 'ntrans.xfyun.cn' };
  for (const [k, v] of Object.entries(req.headers)) {
    if (!v || k === 'host' || HOP_BY_HOP.has(k.toLowerCase())) continue;
    headers[k] = Array.isArray(v) ? v[0] : v;
  }
  headers['content-length'] = String(body.length);

  // Browsers can't set Date header — frontend sends X-Date, forward as Date
  if (headers['x-date']) {
    headers['date'] = headers['x-date'];
    delete headers['x-date'];
  }

  await new Promise<void>((resolve, reject) => {
    const proxy = https.request(
      { hostname: 'ntrans.xfyun.cn', path: subPath, method: req.method, headers },
      (proxyRes) => {
        res.status(proxyRes.statusCode ?? 200);
        for (const [k, v] of Object.entries(proxyRes.headers)) {
          if (!v || HOP_BY_HOP.has(k.toLowerCase())) continue;
          res.setHeader(k, Array.isArray(v) ? v[0] : v);
        }
        const out: Buffer[] = [];
        proxyRes.on('data', (c: Buffer) => out.push(c));
        proxyRes.on('end', () => { res.end(Buffer.concat(out)); resolve(); });
        proxyRes.on('error', reject);
      },
    );
    proxy.on('error', (err) => {
      if (!res.headersSent) res.status(502).json({ error: err.message });
      reject(err);
    });
    proxy.end(body);
  });
}

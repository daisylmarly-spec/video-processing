/**
 * Cloudflare Worker — proxies Xunfei (iFlytek) API calls.
 *
 * Routes:
 *   /xf-asr/*  →  https://raasr.xfyun.cn/*   (LFASR speech recognition)
 *   /xf-mt/*   →  https://ntrans.xfyun.cn/*  (machine translation)
 *
 * Deploy at https://dash.cloudflare.com → Workers & Pages → Create Worker.
 * Paste this file, click Deploy, copy the Worker URL, then set:
 *   VITE_XF_PROXY_BASE = https://<your-worker>.workers.dev
 * in your Vercel project's Environment Variables settings.
 */

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age':       '86400',
};

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    // Resolve upstream host + path
    let upstreamBase;
    let pathSuffix;
    if (url.pathname.startsWith('/xf-asr/')) {
      upstreamBase = 'https://raasr.xfyun.cn';
      pathSuffix   = url.pathname.slice('/xf-asr'.length);
    } else if (url.pathname.startsWith('/xf-mt/')) {
      upstreamBase = 'https://ntrans.xfyun.cn';
      pathSuffix   = url.pathname.slice('/xf-mt'.length);
    } else {
      return new Response('Not Found', { status: 404 });
    }

    const upstreamUrl = upstreamBase + pathSuffix + url.search;

    // Build forwarded headers
    const headers = new Headers();
    for (const [k, v] of request.headers.entries()) {
      const lower = k.toLowerCase();
      // Drop hop-by-hop and client-identifying headers
      if (['origin', 'referer', 'host', 'cf-connecting-ip',
           'cf-ray', 'cf-visitor', 'x-forwarded-for',
           'x-forwarded-proto', 'x-real-ip'].includes(lower)) continue;
      // ntrans uses Date header for auth — browsers can't set Date, so
      // the frontend sends X-Date instead; rename it here.
      if (lower === 'x-date') {
        headers.set('date', v);
      } else {
        headers.set(k, v);
      }
    }
    headers.set('host', new URL(upstreamBase).hostname);

    const upstream = await fetch(upstreamUrl, {
      method:  request.method,
      headers,
      body:    request.body,
    });

    // Forward upstream response + add CORS headers
    const resHeaders = new Headers(upstream.headers);
    for (const [k, v] of Object.entries(CORS)) resHeaders.set(k, v);
    // Remove hop-by-hop headers that confuse browsers
    resHeaders.delete('transfer-encoding');
    resHeaders.delete('connection');

    return new Response(upstream.body, {
      status:  upstream.status,
      headers: resHeaders,
    });
  },
};

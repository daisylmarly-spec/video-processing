import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { IncomingMessage } from 'http'
import type { ClientRequest } from 'http'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/xf-asr': {
        target:       'https://raasr.xfyun.cn',
        changeOrigin: true,
        rewrite:      path => path.replace(/^\/api\/xf-asr/, ''),
      },
      '/api/xf-mt': {
        target:       'https://ntrans.xfyun.cn',
        changeOrigin: true,
        rewrite:      path => path.replace(/^\/api\/xf-mt/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq: ClientRequest, req: IncomingMessage) => {
            const xDate = req.headers['x-date'];
            if (xDate) {
              proxyReq.setHeader('Date', xDate);
              proxyReq.removeHeader('x-date');
            }
          });
        },
      },
    },
  },
})

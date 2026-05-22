import type { TranscriptSegment } from '../pages/video-processing/components/TranscriptEditor';
import { md5Hex } from './md5';

const ASR_BASE = import.meta.env.VITE_XF_PROXY_BASE
  ? `${import.meta.env.VITE_XF_PROXY_BASE}/xf-asr`
  : '/api/xf-asr';

// 大模型 auth: signature = Base64(HmacSHA1(sortedQueryString, accessKeySecret))
async function buildSignature(
  params: Record<string, string>,
  accessKeySecret: string,
): Promise<string> {
  const enc     = new TextEncoder();
  const base    = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(accessKeySecret),
    { name: 'HMAC', hash: 'SHA-1' },
    false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(base));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

function formatDT(): string {
  const now    = new Date();
  const offset = -now.getTimezoneOffset();         // minutes ahead of UTC
  const sign   = offset >= 0 ? '+' : '-';
  const hh     = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0');
  const mm     = String(Math.abs(offset) % 60).padStart(2, '0');
  const pad    = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}` +
         `T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}${sign}${hh}${mm}`;
}

function random16(): string {
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

async function getMediaDuration(blob: Blob): Promise<number> {
  return new Promise(resolve => {
    const url   = URL.createObjectURL(blob);
    const el    = blob.type.startsWith('video') ? document.createElement('video')
                                                 : document.createElement('audio');
    const done  = (ms: number) => { URL.revokeObjectURL(url); resolve(ms); };
    const timer = setTimeout(() => done(0), 5000);
    el.addEventListener('loadedmetadata', () => {
      clearTimeout(timer);
      done(isFinite(el.duration) ? Math.round(el.duration * 1000) : 0);
    }, { once: true });
    el.addEventListener('error', () => { clearTimeout(timer); done(0); }, { once: true });
    el.preload = 'metadata';
    el.src = url;
  });
}

interface UploadResponse {
  code:     string;
  descInfo: string;
  content?: { orderId: string; taskEstimateTime?: number };
}

interface ResultResponse {
  code:     string;
  descInfo: string;
  content?: {
    orderInfo:    { orderId: string; status: number; failType?: number };
    orderResult:  string;
    taskEstimateTime?: number;
  };
}

// Best-effort sentence parser — handles multiple Xunfei result shapes
interface RawSentence { bg?: string|number; ed?: string|number; w?: string; onebest?: string }
function parseSentences(raw: string): RawSentence[] {
  if (!raw) return [];
  try {
    const obj = JSON.parse(raw);
    if (Array.isArray(obj)) return obj;
    if (obj.lattice) {
      return (obj.lattice as Array<{ bg?: string|number; ed?: string|number; w?: string; json_1best?: string }>)
        .map(item => {
          if (item.json_1best) {
            try {
              const inner = JSON.parse(item.json_1best);
              const text  = (inner.ws as Array<{cw: Array<{w: string}>}>)
                ?.map(ws => ws.cw?.map(c => c.w).join('') ?? '').join('') ?? '';
              return { bg: item.bg ?? inner.bg, ed: item.ed ?? inner.ed, w: text };
            } catch { return item; }
          }
          return item;
        });
    }
    if (obj.sentences) return obj.sentences;
  } catch {}
  return [];
}

const POLL_INTERVAL = 3000;
const POLL_TIMEOUT  = 10 * 60 * 1000;

// accessKeySecret = settings.xfApiKey  (console APISecret)
// accessKeyId     = settings.xfApiSecret (console APIKey)
export async function transcribeAudio(
  blob:            Blob,
  fileName:        string,
  appId:           string,
  accessKeySecret: string,
  accessKeyId:     string,
  sourceLang:      string = 'cn',
): Promise<TranscriptSegment[]> {
  const duration = await getMediaDuration(blob);

  // ── Upload ────────────────────────────────────────────────────────────────
  const uploadParams: Record<string, string> = {
    appId, accessKeyId,
    dateTime:        formatDT(),
    signatureRandom: random16(),
    fileSize:        String(blob.size),
    fileName,
    duration:        String(duration),
    language:        'autodialect',
  };
  const uploadSig  = await buildSignature(uploadParams, accessKeySecret);
  const arrayBuffer = await blob.arrayBuffer();

  const upRes = await fetch(`${ASR_BASE}/v2/upload?${new URLSearchParams(uploadParams)}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/octet-stream', 'signature': uploadSig },
    body:    arrayBuffer,
  });
  if (!upRes.ok) {
    throw new Error(`上传失败 ${upRes.status}: ${await upRes.text().catch(() => '')}`);
  }
  const upData = await upRes.json() as UploadResponse;
  if (upData.code !== '000000') throw new Error(`上传失败: ${upData.descInfo}`);
  const orderId = upData.content?.orderId;
  if (!orderId) throw new Error('上传完成但未获取到任务ID');

  // ── Poll for result ───────────────────────────────────────────────────────
  const deadline = Date.now() + POLL_TIMEOUT;

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL));

    const pollParams: Record<string, string> = {
      accessKeyId,
      dateTime:        formatDT(),
      signatureRandom: random16(),
      orderId,
      resultType:      'transfer',
    };
    const pollSig = await buildSignature(pollParams, accessKeySecret);
    const res     = await fetch(
      `${ASR_BASE}/v2/getResult?${new URLSearchParams(pollParams)}`,
      { headers: { 'signature': pollSig } },
    );
    if (!res.ok) continue;

    const result = await res.json() as ResultResponse;
    if (result.code !== '000000' || !result.content) {
      throw new Error(`查询失败: ${result.descInfo}`);
    }

    const { status } = result.content.orderInfo;
    if (status === -1) throw new Error('识别任务失败，请重试');
    if (status !== 4)  continue;

    const sentences = parseSentences(result.content.orderResult);
    return sentences
      .filter(s => (s.w ?? s.onebest ?? '').trim())
      .map((s, i) => ({
        id:        `seg_${i}`,
        startTime: parseInt(String(s.bg ?? 0), 10) / 1000,
        endTime:   parseInt(String(s.ed ?? 0), 10) / 1000,
        text:      (s.w ?? s.onebest ?? '').trim(),
      }));
  }

  throw new Error('识别超时，请重试');
}

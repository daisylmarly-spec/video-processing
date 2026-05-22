import type { TranscriptSegment } from '../pages/video-processing/components/TranscriptEditor';
import { md5Hex } from './md5';

const ASR_BASE = import.meta.env.VITE_XF_PROXY_BASE
  ? `${import.meta.env.VITE_XF_PROXY_BASE}/xf-asr`
  : '/api/xf-asr';

// v2 LFASR: signa = Base64(HmacSHA1(MD5(appId + ts), secretKey))
async function buildSigna(appId: string, secretKey: string, ts: string): Promise<string> {
  const enc = new TextEncoder();
  const m1  = md5Hex(appId + ts);
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secretKey),
    { name: 'HMAC', hash: 'SHA-1' },
    false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(m1));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

interface UploadResponse {
  code:     string;   // '000000' = success
  descInfo: string;
  content?: { orderId: string; taskEstimateTime?: number };
}

interface Sentence {
  sn:       number;
  begTime:  string;
  endTime:  string;
  onebest:  string;
  speaker?: string;
}

interface ResultResponse {
  code:     string;
  descInfo: string;
  content?: {
    orderInfo: { orderId: string; status: number; failType?: number };
    orderResult: string;   // JSON string → Sentence[]
  };
}

const POLL_INTERVAL = 3000;
const POLL_TIMEOUT  = 10 * 60 * 1000;

async function uploadFile(
  blob:       Blob,
  fileName:   string,
  appId:      string,
  secretKey:  string,
  sourceLang: string,
): Promise<string> {
  const ts    = Math.floor(Date.now() / 1000).toString();
  const signa = await buildSigna(appId, secretKey, ts);

  // v2 API: all auth/meta params go in the query string; body is raw audio bytes
  const qs = new URLSearchParams({
    appId, ts, signa,
    fileName,
    fileSize:  String(blob.size),
    duration:  '0',
    language:  sourceLang,
    audioMode: 'fileStream',
  }).toString();

  const arrayBuffer = await blob.arrayBuffer();

  const res = await fetch(`${ASR_BASE}/v2/api/upload?${qs}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body:    arrayBuffer,
  });

  if (!res.ok) {
    throw new Error(`上传失败 ${res.status}: ${await res.text().catch(() => '')}`);
  }

  const data = await res.json() as UploadResponse;
  if (data.code !== '000000') {
    throw new Error(`上传失败: ${data.descInfo ?? data.code}`);
  }

  const orderId = data.content?.orderId;
  if (!orderId) throw new Error('上传完成但未获取到任务ID');
  return orderId;
}

export async function transcribeAudio(
  blob:       Blob,
  fileName:   string,
  appId:      string,
  _apiKey:    string,
  secretKey:  string,
  sourceLang: string = 'cn',
): Promise<TranscriptSegment[]> {
  const orderId = await uploadFile(blob, fileName, appId, secretKey, sourceLang);

  const deadline = Date.now() + POLL_TIMEOUT;

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL));

    const ts2    = Math.floor(Date.now() / 1000).toString();
    const sig2   = await buildSigna(appId, secretKey, ts2);
    const params = new URLSearchParams({ orderId, appId, ts: ts2, signa: sig2 });
    const res    = await fetch(`${ASR_BASE}/v2/api/getResult?${params}`);

    if (!res.ok) continue;

    const result = await res.json() as ResultResponse;
    if (result.code !== '000000' || !result.content) {
      throw new Error(`查询失败: ${result.descInfo ?? result.code}`);
    }

    const { status } = result.content.orderInfo;
    if (status === -1) throw new Error('识别任务失败，请重试');
    if (status !== 4)  continue;   // 4 = done

    const sentences: Sentence[] = JSON.parse(result.content.orderResult);
    return sentences
      .filter(s => s.onebest?.trim())
      .map((s, i) => ({
        id:        `seg_${i}`,
        startTime: parseInt(s.begTime, 10) / 1000,
        endTime:   parseInt(s.endTime, 10) / 1000,
        text:      s.onebest.trim(),
      }));
  }

  throw new Error('识别超时，请重试');
}

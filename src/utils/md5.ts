/** Pure-JS MD5 + HMAC-MD5 (RFC 1321 / RFC 2104). No external deps. */

const T = (() => {
  const t = new Uint32Array(64);
  for (let i = 0; i < 64; i++) t[i] = (Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0;
  return t;
})();

function add32(a: number, b: number) { return (a + b) >>> 0; }
function rol(x: number, n: number)   { return (x << n) | (x >>> (32 - n)); }

function md5Block(msg: Uint8Array): Uint8Array<ArrayBuffer> {
  const origLen = msg.length;
  const padLen  = origLen % 64 < 56 ? 56 - (origLen % 64) : 120 - (origLen % 64);
  const buf     = new Uint8Array(origLen + padLen + 8);
  buf.set(msg);
  buf[origLen] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(origLen + padLen,     (origLen * 8) >>> 0,                 true);
  dv.setUint32(origLen + padLen + 4, Math.floor((origLen * 8) / 0x100000000), true);

  let a0 = 0x67452301, b0 = 0xEFCDAB89, c0 = 0x98BADCFE, d0 = 0x10325476;

  for (let i = 0; i < buf.length; i += 64) {
    const M = new Uint32Array(16);
    for (let j = 0; j < 16; j++) M[j] = dv.getUint32(i + j * 4, true);

    let a = a0, b = b0, c = c0, d = d0;

    for (let j = 0; j < 16; j++) {
      const F = (b & c) | (~b & d);
      a = add32(rol(add32(add32(a, F), add32(M[j],          T[j])),      [7,12,17,22][j%4]), b);
      [a, b, c, d] = [d, a, b, c];
    }
    for (let j = 0; j < 16; j++) {
      const F = (b & d) | (c & ~d);
      a = add32(rol(add32(add32(a, F), add32(M[(5*j+1)%16],  T[16+j])), [5,9,14,20][j%4]),  b);
      [a, b, c, d] = [d, a, b, c];
    }
    for (let j = 0; j < 16; j++) {
      const F = b ^ c ^ d;
      a = add32(rol(add32(add32(a, F), add32(M[(3*j+5)%16],  T[32+j])), [4,11,16,23][j%4]), b);
      [a, b, c, d] = [d, a, b, c];
    }
    for (let j = 0; j < 16; j++) {
      const F = c ^ (b | ~d);
      a = add32(rol(add32(add32(a, F), add32(M[(7*j)%16],    T[48+j])), [6,10,15,21][j%4]), b);
      [a, b, c, d] = [d, a, b, c];
    }

    a0 = add32(a0, a); b0 = add32(b0, b);
    c0 = add32(c0, c); d0 = add32(d0, d);
  }

  const out = new Uint8Array(16);
  const ov  = new DataView(out.buffer);
  ov.setUint32(0, a0, true); ov.setUint32(4, b0, true);
  ov.setUint32(8, c0, true); ov.setUint32(12, d0, true);
  return out;
}

const enc = new TextEncoder();

export function md5Hex(input: string): string {
  const bytes = md5Block(enc.encode(input));
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export function hmacMd5Base64(key: string, data: string): string {
  let keyBytes = enc.encode(key);
  if (keyBytes.length > 64) keyBytes = md5Block(keyBytes);

  const ipad = new Uint8Array(64), opad = new Uint8Array(64);
  ipad.set(keyBytes); opad.set(keyBytes);
  for (let i = 0; i < 64; i++) { ipad[i] ^= 0x36; opad[i] ^= 0x5c; }

  const dataBytes = enc.encode(data);
  const inner = new Uint8Array(64 + dataBytes.length);
  inner.set(ipad); inner.set(dataBytes, 64);
  const innerHash = md5Block(inner);

  const outer = new Uint8Array(80);
  outer.set(opad); outer.set(innerHash, 64);
  const raw = md5Block(outer);

  let bin = '';
  for (const byte of raw) bin += String.fromCharCode(byte);
  return btoa(bin);
}

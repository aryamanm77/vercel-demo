// Content-hash deduplicated image storage abstraction + PNG/JPEG magic-byte validator,
// metadata stripper, and max-1000px resizer (works identically in Browser and Node).

import { crc32, inflateRaw } from '../utils/xlsxCodec';

export const MAX_IMAGE_BYTES = 1024 * 1024; // 1 MB
export const MAX_IMAGE_WIDTH = 1000;

export type SupportedImageMime = 'image/png' | 'image/jpeg';

export interface StoredImageMeta {
  imageId: string; // SHA-256 hex digest
  mimeType: SupportedImageMime;
  byteLength: number;
  width: number;
  height: number;
  originalFilename?: string;
  createdAt: string;
}

export interface StoredImageAsset extends StoredImageMeta {
  bytes: Uint8Array;
}

export interface ProcessedImageResult {
  ok: true;
  bytes: Uint8Array;
  mimeType: SupportedImageMime;
  width: number;
  height: number;
  metadataStripped: boolean;
  resized: boolean;
}

export interface ImageValidationFailure {
  ok: false;
  code: 'UNSUPPORTED_FORMAT' | 'SIZE_EXCEEDED' | 'UNREADABLE_IMAGE';
  message: string;
}

export interface ImageStoragePort {
  put(bytes: Uint8Array, mimeType: SupportedImageMime, meta?: { width: number; height: number; originalFilename?: string }): Promise<StoredImageMeta>;
  get(imageId: string): Promise<StoredImageAsset | null>;
  has(imageId: string): Promise<boolean>;
  delete(imageId: string): Promise<boolean>;
  toDataUrl(imageId: string): Promise<string | null>;
  listIds(): Promise<string[]>;
}

// ---------------------------------------------------------------------------
// Pure-TS SHA-256 (sync, zero external dependencies)
// ---------------------------------------------------------------------------

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(val: number, bits: number): number {
  return (val >>> bits) | (val << (32 - bits));
}

export function sha256Hex(data: Uint8Array): string {
  const len = data.length;
  const bitLenHi = Math.floor((len * 8) / 0x100000000);
  const bitLenLo = (len * 8) >>> 0;
  const paddedLen = Math.ceil((len + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(data);
  padded[len] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 8, bitLenHi, false);
  view.setUint32(paddedLen - 4, bitLenLo, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);
  for (let i = 0; i < paddedLen; i += 64) {
    for (let t = 0; t < 16; t++) {
      w[t] = view.getUint32(i + t * 4, false);
    }
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[t] + w[t]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((x) => x.toString(16).padStart(8, '0'))
    .join('');
}

// ---------------------------------------------------------------------------
// Magic-Byte Detection, Dimension Inspection, Metadata Stripping & Resizing
// ---------------------------------------------------------------------------

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function detectImageMimeByMagicBytes(bytes: Uint8Array): SupportedImageMime | null {
  if (bytes.length >= 8 && PNG_SIG.every((b, idx) => bytes[idx] === b)) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  return null;
}

function readU32BE(buf: Uint8Array, offset: number): number {
  return (
    ((buf[offset] << 24) | (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3]) >>>
    0
  );
}

function writeU32BE(buf: Uint8Array, offset: number, val: number): void {
  buf[offset] = (val >>> 24) & 0xff;
  buf[offset + 1] = (val >>> 16) & 0xff;
  buf[offset + 2] = (val >>> 8) & 0xff;
  buf[offset + 3] = val & 0xff;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function buildPngChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(12 + data.length);
  writeU32BE(chunk, 0, data.length);
  for (let i = 0; i < 4; i++) chunk[4 + i] = type.charCodeAt(i);
  chunk.set(data, 8);
  const crc = crc32(chunk.subarray(4, 8 + data.length));
  writeU32BE(chunk, 8 + data.length, crc);
  return chunk;
}

export function encodeRgbaPng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const stride = width * 4 + 1;
  const raw = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filter None
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * stride + 1);
  }

  // Wrap raw scanlines in valid zlib stored-deflate blocks (max 65535 bytes/block)
  const blocks: Uint8Array[] = [new Uint8Array([0x78, 0x01])];
  let offset = 0;
  while (offset < raw.length || offset === 0) {
    const remaining = raw.length - offset;
    const blockLen = Math.min(remaining, 65535);
    const isFinal = offset + blockLen >= raw.length ? 1 : 0;
    const header = new Uint8Array(5);
    header[0] = isFinal;
    header[1] = blockLen & 0xff;
    header[2] = (blockLen >>> 8) & 0xff;
    const nlen = (~blockLen) & 0xffff;
    header[3] = nlen & 0xff;
    header[4] = (nlen >>> 8) & 0xff;
    blocks.push(header, raw.subarray(offset, offset + blockLen));
    offset += blockLen;
    if (remaining === 0) break;
  }
  const adler = new Uint8Array(4);
  writeU32BE(adler, 0, adler32(raw));
  blocks.push(adler);

  const zLen = blocks.reduce((s, b) => s + b.length, 0);
  const idatData = new Uint8Array(zLen);
  let zPos = 0;
  for (const b of blocks) {
    idatData.set(b, zPos);
    zPos += b.length;
  }

  const ihdr = new Uint8Array(13);
  writeU32BE(ihdr, 0, width);
  writeU32BE(ihdr, 4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const sig = new Uint8Array(PNG_SIG);
  const ihdrChunk = buildPngChunk('IHDR', ihdr);
  const idatChunk = buildPngChunk('IDAT', idatData);
  const iendChunk = buildPngChunk('IEND', new Uint8Array(0));

  const out = new Uint8Array(sig.length + ihdrChunk.length + idatChunk.length + iendChunk.length);
  let pos = 0;
  for (const part of [sig, ihdrChunk, idatChunk, iendChunk]) {
    out.set(part, pos);
    pos += part.length;
  }
  return out;
}

interface ParsedPngInfo {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  interlace: number;
  idatParts: Uint8Array[];
  strippedAncillaryCount: number;
  cleanChunksBytes: Uint8Array;
}

const PNG_CRITICAL_AND_COLOR = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS']);

function parseAndStripPng(bytes: Uint8Array): ParsedPngInfo {
  if (bytes.length < 33) throw new Error('PNG file truncated');
  let pos = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  let sawIhdr = false;
  let sawIdat = false;
  let sawIend = false;
  let strippedAncillaryCount = 0;
  const keptChunks: Uint8Array[] = [new Uint8Array(PNG_SIG)];
  const idatParts: Uint8Array[] = [];

  while (pos + 12 <= bytes.length) {
    const length = readU32BE(bytes, pos);
    if (pos + 12 + length > bytes.length) {
      throw new Error('Corrupted PNG chunk length');
    }
    const type = String.fromCharCode(
      bytes[pos + 4],
      bytes[pos + 5],
      bytes[pos + 6],
      bytes[pos + 7],
    );
    const data = bytes.subarray(pos + 8, pos + 8 + length);

    if (type === 'IHDR') {
      if (length !== 13) throw new Error('Invalid PNG IHDR chunk');
      width = readU32BE(data, 0);
      height = readU32BE(data, 4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
      if (width === 0 || height === 0) throw new Error('PNG has zero dimension');
      sawIhdr = true;
    } else if (type === 'IDAT') {
      sawIdat = true;
      idatParts.push(new Uint8Array(data));
    } else if (type === 'IEND') {
      sawIend = true;
    }

    if (PNG_CRITICAL_AND_COLOR.has(type)) {
      keptChunks.push(bytes.subarray(pos, pos + 12 + length));
    } else {
      strippedAncillaryCount++;
    }

    pos += 12 + length;
    if (sawIend) break;
  }

  if (!sawIhdr || !sawIdat || !sawIend) {
    throw new Error('Malformed PNG: missing IHDR, IDAT, or IEND');
  }

  const totalCleanLen = keptChunks.reduce((s, c) => s + c.length, 0);
  const cleanChunksBytes = new Uint8Array(totalCleanLen);
  let outPos = 0;
  for (const c of keptChunks) {
    cleanChunksBytes.set(c, outPos);
    outPos += c.length;
  }

  return {
    width,
    height,
    bitDepth,
    colorType,
    interlace,
    idatParts,
    strippedAncillaryCount,
    cleanChunksBytes,
  };
}

function decodePngToRgbaIfStandard(info: ParsedPngInfo): Uint8Array | null {
  if (info.interlace !== 0 || info.bitDepth !== 8) return null;
  if (info.colorType !== 2 && info.colorType !== 6 && info.colorType !== 0) return null;
  const channels = info.colorType === 6 ? 4 : info.colorType === 2 ? 3 : 1;

  const totalZlib = info.idatParts.reduce((s, p) => s + p.length, 0);
  const zlib = new Uint8Array(totalZlib);
  let zOff = 0;
  for (const p of info.idatParts) {
    zlib.set(p, zOff);
    zOff += p.length;
  }
  if (zlib.length < 6) return null;
  // Strip 2-byte zlib header + 4-byte adler32 trailer
  const rawScanlines = inflateRaw(zlib.subarray(2, zlib.length - 4));
  const bpp = channels;
  const stride = info.width * bpp;
  if (rawScanlines.length < (stride + 1) * info.height) return null;

  const unfilt = new Uint8Array(stride * info.height);
  const paeth = (a: number, b: number, c: number) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
  };

  for (let y = 0; y < info.height; y++) {
    const srcRow = y * (stride + 1);
    const filter = rawScanlines[srcRow];
    const dstRow = y * stride;
    for (let x = 0; x < stride; x++) {
      const val = rawScanlines[srcRow + 1 + x];
      const left = x >= bpp ? unfilt[dstRow + x - bpp] : 0;
      const up = y > 0 ? unfilt[dstRow - stride + x] : 0;
      const upLeft = y > 0 && x >= bpp ? unfilt[dstRow - stride + x - bpp] : 0;
      let recon = val;
      if (filter === 1) recon = (val + left) & 0xff;
      else if (filter === 2) recon = (val + up) & 0xff;
      else if (filter === 3) recon = (val + ((left + up) >>> 1)) & 0xff;
      else if (filter === 4) recon = (val + paeth(left, up, upLeft)) & 0xff;
      unfilt[dstRow + x] = recon;
    }
  }

  const rgba = new Uint8Array(info.width * info.height * 4);
  for (let i = 0, p = 0; i < info.width * info.height; i++, p += 4) {
    if (channels === 4) {
      rgba[p] = unfilt[i * 4];
      rgba[p + 1] = unfilt[i * 4 + 1];
      rgba[p + 2] = unfilt[i * 4 + 2];
      rgba[p + 3] = unfilt[i * 4 + 3];
    } else if (channels === 3) {
      rgba[p] = unfilt[i * 3];
      rgba[p + 1] = unfilt[i * 3 + 1];
      rgba[p + 2] = unfilt[i * 3 + 2];
      rgba[p + 3] = 255;
    } else {
      const g = unfilt[i];
      rgba[p] = g;
      rgba[p + 1] = g;
      rgba[p + 2] = g;
      rgba[p + 3] = 255;
    }
  }
  return rgba;
}

function downsampleRgba(
  src: Uint8Array,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): Uint8Array {
  const dst = new Uint8Array(dstW * dstH * 4);
  for (let y = 0; y < dstH; y++) {
    const sy = Math.min(srcH - 1, Math.floor((y * srcH) / dstH));
    for (let x = 0; x < dstW; x++) {
      const sx = Math.min(srcW - 1, Math.floor((x * srcW) / dstW));
      const si = (sy * srcW + sx) * 4;
      const di = (y * dstW + x) * 4;
      dst[di] = src[si];
      dst[di + 1] = src[si + 1];
      dst[di + 2] = src[si + 2];
      dst[di + 3] = src[si + 3];
    }
  }
  return dst;
}

interface ParsedJpegInfo {
  width: number;
  height: number;
  metadataStripped: boolean;
  cleanBytes: Uint8Array;
}

function parseAndStripJpeg(bytes: Uint8Array): ParsedJpegInfo {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error('Malformed JPEG header');
  }
  const kept: Uint8Array[] = [bytes.subarray(0, 2)];
  let pos = 2;
  let width = 0;
  let height = 0;
  let sawSof = false;
  let sawSos = false;
  let metadataStripped = false;

  while (pos < bytes.length) {
    if (bytes[pos] !== 0xff) {
      throw new Error('Malformed JPEG marker stream');
    }
    while (pos < bytes.length && bytes[pos] === 0xff) pos++;
    if (pos >= bytes.length) break;
    const marker = bytes[pos];
    pos++;

    if (marker === 0xd9) {
      kept.push(new Uint8Array([0xff, 0xd9]));
      break;
    }
    if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7)) {
      kept.push(new Uint8Array([0xff, marker]));
      continue;
    }

    if (pos + 2 > bytes.length) throw new Error('Truncated JPEG segment length');
    const segLen = (bytes[pos] << 8) | bytes[pos + 1];
    if (segLen < 2 || pos + segLen > bytes.length) {
      throw new Error('Invalid JPEG segment length');
    }

    // SOF0..SOF3 contain width & height
    if ((marker >= 0xc0 && marker <= 0xc3) && segLen >= 7) {
      height = (bytes[pos + 3] << 8) | bytes[pos + 4];
      width = (bytes[pos + 5] << 8) | bytes[pos + 6];
      sawSof = true;
    }

    // SOS (0xDA) starts entropy-coded scan until EOI (0xFF 0xD9)
    if (marker === 0xda) {
      sawSos = true;
      kept.push(bytes.subarray(pos - 2));
      break;
    }

    // Strip APP1..APP15 (EXIF/XMP/IPTC/ICC) and COM (0xFE) comments
    const isMetadataSegment = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
    if (isMetadataSegment) {
      metadataStripped = true;
    } else {
      kept.push(bytes.subarray(pos - 2, pos + segLen));
    }

    pos += segLen;
  }

  if (!sawSof || width === 0 || height === 0 || !sawSos) {
    throw new Error('Unreadable or incomplete JPEG image');
  }

  const total = kept.reduce((s, p) => s + p.length, 0);
  const cleanBytes = new Uint8Array(total);
  let cursor = 0;
  for (const p of kept) {
    cleanBytes.set(p, cursor);
    cursor += p.length;
  }

  return { width, height, metadataStripped, cleanBytes };
}

async function resizeViaBrowserCanvasIfAvailable(
  bytes: Uint8Array,
  mimeType: SupportedImageMime,
  maxWidth: number,
): Promise<{ bytes: Uint8Array; width: number; height: number } | null> {
  if (typeof document === 'undefined' || typeof createImageBitmap === 'undefined') {
    return null;
  }
  try {
    const safeBuffer = new Uint8Array(bytes).buffer;
    const blob = new Blob([safeBuffer], { type: mimeType });
    const bitmap = await createImageBitmap(blob);
    const targetW = bitmap.width > maxWidth ? maxWidth : bitmap.width;
    const targetH = bitmap.width > maxWidth ? Math.max(1, Math.round((bitmap.height * maxWidth) / bitmap.width)) : bitmap.height;
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    bitmap.close();

    const outBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, mimeType, mimeType === 'image/jpeg' ? 0.9 : undefined),
    );
    if (!outBlob) return null;
    const buf = new Uint8Array(await outBlob.arrayBuffer());
    return { bytes: buf, width: targetW, height: targetH };
  } catch {
    return null;
  }
}

export function validateAndProcessImageSync(
  inputBytes: Uint8Array,
): ProcessedImageResult | ImageValidationFailure {
  if (inputBytes.length > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      code: 'SIZE_EXCEEDED',
      message: `Image exceeds 1 MB limit (${(inputBytes.length / (1024 * 1024)).toFixed(2)} MB).`,
    };
  }

  const mimeType = detectImageMimeByMagicBytes(inputBytes);
  if (!mimeType) {
    return {
      ok: false,
      code: 'UNSUPPORTED_FORMAT',
      message: 'Unsupported image format. Only valid PNG or JPG/JPEG files are accepted.',
    };
  }

  try {
    if (mimeType === 'image/png') {
      const info = parseAndStripPng(inputBytes);
      let finalBytes = info.cleanChunksBytes;
      let width = info.width;
      let height = info.height;
      let resized = false;
      let metadataStripped = info.strippedAncillaryCount > 0;

      if (width > MAX_IMAGE_WIDTH) {
        const rgba = decodePngToRgbaIfStandard(info);
        if (rgba) {
          const newW = MAX_IMAGE_WIDTH;
          const newH = Math.max(1, Math.round((height * MAX_IMAGE_WIDTH) / width));
          const down = downsampleRgba(rgba, width, height, newW, newH);
          finalBytes = encodeRgbaPng(newW, newH, down);
          width = newW;
          height = newH;
          resized = true;
          metadataStripped = true;
        }
      }

      if (finalBytes.length > MAX_IMAGE_BYTES) {
        return {
          ok: false,
          code: 'SIZE_EXCEEDED',
          message: 'Processed image still exceeds 1 MB limit.',
        };
      }

      return {
        ok: true,
        bytes: finalBytes,
        mimeType,
        width,
        height,
        metadataStripped,
        resized,
      };
    }

    const jpg = parseAndStripJpeg(inputBytes);
    if (jpg.cleanBytes.length > MAX_IMAGE_BYTES) {
      return {
        ok: false,
        code: 'SIZE_EXCEEDED',
        message: 'Image exceeds 1 MB limit.',
      };
    }
    return {
      ok: true,
      bytes: jpg.cleanBytes,
      mimeType: 'image/jpeg',
      width: jpg.width,
      height: jpg.height,
      metadataStripped: jpg.metadataStripped,
      resized: false,
    };
  } catch (err) {
    return {
      ok: false,
      code: 'UNREADABLE_IMAGE',
      message: err instanceof Error ? err.message : 'Unreadable or corrupted image bytes.',
    };
  }
}

export async function validateAndProcessImage(
  inputBytes: Uint8Array,
): Promise<ProcessedImageResult | ImageValidationFailure> {
  const syncResult = validateAndProcessImageSync(inputBytes);
  if (!syncResult.ok) return syncResult;

  if (syncResult.width > MAX_IMAGE_WIDTH) {
    const canvasRes = await resizeViaBrowserCanvasIfAvailable(
      syncResult.bytes,
      syncResult.mimeType,
      MAX_IMAGE_WIDTH,
    );
    if (canvasRes) {
      if (canvasRes.bytes.length > MAX_IMAGE_BYTES) {
        return {
          ok: false,
          code: 'SIZE_EXCEEDED',
          message: 'Resized image exceeds 1 MB limit.',
        };
      }
      return {
        ok: true,
        bytes: canvasRes.bytes,
        mimeType: syncResult.mimeType,
        width: canvasRes.width,
        height: canvasRes.height,
        metadataStripped: true,
        resized: true,
      };
    }
  }

  return syncResult;
}

// ---------------------------------------------------------------------------
// Base64 helpers (Browser & Node compatible)
// ---------------------------------------------------------------------------

export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---------------------------------------------------------------------------
// Content-Hash Deduplicated Image Storage Implementation
// ---------------------------------------------------------------------------

const IMAGE_BLOB_STORAGE_KEY = 'mit_mysore_image_blobs_v1';

interface SerializedImageAsset {
  imageId: string;
  mimeType: SupportedImageMime;
  byteLength: number;
  width: number;
  height: number;
  originalFilename?: string;
  createdAt: string;
  base64: string;
}

class LocalContentHashImageStorage implements ImageStoragePort {
  private memoryMap = new Map<string, StoredImageAsset>();
  private hydrated = false;

  private ensureHydrated(): void {
    if (this.hydrated) return;
    this.hydrated = true;
    try {
      const raw = localStorage.getItem(IMAGE_BLOB_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, SerializedImageAsset>;
      for (const [id, item] of Object.entries(parsed)) {
        this.memoryMap.set(id, {
          imageId: item.imageId,
          mimeType: item.mimeType,
          byteLength: item.byteLength,
          width: item.width,
          height: item.height,
          originalFilename: item.originalFilename,
          createdAt: item.createdAt,
          bytes: base64ToBytes(item.base64),
        });
      }
    } catch {
      // Safe fallback in Node tests or quota-restricted storage
    }
  }

  private persist(): void {
    try {
      const obj: Record<string, SerializedImageAsset> = {};
      for (const [id, asset] of this.memoryMap.entries()) {
        obj[id] = {
          imageId: asset.imageId,
          mimeType: asset.mimeType,
          byteLength: asset.byteLength,
          width: asset.width,
          height: asset.height,
          originalFilename: asset.originalFilename,
          createdAt: asset.createdAt,
          base64: bytesToBase64(asset.bytes),
        };
      }
      localStorage.setItem(IMAGE_BLOB_STORAGE_KEY, JSON.stringify(obj));
    } catch {
      // In-memory store remains authoritative when localStorage is unavailable or full
    }
  }

  putSync(
    bytes: Uint8Array,
    mimeType: SupportedImageMime,
    meta?: { width?: number; height?: number; originalFilename?: string },
  ): StoredImageMeta {
    this.ensureHydrated();
    const imageId = sha256Hex(bytes);
    const existing = this.memoryMap.get(imageId);
    if (existing) {
      return {
        imageId: existing.imageId,
        mimeType: existing.mimeType,
        byteLength: existing.byteLength,
        width: existing.width,
        height: existing.height,
        originalFilename: existing.originalFilename,
        createdAt: existing.createdAt,
      };
    }

    const asset: StoredImageAsset = {
      imageId,
      mimeType,
      byteLength: bytes.length,
      width: meta?.width ?? 0,
      height: meta?.height ?? 0,
      originalFilename: meta?.originalFilename,
      createdAt: new Date().toISOString(),
      bytes: new Uint8Array(bytes),
    };
    this.memoryMap.set(imageId, asset);
    this.persist();
    return {
      imageId: asset.imageId,
      mimeType: asset.mimeType,
      byteLength: asset.byteLength,
      width: asset.width,
      height: asset.height,
      originalFilename: asset.originalFilename,
      createdAt: asset.createdAt,
    };
  }

  getSync(imageId: string): StoredImageAsset | null {
    this.ensureHydrated();
    return this.memoryMap.get(imageId) || null;
  }

  hasSync(imageId: string): boolean {
    this.ensureHydrated();
    return this.memoryMap.has(imageId);
  }

  toDataUrlSync(imageId: string | null | undefined): string | null {
    if (!imageId) return null;
    const asset = this.getSync(imageId);
    if (!asset) return null;
    return `data:${asset.mimeType};base64,${bytesToBase64(asset.bytes)}`;
  }

  clearMemoryAndStorage(): void {
    this.memoryMap.clear();
    this.hydrated = true;
    try {
      localStorage.removeItem(IMAGE_BLOB_STORAGE_KEY);
    } catch {
      // Ignore in Node
    }
  }

  async put(
    bytes: Uint8Array,
    mimeType: SupportedImageMime,
    meta?: { width: number; height: number; originalFilename?: string },
  ): Promise<StoredImageMeta> {
    return this.putSync(bytes, mimeType, meta);
  }

  async get(imageId: string): Promise<StoredImageAsset | null> {
    return this.getSync(imageId);
  }

  async has(imageId: string): Promise<boolean> {
    return this.hasSync(imageId);
  }

  async delete(imageId: string): Promise<boolean> {
    this.ensureHydrated();
    const deleted = this.memoryMap.delete(imageId);
    if (deleted) this.persist();
    return deleted;
  }

  async toDataUrl(imageId: string): Promise<string | null> {
    return this.toDataUrlSync(imageId);
  }

  async listIds(): Promise<string[]> {
    this.ensureHydrated();
    return Array.from(this.memoryMap.keys());
  }
}

export const imageStorage = new LocalContentHashImageStorage();

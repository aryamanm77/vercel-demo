// Zero-dependency OOXML (.xlsx) ZIP codec, cell reader/writer,
// and floating + in-cell embedded image extractor/writer.

export interface XlsxCell {
  row: number; // 1-based Excel row
  col: number; // 0-based column index
  ref: string;
  value: string | number | boolean | null;
  rawText: string;
  isDateSerial?: boolean;
}

export interface XlsxExtractedImage {
  row1Based: number; // 1-based Excel row
  col0Based: number;
  source: 'floating' | 'in_cell';
  mediaPath: string;
  filename: string;
  bytes: Uint8Array;
}

export interface ParsedXlsxWorkbook {
  sheetName: string;
  rows: (string | number | boolean | null)[][]; // index 0 == Excel row 1
  cells: XlsxCell[][]; // index 0 == Excel row 1
  images: XlsxExtractedImage[];
}

export interface XlsxWriteImageInput {
  row1Based: number; // 1-based target Excel row
  col0Based?: number;
  bytes: Uint8Array;
  mimeType: 'image/png' | 'image/jpeg';
  filename?: string;
}

export interface XlsxBuildOptions {
  sheetName?: string;
  headers: string[];
  rows: (string | number | boolean | null | undefined)[][];
  images?: XlsxWriteImageInput[];
}

// ---------------------------------------------------------------------------
// CRC-32 & Minimal ZIP Builder / Reader (STORE = 0, DEFLATE = 8)
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8');

function u16LE(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

function u32LE(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

function writeU16LE(buf: Uint8Array, offset: number, value: number): void {
  buf[offset] = value & 0xff;
  buf[offset + 1] = (value >>> 8) & 0xff;
}

function writeU32LE(buf: Uint8Array, offset: number, value: number): void {
  buf[offset] = value & 0xff;
  buf[offset + 1] = (value >>> 8) & 0xff;
  buf[offset + 2] = (value >>> 16) & 0xff;
  buf[offset + 3] = (value >>> 24) & 0xff;
}

// Pure-TS RFC 1951 raw DEFLATE decompressor (supports stored, fixed, and dynamic Huffman blocks).
export function inflateRaw(src: Uint8Array): Uint8Array {
  let bitPos = 0;
  const readBits = (n: number): number => {
    let val = 0;
    for (let i = 0; i < n; i++) {
      const byteIdx = bitPos >>> 3;
      if (byteIdx >= src.length) throw new Error('Unexpected end of deflate stream');
      const bit = (src[byteIdx] >>> (bitPos & 7)) & 1;
      val |= bit << i;
      bitPos++;
    }
    return val;
  };
  const alignByte = () => {
    const rem = bitPos & 7;
    if (rem !== 0) bitPos += 8 - rem;
  };

  interface HuffTree {
    counts: Int32Array;
    symbols: Int32Array;
  }

  const buildTree = (lengths: number[]): HuffTree => {
    const maxLen = 15;
    const counts = new Int32Array(maxLen + 1);
    for (const l of lengths) {
      if (l > 0) counts[l]++;
    }
    const offsets = new Int32Array(maxLen + 1);
    let sum = 0;
    for (let bits = 1; bits <= maxLen; bits++) {
      offsets[bits] = sum;
      sum += counts[bits];
    }
    const symbols = new Int32Array(lengths.length);
    for (let sym = 0; sym < lengths.length; sym++) {
      const l = lengths[sym];
      if (l > 0) {
        symbols[offsets[l]++] = sym;
      }
    }
    return { counts, symbols };
  };

  const decodeSymbol = (tree: HuffTree): number => {
    let code = 0;
    let first = 0;
    let index = 0;
    for (let len = 1; len <= 15; len++) {
      code |= readBits(1);
      const count = tree.counts[len];
      if (code - count < first) {
        return tree.symbols[index + (code - first)];
      }
      index += count;
      first = (first + count) << 1;
      code <<= 1;
    }
    throw new Error('Invalid Huffman code in deflate stream');
  };

  const fixedLitLengths = new Array<number>(288);
  for (let i = 0; i <= 143; i++) fixedLitLengths[i] = 8;
  for (let i = 144; i <= 255; i++) fixedLitLengths[i] = 9;
  for (let i = 256; i <= 279; i++) fixedLitLengths[i] = 7;
  for (let i = 280; i <= 287; i++) fixedLitLengths[i] = 8;
  const fixedLitTree = buildTree(fixedLitLengths);
  const fixedDistTree = buildTree(new Array<number>(32).fill(5));

  const lenBase = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  const lenExtra = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
  const distBase = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
  const distExtra = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
  const codeOrder = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

  const out: number[] = [];
  let bfinal = 0;
  do {
    bfinal = readBits(1);
    const btype = readBits(2);
    if (btype === 0) {
      alignByte();
      const byteIdx = bitPos >>> 3;
      if (byteIdx + 4 > src.length) throw new Error('Invalid uncompressed deflate block');
      const len = src[byteIdx] | (src[byteIdx + 1] << 8);
      bitPos += 32;
      const dataStart = bitPos >>> 3;
      if (dataStart + len > src.length) throw new Error('Truncated uncompressed deflate block');
      for (let i = 0; i < len; i++) out.push(src[dataStart + i]);
      bitPos += len * 8;
    } else if (btype === 1 || btype === 2) {
      let litTree = fixedLitTree;
      let distTree = fixedDistTree;
      if (btype === 2) {
        const hlit = readBits(5) + 257;
        const hdist = readBits(5) + 1;
        const hclen = readBits(4) + 4;
        const codeLens = new Array<number>(19).fill(0);
        for (let i = 0; i < hclen; i++) codeLens[codeOrder[i]] = readBits(3);
        const codeTree = buildTree(codeLens);
        const lengths: number[] = [];
        while (lengths.length < hlit + hdist) {
          const sym = decodeSymbol(codeTree);
          if (sym < 16) {
            lengths.push(sym);
          } else if (sym === 16) {
            const repeat = 3 + readBits(2);
            const prev = lengths[lengths.length - 1] ?? 0;
            for (let r = 0; r < repeat; r++) lengths.push(prev);
          } else if (sym === 17) {
            const repeat = 3 + readBits(3);
            for (let r = 0; r < repeat; r++) lengths.push(0);
          } else {
            const repeat = 11 + readBits(7);
            for (let r = 0; r < repeat; r++) lengths.push(0);
          }
        }
        litTree = buildTree(lengths.slice(0, hlit));
        distTree = buildTree(lengths.slice(hlit, hlit + hdist));
      }
      while (true) {
        const sym = decodeSymbol(litTree);
        if (sym < 256) {
          out.push(sym);
        } else if (sym === 256) {
          break;
        } else {
          const idx = sym - 257;
          const length = lenBase[idx] + readBits(lenExtra[idx]);
          const distIdx = decodeSymbol(distTree);
          const dist = distBase[distIdx] + readBits(distExtra[distIdx]);
          for (let i = 0; i < length; i++) {
            out.push(out[out.length - dist]);
          }
        }
      }
    } else {
      throw new Error('Unsupported deflate block type');
    }
  } while (!bfinal);

  return new Uint8Array(out);
}

export function buildZipArchive(entries: { name: string; data: Uint8Array }[]): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = textEncoder.encode(entry.name);
    const data = entry.data;
    const crc = crc32(data);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    writeU32LE(localHeader, 0, 0x04034b50);
    writeU16LE(localHeader, 4, 20);
    writeU16LE(localHeader, 6, 0x0800); // UTF-8
    writeU16LE(localHeader, 8, 0); // STORE
    writeU16LE(localHeader, 10, 0);
    writeU16LE(localHeader, 12, 0);
    writeU32LE(localHeader, 14, crc);
    writeU32LE(localHeader, 18, data.length);
    writeU32LE(localHeader, 22, data.length);
    writeU16LE(localHeader, 26, nameBytes.length);
    writeU16LE(localHeader, 28, 0);
    localHeader.set(nameBytes, 30);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    writeU32LE(centralHeader, 0, 0x02014b50);
    writeU16LE(centralHeader, 4, 20);
    writeU16LE(centralHeader, 6, 20);
    writeU16LE(centralHeader, 8, 0x0800);
    writeU16LE(centralHeader, 10, 0); // STORE
    writeU16LE(centralHeader, 12, 0);
    writeU16LE(centralHeader, 14, 0);
    writeU32LE(centralHeader, 16, crc);
    writeU32LE(centralHeader, 20, data.length);
    writeU32LE(centralHeader, 24, data.length);
    writeU16LE(centralHeader, 28, nameBytes.length);
    writeU16LE(centralHeader, 30, 0);
    writeU16LE(centralHeader, 32, 0);
    writeU16LE(centralHeader, 34, 0);
    writeU16LE(centralHeader, 36, 0);
    writeU32LE(centralHeader, 38, 0);
    writeU32LE(centralHeader, 42, offset);
    centralHeader.set(nameBytes, 46);

    localParts.push(localHeader, data);
    centralParts.push(centralHeader);
    offset += localHeader.length + data.length;
  }

  const centralSize = centralParts.reduce((s, p) => s + p.length, 0);
  const eocd = new Uint8Array(22);
  writeU32LE(eocd, 0, 0x06054b50);
  writeU16LE(eocd, 4, 0);
  writeU16LE(eocd, 6, 0);
  writeU16LE(eocd, 8, entries.length);
  writeU16LE(eocd, 10, entries.length);
  writeU32LE(eocd, 12, centralSize);
  writeU32LE(eocd, 16, offset);
  writeU16LE(eocd, 20, 0);

  const totalLen = offset + centralSize + eocd.length;
  const result = new Uint8Array(totalLen);
  let cursor = 0;
  for (const part of localParts) {
    result.set(part, cursor);
    cursor += part.length;
  }
  for (const part of centralParts) {
    result.set(part, cursor);
    cursor += part.length;
  }
  result.set(eocd, cursor);
  return result;
}

export function readZipArchive(bytes: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65558); i--) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) {
    throw new Error('Invalid .xlsx / ZIP file: missing End of Central Directory.');
  }

  const totalEntries = u16LE(view, eocdOffset + 10);
  const cdOffset = u32LE(view, eocdOffset + 16);
  const files = new Map<string, Uint8Array>();

  let pos = cdOffset;
  for (let i = 0; i < totalEntries; i++) {
    if (u32LE(view, pos) !== 0x02014b50) break;
    const method = u16LE(view, pos + 10);
    const compSize = u32LE(view, pos + 20);
    const nameLen = u16LE(view, pos + 28);
    const extraLen = u16LE(view, pos + 30);
    const commentLen = u16LE(view, pos + 32);
    const localHeaderOffset = u32LE(view, pos + 42);
    const name = textDecoder.decode(bytes.subarray(pos + 46, pos + 46 + nameLen));

    const lfhNameLen = u16LE(view, localHeaderOffset + 26);
    const lfhExtraLen = u16LE(view, localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + lfhNameLen + lfhExtraLen;
    const compressed = bytes.subarray(dataStart, dataStart + compSize);

    if (!name.endsWith('/')) {
      if (method === 0) {
        files.set(name.replace(/\\/g, '/'), new Uint8Array(compressed));
      } else if (method === 8) {
        files.set(name.replace(/\\/g, '/'), inflateRaw(compressed));
      } else {
        throw new Error(`Unsupported ZIP compression method ${method} for ${name}`);
      }
    }
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

// ---------------------------------------------------------------------------
// Minimal XML Helpers (Dependency-Free)
// ---------------------------------------------------------------------------

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getAttr(tag: string, attrName: string): string | undefined {
  const escaped = attrName.replace(/[:]/g, '\\:');
  const match = tag.match(new RegExp(`(?:^|\\s)${escaped}\\s*=\\s*"([^"]*)"`, 'i'));
  if (match) return decodeXmlEntities(match[1]);
  const singleMatch = tag.match(new RegExp(`(?:^|\\s)${escaped}\\s*=\\s*'([^']*)'`, 'i'));
  return singleMatch ? decodeXmlEntities(singleMatch[1]) : undefined;
}

function extractTextTags(xml: string): string {
  const parts: string[] = [];
  const tRegex = /<(?:[a-zA-Z0-9_]+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:[a-zA-Z0-9_]+:)?t>/g;
  let m: RegExpExecArray | null;
  while ((m = tRegex.exec(xml)) !== null) {
    parts.push(decodeXmlEntities(m[1]));
  }
  return parts.join('');
}

function resolveRelativePath(baseXmlPath: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = baseXmlPath.split('/');
  parts.pop(); // remove filename
  // if base is e.g. xl/worksheets/_rels/sheet1.xml.rels, its base dir is xl/worksheets
  if (parts[parts.length - 1] === '_rels') {
    parts.pop();
  }
  for (const seg of target.split('/')) {
    if (seg === '..') {
      parts.pop();
    } else if (seg && seg !== '.') {
      parts.push(seg);
    }
  }
  return parts.join('/');
}

function parseRelsMap(relsBytes: Uint8Array | undefined, relsFilePath: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!relsBytes) return map;
  const xml = textDecoder.decode(relsBytes);
  const relRegex = /<Relationship\b[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = relRegex.exec(xml)) !== null) {
    const id = getAttr(m[0], 'Id');
    const target = getAttr(m[0], 'Target');
    if (id && target) {
      map.set(id, resolveRelativePath(relsFilePath, target));
    }
  }
  return map;
}

function colLettersToIndex(letters: string): number {
  let idx = 0;
  const upper = letters.toUpperCase();
  for (let i = 0; i < upper.length; i++) {
    idx = idx * 26 + (upper.charCodeAt(i) - 64);
  }
  return idx - 1;
}

function indexToColLetters(colIndex: number): string {
  let n = colIndex + 1;
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function parseSharedStrings(xmlBytes: Uint8Array | undefined): string[] {
  if (!xmlBytes) return [];
  const xml = textDecoder.decode(xmlBytes);
  const strings: string[] = [];
  const siRegex = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g;
  let m: RegExpExecArray | null;
  while ((m = siRegex.exec(xml)) !== null) {
    strings.push(extractTextTags(m[1]));
  }
  return strings;
}

function parseDateStyleIndices(stylesBytes: Uint8Array | undefined): Set<number> {
  const dateStyleIndices = new Set<number>();
  if (!stylesBytes) return dateStyleIndices;
  const xml = textDecoder.decode(stylesBytes);
  const customDateFmtIds = new Set<number>();

  const numFmtRegex = /<numFmt\b[^>]*>/g;
  let nf: RegExpExecArray | null;
  while ((nf = numFmtRegex.exec(xml)) !== null) {
    const idStr = getAttr(nf[0], 'numFmtId');
    const code = (getAttr(nf[0], 'formatCode') || '').toLowerCase();
    if (idStr && /[ymd]/.test(code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, ''))) {
      customDateFmtIds.add(parseInt(idStr, 10));
    }
  }

  const cellXfsMatch = xml.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/);
  if (!cellXfsMatch) return dateStyleIndices;
  const xfRegex = /<xf\b[^>]*>/g;
  let xf: RegExpExecArray | null;
  let idx = 0;
  while ((xf = xfRegex.exec(cellXfsMatch[1])) !== null) {
    const numFmtId = parseInt(getAttr(xf[0], 'numFmtId') || '0', 10);
    if ((numFmtId >= 14 && numFmtId <= 22) || customDateFmtIds.has(numFmtId)) {
      dateStyleIndices.add(idx);
    }
    idx++;
  }
  return dateStyleIndices;
}

// ---------------------------------------------------------------------------
// XLSX Parser (Cells + Floating Drawings + In-Cell RichData / CellImages)
// ---------------------------------------------------------------------------

export function parseXlsxBuffer(bytes: Uint8Array): ParsedXlsxWorkbook {
  const files = readZipArchive(bytes);
  const sharedStrings = parseSharedStrings(files.get('xl/sharedStrings.xml'));
  const dateStyleIndices = parseDateStyleIndices(files.get('xl/styles.xml'));

  // Determine first worksheet path
  let sheetName = 'Sheet1';
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const workbookBytes = files.get('xl/workbook.xml');
  const workbookRels = parseRelsMap(files.get('xl/_rels/workbook.xml.rels'), 'xl/_rels/workbook.xml.rels');

  if (workbookBytes) {
    const wbXml = textDecoder.decode(workbookBytes);
    const sheetMatch = wbXml.match(/<sheet\b[^>]*>/);
    if (sheetMatch) {
      sheetName = getAttr(sheetMatch[0], 'name') || sheetName;
      const rid = getAttr(sheetMatch[0], 'r:id') || getAttr(sheetMatch[0], 'id');
      if (rid && workbookRels.has(rid)) {
        sheetPath = workbookRels.get(rid)!;
      }
    }
  }

  const sheetBytes = files.get(sheetPath);
  if (!sheetBytes) {
    throw new Error(`Worksheet ${sheetPath} not found in .xlsx archive.`);
  }
  const sheetXml = textDecoder.decode(sheetBytes);
  const sheetRelsPath = `${sheetPath.replace(/([^/]+)$/, '_rels/$1.rels')}`;
  const sheetRels = parseRelsMap(files.get(sheetRelsPath), sheetRelsPath);

  // Build in-cell richData vm -> media path lookup if present
  const vmToMediaPath = new Map<number, string>();
  const metadataBytes = files.get('xl/metadata.xml');
  const richValBytes = files.get('xl/richData/rdrichvalue.xml');
  const richRelBytes = files.get('xl/richData/rdrichvaluerel.xml');
  const richRelRels = parseRelsMap(
    files.get('xl/richData/_rels/rdrichvaluerel.xml.rels'),
    'xl/richData/_rels/rdrichvaluerel.xml.rels',
  );

  if (richValBytes && richRelBytes) {
    const richRelXml = textDecoder.decode(richRelBytes);
    const relEmbedIds: string[] = [];
    const relTagRegex = /<(?:[a-zA-Z0-9_]+:)?rel\b[^>]*>/g;
    let rm: RegExpExecArray | null;
    while ((rm = relTagRegex.exec(richRelXml)) !== null) {
      const rid = getAttr(rm[0], 'r:id') || getAttr(rm[0], 'id') || '';
      relEmbedIds.push(rid);
    }

    const richValXml = textDecoder.decode(richValBytes);
    const rvMediaByIndex = new Map<number, string>();
    const rvRegex = /<(?:[a-zA-Z0-9_]+:)?rv\b[^>]*>([\s\S]*?)<\/(?:[a-zA-Z0-9_]+:)?rv>/g;
    let rvm: RegExpExecArray | null;
    let rvIndex = 0;
    while ((rvm = rvRegex.exec(richValXml)) !== null) {
      const firstVMatch = rvm[1].match(/<(?:[a-zA-Z0-9_]+:)?v>(\d+)<\/(?:[a-zA-Z0-9_]+:)?v>/);
      if (firstVMatch) {
        const relIdx = parseInt(firstVMatch[1], 10);
        const rid = relEmbedIds[relIdx];
        const mediaPath = rid ? richRelRels.get(rid) : undefined;
        if (mediaPath) {
          rvMediaByIndex.set(rvIndex, mediaPath);
        }
      }
      rvIndex++;
    }

    if (metadataBytes) {
      const metaXml = textDecoder.decode(metadataBytes);
      const valMetaMatch = metaXml.match(/<valueMetadata\b[^>]*>([\s\S]*?)<\/valueMetadata>/);
      const rcRegex = /<rc\b[^>]*>/g;
      let vmIdx = 1;
      if (valMetaMatch) {
        let rcm: RegExpExecArray | null;
        while ((rcm = rcRegex.exec(valMetaMatch[1])) !== null) {
          const v = parseInt(getAttr(rcm[0], 'v') || '-1', 10);
          // Match futureMetadata RichValue rv index if referenced directly
          const targetMedia = rvMediaByIndex.get(v) ?? rvMediaByIndex.get(vmIdx - 1);
          if (targetMedia) vmToMediaPath.set(vmIdx, targetMedia);
          vmIdx++;
        }
      }
    } else {
      // Fallback: 1-based vm maps to 0-based rvIndex
      for (const [rvIdx, mediaPath] of rvMediaByIndex.entries()) {
        vmToMediaPath.set(rvIdx + 1, mediaPath);
      }
    }
  }

  // Optional cellimages.xml (DISPIMG("ID_...")) mapping
  const dispImgIdToMedia = new Map<string, string>();
  const cellImagesBytes = files.get('xl/cellimages.xml');
  if (cellImagesBytes) {
    const ciXml = textDecoder.decode(cellImagesBytes);
    const ciRels = parseRelsMap(
      files.get('xl/_rels/cellimages.xml.rels'),
      'xl/_rels/cellimages.xml.rels',
    );
    const ciItemRegex = /<etc:cellImage\b[^>]*>([\s\S]*?)<\/etc:cellImage>/g;
    let cim: RegExpExecArray | null;
    while ((cim = ciItemRegex.exec(ciXml)) !== null) {
      const cNvPr = cim[1].match(/<xdr:cNvPr\b[^>]*>/);
      const blip = cim[1].match(/<a:blip\b[^>]*>/);
      const imgId = cNvPr ? getAttr(cNvPr[0], 'name') : undefined;
      const embed = blip ? getAttr(blip[0], 'r:embed') : undefined;
      if (imgId && embed && ciRels.has(embed)) {
        dispImgIdToMedia.set(imgId, ciRels.get(embed)!);
      }
    }
  }

  // Parse rows and cells
  const cellsByRow = new Map<number, XlsxCell[]>();
  const extractedImages: XlsxExtractedImage[] = [];
  let maxRow = 0;
  let maxCol = 0;

  const rowRegex = /<row\b([^>]*)>([\s\S]*?)<\/row>/g;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRegex.exec(sheetXml)) !== null) {
    const rowAttrs = rowMatch[1];
    const rowBody = rowMatch[2];
    const rowAttrR = rowAttrs.match(/\br\s*=\s*"(\d+)"/);
    let currentRow = rowAttrR ? parseInt(rowAttrR[1], 10) : maxRow + 1;

    const cellRegex = /<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cellMatch: RegExpExecArray | null;
    let fallbackCol = 0;

    while ((cellMatch = cellRegex.exec(rowBody)) !== null) {
      const cAttrs = `<c ${cellMatch[1]}>`;
      const cBody = cellMatch[2] || '';
      const ref = getAttr(cAttrs, 'r') || `${indexToColLetters(fallbackCol)}${currentRow}`;
      const refMatch = ref.match(/^([A-Za-z]+)(\d+)$/);
      const col = refMatch ? colLettersToIndex(refMatch[1]) : fallbackCol;
      if (refMatch) currentRow = parseInt(refMatch[2], 10);
      fallbackCol = col + 1;

      if (currentRow > maxRow) maxRow = currentRow;
      if (col > maxCol) maxCol = col;

      const t = getAttr(cAttrs, 't') || '';
      const sAttr = getAttr(cAttrs, 's');
      const vmAttr = getAttr(cAttrs, 'vm');

      const vMatch = cBody.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/);
      const isMatch = cBody.match(/<is(?:\s[^>]*)?>([\s\S]*?)<\/is>/);
      const fMatch = cBody.match(/<f(?:\s[^>]*)?>([\s\S]*?)<\/f>/);

      let value: string | number | boolean | null = null;
      let rawText = '';
      let isDateSerial = false;

      if (t === 's' && vMatch) {
        const idx = parseInt(vMatch[1].trim(), 10);
        value = sharedStrings[idx] ?? '';
        rawText = String(value);
      } else if (t === 'inlineStr' && isMatch) {
        value = extractTextTags(isMatch[1]);
        rawText = value;
      } else if (t === 'str' && vMatch) {
        value = decodeXmlEntities(vMatch[1]);
        rawText = value;
      } else if (t === 'b' && vMatch) {
        value = vMatch[1].trim() === '1';
        rawText = String(value);
      } else if (vMatch) {
        const rawNum = vMatch[1].trim();
        const num = Number(rawNum);
        value = Number.isNaN(num) ? decodeXmlEntities(rawNum) : num;
        rawText = rawNum;
        if (sAttr !== undefined && typeof value === 'number') {
          isDateSerial = dateStyleIndices.has(parseInt(sAttr, 10));
        }
      }

      // Check in-cell richData image (`vm="..."`)
      if (vmAttr) {
        const vmNum = parseInt(vmAttr, 10);
        const mediaPath = vmToMediaPath.get(vmNum);
        const imgBytes = mediaPath ? files.get(mediaPath) : undefined;
        if (mediaPath && imgBytes) {
          extractedImages.push({
            row1Based: currentRow,
            col0Based: col,
            source: 'in_cell',
            mediaPath,
            filename: mediaPath.split('/').pop() || 'image',
            bytes: imgBytes,
          });
        }
      }

      // Check DISPIMG(...) formula in-cell image
      if (fMatch) {
        const dispMatch = decodeXmlEntities(fMatch[1]).match(/DISPIMG\(\s*"([^"]+)"/i);
        if (dispMatch) {
          const mediaPath = dispImgIdToMedia.get(dispMatch[1]);
          const imgBytes = mediaPath ? files.get(mediaPath) : undefined;
          if (mediaPath && imgBytes) {
            extractedImages.push({
              row1Based: currentRow,
              col0Based: col,
              source: 'in_cell',
              mediaPath,
              filename: mediaPath.split('/').pop() || 'image',
              bytes: imgBytes,
            });
          }
        }
      }

      const rowList = cellsByRow.get(currentRow) || [];
      rowList.push({ row: currentRow, col, ref, value, rawText, isDateSerial });
      cellsByRow.set(currentRow, rowList);
    }
  }

  // Extract floating images from drawings
  const drawingTagRegex = /<drawing\b[^>]*>/g;
  let dTag: RegExpExecArray | null;
  while ((dTag = drawingTagRegex.exec(sheetXml)) !== null) {
    const rid = getAttr(dTag[0], 'r:id');
    if (!rid) continue;
    const drawingPath = sheetRels.get(rid);
    if (!drawingPath) continue;
    const drawingBytes = files.get(drawingPath);
    if (!drawingBytes) continue;

    const drawingRelsPath = drawingPath.replace(/([^/]+)$/, '_rels/$1.rels');
    const drawingRels = parseRelsMap(files.get(drawingRelsPath), drawingRelsPath);
    const drawingXml = textDecoder.decode(drawingBytes);

    const anchorRegex = /<(?:xdr:)?(?:twoCellAnchor|oneCellAnchor)\b[^>]*>([\s\S]*?)<\/(?:xdr:)?(?:twoCellAnchor|oneCellAnchor)>/g;
    let am: RegExpExecArray | null;
    while ((am = anchorRegex.exec(drawingXml)) !== null) {
      const body = am[1];
      const fromMatch = body.match(/<(?:xdr:)?from\b[^>]*>([\s\S]*?)<\/(?:xdr:)?from>/);
      if (!fromMatch) continue;
      const rowNumMatch = fromMatch[1].match(/<(?:xdr:)?row>(\d+)<\/(?:xdr:)?row>/);
      const colNumMatch = fromMatch[1].match(/<(?:xdr:)?col>(\d+)<\/(?:xdr:)?col>/);
      const blipMatch = body.match(/<a:blip\b[^>]*>/);
      if (!rowNumMatch || !blipMatch) continue;

      const embedId = getAttr(blipMatch[0], 'r:embed');
      const mediaPath = embedId ? drawingRels.get(embedId) : undefined;
      const imgBytes = mediaPath ? files.get(mediaPath) : undefined;
      if (mediaPath && imgBytes) {
        extractedImages.push({
          row1Based: parseInt(rowNumMatch[1], 10) + 1, // drawing row is 0-based
          col0Based: colNumMatch ? parseInt(colNumMatch[1], 10) : 0,
          source: 'floating',
          mediaPath,
          filename: mediaPath.split('/').pop() || 'image',
          bytes: imgBytes,
        });
      }
    }
  }

  // Normalize rows dense array (length = maxRow)
  const rows: (string | number | boolean | null)[][] = [];
  const cells: XlsxCell[][] = [];
  for (let r = 1; r <= maxRow; r++) {
    const rowArr = new Array<string | number | boolean | null>(maxCol + 1).fill(null);
    const cellArr: XlsxCell[] = [];
    const entries = cellsByRow.get(r) || [];
    for (const c of entries) {
      rowArr[c.col] = c.value;
      cellArr[c.col] = c;
    }
    rows.push(rowArr);
    cells.push(cellArr);
  }

  return {
    sheetName,
    rows,
    cells,
    images: extractedImages,
  };
}

// ---------------------------------------------------------------------------
// XLSX Builder (Cells + Optional Row-Anchored Floating Images)
// ---------------------------------------------------------------------------

export function buildXlsxBuffer(options: XlsxBuildOptions): Uint8Array {
  const sheetName = (options.sheetName || 'Sheet1').slice(0, 31).replace(/[\\/*?:[\]]/g, '');
  const allRows: (string | number | boolean | null | undefined)[][] = [options.headers, ...options.rows];
  const images = options.images || [];

  const rowXmlParts: string[] = [];
  for (let r = 0; r < allRows.length; r++) {
    const excelRow = r + 1;
    const rowData = allRows[r];
    const cellXmlParts: string[] = [];
    for (let c = 0; c < rowData.length; c++) {
      const val = rowData[c];
      if (val === null || val === undefined || val === '') continue;
      const ref = `${indexToColLetters(c)}${excelRow}`;
      if (typeof val === 'number' && Number.isFinite(val)) {
        cellXmlParts.push(`<c r="${ref}"><v>${val}</v></c>`);
      } else if (typeof val === 'boolean') {
        cellXmlParts.push(`<c r="${ref}" t="b"><v>${val ? 1 : 0}</v></c>`);
      } else {
        cellXmlParts.push(`<c r="${ref}" t="inlineStr"><is><t>${escapeXml(String(val))}</t></is></c>`);
      }
    }
    rowXmlParts.push(`<row r="${excelRow}">${cellXmlParts.join('')}</row>`);
  }

  const sheetXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheetData>${rowXmlParts.join('')}</sheetData>` +
    (images.length > 0 ? `<drawing r:id="rId1"/>` : '') +
    `</worksheet>`;

  const archiveEntries: { name: string; data: Uint8Array }[] = [];

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Default Extension="png" ContentType="image/png"/>` +
    `<Default Extension="jpg" ContentType="image/jpeg"/>` +
    `<Default Extension="jpeg" ContentType="image/jpeg"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    (images.length > 0
      ? `<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`
      : '') +
    `</Types>`;

  const rootRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;

  const workbookXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets>` +
    `</workbook>`;

  const workbookRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `</Relationships>`;

  const stylesXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>` +
    `<fills count="1"><fill><patternFill patternType="none"/></fill></fills>` +
    `<borders count="1"><border/></borders>` +
    `<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellXfs>` +
    `</styleSheet>`;

  archiveEntries.push(
    { name: '[Content_Types].xml', data: textEncoder.encode(contentTypes) },
    { name: '_rels/.rels', data: textEncoder.encode(rootRels) },
    { name: 'xl/workbook.xml', data: textEncoder.encode(workbookXml) },
    { name: 'xl/_rels/workbook.xml.rels', data: textEncoder.encode(workbookRels) },
    { name: 'xl/styles.xml', data: textEncoder.encode(stylesXml) },
    { name: 'xl/worksheets/sheet1.xml', data: textEncoder.encode(sheetXml) },
  );

  if (images.length > 0) {
    const sheetRels =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>` +
      `</Relationships>`;
    archiveEntries.push({
      name: 'xl/worksheets/_rels/sheet1.xml.rels',
      data: textEncoder.encode(sheetRels),
    });

    const drawingRelsParts: string[] = [];
    const anchorParts: string[] = [];

    images.forEach((img, idx) => {
      const num = idx + 1;
      const ext = img.mimeType === 'image/png' ? 'png' : 'jpg';
      const mediaFilename = `image${num}.${ext}`;
      const rId = `rId${num}`;
      const row0 = Math.max(0, img.row1Based - 1);
      const col0 = Math.max(0, img.col0Based ?? 1);

      archiveEntries.push({
        name: `xl/media/${mediaFilename}`,
        data: img.bytes,
      });

      drawingRelsParts.push(
        `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${mediaFilename}"/>`,
      );

      anchorParts.push(
        `<xdr:twoCellAnchor editAs="oneCell">` +
          `<xdr:from><xdr:col>${col0}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${row0}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>` +
          `<xdr:to><xdr:col>${col0 + 1}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${row0 + 1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>` +
          `<xdr:pic>` +
            `<xdr:nvPicPr><xdr:cNvPr id="${num}" name="${escapeXml(img.filename || mediaFilename)}"/><xdr:cNvPicPr/></xdr:nvPicPr>` +
            `<xdr:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>` +
            `<xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>` +
          `</xdr:pic>` +
          `<xdr:clientData/>` +
        `</xdr:twoCellAnchor>`,
      );
    });

    const drawingRels =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      drawingRelsParts.join('') +
      `</Relationships>`;

    const drawingXml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/spreadsheetml/2006/drawing" ` +
      `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ` +
      `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      anchorParts.join('') +
      `</xdr:wsDr>`;

    archiveEntries.push(
      { name: 'xl/drawings/_rels/drawing1.xml.rels', data: textEncoder.encode(drawingRels) },
      { name: 'xl/drawings/drawing1.xml', data: textEncoder.encode(drawingXml) },
    );
  }

  return buildZipArchive(archiveEntries);
}

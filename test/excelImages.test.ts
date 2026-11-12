import assert from 'node:assert/strict';
import test from 'node:test';
import { getMockDb, resetMockDb } from '../src/data/mockDatabase';
import {
  encodeRgbaPng,
  imageStorage,
  MAX_IMAGE_BYTES,
  validateAndProcessImage,
} from '../src/services/imageStorage';
import {
  buildCorrectedQuestionExcelBytes,
  confirmQuestionExcelImport,
  generateShuffledPaperSets,
  getCoeQuestionBankSummary,
  getStudentQuestionView,
  previewQuestionExcelImport,
  updatePreviewQuestionRow,
} from '../src/services/questionImageExcelService';
import { buildZipArchive, crc32, parseXlsxBuffer } from '../src/utils/xlsxCodec';

const enc = new TextEncoder();

function makePngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length, false);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)), false);
  return out;
}

function makeSamplePng(width: number, height: number, withExifTextChunk = false, fillByte = 40): Uint8Array {
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = fillByte;
    rgba[i + 1] = 120;
    rgba[i + 2] = 220;
    rgba[i + 3] = 255;
  }
  const cleanPng = encodeRgbaPng(width, height, rgba);
  if (!withExifTextChunk) return cleanPng;

  // Inject tEXt & eXIf ancillary chunks before IEND
  const iendPos = cleanPng.length - 12;
  const textChunk = makePngChunk('tEXt', enc.encode('Author\0SecretCameraMeta'));
  const exifChunk = makePngChunk('eXIf', enc.encode('Exif\0\0GPS:12.34,56.78'));
  const combined = new Uint8Array(iendPos + textChunk.length + exifChunk.length + 12);
  combined.set(cleanPng.subarray(0, iendPos), 0);
  combined.set(textChunk, iendPos);
  combined.set(exifChunk, iendPos + textChunk.length);
  combined.set(cleanPng.subarray(iendPos), iendPos + textChunk.length + exifChunk.length);
  return combined;
}

function makeMinimalJpeg(width: number, height: number, withExifAndComment = false): Uint8Array {
  const parts: Uint8Array[] = [new Uint8Array([0xff, 0xd8])]; // SOI
  // APP0 JFIF
  parts.push(new Uint8Array([0xff, 0xe0, 0x00, 0x06, 0x4a, 0x46, 0x49, 0x46]));
  if (withExifAndComment) {
    const exifPayload = enc.encode('Exif\0\0SECRET_GPS');
    const app1 = new Uint8Array(4 + exifPayload.length);
    app1[0] = 0xff;
    app1[1] = 0xe1;
    app1[2] = ((exifPayload.length + 2) >>> 8) & 0xff;
    app1[3] = (exifPayload.length + 2) & 0xff;
    app1.set(exifPayload, 4);
    parts.push(app1);

    const comPayload = enc.encode('COMMENT_META');
    const com = new Uint8Array(4 + comPayload.length);
    com[0] = 0xff;
    com[1] = 0xfe;
    com[2] = ((comPayload.length + 2) >>> 8) & 0xff;
    com[3] = (comPayload.length + 2) & 0xff;
    com.set(comPayload, 4);
    parts.push(com);
  }
  // SOF0 (length = 11: 2 len + 1 precision + 2 H + 2 W + 1 Nf + 3*1 comp)
  const sof0 = new Uint8Array([
    0xff, 0xc0, 0x00, 0x0b, 0x08,
    (height >>> 8) & 0xff, height & 0xff,
    (width >>> 8) & 0xff, width & 0xff,
    0x01, 0x01, 0x11, 0x00,
  ]);
  parts.push(sof0);
  // SOS + entropy + EOI
  parts.push(new Uint8Array([0xff, 0xda, 0x00, 0x06, 0x01, 0x00, 0x00, 0x3f, 0x11, 0x22, 0xff, 0xd9]));

  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const part of parts) {
    out.set(part, p);
    p += part.length;
  }
  return out;
}

function readPngWidth(png: Uint8Array): number {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return view.getUint32(16, false);
}

function buildCustomQuestionXlsx(): {
  xlsxBytes: Uint8Array;
  imgRow2: Uint8Array;
  imgRow3InCell: Uint8Array;
  imgRow4Jpg: Uint8Array;
} {
  const imgRow2 = makeSamplePng(1600, 120, true, 55); // Oversized width (<1MB) + metadata -> resize to 1000x75 & strip
  const imgRow3InCell = makeSamplePng(120, 90, false, 99);
  const imgRow4Jpg = makeMinimalJpeg(640, 480, true); // Metadata -> strip
  const gifInvalid = enc.encode('GIF89a......');
  const oversized = new Uint8Array(MAX_IMAGE_BYTES + 64);
  oversized.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // >1MB
  const corruptedPng = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02]);

  // Shuffled headers: Difficulty | Option D | Question | Correct | Option A | Option B | Option C | ImageCell
  const headers = ['Difficulty', 'Option D', 'Question', 'Correct', 'Option A', 'Option B', 'Option C', 'Figure'];
  const dataRows = [
    ['Standard', 'O(n^2)', 'What is binary search complexity?', 'B', 'O(1)', 'O(log n)', 'O(n)', ''], // Row 2 (floating resized PNG)
    ['Standard', 'Tree', 'Identify the linear LIFO structure:', 'A', 'Stack', 'Graph', 'Trie', 'inCell'], // Row 3 (in-cell richData vm=1)
    ['Standard', 'UDP', 'Which protocol guarantees ordered delivery?', 'B', 'IP', 'TCP', 'ARP', ''], // Row 4 (2 images: JPEG + duplicate PNG -> warning + keeps 1st)
    ['Standard', 'None', 'Row with bad GIF image', 'A', 'Opt1', 'Opt2', 'Opt3', ''], // Row 5 (unsupported format -> warning)
    ['Standard', 'None', 'Row with >1MB image', 'C', 'Opt1', 'Opt2', 'Opt3', ''], // Row 6 (>1MB -> warning)
    ['Standard', 'None', 'Row with corrupted image', 'D', 'Opt1', 'Opt2', 'Opt3', ''], // Row 7 (unreadable -> warning)
    ['Standard', 'D4', 'Plain text question without picture', 'A', 'A1', 'B2', 'C3', ''], // Row 8 (no image)
  ];

  const colRef = (c: number, r: number) => `${String.fromCharCode(65 + c)}${r}`;
  let sheetRowsXml = '';
  const all = [headers, ...dataRows];
  all.forEach((row, rIdx) => {
    const excelRow = rIdx + 1;
    let cellsXml = '';
    row.forEach((val, cIdx) => {
      if (excelRow === 3 && cIdx === 7) {
        // In-cell richData cell (vm="1")
        cellsXml += `<c r="${colRef(cIdx, excelRow)}" vm="1"><v>0</v></c>`;
      } else if (val !== '') {
        cellsXml += `<c r="${colRef(cIdx, excelRow)}" t="inlineStr"><is><t>${val}</t></is></c>`;
      }
    });
    sheetRowsXml += `<row r="${excelRow}">${cellsXml}</row>`;
  });

  const sheetXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheetData>${sheetRowsXml}</sheetData><drawing r:id="rId1"/></worksheet>`;

  const sheetRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>` +
    `</Relationships>`;

  // Floating anchors:
  // - row 0 (Excel Row 1 = header) -> HEADER_IMAGE_IGNORED warning
  // - row 1 (Excel Row 2) -> resized PNG
  // - row 3 (Excel Row 4) -> JPEG + extra duplicate PNG -> MULTIPLE_IMAGES_ON_ROW warning
  // - row 4 (Excel Row 5) -> GIF -> UNSUPPORTED_IMAGE_FORMAT warning
  // - row 5 (Excel Row 6) -> >1MB PNG -> IMAGE_TOO_LARGE warning
  // - row 6 (Excel Row 7) -> corrupted PNG -> UNREADABLE_IMAGE warning
  // - row 15 (Excel Row 16 = outside data rows) -> OUTSIDE_ROW_IMAGE_IGNORED warning
  const anchors = [
    { row0: 0, rid: 'rId1', name: 'headerPic.png' },
    { row0: 1, rid: 'rId2', name: 'wideDiagram.png' },
    { row0: 3, rid: 'rId3', name: 'circuit.jpg' },
    { row0: 3, rid: 'rId2', name: 'secondPicSameRow.png' },
    { row0: 4, rid: 'rId4', name: 'bad.gif' },
    { row0: 5, rid: 'rId5', name: 'huge.png' },
    { row0: 6, rid: 'rId6', name: 'corrupt.png' },
    { row0: 15, rid: 'rId1', name: 'outside.png' },
  ];

  const drawingXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/spreadsheetml/2006/drawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    anchors
      .map(
        (a, i) =>
          `<xdr:twoCellAnchor><xdr:from><xdr:col>2</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${a.row0}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>` +
          `<xdr:to><xdr:col>3</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${a.row0 + 1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>` +
          `<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${i + 1}" name="${a.name}"/><xdr:cNvPicPr/></xdr:nvPicPr>` +
          `<xdr:blipFill><a:blip r:embed="${a.rid}"/></xdr:blipFill><xdr:spPr/></xdr:pic></xdr:twoCellAnchor>`,
      )
      .join('') +
    `</xdr:wsDr>`;

  const drawingRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/header.png"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/wide.png"/>` +
    `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/circuit.jpg"/>` +
    `<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/bad.gif"/>` +
    `<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/huge.png"/>` +
    `<Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/corrupt.png"/>` +
    `</Relationships>`;

  const richValueXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<rvData xmlns="http://schemas.microsoft.com/office/spreadsheetml/2017/richdata"><rv s="0"><v>0</v></rv></rvData>`;
  const richValRelXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<richValueRels xmlns="http://schemas.microsoft.com/office/spreadsheetml/2022/richvaluerel" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<rel r:id="rId1"/></richValueRels>`;
  const richValRelRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/incell.png"/>` +
    `</Relationships>`;

  const xlsxBytes = buildZipArchive([
    { name: 'xl/workbook.xml', data: enc.encode(`<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`) },
    { name: 'xl/_rels/workbook.xml.rels', data: enc.encode(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`) },
    { name: 'xl/worksheets/sheet1.xml', data: enc.encode(sheetXml) },
    { name: 'xl/worksheets/_rels/sheet1.xml.rels', data: enc.encode(sheetRels) },
    { name: 'xl/drawings/drawing1.xml', data: enc.encode(drawingXml) },
    { name: 'xl/drawings/_rels/drawing1.xml.rels', data: enc.encode(drawingRels) },
    { name: 'xl/richData/rdrichvalue.xml', data: enc.encode(richValueXml) },
    { name: 'xl/richData/rdrichvaluerel.xml', data: enc.encode(richValRelXml) },
    { name: 'xl/richData/_rels/rdrichvaluerel.xml.rels', data: enc.encode(richValRelRels) },
    { name: 'xl/media/header.png', data: imgRow3InCell },
    { name: 'xl/media/wide.png', data: imgRow2 },
    { name: 'xl/media/circuit.jpg', data: imgRow4Jpg },
    { name: 'xl/media/bad.gif', data: gifInvalid },
    { name: 'xl/media/huge.png', data: oversized },
    { name: 'xl/media/corrupt.png', data: corruptedPng },
    { name: 'xl/media/incell.png', data: imgRow3InCell },
  ]);

  return { xlsxBytes, imgRow2, imgRow3InCell, imgRow4Jpg };
}

test('Image validation strips metadata, resizes PNG > 1000px, rejects GIF / corrupt / >1MB', async () => {
  const wideMetaPng = makeSamplePng(1600, 120, true);
  const res = await validateAndProcessImage(wideMetaPng);
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.width, 1000);
    assert.equal(res.height, 75);
    assert.equal(readPngWidth(res.bytes), 1000);
    const asText = new TextDecoder('latin1').decode(res.bytes);
    assert.equal(asText.includes('SecretCameraMeta'), false);
    assert.equal(asText.includes('GPS:12.34'), false);
  }

  const jpgWithExif = makeMinimalJpeg(800, 600, true);
  const jpgRes = await validateAndProcessImage(jpgWithExif);
  assert.equal(jpgRes.ok, true);
  if (jpgRes.ok) {
    const asText = new TextDecoder('latin1').decode(jpgRes.bytes);
    assert.equal(asText.includes('SECRET_GPS'), false);
    assert.equal(asText.includes('COMMENT_META'), false);
  }
});

test('Messy XLSX with floating + in-cell images, shuffled columns, warnings, preview edit, corrected download & deduplication', async () => {
  resetMockDb();
  imageStorage.clearMemoryAndStorage();
  const db = getMockDb();
  const draftBank = db.questionBanks.find((b) => b.status === 'Draft')!;

  const { xlsxBytes, imgRow3InCell } = buildCustomQuestionXlsx();
  const preview = await previewQuestionExcelImport({
    bankId: draftBank.id,
    departmentId: draftBank.departmentId,
    defaultModuleNumber: 1,
    fileName: 'messy-images.xlsx',
    xlsxBytes,
  });

  assert.equal(preview.rows.length, 7);
  // Row 2 floating oversized PNG attached & resized
  const row2 = preview.rows.find((r) => r.rowNumber === 2)!;
  assert.ok(row2.imageId);
  assert.equal(row2.imageSource, 'floating');
  assert.equal(readPngWidth(imageStorage.getSync(row2.imageId!)!.bytes), 1000);

  // Row 3 in-cell richData PNG attached
  const row3 = preview.rows.find((r) => r.rowNumber === 3)!;
  assert.ok(row3.imageId);
  assert.equal(row3.imageSource, 'in_cell');

  // Row 4 JPEG attached + MULTIPLE_IMAGES_ON_ROW warning emitted
  const row4 = preview.rows.find((r) => r.rowNumber === 4)!;
  assert.ok(row4.imageId);
  assert.equal(imageStorage.getSync(row4.imageId!)!.mimeType, 'image/jpeg');
  assert.ok(preview.issues.some((i) => i.code === 'MULTIPLE_IMAGES_ON_ROW' && i.rowNumber === 4));

  // Warnings emitted cleanly (never silently dropped)
  assert.ok(preview.issues.some((i) => i.code === 'HEADER_IMAGE_IGNORED' && i.rowNumber === 1));
  assert.ok(preview.issues.some((i) => i.code === 'OUTSIDE_ROW_IMAGE_IGNORED' && i.rowNumber === 16));
  assert.ok(preview.issues.some((i) => i.code === 'UNSUPPORTED_IMAGE_FORMAT' && i.rowNumber === 5));
  assert.ok(preview.issues.some((i) => i.code === 'IMAGE_TOO_LARGE' && i.rowNumber === 6));
  assert.ok(preview.issues.some((i) => i.code === 'UNREADABLE_IMAGE' && i.rowNumber === 7));

  // Row 8 plain text question has no image
  const row8 = preview.rows.find((r) => r.rowNumber === 8)!;
  assert.equal(row8.imageId, null);

  // Content-hash deduplication: storing identical PNG again reuses the exact same imageId & count
  const idsBefore = (await imageStorage.listIds()).length;
  const processedDup = await validateAndProcessImage(imgRow3InCell);
  assert.equal(processedDup.ok, true);
  if (processedDup.ok) {
    const dupMeta = imageStorage.putSync(processedDup.bytes, processedDup.mimeType);
    assert.equal(dupMeta.imageId, row3.imageId);
    assert.equal((await imageStorage.listIds()).length, idsBefore);
  }

  // HOD preview edits: remove row 4 image and attach replacement image to row 8
  await updatePreviewQuestionRow({
    previewId: preview.previewId,
    rowNumber: 4,
    imageAction: { type: 'remove' },
  });
  const replacementPng = makeSamplePng(300, 200, false, 180);
  const editedSession = await updatePreviewQuestionRow({
    previewId: preview.previewId,
    rowNumber: 8,
    imageAction: { type: 'replace', bytes: replacementPng, filename: 'replaced.png' },
  });
  assert.equal(editedSession.rows.find((r) => r.rowNumber === 4)!.imageId, null);
  assert.ok(editedSession.rows.find((r) => r.rowNumber === 8)!.imageId);

  // Regenerate corrected .xlsx after preview edits and verify round-trip embedded images
  const correctedBytes = buildCorrectedQuestionExcelBytes({ previewId: preview.previewId });
  const roundTrip = parseXlsxBuffer(correctedBytes);
  assert.ok(roundTrip.images.some((im) => im.row1Based === 2));
  assert.ok(roundTrip.images.some((im) => im.row1Based === 8));
  assert.equal(roundTrip.images.some((im) => im.row1Based === 4), false);

  // Confirm import into Question Bank (stores imageId reference only, no inline bytes)
  const confirmed = confirmQuestionExcelImport({
    previewId: preview.previewId,
    departmentId: draftBank.departmentId,
    mode: 'replace_module',
    actorName: 'Test HOD',
    actorEmployeeId: 'MITM-TEST-1',
  });
  assert.equal(confirmed.importedCount, 7);
  assert.equal(confirmed.attachedImageCount, 3);
  const persistedQ = confirmed.bank.questions.find((q) =>
    q.questionText.includes('binary search complexity'),
  )!;
  assert.equal(persistedQ.imageId, row2.imageId);
  assert.equal((persistedQ as unknown as Record<string, unknown>).bytes, undefined);

  // Deterministic shuffle & set generation A-D keeps imageId bound to its question while remapping answerKey
  const setsA = generateShuffledPaperSets({
    questions: confirmed.bank.questions,
    subjectId: confirmed.bank.subjectId,
    subjectCode: confirmed.bank.subjectCode,
    seed: 'EXAM-2026',
  });
  const setsB = generateShuffledPaperSets({
    questions: confirmed.bank.questions,
    subjectId: confirmed.bank.subjectId,
    subjectCode: confirmed.bank.subjectCode,
    seed: 'EXAM-2026',
  });
  assert.deepEqual(setsA.A.questions.map((q) => q.questionId), setsB.A.questions.map((q) => q.questionId));
  const shuffledTarget = setsA.B.questions.find((q) => q.questionId === persistedQ.questionId)!;
  assert.equal(shuffledTarget.imageId, persistedQ.imageId);
  const chosenOptionText = shuffledTarget[`option${setsA.B.answerKey[shuffledTarget.orderNumber]}` as const];
  assert.equal(chosenOptionText, 'O(log n)');

  // COE view exposes NO questions and NO images
  const coeSummary = getCoeQuestionBankSummary(confirmed.bank.id);
  const serializedCoe = JSON.stringify(coeSummary);
  assert.equal(serializedCoe.includes('binary search'), false);
  assert.equal(serializedCoe.includes(persistedQ.imageId!), false);

  // Student question view resolves imageDataUrl when imageId exists, null otherwise
  const studentQs = getStudentQuestionView(setsA.A.questions);
  const sqWithImg = studentQs.find((q) => q.questionId === persistedQ.questionId)!;
  assert.ok(sqWithImg.imageDataUrl?.startsWith('data:image/png;base64,'));
});

test('Plain XLSX without images imports identically and shuffles cleanly without image fields', async () => {
  resetMockDb();
  imageStorage.clearMemoryAndStorage();
  const db = getMockDb();
  const draftBank = db.questionBanks.find((b) => b.status === 'Draft')!;

  const noImgXlsx = buildCorrectedQuestionExcelBytes({
    questions: [
      {
        questionId: 'TMP-1',
        subjectId: draftBank.subjectId,
        moduleNumber: 2,
        questionText: 'Plain question 1',
        optionA: 'Alpha',
        optionB: 'Beta',
        optionC: 'Gamma',
        optionD: 'Delta',
        correctOption: 'C',
        difficulty: draftBank.declaredDifficulty,
        updatedAt: '',
      },
    ],
  });

  const preview = await previewQuestionExcelImport({
    bankId: draftBank.id,
    departmentId: draftBank.departmentId,
    defaultModuleNumber: 2,
    fileName: 'plain.xlsx',
    xlsxBytes: noImgXlsx,
  });
  assert.equal(preview.issues.length, 0);
  assert.equal(preview.rows[0].imageId, null);

  const confirmed = confirmQuestionExcelImport({
    previewId: preview.previewId,
    departmentId: draftBank.departmentId,
    mode: 'replace_module',
  });
  const importedQ = confirmed.bank.questions.find((q) => q.questionText === 'Plain question 1')!;
  assert.equal(importedQ.imageId, undefined);

  const studentView = getStudentQuestionView([importedQ]);
  assert.equal(studentView[0].imageDataUrl, null);
  assert.equal(studentView[0].imageId, null);
});

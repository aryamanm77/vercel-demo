import assert from 'node:assert/strict';
import test from 'node:test';
import { getMockDb, resetMockDb } from '../src/data/mockDatabase';
import {
  assignExamVersionsForExam,
  configureExamEligibility,
  DeterministicNeighborVersionAssigner,
  DirectoryActorContext,
  freezeExamEligibilitySnapshot,
  getCoeStudentCounts,
  PortalAccessError,
  setStudentActiveStatus,
  studentDirectoryPort,
  updateDirectorySettings,
} from '../src/services/studentDirectoryPort';
import {
  getStudentExamView,
  loginStudent,
  resetStudentLoginSession,
  verifyStudentToken,
} from '../src/services/studentExamAuthService';
import {
  buildCorrectedStudentExcelBytes,
  confirmStudentUpload,
  generateStudentTemplateXlsx,
  previewStudentUpload,
  updateStudentPreviewRow,
} from '../src/services/studentUploadService';
import { buildXlsxBuffer, parseXlsxBuffer } from '../src/utils/xlsxCodec';

const cseHod: DirectoryActorContext = {
  role: 'HOD',
  branchCode: 'CSE',
  actorName: 'Dr. Sharath Kumar Y H',
  actorEmployeeId: 'MITM-CSE-101',
};

const principalAdmin: DirectoryActorContext = {
  role: 'PRINCIPAL',
  actorName: 'Dr. B. G. Naresh Kumar',
  actorEmployeeId: 'MITM-ADM-001',
};

const coeActor: DirectoryActorContext = {
  role: 'COE',
  actorName: 'Controller of Examinations',
  actorEmployeeId: 'MITM-COE-001',
};

test('Template download + messy XLSX parsing (shuffled headers, extra attrs, blank rows, mixed DOBs, serial dates, lowercase USNs, wrong-branch, duplicates)', () => {
  resetMockDb();

  // Check template columns
  const tplParsed = parseXlsxBuffer(generateStudentTemplateXlsx());
  assert.deepEqual(tplParsed.rows[0], ['USN', 'Name', 'DOB', 'Branch', 'Semester', 'Section']);

  // Build messy XLSX with shuffled synonym headers & extra columns
  const messyXlsx = buildXlsxBuffer({
    sheetName: 'MessyStudents',
    headers: ['Sec', 'Roll No', 'Quota', 'Full Name', 'Department', 'Sem', 'Birth Date', 'Hostel'],
    rows: [
      [' a ', ' 4mh24cs901 ', 'KCET', 'Ananya Rao', 'Computer Science', 5, '14/05/2005', 'Block A'], // valid alias + dd/mm/yyyy + lowercase/space USN + extra attrs
      ['B', '4MH24CS902', 'MGMT', 'Rohan Verma', 'cs', 5, 38486, 'Day Scholar'], // Excel serial 38486 -> 2005-05-14
      ['A', '4MH24CS903', 'COMEDK', 'Kavya Nair', 'CSE', 5, '04/05/2005', ''], // ambiguous DOB warning (DD/MM -> 2005-05-04)
      ['A', '4MH24CS904', 'KCET', 'Dev Patel', 'CSE', 5, '19-08-2004', ''], // dd-mm-yyyy -> 2004-08-19
      ['A', '4MH24CS905', 'KCET', 'Isha Sen', 'CSE', 5, '25.10.2004', ''], // dd.mm.yyyy -> 2004-10-25
      [null, null, null, null, null, null, null, null], // blank row ignored
      ['A', '4mh24cs901', 'KCET', 'Duplicate Row', 'CSE', 5, '2005-01-01', ''], // duplicate USN in file -> ERROR
      ['A', '4MH24EC999', 'KCET', 'Wrong Branch Student', 'ece', 5, '2005-02-02', ''], // wrong branch for CSE HOD -> ERROR
      ['A', 'BADUSN1', 'KCET', 'NonMatching USN', 'CSE', 5, '2005-03-03', ''], // USN format warning
      ['A', '4MH24CS906', 'KCET', '', 'CSE', 5, '2005-04-04', ''], // missing required Name -> ERROR
      ['A', '4MH24CS907', 'KCET', 'Bad Date Student', 'CSE', 5, '31/02/2005', ''], // invalid calendar DOB -> ERROR
    ],
  });

  // Spy on console to verify DOB NEVER appears in console logs
  const loggedLines: string[] = [];
  const origLog = console.log;
  const origWarn = console.warn;
  const origErr = console.error;
  console.log = (...args: unknown[]) => loggedLines.push(args.map(String).join(' '));
  console.warn = (...args: unknown[]) => loggedLines.push(args.map(String).join(' '));
  console.error = (...args: unknown[]) => loggedLines.push(args.map(String).join(' '));

  let preview;
  try {
    preview = previewStudentUpload({
      fileName: 'messy-students.xlsx',
      bytes: messyXlsx,
      actor: cseHod,
    });
  } finally {
    console.log = origLog;
    console.warn = origWarn;
    console.error = origErr;
  }

  // Blank row skipped -> 10 data rows parsed
  assert.equal(preview.rows.length, 10);
  assert.deepEqual(preview.extraColumns, ['Quota', 'Hostel']);

  const r2 = preview.rows.find((r) => r.usn === '4MH24CS901' && r.rowNumber === 2)!;
  assert.equal(r2.branchCode, 'CSE');
  assert.equal(r2.dob, '2005-05-14');
  assert.equal(r2.attributes.Quota, 'KCET');
  assert.equal(r2.attributes.Hostel, 'Block A');
  assert.equal(r2.disposition, 'NEW');

  const r3 = preview.rows.find((r) => r.usn === '4MH24CS902')!;
  assert.equal(r3.dob, '2005-05-14'); // Serial 38486

  const r4 = preview.rows.find((r) => r.usn === '4MH24CS903')!;
  assert.equal(r4.dob, '2005-05-04');
  assert.ok(r4.issues.some((i) => i.code === 'AMBIGUOUS_DOB' && i.severity === 'WARNING'));

  assert.equal(preview.rows.find((r) => r.usn === '4MH24CS904')!.dob, '2004-08-19');
  assert.equal(preview.rows.find((r) => r.usn === '4MH24CS905')!.dob, '2004-10-25');

  const dupRow = preview.rows.find((r) => r.rowNumber === 8)!;
  assert.ok(dupRow.issues.some((i) => i.code === 'DUPLICATE_USN_IN_FILE' && i.severity === 'ERROR'));

  const wrongBranchRow = preview.rows.find((r) => r.usn === '4MH24EC999')!;
  assert.ok(wrongBranchRow.issues.some((i) => i.code === 'WRONG_BRANCH' && i.severity === 'ERROR'));

  const badUsnRow = preview.rows.find((r) => r.usn === 'BADUSN1')!;
  assert.ok(badUsnRow.issues.some((i) => i.code === 'INVALID_USN_FORMAT' && i.severity === 'WARNING'));

  // Raw file untouched in audit store
  const rawAudit = getMockDb().rawUploadAuditArtifacts![preview.rawUploadAuditId];
  assert.ok(rawAudit);
  assert.equal(rawAudit.fileName, 'messy-students.xlsx');

  // Step 1 edits: fix missing Name on 4MH24CS906 and exclude duplicate row
  updateStudentPreviewRow({
    previewId: preview.previewId,
    rowNumber: 11,
    actor: cseHod,
    patch: { studentName: 'Fixed Student Name' },
  });
  const afterFix = updateStudentPreviewRow({
    previewId: preview.previewId,
    rowNumber: 8,
    actor: cseHod,
    patch: { excluded: true },
  });
  assert.equal(afterFix.counts.excludedCount, 1);

  // Confirm upsert
  const confirmed = confirmStudentUpload({
    previewId: preview.previewId,
    actor: cseHod,
  });
  assert.equal(confirmed.addedCount, 7);

  // Download corrected XLSX works cleanly
  const correctedBytes = buildCorrectedStudentExcelBytes(preview.previewId);
  const parsedCorrected = parseXlsxBuffer(correctedBytes);
  assert.equal(parsedCorrected.rows[0].slice(0, 6).join('|'), 'USN|Name|DOB|Branch|Semester|Section');
  assert.equal(parsedCorrected.rows.length, 8); // header + 7 valid non-excluded rows

  // DOB never appeared in any console log or audit log
  const allAuditText = JSON.stringify(getMockDb().auditLogs);
  for (const sensitiveDob of ['2005-05-14', '2004-08-19', '2004-10-25', '2005-05-04']) {
    assert.equal(loggedLines.join('\n').includes(sensitiveDob), false);
    assert.equal(allAuditText.includes(sensitiveDob), false);
  }
});

test('Upsert semantics, semester history, cross-branch conflict, strict USN mode & status deactivation', () => {
  resetMockDb();

  // First upload by CSE HOD
  const firstUpload = buildXlsxBuffer({
    sheetName: 'S1',
    headers: ['USN', 'Name', 'DOB', 'Branch', 'Semester', 'Section'],
    rows: [
      ['4MH24CS801', 'Meera K', '2005-02-11', 'CSE', 5, 'A'],
      ['4MH24CS802', 'Nikhil P', '2005-07-21', 'CSE', 5, 'A'],
    ],
  });
  const p1 = previewStudentUpload({ fileName: 'u1.xlsx', bytes: firstUpload, actor: cseHod });
  confirmStudentUpload({ previewId: p1.previewId, actor: cseHod });

  // Second upload: 4MH24CS801 promoted to Sem 6 (UPDATED), 4MH24CS802 UNCHANGED (omitting 801 won't delete), plus 4MH24CS803 NEW
  const secondUpload = buildXlsxBuffer({
    sheetName: 'S2',
    headers: ['USN', 'Name', 'DOB', 'Branch', 'Semester', 'Section'],
    rows: [
      ['4MH24CS801', 'Meera K', '2005-02-11', 'CSE', 6, 'A'],
      ['4MH24CS802', 'Nikhil P', '2005-07-21', 'CSE', 5, 'A'],
      ['4MH24CS803', 'Priya R', '2005-09-12', 'CSE', 5, 'B'],
    ],
  });
  const p2 = previewStudentUpload({ fileName: 'u2.xlsx', bytes: secondUpload, actor: cseHod });
  assert.equal(p2.counts.newCount, 1);
  assert.equal(p2.counts.updatedCount, 1);
  assert.equal(p2.counts.unchangedCount, 1);

  confirmStudentUpload({ previewId: p2.previewId, actor: cseHod });

  // Third upload omits 801 & 802 completely -> verify neither is deleted
  const thirdUpload = buildXlsxBuffer({
    sheetName: 'S3',
    headers: ['USN', 'Name', 'DOB', 'Branch', 'Semester', 'Section'],
    rows: [['4MH24CS804', 'Tarun M', '2005-12-01', 'CSE', 5, 'A']],
  });
  const p3 = previewStudentUpload({ fileName: 'u3.xlsx', bytes: thirdUpload, actor: cseHod });
  confirmStudentUpload({ previewId: p3.previewId, actor: cseHod });

  const meera = studentDirectoryPort.findByUsn('4MH24CS801', cseHod)!;
  assert.equal(meera.semesterNumber, 6);
  assert.equal(meera.semesterHistory.length, 2);
  assert.equal(meera.semesterHistory[1].fromSemester, 5);
  assert.equal(meera.semesterHistory[1].toSemester, 6);
  assert.ok(studentDirectoryPort.findByUsn('4MH24CS802', cseHod));

  // Cross-branch USN conflict when Principal attempts to upload 4MH24CS801 under ECE
  const conflictUpload = buildXlsxBuffer({
    sheetName: 'Conflict',
    headers: ['USN', 'Name', 'DOB', 'Branch', 'Semester', 'Section'],
    rows: [['4MH24CS801', 'Meera K', '2005-02-11', 'ECE', 5, 'A']],
  });
  const pConflict = previewStudentUpload({
    fileName: 'conflict.xlsx',
    bytes: conflictUpload,
    actor: principalAdmin,
  });
  assert.equal(pConflict.counts.conflictCount, 1);
  assert.equal(pConflict.rows[0].disposition, 'CONFLICT');

  // Strict USN mode makes bad USN format an ERROR instead of WARNING
  updateDirectorySettings({ usnStrictMode: true }, principalAdmin);
  const badUsnUpload = buildXlsxBuffer({
    sheetName: 'Strict',
    headers: ['USN', 'Name', 'DOB', 'Branch', 'Semester', 'Section'],
    rows: [['INVALID', 'Bad USN', '2005-01-01', 'CSE', 5, 'A']],
  });
  const pStrict = previewStudentUpload({
    fileName: 'strict.xlsx',
    bytes: badUsnUpload,
    actor: cseHod,
  });
  assert.equal(pStrict.counts.errorCount, 1);
  assert.equal(pStrict.rows[0].issues[0].severity, 'ERROR');

  // HOD deactivates & reactivates own branch student
  const deact = setStudentActiveStatus({ usn: '4MH24CS802', status: 'INACTIVE', actor: cseHod });
  assert.equal(deact.status, 'INACTIVE');
  const react = setStudentActiveStatus({ usn: '4MH24CS802', status: 'ACTIVE', actor: cseHod });
  assert.equal(react.status, 'ACTIVE');
});

test('Branch isolation (403/404), COE counts-only privacy & deterministic neighbor-differing A-D version assignment', () => {
  resetMockDb();
  const db = getMockDb();

  // Pick a real ECE student seeded from mockDatabase
  const eceStudent = db.studentDirectory!.find((s) => s.branchCode === 'ECE')!;
  assert.ok(eceStudent);

  // CSE HOD looking up or searching ECE throws PortalAccessError 403
  assert.throws(
    () => studentDirectoryPort.findByUsn(eceStudent.usn, cseHod),
    (err: unknown) => err instanceof PortalAccessError && err.statusCode === 403,
  );
  assert.throws(
    () => studentDirectoryPort.search({ branch: 'ECE' }, cseHod),
    (err: unknown) => err instanceof PortalAccessError && err.statusCode === 403,
  );
  assert.throws(
    () => setStudentActiveStatus({ usn: eceStudent.usn, status: 'INACTIVE', actor: cseHod }),
    (err: unknown) => err instanceof PortalAccessError && err.statusCode === 403,
  );

  // COE cannot fetch personal student records
  assert.throws(
    () => studentDirectoryPort.findByUsn(eceStudent.usn, coeActor),
    (err: unknown) => err instanceof PortalAccessError && err.statusCode === 403,
  );

  // COE counts-only endpoint contains ZERO USNs, names, or DOBs
  const coeCounts = getCoeStudentCounts();
  assert.ok(coeCounts.length > 0);
  const coeSerialized = JSON.stringify(coeCounts);
  assert.equal(coeSerialized.includes(eceStudent.usn), false);
  assert.equal(coeSerialized.includes(eceStudent.studentName), false);
  assert.equal(coeSerialized.includes(eceStudent.dob), false);

  // Deterministic A-D neighbor version assignment over sorted USNs per room/section
  const exam = db.examSchedules.find((e) => e.departmentCode === 'CSE' && e.semesterNumber === 5)!;
  configureExamEligibility({
    examId: exam.id,
    allowedBranches: ['CSE'],
    semesterNumber: 5,
    allowedSections: ['A', 'B'],
    actor: coeActor,
  });
  const frozenCfg = freezeExamEligibilitySnapshot({ examId: exam.id, actor: coeActor });
  assert.ok(frozenCfg.isFrozen);
  assert.ok(frozenCfg.eligibleUsnsSnapshot.length >= 4);

  const assignRun1 = assignExamVersionsForExam({
    examId: exam.id,
    actor: coeActor,
    assigner: new DeterministicNeighborVersionAssigner(),
  });
  const assignRun2 = assignExamVersionsForExam({
    examId: exam.id,
    actor: coeActor,
    assigner: new DeterministicNeighborVersionAssigner(),
  });
  assert.deepEqual(assignRun1, assignRun2);

  // Verify sorted order & adjacent seats in same room NEVER get the same paper version
  const byRoom = new Map<string, typeof assignRun1>();
  for (const a of assignRun1) {
    const arr = byRoom.get(a.roomCode) || [];
    arr.push(a);
    byRoom.set(a.roomCode, arr);
  }
  for (const [, list] of byRoom.entries()) {
    for (let i = 1; i < list.length; i++) {
      assert.ok(list[i - 1].usn.localeCompare(list[i].usn) < 0);
      assert.notEqual(list[i - 1].assignedVersion, list[i].assignedVersion);
    }
  }
});

test('Student login auth, rate-limit lockout, ineligibility ("Not scheduled"), single active session, reset & zero DOB in student view', () => {
  resetMockDb();
  const db = getMockDb();
  const cseExam = db.examSchedules.find((e) => e.departmentCode === 'CSE' && e.semesterNumber === 5)!;
  const targetSec = cseExam.section.trim().toUpperCase().replace(/^SECTION\s+/i, '');
  const activeCseStudent = db.studentDirectory!.find(
    (s) => s.branchCode === 'CSE' && s.semesterNumber === cseExam.semesterNumber && s.section === targetSec,
  )!;
  const sessionCode = db.directorySettings!.sessionAccessCode;

  // 1. Generic error for wrong DOB or unknown USN or wrong session code
  assert.throws(
    () =>
      loginStudent({
        usn: activeCseStudent.usn,
        dob: '1999-01-01',
        sessionCode,
        examId: cseExam.id,
        clientId: 'client-1',
      }),
    (e: unknown) => e instanceof PortalAccessError && e.message === 'Details not found',
  );
  assert.throws(
    () =>
      loginStudent({
        usn: '4MH99UNKNOWN',
        dob: '1999-01-01',
        sessionCode,
        examId: cseExam.id,
        clientId: 'client-2',
      }),
    (e: unknown) => e instanceof PortalAccessError && e.message === 'Details not found',
  );
  assert.throws(
    () =>
      loginStudent({
        usn: activeCseStudent.usn,
        dob: activeCseStudent.dob,
        sessionCode: 'WRONG_CODE',
        examId: cseExam.id,
        clientId: 'client-3',
      }),
    (e: unknown) => e instanceof PortalAccessError && e.message === 'Details not found',
  );

  // 2. Rate-limit lockout per USN
  for (let i = 0; i < 4; i++) {
    assert.throws(() =>
      loginStudent({
        usn: activeCseStudent.usn,
        dob: '1999-01-01',
        sessionCode,
        examId: cseExam.id,
        clientId: `client-brute-${i}`,
      }),
    );
  }
  assert.throws(
    () =>
      loginStudent({
        usn: activeCseStudent.usn,
        dob: activeCseStudent.dob,
        sessionCode,
        examId: cseExam.id,
        clientId: 'client-brute-fresh',
      }),
    (e: unknown) => e instanceof PortalAccessError && e.statusCode === 429,
  );

  // Invigilator resets lockout/session -> login succeeds cleanly
  resetStudentLoginSession({ usn: activeCseStudent.usn, actor: cseHod });

  const session = loginStudent({
    usn: activeCseStudent.usn,
    dob: activeCseStudent.dob,
    sessionCode,
    examId: cseExam.id,
    clientId: 'lab-pc-01',
    nowMs: 1_000_000,
  });

  // 3. Single active login per student rejects concurrent second login
  assert.throws(
    () =>
      loginStudent({
        usn: activeCseStudent.usn,
        dob: activeCseStudent.dob,
        sessionCode,
        examId: cseExam.id,
        clientId: 'lab-pc-02',
        nowMs: 1_001_000,
      }),
    (e: unknown) => e instanceof PortalAccessError && e.statusCode === 409,
  );

  // 4. Token signature & expiry enforcement
  assert.throws(
    () => verifyStudentToken(`${session.token}tamper`, 1_001_000),
    (e: unknown) => e instanceof PortalAccessError && e.statusCode === 401,
  );
  assert.throws(
    () => verifyStudentToken(session.token, session.expiresAt + 1000),
    (e: unknown) => e instanceof PortalAccessError && e.statusCode === 401,
  );

  // 5. Student Exam View contains only own exam & ZERO DOB & ZERO answer keys
  const examView = getStudentExamView(session.token, 1_001_000);
  assert.equal(examView.student.usn, activeCseStudent.usn);
  assert.equal(examView.exam.id, cseExam.id);
  const serializedView = JSON.stringify(examView);
  assert.equal(serializedView.includes(activeCseStudent.dob), false);
  assert.equal(serializedView.includes('correctOption'), false);

  // 6. Invigilator session reset invalidates existing token and permits fresh login
  resetStudentLoginSession({ usn: activeCseStudent.usn, actor: cseHod });
  assert.throws(
    () => verifyStudentToken(session.token, 1_002_000),
    (e: unknown) => e instanceof PortalAccessError && e.statusCode === 401,
  );

  // 7. Ineligible / INACTIVE student sees "Not scheduled"
  const otherBranchStudent = db.studentDirectory!.find((s) => s.branchCode === 'ECE')!;
  assert.throws(
    () =>
      loginStudent({
        usn: otherBranchStudent.usn,
        dob: otherBranchStudent.dob,
        sessionCode,
        examId: cseExam.id,
        clientId: 'lab-pc-03',
      }),
    (e: unknown) => e instanceof PortalAccessError && e.statusCode === 403 && e.message === 'Not scheduled',
  );

  setStudentActiveStatus({ usn: activeCseStudent.usn, status: 'INACTIVE', actor: cseHod });
  assert.throws(
    () =>
      loginStudent({
        usn: activeCseStudent.usn,
        dob: activeCseStudent.dob,
        sessionCode,
        examId: cseExam.id,
        clientId: 'lab-pc-01',
      }),
    (e: unknown) => e instanceof PortalAccessError && e.statusCode === 403 && e.message === 'Not scheduled',
  );
});

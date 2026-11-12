import assert from 'node:assert/strict';
import test from 'node:test';
import { getQBankBasePath } from '../src/services/qbankApi';
import {
  buildRosterTemplateXlsx,
  computeAvailableQuestions,
  formatModuleShort,
  formatModuleUnit,
  moduleUnitWeight,
  parseRosterRows,
} from '../src/utils/qbankHelpers';
import { parseXlsxBuffer } from '../src/utils/xlsxCodec';

test('QBank base path defaults to /qbank in Node/SSR environment', () => {
  assert.equal(getQBankBasePath(), '/qbank');
});

test('QBank module & half-module formatting and blueprint weights', () => {
  assert.equal(formatModuleUnit(1), 'Module 1');
  assert.equal(formatModuleUnit(21), 'Module 2 (1st Half)');
  assert.equal(formatModuleUnit(22), 'Module 2 (2nd Half)');
  assert.equal(formatModuleShort(3), 'M3');
  assert.equal(formatModuleShort(41), 'M4A');
  assert.equal(formatModuleShort(42), 'M4B');
  assert.equal(moduleUnitWeight(1), 2);
  assert.equal(moduleUnitWeight(21), 1);

  const avail = computeAvailableQuestions(2, {
    21: {
      id: 1,
      subjectId: 1,
      subjectCode: 'CS301',
      moduleNumber: 21,
      status: 'READY',
      questionCount: 60,
      lastImportFilename: null,
      lastImportedBy: null,
      lastImportedAt: null,
      lastErrorCount: 0,
      lastWarningCount: 0,
    },
    22: {
      id: 2,
      subjectId: 1,
      subjectCode: 'CS301',
      moduleNumber: 22,
      status: 'READY',
      questionCount: 65,
      lastImportFilename: null,
      lastImportedBy: null,
      lastImportedAt: null,
      lastErrorCount: 0,
      lastWarningCount: 0,
    },
  });
  assert.deepEqual(avail, { available: 125, ready: true });
});

test('COE student roster XLSX template round-trips through OOXML parser', () => {
  const bytes = buildRosterTemplateXlsx();
  const parsedWb = parseXlsxBuffer(bytes);
  assert.equal(parsedWb.sheetName, 'StudentRoster');
  const roster = parseRosterRows(parsedWb.rows);
  assert.equal(roster.warnings.length, 0);
  assert.equal(roster.students.length, 2);
  assert.deepEqual(roster.students[0], {
    rollNumber: '1JT23CS001',
    fullName: 'Aarav Sharma',
    roomCode: 'LH-101',
    rowNumber: 1,
    seatNumber: 1,
    fontScale: 1,
    highContrast: false,
    accommodationExtraMinutes: 0,
  });
  assert.deepEqual(roster.students[1], {
    rollNumber: '1JT23CS002',
    fullName: 'Diya Rao',
    roomCode: 'LH-101',
    rowNumber: 1,
    seatNumber: 2,
    fontScale: 1.2,
    highContrast: true,
    accommodationExtraMinutes: 15,
  });
});

test('parseRosterRows deduplicates roll numbers and handles aliases safely', () => {
  const res = parseRosterRows([
    ['USN', 'Student Name', 'Hall', 'Extra'],
    ['1JT23CS010', 'Rohan Verma', 'AB-202', 10],
    ['1JT23CS010', 'Rohan Duplicate', 'AB-202', 0],
    ['', 'Missing Roll', 'AB-202', 0],
  ]);
  assert.equal(res.students.length, 1);
  assert.equal(res.students[0].rollNumber, '1JT23CS010');
  assert.equal(res.students[0].roomCode, 'AB-202');
  assert.equal(res.students[0].accommodationExtraMinutes, 10);
  assert.equal(res.warnings.length, 2);
});

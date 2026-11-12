import React, { useCallback, useEffect, useState } from 'react';
import {
  Check,
  Download,
  Edit3,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { StatusBadge } from '../../components/StatusBadge';
import { qbankApi } from '../../services/qbankApi';
import type {
  ImportPreviewResult,
  ParsedQuestionRow,
  Subject,
  SubjectModule,
} from '../../types';
import { triggerBlobDownload } from '../../utils/exportUtils';
import {
  formatModuleShort,
  formatModuleUnit,
  sortedPreviewIssues,
} from '../../utils/qbankHelpers';

export const HodWorkspacePage: React.FC = () => {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [mode, setMode] = useState<string>('MULTI');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [modules, setModules] = useState<SubjectModule[]>([]);
  const [previews, setPreviews] = useState<ImportPreviewResult[]>([]);
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // + Subject modal
  const [subModalOpen, setSubModalOpen] = useState(false);
  const [subCode, setSubCode] = useState('');
  const [subName, setSubName] = useState('');
  const [subExpected, setSubExpected] = useState(120);
  const [subMarks, setSubMarks] = useState(1);

  // Row edit modal
  const [editing, setEditing] = useState<{
    previewIdx: number;
    preview: ImportPreviewResult;
    row: ParsedQuestionRow;
  } | null>(null);
  const [editQText, setEditQText] = useState('');
  const [editOptions, setEditOptions] = useState<string[]>(['', '', '', '']);
  const [editCorrectIndex, setEditCorrectIndex] = useState<number>(0);

  const loadSubjects = useCallback(async (preferId?: number) => {
    try {
      const list = await qbankApi.subjects.list(false);
      setSubjects(list);
      if (preferId) {
        setSelectedSubjectId(String(preferId));
      } else if (list.length > 0 && !list.some((s) => String(s.id) === selectedSubjectId)) {
        setSelectedSubjectId(String(list[0].id));
      } else if (list.length === 0) {
        setSelectedSubjectId('');
      }
    } catch (err) {
      setFlash({
        kind: 'err',
        msg: err instanceof Error ? err.message : 'Unable to load subjects',
      });
    }
  }, [selectedSubjectId]);

  const loadModules = useCallback(async (sid: string) => {
    if (!sid) {
      setModules([]);
      return;
    }
    try {
      setModules(await qbankApi.subjects.modules(Number(sid)));
    } catch (err) {
      setFlash({
        kind: 'err',
        msg: err instanceof Error ? err.message : 'Unable to load module status',
      });
    }
  }, []);

  useEffect(() => {
    void loadSubjects();
  }, [loadSubjects]);

  useEffect(() => {
    void loadModules(selectedSubjectId);
  }, [selectedSubjectId, loadModules]);

  const handleDownloadTemplate = async () => {
    try {
      const blob = await qbankApi.hod.downloadTemplate(true);
      triggerBlobDownload(blob, 'qbank-5module-template.xlsx');
    } catch (err) {
      setFlash({
        kind: 'err',
        msg: err instanceof Error ? err.message : 'Unable to download template',
      });
    }
  };

  const handlePreview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubjectId || !selectedFile) {
      setFlash({ kind: 'err', msg: 'Select a subject and an Excel file (.xlsx / .xls).' });
      return;
    }
    setBusy(true);
    setFlash(null);
    try {
      const sid = Number(selectedSubjectId);
      if (mode === 'MULTI') {
        const res = await qbankApi.hod.previewMulti(sid, selectedFile);
        setPreviews(res);
      } else {
        const res = await qbankApi.hod.previewSingle(sid, Number(mode), selectedFile);
        setPreviews([res]);
      }
    } catch (err) {
      setFlash({
        kind: 'err',
        msg: err instanceof Error ? err.message : 'Preview failed',
      });
    } finally {
      setBusy(false);
    }
  };

  const openEditRow = (previewIdx: number, preview: ImportPreviewResult, row: ParsedQuestionRow) => {
    const baseOpts = row.options && row.options.length > 0 ? row.options : ['', '', '', ''];
    const count = Math.max(4, Math.min(5, baseOpts.length));
    const padded = Array.from({ length: count }, (_, i) => baseOpts[i] || '');
    setEditing({ previewIdx, preview, row });
    setEditQText(row.questionText || '');
    setEditOptions(padded);
    setEditCorrectIndex(
      row.correctIndex !== null && row.correctIndex !== undefined && row.correctIndex >= 0
        ? row.correctIndex
        : 0
    );
  };

  const handleSaveRowEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    let trimmed = editOptions.map((o) => o.trim());
    if (trimmed.length === 5 && !trimmed[4]) trimmed = trimmed.slice(0, 4);
    const corr = editCorrectIndex >= trimmed.length ? 0 : editCorrectIndex;
    setBusy(true);
    try {
      const updated = await qbankApi.hod.updatePreviewRow(
        editing.preview.previewId,
        editing.row.sourceRow,
        {
          questionText: editQText.trim(),
          options: trimmed,
          correctIndex: corr,
          excluded: false,
        }
      );
      setPreviews((prev) =>
        prev.map((p, idx) => (idx === editing.previewIdx ? updated : p))
      );
      setEditing(null);
      setFlash({ kind: 'ok', msg: `Row ${editing.row.sourceRow} updated and revalidated.` });
    } catch (err) {
      setFlash({
        kind: 'err',
        msg: err instanceof Error ? err.message : 'Row update failed',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleToggleExclude = async (
    previewIdx: number,
    preview: ImportPreviewResult,
    row: ParsedQuestionRow
  ) => {
    setBusy(true);
    try {
      const updated = await qbankApi.hod.updatePreviewRow(preview.previewId, row.sourceRow, {
        questionText: row.questionText,
        options: row.options,
        correctIndex: row.correctIndex,
        excluded: !row.excluded,
      });
      setPreviews((prev) => prev.map((p, idx) => (idx === previewIdx ? updated : p)));
    } catch (err) {
      setFlash({
        kind: 'err',
        msg: err instanceof Error ? err.message : 'Unable to toggle row exclusion',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmOne = async (previewIdx: number, preview: ImportPreviewResult) => {
    setBusy(true);
    try {
      const res = await qbankApi.hod.confirmPreview(preview.previewId);
      setPreviews((prev) => prev.filter((_, idx) => idx !== previewIdx));
      await loadModules(selectedSubjectId);
      setFlash({
        kind: 'ok',
        msg: `${formatModuleUnit(res.moduleNumber)} READY: ${res.questionCount} questions imported.`,
      });
    } catch (err) {
      setFlash({
        kind: 'err',
        msg: err instanceof Error ? err.message : 'Confirm import failed',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmAll = async () => {
    const readyList = previews.filter((p) => p.canConfirmDirectly);
    if (readyList.length === 0) return;
    setBusy(true);
    const msgs: string[] = [];
    const remaining = [...previews];
    try {
      for (const target of readyList) {
        const res = await qbankApi.hod.confirmPreview(target.previewId);
        msgs.push(`${formatModuleShort(res.moduleNumber)}: ${res.questionCount}`);
        const idx = remaining.findIndex((x) => x.previewId === target.previewId);
        if (idx >= 0) remaining.splice(idx, 1);
      }
      setPreviews(remaining);
      await loadModules(selectedSubjectId);
      setFlash({ kind: 'ok', msg: `Confirmed ${msgs.join(', ')}` });
    } catch (err) {
      setPreviews(remaining);
      await loadModules(selectedSubjectId);
      setFlash({
        kind: 'err',
        msg:
          (msgs.length > 0 ? `Confirmed ${msgs.join(', ')} before error: ` : '') +
          (err instanceof Error ? err.message : 'Confirm all failed'),
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDiscard = async (previewIdx: number, previewId: string) => {
    try {
      await qbankApi.hod.discardPreview(previewId);
    } catch {
      // ignore if already discarded
    }
    setPreviews((prev) => prev.filter((_, idx) => idx !== previewIdx));
  };

  const handleCreateSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const created = await qbankApi.subjects.create({
        code: subCode.trim(),
        name: subName.trim(),
        expectedQuestionsPerModule: Number(subExpected) || 120,
        marksPerQuestion: Number(subMarks) || 1,
      });
      setSubModalOpen(false);
      setSubCode('');
      setSubName('');
      await loadSubjects(created.id);
      setFlash({ kind: 'ok', msg: `Created subject ${created.code} — ${created.name}.` });
    } catch (err) {
      setFlash({
        kind: 'err',
        msg: err instanceof Error ? err.message : 'Unable to create subject',
      });
    } finally {
      setBusy(false);
    }
  };

  const byModNum: Record<number, SubjectModule> = {};
  modules.forEach((m) => {
    byModNum[m.moduleNumber] = m;
  });
  const readyCount = previews.filter((p) => p.canConfirmDirectly).length;

  return (
    <div className="space-y-5">
      {flash && (
        <div
          className={`p-3 rounded-lg border text-xs font-medium ${
            flash.kind === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          {flash.msg}
        </div>
      )}

      <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">HOD Question Bank Excel Upload</h2>
            <p className="text-xs text-slate-500">
              Upload Module 1–5 or Part A / Part B workbooks, inspect &amp; fix rows, then confirm.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleDownloadTemplate()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold"
            >
              <Download className="w-3.5 h-3.5" /> 5-Module Template (.xlsx)
            </button>
            <button
              type="button"
              onClick={() => setSubModalOpen(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold"
            >
              <Plus className="w-3.5 h-3.5" /> New Subject
            </button>
          </div>
        </div>

        {subjects.length === 0 && (
          <div className="p-3 rounded bg-amber-50 border border-amber-200 text-xs text-amber-900">
            No active subjects yet. Click <strong>New Subject</strong> to create one.
          </div>
        )}

        <form onSubmit={handlePreview} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Subject</label>
            <select
              value={selectedSubjectId}
              onChange={(e) => setSelectedSubjectId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
            >
              {subjects.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.code} — {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Import Mode</label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
            >
              <option value="MULTI">Multi-Sheet (Module 1..5 / 1A..5B)</option>
              {[1, 2, 3, 4, 5].map((m) => (
                <React.Fragment key={m}>
                  <option value={String(m)}>Module {m} (Full)</option>
                  <option value={String(m * 10 + 1)}>Module {m} — 1st Half (Part A)</option>
                  <option value={String(m * 10 + 2)}>Module {m} — 2nd Half (Part B)</option>
                </React.Fragment>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Excel File (.xlsx / .xls)
            </label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
              className="w-full text-xs text-slate-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border file:border-slate-300 file:bg-slate-50 file:font-semibold"
            />
          </div>
          <button
            type="submit"
            disabled={busy || !selectedSubjectId || !selectedFile}
            className="inline-flex items-center justify-center gap-1.5 py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-md disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            {busy ? 'Parsing...' : 'Preview Workbook'}
          </button>
        </form>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2">
          {[1, 2, 3, 4, 5].map((m) => {
            const full = byModNum[m];
            const h1 = byModNum[m * 10 + 1];
            const h2 = byModNum[m * 10 + 2];
            const usingHalves =
              ((h1 && h1.status === 'READY') || (h2 && h2.status === 'READY')) &&
              (!full || full.status !== 'READY');
            return (
              <div key={m} className="p-3 rounded-lg border border-slate-200 bg-slate-50 space-y-1.5">
                <div className="text-xs font-bold text-slate-900">Module {m}</div>
                {usingHalves ? (
                  <div className="space-y-1 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span>Part A:</span>
                      <StatusBadge
                        status={h1?.status === 'READY' ? `READY (${h1.questionCount})` : 'EMPTY'}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Part B:</span>
                      <StatusBadge
                        status={h2?.status === 'READY' ? `READY (${h2.questionCount})` : 'EMPTY'}
                      />
                    </div>
                  </div>
                ) : (
                  <div>
                    <StatusBadge
                      status={
                        full?.status === 'READY'
                          ? `READY · ${full.questionCount} Qs`
                          : `EMPTY · ${full?.questionCount || 0}`
                      }
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {previews.length > 1 && (
        <div className="bg-white rounded-lg border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-900">
            {previews.length} sheets loaded · {readyCount} ready for direct confirmation
          </div>
          <button
            type="button"
            disabled={busy || readyCount === 0}
            onClick={() => void handleConfirmAll()}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-md disabled:opacity-50"
          >
            <Check className="w-3.5 h-3.5" /> Confirm All Ready ({readyCount})
          </button>
        </div>
      )}

      {previews.map((p, previewIdx) => {
        const issues = sortedPreviewIssues(p.issues);
        return (
          <div key={p.previewId} className="bg-white rounded-lg border border-slate-200 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {formatModuleUnit(p.moduleNumber)} ({p.sheetName})
                </h3>
                <p className="text-xs text-slate-600 mt-0.5 tabular-nums">
                  Valid: {p.validCount} · Errors: {p.errorCount} · Warnings: {p.warningCount} ·
                  Duplicates Skipped: {p.duplicateSkippedCount || 0} · Excluded:{' '}
                  {p.excludedCount || 0} · Expected: {p.expectedCount}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={p.canConfirmDirectly ? 'READY' : `${p.errorCount} ERROR(S)`} />
                <button
                  type="button"
                  disabled={busy || !p.canConfirmDirectly}
                  onClick={() => void handleConfirmOne(previewIdx, p)}
                  className="px-3.5 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50"
                >
                  Confirm Sheet
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleDiscard(previewIdx, p.previewId)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Discard
                </button>
              </div>
            </div>

            {issues.length > 0 && (
              <div className="p-3 rounded-md bg-amber-50 border border-amber-200 text-xs space-y-1 max-h-40 overflow-y-auto">
                {issues.slice(0, 25).map((iss, idx) => (
                  <div key={idx} className="text-amber-950">
                    <strong>[{iss.severity}]</strong> {iss.message}
                  </div>
                ))}
              </div>
            )}

            <div className="overflow-x-auto border border-slate-200 rounded-md">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Row</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    <th className="px-3 py-2 font-semibold">Question &amp; Options</th>
                    <th className="px-3 py-2 font-semibold">Answer</th>
                    <th className="px-3 py-2 font-semibold">Issues</th>
                    <th className="px-3 py-2 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(p.rows || []).map((r) => (
                    <tr key={r.sourceRow} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-mono">{r.sourceRow}</td>
                      <td className="px-3 py-2">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="px-3 py-2 max-w-md">
                        <div className="font-medium text-slate-900">{r.questionText}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {(r.options || [])
                            .map((opt, idx) => `${String.fromCharCode(65 + idx)}) ${opt}`)
                            .join(' | ')}
                        </div>
                      </td>
                      <td className="px-3 py-2 font-mono font-bold">
                        {r.correctIndex !== null && r.correctIndex !== undefined && r.correctIndex >= 0
                          ? String.fromCharCode(65 + r.correctIndex)
                          : 'MISSING'}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {(r.issues || []).map((iss) => iss.message).join('; ')}
                      </td>
                      <td className="px-3 py-2 text-right space-x-1.5 whitespace-nowrap">
                        {r.status !== 'DUPLICATE_SKIPPED' && (
                          <button
                            type="button"
                            onClick={() => openEditRow(previewIdx, p, r)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 font-semibold"
                          >
                            <Edit3 className="w-3 h-3" /> Edit
                          </button>
                        )}
                        {(r.status === 'ERROR' || r.status === 'WARNING' || r.status === 'EXCLUDED') && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleToggleExclude(previewIdx, p, r)}
                            className="px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 font-semibold"
                          >
                            {r.excluded ? 'Include' : 'Exclude'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {subModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-lg bg-white border border-slate-200 shadow-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900">Create Subject</h3>
              <button
                type="button"
                onClick={() => setSubModalOpen(false)}
                className="p-1 text-slate-500 hover:text-slate-900 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateSubject} className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Subject Code
                </label>
                <input
                  type="text"
                  required
                  value={subCode}
                  onChange={(e) => setSubCode(e.target.value)}
                  placeholder="CS301"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Subject Name
                </label>
                <input
                  type="text"
                  required
                  value={subName}
                  onChange={(e) => setSubName(e.target.value)}
                  placeholder="Algorithms & Data Structures"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Expected Qs / Module
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={subExpected}
                    onChange={(e) => setSubExpected(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Marks / Question
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={subMarks}
                    onChange={(e) => setSubMarks(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSubModalOpen(false)}
                  className="px-3.5 py-2 text-xs font-semibold border border-slate-300 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-4 py-2 text-xs font-semibold bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Create Subject
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-lg bg-white border border-slate-200 shadow-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900">
                Edit Row {editing.row.sourceRow} ({formatModuleUnit(editing.preview.moduleNumber)})
              </h3>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="p-1 text-slate-500 hover:text-slate-900 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveRowEdit} className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Question Text
                </label>
                <textarea
                  rows={3}
                  required
                  value={editQText}
                  onChange={(e) => setEditQText(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                />
              </div>
              {editOptions.map((opt, idx) => (
                <div key={idx}>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Option {String.fromCharCode(65 + idx)}
                  </label>
                  <input
                    type="text"
                    value={opt}
                    onChange={(e) =>
                      setEditOptions((prev) =>
                        prev.map((v, i) => (i === idx ? e.target.value : v))
                      )
                    }
                    className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md"
                  />
                </div>
              ))}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Correct Answer
                </label>
                <select
                  value={String(editCorrectIndex)}
                  onChange={(e) => setEditCorrectIndex(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
                >
                  {editOptions.map((_, idx) => (
                    <option key={idx} value={String(idx)}>
                      Option {String.fromCharCode(65 + idx)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="px-3.5 py-2 text-xs font-semibold border border-slate-300 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-4 py-2 text-xs font-semibold bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Save &amp; Revalidate
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

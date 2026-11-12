import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Contrast,
  ExternalLink,
  GraduationCap,
  RefreshCw,
} from 'lucide-react';
import {
  QBankApiError,
  qbankApi,
  setStudentToken,
} from '../../services/qbankApi';
import type { PublicSessionOption, StudentPaperPayload } from '../../types';

interface QueuedAnswer {
  questionPosition: number;
  selectedOptionIndex: number | null;
  clientTimestamp: string;
}

const LETTERS = ['A', 'B', 'C', 'D', 'E'];

function offlineQueueKey(sessionId: number, rollNumber: string): string {
  return `qbank_offline_q_${sessionId}_${rollNumber}`;
}

function readDirtyQueue(key: string): Record<string, QueuedAnswer> {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Record<string, QueuedAnswer>) : {};
  } catch {
    return {};
  }
}

function writeDirtyQueue(key: string, queue: Record<string, QueuedAnswer>): void {
  try {
    if (Object.keys(queue).length === 0) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, JSON.stringify(queue));
    }
  } catch {
    // ignore storage limits
  }
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export const StudentPortalPage: React.FC = () => {
  // Login state
  const [sessions, setSessions] = useState<PublicSessionOption[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [rollNumber, setRollNumber] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(true);

  // Active exam state
  const [studentToken, setActiveToken] = useState<string | null>(null);
  const [paper, setPaper] = useState<StudentPaperPayload | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selections, setSelections] = useState<Record<string, number | null>>({});
  const [fontScale, setFontScale] = useState(1.0);
  const [highContrast, setHighContrast] = useState(false);
  const [syncState, setSyncState] = useState('SYNCED');
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [finished, setFinished] = useState(false);

  const dirtyQueueRef = useRef<Record<string, QueuedAnswer>>({});
  const clockOffsetMsRef = useRef<number>(0);
  const effectiveEndMsRef = useRef<number>(0);
  const currentIdxRef = useRef<number>(0);
  const finishedRef = useRef<boolean>(false);

  currentIdxRef.current = currentIdx;
  finishedRef.current = finished;

  const loadPublicSessions = useCallback(async () => {
    setLoadingSessions(true);
    setLoginError(null);
    try {
      const list = await qbankApi.student.publicSessions();
      setSessions(list);
      if (list.length > 0) {
        setSelectedSessionId(String(list[0].sessionId));
      } else {
        setSelectedSessionId('');
      }
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Unable to reach QBank server');
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  useEffect(() => {
    void loadPublicSessions();
  }, [loadPublicSessions]);

  useEffect(() => {
    if (highContrast) document.body.classList.add('qb-high-contrast');
    else document.body.classList.remove('qb-high-contrast');
    return () => {
      document.body.classList.remove('qb-high-contrast');
    };
  }, [highContrast]);

  const flushDirtyQueue = useCallback(
    async (tok: string, p: StudentPaperPayload) => {
      if (finishedRef.current) return;
      const keys = Object.keys(dirtyQueueRef.current);
      if (keys.length === 0) {
        setSyncState('SYNCED');
        return;
      }
      const batch = keys.map((k) => dirtyQueueRef.current[k]);
      try {
        const ack = await qbankApi.student.saveResponses(tok, {
          answers: batch,
          lastQuestionIndex: currentIdxRef.current,
        });
        keys.forEach((k) => {
          delete dirtyQueueRef.current[k];
        });
        writeDirtyQueue(offlineQueueKey(p.sessionId, p.rollNumber), dirtyQueueRef.current);
        if (ack.serverNow) clockOffsetMsRef.current = Date.parse(ack.serverNow) - Date.now();
        if (ack.effectiveEndAt) effectiveEndMsRef.current = Date.parse(ack.effectiveEndAt);
        setSyncState('SYNCED');
      } catch (err) {
        if (err instanceof QBankApiError && (err.status === 401 || err.status === 403 || err.status === 409)) {
          setSyncState(`BLOCKED: ${err.message}`);
        } else {
          setSyncState('OFFLINE (saved locally)');
        }
      }
    },
    []
  );

  const finishExam = useCallback(
    async (autoTriggered: boolean) => {
      if (!paper || !studentToken || finishedRef.current) return;
      if (!autoTriggered) {
        const answeredCount = paper.questions.filter((q) => {
          const v = selections[String(q.position)];
          return v !== null && v !== undefined;
        }).length;
        if (!window.confirm(`Submit exam now? Answered: ${answeredCount} / ${paper.questions.length}`)) {
          return;
        }
      }
      await flushDirtyQueue(studentToken, paper);
      try {
        await qbankApi.student.finish(studentToken, currentIdxRef.current);
      } catch (err) {
        if (!autoTriggered) {
          window.alert(
            `Unable to submit online: ${err instanceof Error ? err.message : 'Network error'}`
          );
          return;
        }
      }
      finishedRef.current = true;
      setFinished(true);
      setStudentToken(null);
      try {
        window.localStorage.removeItem(offlineQueueKey(paper.sessionId, paper.rollNumber));
      } catch {
        // ignore
      }
    },
    [flushDirtyQueue, paper, selections, studentToken]
  );

  useEffect(() => {
    if (!paper || !studentToken || finished) return;

    const tickTimer = window.setInterval(() => {
      const serverNowMs = Date.now() + clockOffsetMsRef.current;
      const rem = Math.max(0, Math.floor((effectiveEndMsRef.current - serverNowMs) / 1000));
      setRemainingSeconds(rem);
      if (rem === 0 && !finishedRef.current) {
        void finishExam(true);
      }
    }, 1000);

    const hbTimer = window.setInterval(() => {
      void (async () => {
        if (Object.keys(dirtyQueueRef.current).length > 0) {
          await flushDirtyQueue(studentToken, paper);
        }
        try {
          const hb = await qbankApi.student.heartbeat(studentToken, currentIdxRef.current);
          if (hb.serverNow) clockOffsetMsRef.current = Date.parse(hb.serverNow) - Date.now();
          if (hb.effectiveEndAt) effectiveEndMsRef.current = Date.parse(hb.effectiveEndAt);
          if (Object.keys(dirtyQueueRef.current).length === 0) setSyncState('SYNCED');
        } catch (err) {
          if (err instanceof QBankApiError && (err.status === 401 || err.status === 403)) {
            setSyncState(`LOCKED: ${err.message}`);
          } else {
            setSyncState('OFFLINE (saved locally)');
          }
        }
      })();
    }, 15000);

    return () => {
      window.clearInterval(tickTimer);
      window.clearInterval(hbTimer);
    };
  }, [finishExam, finished, flushDirtyQueue, paper, studentToken]);

  const selectOption = useCallback(
    (questionPosition: number, optionIndex: number | null) => {
      if (!paper || !studentToken || finishedRef.current) return;
      const posKey = String(questionPosition);
      setSelections((prev) => ({ ...prev, [posKey]: optionIndex }));
      dirtyQueueRef.current[posKey] = {
        questionPosition,
        selectedOptionIndex: optionIndex,
        clientTimestamp: new Date().toISOString(),
      };
      writeDirtyQueue(offlineQueueKey(paper.sessionId, paper.rollNumber), dirtyQueueRef.current);
      setSyncState('SAVING');
      void flushDirtyQueue(studentToken, paper);
    },
    [flushDirtyQueue, paper, studentToken]
  );

  useEffect(() => {
    if (!paper || finished) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.key === 'ArrowLeft' || e.key === 'p' || e.key === 'P') {
        setCurrentIdx((idx) => Math.max(0, idx - 1));
      } else if (e.key === 'ArrowRight' || e.key === 'n' || e.key === 'N') {
        setCurrentIdx((idx) => Math.min(paper.questions.length - 1, idx + 1));
      } else {
        let optIdx = ['a', 'b', 'c', 'd'].indexOf(e.key.toLowerCase());
        if (optIdx < 0) optIdx = ['1', '2', '3', '4'].indexOf(e.key);
        const q = paper.questions[currentIdxRef.current];
        if (optIdx >= 0 && q && optIdx < q.options.length) {
          const cur = selections[String(q.position)];
          selectOption(q.position, cur === optIdx ? null : optIdx);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [finished, paper, selectOption, selections]);

  const handleStudentLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    const sid = Number(selectedSessionId);
    if (!sid) {
      setLoginError('Please select an open exam session.');
      return;
    }
    setLoginBusy(true);
    try {
      const auth = await qbankApi.student.login({
        sessionId: sid,
        rollNumber: rollNumber.trim(),
      });
      setStudentToken(auth.signedToken);
      const loadedPaper = await qbankApi.student.getPaper(auth.signedToken);
      const dirty = readDirtyQueue(offlineQueueKey(loadedPaper.sessionId, loadedPaper.rollNumber));
      dirtyQueueRef.current = dirty;

      const mergedSelections: Record<string, number | null> = {
        ...(loadedPaper.savedSelections || {}),
      };
      Object.keys(dirty).forEach((pos) => {
        mergedSelections[pos] = dirty[pos].selectedOptionIndex;
      });

      clockOffsetMsRef.current = Date.parse(loadedPaper.serverNow) - Date.now();
      effectiveEndMsRef.current = Date.parse(loadedPaper.effectiveEndAt);
      const initialRem = Math.max(
        0,
        Math.floor((effectiveEndMsRef.current - Date.now() - clockOffsetMsRef.current) / 1000)
      );

      setRemainingSeconds(initialRem);
      setFontScale(loadedPaper.fontScale || 1.0);
      setHighContrast(Boolean(loadedPaper.highContrast));
      setCurrentIdx(
        Math.max(
          0,
          Math.min(
            loadedPaper.lastQuestionIndex || 0,
            Math.max(0, loadedPaper.questions.length - 1)
          )
        )
      );
      setSelections(mergedSelections);
      setActiveToken(auth.signedToken);
      setPaper(loadedPaper);
      setFinished(false);
      void flushDirtyQueue(auth.signedToken, loadedPaper);
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Student sign-in failed');
    } finally {
      setLoginBusy(false);
    }
  };

  if (finished && paper) {
    return (
      <div className="min-h-screen bg-[#F4F6FA] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2.5 text-emerald-700">
            <CheckCircle2 className="w-6 h-6" />
            <h1 className="text-lg font-bold text-slate-900">Exam Submitted</h1>
          </div>
          <p className="text-sm text-slate-700">
            Your responses for Roll <strong>{paper.rollNumber}</strong> (Version{' '}
            <strong>{paper.assignedVersion}</strong>) have been recorded on QBank.
          </p>
          <button
            type="button"
            onClick={() => {
              setPaper(null);
              setActiveToken(null);
              setFinished(false);
              void loadPublicSessions();
            }}
            className="w-full py-2.5 bg-[#0F172A] hover:bg-slate-800 text-white text-sm font-semibold rounded-md"
          >
            Return to Candidate Sign-In
          </button>
        </div>
      </div>
    );
  }

  if (paper) {
    const q = paper.questions[currentIdx];
    const currentSel = q ? selections[String(q.position)] : null;
    const h = Math.floor(remainingSeconds / 3600);
    const m = Math.floor((remainingSeconds % 3600) / 60);
    const s = remainingSeconds % 60;

    return (
      <div
        className="min-h-screen flex flex-col"
        style={{ fontSize: `${Math.round(fontScale * 100)}%` }}
      >
        <header className="qb-exam-surface bg-[#0F172A] text-white border-b border-slate-800 px-4 sm:px-6 py-3">
          <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-bold text-sm sm:text-base">
                {paper.rollNumber} · {paper.fullName} (Version {paper.assignedVersion})
              </div>
              <div className="text-xs text-slate-300">Session #{paper.sessionId}</div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`px-2.5 py-1 rounded text-xs font-semibold ${
                  syncState === 'SYNCED'
                    ? 'bg-emerald-900/60 text-emerald-200 border border-emerald-500/40'
                    : 'bg-amber-900/60 text-amber-200 border border-amber-500/40'
                }`}
              >
                {syncState}
              </span>
              <button
                type="button"
                onClick={() => setFontScale((v) => Math.max(0.85, +(v - 0.1).toFixed(2)))}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-semibold"
              >
                A-
              </button>
              <button
                type="button"
                onClick={() => setFontScale((v) => Math.min(1.8, +(v + 0.1).toFixed(2)))}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-semibold"
              >
                A+
              </button>
              <button
                type="button"
                onClick={() => setHighContrast((v) => !v)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-semibold"
              >
                <Contrast className="w-3.5 h-3.5" /> Contrast
              </button>
              <span
                className={`inline-flex items-center gap-1 px-3 py-1 rounded font-mono text-sm font-bold border ${
                  remainingSeconds <= 300
                    ? 'bg-red-950 text-red-200 border-red-400'
                    : 'bg-slate-800 text-white border-slate-600'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                {pad2(h)}:{pad2(m)}:{pad2(s)}
              </span>
              <button
                type="button"
                onClick={() => void finishExam(false)}
                className="px-3 py-1.5 rounded bg-red-600 hover:bg-red-700 text-white text-xs font-bold"
              >
                Submit Exam
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6 space-y-5">
          <div className="qb-exam-surface bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-xs font-semibold text-slate-500 mb-2">Question Navigator</div>
            <div className="flex flex-wrap gap-1.5">
              {paper.questions.map((item, idx) => {
                const sel = selections[String(item.position)];
                const isAnswered = sel !== null && sel !== undefined;
                const isCurrent = idx === currentIdx;
                return (
                  <button
                    key={item.position}
                    type="button"
                    onClick={() => setCurrentIdx(idx)}
                    className={`w-9 h-9 rounded text-xs font-bold border transition-colors ${
                      isCurrent
                        ? 'ring-2 ring-blue-500 bg-blue-600 text-white border-blue-600'
                        : isAnswered
                        ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                        : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    {item.position}
                  </button>
                );
              })}
            </div>
          </div>

          {q && (
            <div className="qb-exam-surface bg-white rounded-lg border border-slate-200 p-6 space-y-5">
              <div className="text-sm font-bold text-slate-500">
                Question {q.position} of {paper.questions.length}
              </div>

              <div className="text-base sm:text-lg font-medium whitespace-pre-wrap leading-relaxed">
                {q.text}
              </div>

              <div className="space-y-2.5">
                {q.options.map((optText, idx) => {
                  const selected = currentSel === idx;
                  return (
                    <label
                      key={idx}
                      onClick={() => selectOption(q.position, selected ? null : idx)}
                      className={`qb-exam-option flex items-start gap-3 p-3.5 rounded-lg border cursor-pointer transition-colors ${
                        selected
                          ? 'qb-exam-option-selected bg-blue-50 border-blue-600 text-slate-900'
                          : 'bg-white border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        checked={selected}
                        readOnly
                        name={`q_${q.position}`}
                        className="mt-1"
                      />
                      <span className="font-bold">{LETTERS[idx]}.</span>
                      <span className="whitespace-pre-wrap">{optText}</span>
                    </label>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  disabled={currentIdx === 0}
                  onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md border border-slate-300 bg-white text-slate-800 text-xs font-semibold disabled:opacity-40"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Previous
                </button>
                <button
                  type="button"
                  disabled={currentSel === null || currentSel === undefined}
                  onClick={() => selectOption(q.position, null)}
                  className="px-4 py-2 rounded-md border border-slate-300 bg-white text-slate-800 text-xs font-semibold disabled:opacity-40"
                >
                  Clear Choice
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (currentIdx >= paper.questions.length - 1) void finishExam(false);
                    else setCurrentIdx((i) => Math.min(paper.questions.length - 1, i + 1));
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
                >
                  {currentIdx >= paper.questions.length - 1 ? 'Review & Submit' : 'Next'}
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F6FA] flex flex-col">
      <header className="bg-[#0F172A] text-white border-b border-slate-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-600/20 border border-emerald-400/40 flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h1 className="font-bold text-base tracking-tight">QBank Student Exam Portal</h1>
              <p className="text-xs text-slate-300">
                Sign in with your Active Exam Session and Roll Number
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/admin/login"
              className="px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
            >
              Staff / Admin Portal
            </Link>
            <a
              href="/qbank/student.html"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors"
            >
              Classic Student View
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">Candidate Exam Sign-In</h2>
            <button
              type="button"
              onClick={() => void loadPublicSessions()}
              className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingSessions ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {loginError && (
            <div className="p-3 rounded bg-red-50 border border-red-200 text-xs text-red-800">
              {loginError}
            </div>
          )}

          <form onSubmit={handleStudentLogin} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Active Exam Session
              </label>
              <select
                required
                value={selectedSessionId}
                onChange={(e) => setSelectedSessionId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
              >
                {sessions.length === 0 ? (
                  <option value="">No open exam session available</option>
                ) : (
                  sessions.map((s) => (
                    <option key={s.sessionId} value={String(s.sessionId)}>
                      {s.subjectCode} — {s.title} ({s.slot})
                    </option>
                  ))
                )}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Roll Number
              </label>
              <input
                type="text"
                required
                autoComplete="off"
                value={rollNumber}
                onChange={(e) => setRollNumber(e.target.value)}
                placeholder="Enter Roll Number"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              />
            </div>
            <button
              type="submit"
              disabled={loginBusy || !selectedSessionId}
              className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold rounded-md transition-colors disabled:opacity-50"
            >
              {loginBusy ? 'Starting Exam...' : 'Start Exam'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
};

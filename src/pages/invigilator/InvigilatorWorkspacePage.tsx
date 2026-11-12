import React, { useCallback, useEffect, useState } from 'react';
import { Clock, Eye, RefreshCw, RotateCcw } from 'lucide-react';
import { StatusBadge } from '../../components/StatusBadge';
import { qbankApi } from '../../services/qbankApi';
import type { PublicSessionOption, RoomMonitorView } from '../../types';
import { formatInstant } from '../../utils/qbankHelpers';

export const InvigilatorWorkspacePage: React.FC = () => {
  const [openSessions, setOpenSessions] = useState<PublicSessionOption[]>([]);
  const [sessionIdInput, setSessionIdInput] = useState('');
  const [roomCodeFilter, setRoomCodeFilter] = useState('');
  const [monitor, setMonitor] = useState<RoomMonitorView | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Grant extra time form
  const [extraTargetRoll, setExtraTargetRoll] = useState('');
  const [extraTargetRoom, setExtraTargetRoom] = useState('');
  const [extraMinutes, setExtraMinutes] = useState(10);
  const [extraReason, setExtraReason] = useState('');

  // Reset login target
  const [resetRoll, setResetRoll] = useState<string | null>(null);
  const [resetReason, setResetReason] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const list = await qbankApi.student.publicSessions();
        setOpenSessions(list);
        if (list.length > 0 && !sessionIdInput) {
          setSessionIdInput(String(list[0].sessionId));
        }
      } catch {
        // manual session ID always remains available
      }
    })();
  }, [sessionIdInput]);

  const loadMonitor = useCallback(async () => {
    const sid = Number(sessionIdInput);
    if (!sid) return;
    try {
      const data = await qbankApi.invigilator.monitorRoom(sid, roomCodeFilter);
      setMonitor(data);
    } catch (err) {
      setFlash({
        kind: 'err',
        msg: err instanceof Error ? err.message : 'Unable to load room monitor',
      });
    }
  }, [roomCodeFilter, sessionIdInput]);

  useEffect(() => {
    if (!autoRefresh || !sessionIdInput) return;
    const id = window.setInterval(() => {
      void loadMonitor();
    }, 10000);
    return () => window.clearInterval(id);
  }, [autoRefresh, loadMonitor, sessionIdInput]);

  const handleResetLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const sid = Number(sessionIdInput);
    if (!sid || !resetRoll) return;
    setBusy(true);
    try {
      await qbankApi.invigilator.resetStudentLogin(sid, resetRoll, resetReason.trim() || 'Invigilator reset');
      setFlash({ kind: 'ok', msg: `Reset active login lock for ${resetRoll}.` });
      setResetRoll(null);
      setResetReason('');
      await loadMonitor();
    } catch (err) {
      setFlash({
        kind: 'err',
        msg: err instanceof Error ? err.message : 'Reset login failed',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleGrantExtraTime = async (e: React.FormEvent) => {
    e.preventDefault();
    const sid = Number(sessionIdInput);
    if (!sid) return;
    setBusy(true);
    try {
      await qbankApi.invigilator.grantExtraTime(sid, {
        roomCode: extraTargetRoom.trim() || null,
        rollNumber: extraTargetRoll.trim() || null,
        extraMinutes: Number(extraMinutes) || 0,
        reason: extraReason.trim() || 'Invigilator time extension',
      });
      setFlash({ kind: 'ok', msg: `Granted +${extraMinutes} minute(s).` });
      setExtraTargetRoll('');
      setExtraReason('');
      await loadMonitor();
    } catch (err) {
      setFlash({
        kind: 'err',
        msg: err instanceof Error ? err.message : 'Extra time grant failed',
      });
    } finally {
      setBusy(false);
    }
  };

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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900">Invigilator Live Room Monitor</h2>
            <p className="text-xs text-slate-500">
              Track student heartbeats, reset locked exam sessions, and grant extra time.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh every 10s
          </label>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void loadMonitor();
          }}
          className="flex flex-wrap gap-3 items-end"
        >
          {openSessions.length > 0 && (
            <div className="min-w-[260px]">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Open Sessions
              </label>
              <select
                value={sessionIdInput}
                onChange={(e) => setSessionIdInput(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
              >
                {openSessions.map((s) => (
                  <option key={s.sessionId} value={String(s.sessionId)}>
                    #{s.sessionId} · {s.subjectCode} — {s.title} [{s.slot}]
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="w-36">
            <label className="block text-xs font-semibold text-slate-700 mb-1">Session ID</label>
            <input
              type="number"
              min={1}
              required
              value={sessionIdInput}
              onChange={(e) => setSessionIdInput(e.target.value)}
              placeholder="e.g. 1"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
            />
          </div>
          <div className="w-40">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Room Filter (optional)
            </label>
            <input
              type="text"
              value={roomCodeFilter}
              onChange={(e) => setRoomCodeFilter(e.target.value)}
              placeholder="e.g. LH-101"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
            />
          </div>
          <button
            type="submit"
            disabled={busy || !sessionIdInput}
            className="inline-flex items-center gap-1.5 py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-md disabled:opacity-50"
          >
            <Eye className="w-4 h-4" /> Monitor Room
          </button>
          {monitor && (
            <button
              type="button"
              onClick={() => void loadMonitor()}
              className="inline-flex items-center gap-1 py-2 px-3 border border-slate-300 rounded-md bg-white hover:bg-slate-50 text-xs font-semibold"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          )}
        </form>
      </div>

      {monitor && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="bg-white p-4 rounded-lg border border-slate-200">
              <div className="text-xs text-slate-500">Total Students</div>
              <div className="text-xl font-bold tabular-nums mt-1">{monitor.totalStudents}</div>
            </div>
            <div className="bg-white p-4 rounded-lg border border-emerald-200">
              <div className="text-xs text-emerald-700">Active</div>
              <div className="text-xl font-bold text-emerald-800 tabular-nums mt-1">
                {monitor.activeCount}
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg border border-red-200">
              <div className="text-xs text-red-700">Disconnected</div>
              <div className="text-xl font-bold text-red-800 tabular-nums mt-1">
                {monitor.disconnectedCount}
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg border border-amber-200">
              <div className="text-xs text-amber-700">Not Started</div>
              <div className="text-xl font-bold text-amber-800 tabular-nums mt-1">
                {monitor.notStartedCount}
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg border border-indigo-200">
              <div className="text-xs text-indigo-700">Finished</div>
              <div className="text-xl font-bold text-indigo-800 tabular-nums mt-1">
                {monitor.finishedCount}
              </div>
            </div>
          </div>

          <form
            onSubmit={handleGrantExtraTime}
            className="bg-white rounded-lg border border-slate-200 p-4 grid grid-cols-1 sm:grid-cols-5 gap-3 items-end"
          >
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Roll Number (optional)
              </label>
              <input
                type="text"
                value={extraTargetRoll}
                onChange={(e) => setExtraTargetRoll(e.target.value)}
                placeholder="Blank = whole room"
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Room Code (optional)
              </label>
              <input
                type="text"
                value={extraTargetRoom}
                onChange={(e) => setExtraTargetRoom(e.target.value)}
                placeholder="e.g. LH-101"
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Extra Minutes
              </label>
              <input
                type="number"
                min={1}
                required
                value={extraMinutes}
                onChange={(e) => setExtraMinutes(Number(e.target.value))}
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Reason *</label>
              <input
                type="text"
                required
                value={extraReason}
                onChange={(e) => setExtraReason(e.target.value)}
                placeholder="System reboot / late start"
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center justify-center gap-1.5 py-2 px-3 bg-[#0F172A] hover:bg-slate-800 text-white text-xs font-semibold rounded-md"
            >
              <Clock className="w-3.5 h-3.5" /> Grant Extra Time
            </button>
          </form>

          {resetRoll && (
            <form
              onSubmit={handleResetLogin}
              className="bg-amber-50 rounded-lg border border-amber-300 p-4 flex flex-wrap gap-3 items-end"
            >
              <div className="text-xs font-bold text-amber-950">
                Reset Login Lock for {resetRoll}
              </div>
              <input
                type="text"
                required
                value={resetReason}
                onChange={(e) => setResetReason(e.target.value)}
                placeholder="Reason (e.g., terminal crashed, shifting seat)"
                className="flex-1 min-w-[220px] px-3 py-1.5 text-xs border border-amber-300 rounded bg-white"
              />
              <button
                type="submit"
                disabled={busy}
                className="px-3 py-1.5 rounded bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold"
              >
                Confirm Reset
              </button>
              <button
                type="button"
                onClick={() => setResetRoll(null)}
                className="px-3 py-1.5 rounded border border-slate-300 bg-white text-xs font-semibold"
              >
                Cancel
              </button>
            </form>
          )}

          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Roll Number</th>
                    <th className="px-4 py-2.5 font-semibold">Full Name</th>
                    <th className="px-4 py-2.5 font-semibold">Room / Seat</th>
                    <th className="px-4 py-2.5 font-semibold">State</th>
                    <th className="px-4 py-2.5 font-semibold">Answered</th>
                    <th className="px-4 py-2.5 font-semibold">Extra Min</th>
                    <th className="px-4 py-2.5 font-semibold">Last Heartbeat</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {monitor.students.map((st) => (
                    <tr key={st.rollNumber} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-mono font-semibold">{st.rollNumber}</td>
                      <td className="px-4 py-2.5">{st.fullName}</td>
                      <td className="px-4 py-2.5">
                        {st.roomCode} {st.rowNumber ? `R${st.rowNumber}` : ''}{' '}
                        {st.seatNumber ? `S${st.seatNumber}` : ''}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge status={st.observedState} />
                      </td>
                      <td className="px-4 py-2.5 tabular-nums">{st.answeredCount}</td>
                      <td className="px-4 py-2.5 tabular-nums">+{st.totalExtraMinutes}m</td>
                      <td className="px-4 py-2.5">{formatInstant(st.lastHeartbeatAt)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => setResetRoll(st.rollNumber)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 font-semibold"
                        >
                          <RotateCcw className="w-3 h-3" /> Reset Login
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {monitor.recentGrants.length > 0 && (
            <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-2">
              <h3 className="text-xs font-bold text-slate-900">Recent Extra-Time Grants</h3>
              <div className="space-y-1 text-xs text-slate-600">
                {monitor.recentGrants.map((g, idx) => (
                  <div key={g.id ?? idx}>
                    +{g.extraMinutes}m →{' '}
                    <strong>{g.rollNumber || `Room ${g.roomCode || 'ALL'}`}</strong> ({g.reason}) ·{' '}
                    by {g.grantedBy} at {formatInstant(g.grantedAt)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Archive,
  BookOpen,
  CheckCircle2,
  DatabaseBackup,
  Download,
  FileSpreadsheet,
  HardDriveDownload,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Unlock,
  Upload,
  Users,
} from 'lucide-react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { StatusBadge } from '../../components/StatusBadge';
import { useAuth } from '../../hooks/useAuth';
import { qbankApi } from '../../services/qbankApi';
import type {
  AuditLogEntry,
  AuditVerificationResult,
  BackupInspection,
  HealthSnapshot,
  ResultsJsonResponse,
  SessionOverview,
  StoredObjectInfo,
  Subject,
  UserRole,
  UserView,
} from '../../types';
import { triggerBlobDownload } from '../../utils/exportUtils';
import { formatBytes, formatInstant } from '../../utils/qbankHelpers';

type AdminTab = 'users' | 'subjects' | 'health' | 'audit' | 'backups' | 'results';

export const AdminWorkspacePage: React.FC = () => {
  const { user: currentUser, authMode } = useAuth();
  const [tab, setTab] = useState<AdminTab>('users');
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  // Users
  const [users, setUsers] = useState<UserView[]>([]);
  const [newUsername, setNewUsername] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newRole, setNewRole] = useState<Exclude<UserRole, 'STUDENT'>>('HOD');
  const [newTempPassword, setNewTempPassword] = useState('');

  // Subjects
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subCode, setSubCode] = useState('');
  const [subName, setSubName] = useState('');
  const [subExpected, setSubExpected] = useState(120);
  const [subMarks, setSubMarks] = useState(1);

  // Health & Purge
  const [health, setHealth] = useState<HealthSnapshot | null>(null);
  const [retentionDays, setRetentionDays] = useState(365);
  const [purgeDialogOpen, setPurgeDialogOpen] = useState(false);

  // Audit
  const [auditEntries, setAuditEntries] = useState<AuditLogEntry[]>([]);
  const [auditLimit, setAuditLimit] = useState(50);
  const [auditEventFilter, setAuditEventFilter] = useState('');
  const [auditActorFilter, setAuditActorFilter] = useState('');
  const [auditVerify, setAuditVerify] = useState<AuditVerificationResult | null>(null);

  // Backups
  const [backups, setBackups] = useState<StoredObjectInfo[]>([]);
  const [backupTag, setBackupTag] = useState('manual');
  const [backupInspection, setBackupInspection] = useState<BackupInspection | null>(null);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);

  // Results
  const [sessions, setSessions] = useState<SessionOverview[]>([]);
  const [sessionIdInput, setSessionIdInput] = useState('');
  const [resultsData, setResultsData] = useState<ResultsJsonResponse | null>(null);

  const [busy, setBusy] = useState(false);

  const notify = (kind: 'ok' | 'err', msg: string) => setFlash({ kind, msg });

  const loadUsersAndSubjects = useCallback(async () => {
    try {
      const [uList, sList] = await Promise.all([
        authMode === 'standalone' ? qbankApi.admin.listUsers() : Promise.resolve([]),
        qbankApi.subjects.list(true),
      ]);
      setUsers(uList);
      setSubjects(sList);
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Failed to load users or subjects');
    }
  }, [authMode]);

  const loadHealth = useCallback(async () => {
    try {
      setHealth(await qbankApi.admin.health());
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Failed to load health snapshot');
    }
  }, []);

  const loadAudit = useCallback(async () => {
    try {
      setAuditEntries(
        await qbankApi.admin.listAudit({
          limit: auditLimit,
          eventType: auditEventFilter,
          actor: auditActorFilter,
        })
      );
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Failed to load audit log');
    }
  }, [auditActorFilter, auditEventFilter, auditLimit]);

  const loadBackups = useCallback(async () => {
    try {
      setBackups(await qbankApi.admin.listBackups());
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Failed to list backups');
    }
  }, []);

  const loadSessionsIfAllowed = useCallback(async () => {
    try {
      const list = await qbankApi.coe.listSessions();
      setSessions(list);
      if (list.length > 0 && !sessionIdInput) {
        setSessionIdInput(String(list[0].sessionId));
      }
    } catch {
      // Admin may not have COE list privilege depending on backend config; fallback to manual session ID input
    }
  }, [sessionIdInput]);

  useEffect(() => {
    void loadUsersAndSubjects();
  }, [loadUsersAndSubjects]);

  useEffect(() => {
    if (tab === 'health') void loadHealth();
    if (tab === 'audit') void loadAudit();
    if (tab === 'backups') void loadBackups();
    if (tab === 'results') void loadSessionsIfAllowed();
  }, [tab, loadAudit, loadBackups, loadHealth, loadSessionsIfAllowed]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const created = await qbankApi.admin.createUser({
        username: newUsername.trim(),
        displayName: newDisplayName.trim(),
        role: newRole,
        temporaryPassword: newTempPassword,
      });
      setNewUsername('');
      setNewDisplayName('');
      setNewTempPassword('');
      await loadUsersAndSubjects();
      notify('ok', `Created ${created.role} account "${created.username}".`);
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Unable to create user');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleUser = async (u: UserView, active: boolean, clearLockout: boolean) => {
    setBusy(true);
    try {
      await qbankApi.admin.updateUser(u.id, { active, clearLockout });
      await loadUsersAndSubjects();
      notify('ok', `Updated account "${u.username}".`);
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Unable to update account');
    } finally {
      setBusy(false);
    }
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
      setSubCode('');
      setSubName('');
      await loadUsersAndSubjects();
      notify('ok', `Created subject ${created.code} — ${created.name}.`);
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Unable to create subject');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleArchiveSubject = async (sub: Subject) => {
    setBusy(true);
    try {
      await qbankApi.subjects.update(sub.id, {
        name: sub.name,
        expectedQuestionsPerModule: sub.expectedQuestionsPerModule,
        marksPerQuestion: sub.marksPerQuestion,
        archived: !sub.archived,
      });
      await loadUsersAndSubjects();
      notify('ok', `${sub.archived ? 'Activated' : 'Archived'} subject ${sub.code}.`);
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Unable to update subject');
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyAudit = async () => {
    setBusy(true);
    try {
      const res = await qbankApi.admin.verifyAuditChain();
      setAuditVerify(res);
      notify(res.intact ? 'ok' : 'err', res.message);
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Audit verification failed');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const created = await qbankApi.admin.createBackup(backupTag.trim() || 'manual');
      await loadBackups();
      notify('ok', `Backup "${created.filename}" created (${formatBytes(created.sizeBytes)}).`);
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Backup creation failed');
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadBackup = async (key: string) => {
    try {
      const blob = await qbankApi.admin.downloadBackup(key);
      triggerBlobDownload(blob, key.split('/').pop() || key);
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Backup download failed');
    }
  };

  const handleInspectBackupFile = async (file: File) => {
    setRestoreFile(file);
    setBusy(true);
    try {
      const info = await qbankApi.admin.inspectBackup(file);
      setBackupInspection(info);
      notify('ok', `Verified encrypted backup (${info.dialect}, format v${info.formatVersion}).`);
    } catch (err) {
      setBackupInspection(null);
      notify('err', err instanceof Error ? err.message : 'Backup inspection failed');
    } finally {
      setBusy(false);
    }
  };

  const handleRestoreConfirmed = async () => {
    if (!restoreFile) return;
    setBusy(true);
    try {
      const info = await qbankApi.admin.restoreBackup(restoreFile, true);
      setBackupInspection(info);
      setRestoreDialogOpen(false);
      notify('ok', `Restored backup from ${formatInstant(info.createdAt)}.`);
      await loadUsersAndSubjects();
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Restore failed');
    } finally {
      setBusy(false);
    }
  };

  const handlePurgeConfirmed = async () => {
    setBusy(true);
    try {
      const res = await qbankApi.admin.purgeRetention(retentionDays);
      setPurgeDialogOpen(false);
      notify('ok', `Retention purge completed: ${JSON.stringify(res)}`);
      await loadHealth();
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Retention purge failed');
    } finally {
      setBusy(false);
    }
  };

  const handleLoadResults = async (e: React.FormEvent) => {
    e.preventDefault();
    const sid = Number(sessionIdInput);
    if (!sid) {
      notify('err', 'Enter a valid numeric Session ID');
      return;
    }
    setBusy(true);
    try {
      const res = await qbankApi.admin.getResults(sid);
      setResultsData(res);
      notify('ok', `Loaded ${res.results.length} candidate result(s) for Session #${sid}.`);
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Unable to load session results');
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadResults = async (kind: 'csv' | 'xlsx') => {
    const sid = Number(sessionIdInput);
    if (!sid) return;
    try {
      const blob =
        kind === 'csv'
          ? await qbankApi.admin.downloadResultsCsv(sid)
          : await qbankApi.admin.downloadResultsXlsx(sid);
      triggerBlobDownload(blob, `qbank-session-${sid}-results.${kind}`);
    } catch (err) {
      notify('err', err instanceof Error ? err.message : `Unable to download ${kind.toUpperCase()}`);
    }
  };

  const tabs: Array<{ id: AdminTab; label: string; icon: React.ReactNode }> = [
    { id: 'users', label: 'Staff & Users', icon: <Users className="w-4 h-4" /> },
    { id: 'subjects', label: 'Subjects', icon: <BookOpen className="w-4 h-4" /> },
    { id: 'results', label: 'Exam Results', icon: <FileSpreadsheet className="w-4 h-4" /> },
    { id: 'health', label: 'System Health', icon: <Activity className="w-4 h-4" /> },
    { id: 'audit', label: 'Audit Chain', icon: <ShieldCheck className="w-4 h-4" /> },
    { id: 'backups', label: 'Backups', icon: <DatabaseBackup className="w-4 h-4" /> },
  ];

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

      <div className="flex flex-wrap gap-2 bg-white p-2 rounded-lg border border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-semibold transition-colors ${
              tab === t.id
                ? 'bg-[#0F172A] text-white'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'users' && (
        <div className="space-y-5">
          {authMode !== 'standalone' ? (
            <div className="bg-white rounded-lg border border-amber-200 p-5 text-sm text-amber-900">
              User management is handled by the host portal when running in host auth mode.
            </div>
          ) : (
            <>
              <div className="bg-white rounded-lg border border-slate-200 p-5">
                <h2 className="text-base font-bold text-slate-900 mb-1">
                  Create Staff Account (HOD · COE · Invigilator · Admin)
                </h2>
                <p className="text-xs text-slate-500 mb-4">
                  Create role-specific accounts for Question Upload (HOD), Exam Generation &amp;
                  Student Roster (COE), and Room Monitoring (INVIGILATOR).
                </p>
                <form
                  onSubmit={handleCreateUser}
                  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end"
                >
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Username
                    </label>
                    <input
                      type="text"
                      required
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      placeholder="hod_cs"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Full Name
                    </label>
                    <input
                      type="text"
                      required
                      value={newDisplayName}
                      onChange={(e) => setNewDisplayName(e.target.value)}
                      placeholder="HOD Computer Science"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Role</label>
                    <select
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value as Exclude<UserRole, 'STUDENT'>)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
                    >
                      <option value="HOD">HOD</option>
                      <option value="COE">COE</option>
                      <option value="INVIGILATOR">INVIGILATOR</option>
                      <option value="ADMIN">ADMIN</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Temporary Password
                    </label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={newTempPassword}
                      onChange={(e) => setNewTempPassword(e.target.value)}
                      placeholder="Min 8 chars"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={busy}
                    className="py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-md disabled:opacity-50"
                  >
                    Create User
                  </button>
                </form>
              </div>

              <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900">
                    Registered Staff ({users.length})
                  </h3>
                  <button
                    type="button"
                    onClick={() => void loadUsersAndSubjects()}
                    className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Refresh
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                      <tr>
                        <th className="px-4 py-2.5 font-semibold">Username</th>
                        <th className="px-4 py-2.5 font-semibold">Display Name</th>
                        <th className="px-4 py-2.5 font-semibold">Role</th>
                        <th className="px-4 py-2.5 font-semibold">Status</th>
                        <th className="px-4 py-2.5 font-semibold">Security</th>
                        <th className="px-4 py-2.5 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {users.map((u) => {
                        const isLocked =
                          Boolean(u.lockedUntil) && new Date(u.lockedUntil!).getTime() > Date.now();
                        return (
                          <tr key={u.id} className="hover:bg-slate-50">
                            <td className="px-4 py-2.5 font-mono font-semibold text-slate-900">
                              {u.username}
                            </td>
                            <td className="px-4 py-2.5">{u.displayName}</td>
                            <td className="px-4 py-2.5">
                              <StatusBadge status={u.role} />
                            </td>
                            <td className="px-4 py-2.5">
                              <StatusBadge status={u.active ? 'ACTIVE' : 'DISABLED'} />
                            </td>
                            <td className="px-4 py-2.5 text-slate-600">
                              {isLocked ? 'Locked ' : ''}
                              {u.mustChangePassword ? 'Temp Password Pending' : 'Standard'}
                              {u.failedLoginAttempts > 0 ? ` (${u.failedLoginAttempts} fails)` : ''}
                            </td>
                            <td className="px-4 py-2.5 text-right space-x-2">
                              {currentUser?.username !== u.username && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void handleToggleUser(u, !u.active, true)}
                                  className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 font-semibold"
                                >
                                  {u.active ? 'Disable' : 'Activate'}
                                </button>
                              )}
                              {(u.failedLoginAttempts > 0 || isLocked) && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void handleToggleUser(u, u.active, true)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 font-semibold"
                                >
                                  <Unlock className="w-3 h-3" /> Unlock
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'subjects' && (
        <div className="space-y-5">
          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <h2 className="text-base font-bold text-slate-900 mb-3">Create Subject</h2>
            <form
              onSubmit={handleCreateSubject}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end"
            >
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
              <div className="lg:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Subject Name
                </label>
                <input
                  type="text"
                  required
                  value={subName}
                  onChange={(e) => setSubName(e.target.value)}
                  placeholder="Data Structures & Algorithms"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Expected / Module
                </label>
                <input
                  type="number"
                  min={1}
                  value={subExpected}
                  onChange={(e) => setSubExpected(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                />
              </div>
              <div className="flex gap-2 items-end">
                <div className="w-24">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Marks/Q</label>
                  <input
                    type="number"
                    min={1}
                    value={subMarks}
                    onChange={(e) => setSubMarks(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="flex-1 py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-md disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            </form>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-900">Subjects ({subjects.length})</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Code</th>
                    <th className="px-4 py-2.5 font-semibold">Name</th>
                    <th className="px-4 py-2.5 font-semibold">Expected / Module</th>
                    <th className="px-4 py-2.5 font-semibold">Marks / Q</th>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {subjects.map((sub) => (
                    <tr key={sub.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-mono font-semibold">{sub.code}</td>
                      <td className="px-4 py-2.5">{sub.name}</td>
                      <td className="px-4 py-2.5 tabular-nums">{sub.expectedQuestionsPerModule}</td>
                      <td className="px-4 py-2.5 tabular-nums">{sub.marksPerQuestion}</td>
                      <td className="px-4 py-2.5">
                        <StatusBadge status={sub.archived ? 'ARCHIVED' : 'ACTIVE'} />
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleToggleArchiveSubject(sub)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 font-semibold"
                        >
                          <Archive className="w-3 h-3" />
                          {sub.archived ? 'Activate' : 'Archive'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'results' && (
        <div className="space-y-5">
          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <h2 className="text-base font-bold text-slate-900 mb-3">
              Session Results &amp; Signed Exports
            </h2>
            <form onSubmit={handleLoadResults} className="flex flex-wrap gap-3 items-end">
              {sessions.length > 0 ? (
                <div className="min-w-[260px]">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Select Session
                  </label>
                  <select
                    value={sessionIdInput}
                    onChange={(e) => setSessionIdInput(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
                  >
                    {sessions.map((s) => (
                      <option key={s.sessionId} value={String(s.sessionId)}>
                        #{s.sessionId} · {s.subjectCode} — {s.title} [{s.slot}] ({s.status})
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div className="w-40">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Session ID
                </label>
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
              <button
                type="submit"
                disabled={busy}
                className="py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-md disabled:opacity-50"
              >
                Load Results
              </button>
              <button
                type="button"
                disabled={!sessionIdInput}
                onClick={() => void handleDownloadResults('csv')}
                className="inline-flex items-center gap-1.5 py-2 px-3 border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold rounded-md"
              >
                <Download className="w-3.5 h-3.5" /> CSV
              </button>
              <button
                type="button"
                disabled={!sessionIdInput}
                onClick={() => void handleDownloadResults('xlsx')}
                className="inline-flex items-center gap-1.5 py-2 px-3 border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold rounded-md"
              >
                <Download className="w-3.5 h-3.5" /> XLSX
              </button>
            </form>
          </div>

          {resultsData && (
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-900">
                    {resultsData.subjectCode} — {resultsData.title} [{resultsData.slot}] (Session #
                    {resultsData.sessionId})
                  </h3>
                  <span className="text-xs text-slate-500">
                    {resultsData.results.length} candidate(s)
                  </span>
                </div>
                <p className="text-[11px] font-mono text-slate-500 break-all">
                  CSV SHA-256: {resultsData.csvSha256} · XLSX SHA-256: {resultsData.xlsxSha256}
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">Roll Number</th>
                      <th className="px-4 py-2.5 font-semibold">Full Name</th>
                      <th className="px-4 py-2.5 font-semibold">Room</th>
                      <th className="px-4 py-2.5 font-semibold">Version</th>
                      <th className="px-4 py-2.5 font-semibold">Correct / Total</th>
                      <th className="px-4 py-2.5 font-semibold">Wrong / Unans.</th>
                      <th className="px-4 py-2.5 font-semibold">Marks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {resultsData.results.map((r) => (
                      <tr key={r.rollNumber} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-mono font-semibold">{r.rollNumber}</td>
                        <td className="px-4 py-2.5">{r.fullName}</td>
                        <td className="px-4 py-2.5">{r.roomCode}</td>
                        <td className="px-4 py-2.5 font-mono">{r.assignedVersion}</td>
                        <td className="px-4 py-2.5 tabular-nums">
                          {r.correctCount} / {r.totalQuestions}
                        </td>
                        <td className="px-4 py-2.5 tabular-nums">
                          {r.wrongCount} / {r.unansweredCount}
                        </td>
                        <td className="px-4 py-2.5 font-semibold tabular-nums">
                          {r.marksAwarded} / {r.maxMarks}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'health' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">QBank System Health &amp; Retention</h2>
            <button
              type="button"
              onClick={() => void loadHealth()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-300 bg-white text-xs font-semibold hover:bg-slate-50"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>

          {health && (
            <>
              {health.alerts.length > 0 && (
                <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 space-y-1">
                  <div className="text-xs font-bold text-amber-900">Active Alerts</div>
                  {health.alerts.map((a, idx) => (
                    <div key={idx} className="text-xs text-amber-800">
                      • {a}
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white p-4 rounded-lg border border-slate-200">
                  <div className="text-xs text-slate-500">Database Status</div>
                  <div className="mt-1 flex items-center gap-2">
                    <StatusBadge status={health.dbStatus} />
                    <span className="text-xs font-mono text-slate-600">{health.dbLatencyMs} ms</span>
                  </div>
                </div>
                <div className="bg-white p-4 rounded-lg border border-slate-200">
                  <div className="text-xs text-slate-500">Sessions (Live / Frozen)</div>
                  <div className="mt-1 text-lg font-bold tabular-nums">
                    {health.liveSessionCount} / {health.frozenSessionCount}
                  </div>
                </div>
                <div className="bg-white p-4 rounded-lg border border-slate-200">
                  <div className="text-xs text-slate-500">Registered Students</div>
                  <div className="mt-1 text-lg font-bold tabular-nums">
                    {health.totalRegisteredStudents}
                  </div>
                </div>
                <div className="bg-white p-4 rounded-lg border border-slate-200">
                  <div className="text-xs text-slate-500">Disk Free / Backups</div>
                  <div className="mt-1 text-lg font-bold tabular-nums">
                    {health.diskFreeMb} MB · {health.backupCount}
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg border border-slate-200 p-5 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Data Retention Purge (`/admin/retention/purge`)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Checked at {formatInstant(health.checkedAt)} · Server errors:{' '}
                    {health.serverErrorsCount}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    value={retentionDays}
                    onChange={(e) => setRetentionDays(Number(e.target.value))}
                    className="w-24 px-3 py-1.5 text-sm border border-slate-300 rounded-md"
                  />
                  <span className="text-xs text-slate-600">days</span>
                  <button
                    type="button"
                    onClick={() => setPurgeDialogOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-700 hover:bg-red-800 text-white text-xs font-semibold"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Purge Old Responses
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'audit' && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-slate-200 p-4 flex flex-wrap gap-3 items-end justify-between">
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Limit</label>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={auditLimit}
                  onChange={(e) => setAuditLimit(Number(e.target.value) || 50)}
                  className="w-20 px-2.5 py-1.5 text-sm border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Event Type</label>
                <input
                  type="text"
                  value={auditEventFilter}
                  onChange={(e) => setAuditEventFilter(e.target.value)}
                  placeholder="Optional"
                  className="w-40 px-2.5 py-1.5 text-sm border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Actor</label>
                <input
                  type="text"
                  value={auditActorFilter}
                  onChange={(e) => setAuditActorFilter(e.target.value)}
                  placeholder="Username"
                  className="w-36 px-2.5 py-1.5 text-sm border border-slate-300 rounded-md"
                />
              </div>
              <button
                type="button"
                onClick={() => void loadAudit()}
                className="px-3.5 py-2 bg-[#0F172A] text-white text-xs font-semibold rounded-md hover:bg-slate-800"
              >
                Filter
              </button>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleVerifyAudit()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 text-white text-xs font-semibold rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Verify Hash Chain
            </button>
          </div>

          {auditVerify && (
            <div
              className={`p-3 rounded-lg border text-xs ${
                auditVerify.intact
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-red-50 border-red-200 text-red-900'
              }`}
            >
              <span className="font-bold">{auditVerify.intact ? 'INTACT' : 'BROKEN'}</span> ·
              Checked {auditVerify.totalChecked} entries · {auditVerify.message}
            </div>
          )}

          <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">Seq</th>
                  <th className="px-3 py-2.5 font-semibold">Time</th>
                  <th className="px-3 py-2.5 font-semibold">Actor</th>
                  <th className="px-3 py-2.5 font-semibold">Event</th>
                  <th className="px-3 py-2.5 font-semibold">Entity</th>
                  <th className="px-3 py-2.5 font-semibold">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditEntries.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono">{a.seqNo}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatInstant(a.createdAt)}</td>
                    <td className="px-3 py-2 font-semibold">
                      {a.actorUsername} ({a.actorRole})
                    </td>
                    <td className="px-3 py-2 font-mono">{a.eventType}</td>
                    <td className="px-3 py-2">
                      {a.entityType}:{a.entityId}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] max-w-md truncate">
                      {a.detailsJson}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'backups' && (
        <div className="space-y-5">
          <div className="bg-white rounded-lg border border-slate-200 p-5 flex flex-wrap gap-3 items-end justify-between">
            <form onSubmit={handleCreateBackup} className="flex gap-2 items-end">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Backup Tag
                </label>
                <input
                  type="text"
                  value={backupTag}
                  onChange={(e) => setBackupTag(e.target.value)}
                  className="w-44 px-3 py-2 text-sm border border-slate-300 rounded-md"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-1.5 py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-md"
              >
                <HardDriveDownload className="w-3.5 h-3.5" /> Create Encrypted Backup
              </button>
            </form>

            <label className="inline-flex items-center gap-1.5 py-2 px-3 border border-slate-300 rounded-md bg-white hover:bg-slate-50 text-xs font-semibold cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              Inspect / Restore `.enc` File
              <input
                type="file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleInspectBackupFile(f);
                }}
              />
            </label>
          </div>

          {backupInspection && (
            <div className="bg-white rounded-lg border border-blue-200 p-4 space-y-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-bold text-slate-900">
                  Inspected Backup ({backupInspection.dialect} · v{backupInspection.formatVersion} ·{' '}
                  {formatInstant(backupInspection.createdAt)})
                </div>
                {restoreFile && (
                  <button
                    type="button"
                    onClick={() => setRestoreDialogOpen(true)}
                    className="px-3 py-1.5 rounded bg-red-700 hover:bg-red-800 text-white font-semibold"
                  >
                    Restore Database from Backup
                  </button>
                )}
              </div>
              <div className="font-mono text-[11px] text-slate-600">
                SHA-256: {backupInspection.payloadSha256}
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(backupInspection.rowCounts || {}).map(([tbl, count]) => (
                  <span key={tbl} className="px-2 py-0.5 rounded bg-slate-100 font-mono">
                    {tbl}: {count}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Backup Key</th>
                  <th className="px-4 py-2.5 font-semibold">Size</th>
                  <th className="px-4 py-2.5 font-semibold">Created At</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {backups.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                      No backups stored in container yet.
                    </td>
                  </tr>
                ) : (
                  backups.map((b) => (
                    <tr key={b.key} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-mono">{b.key}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatBytes(b.sizeBytes)}</td>
                      <td className="px-4 py-2.5">{formatInstant(b.modifiedAt)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => void handleDownloadBackup(b.key)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 font-semibold"
                        >
                          <Download className="w-3 h-3" /> Download
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={purgeDialogOpen}
        title="Confirm Retention Purge"
        description={`Delete expired student response records older than ${retentionDays} day(s)?`}
        consequenceNote="This action permanently deletes old candidate response rows according to your QBank retention policy."
        confirmLabel="Purge Responses"
        variant="destructive"
        isLoading={busy}
        onConfirm={() => void handlePurgeConfirmed()}
        onCancel={() => setPurgeDialogOpen(false)}
      />

      <ConfirmDialog
        isOpen={restoreDialogOpen}
        title="Restore Encrypted Database Backup"
        description={`Restore QBank database from ${restoreFile?.name || 'selected backup'}?`}
        consequenceNote="Restoring replaces current QBank tables with the inspected backup snapshot."
        confirmLabel="Confirm Restore"
        variant="destructive"
        isLoading={busy}
        onConfirm={() => void handleRestoreConfirmed()}
        onCancel={() => setRestoreDialogOpen(false)}
      />
    </div>
  );
};

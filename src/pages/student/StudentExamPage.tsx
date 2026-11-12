import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Calendar,
  CheckCircle2,
  KeyRound,
  LogOut,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { getMockDb } from '../../data/mockDatabase';
import {
  getStudentExamView,
  loginStudent,
  logoutStudentSession,
  StudentExamPayload,
} from '../../services/studentExamAuthService';

const STUDENT_TOKEN_KEY = 'mit_mysore_student_exam_token_v1';

export const StudentExamPage: React.FC = () => {
  const settings = getMockDb().directorySettings;
  const [usn, setUsn] = useState('');
  const [dob, setDob] = useState('');
  const [sessionCode, setSessionCode] = useState('');
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string>>({});
  const [errorMsg, setErrorMsg] = useState('');

  const [sessionToken, setSessionToken] = useState<string>(() => {
    try {
      return sessionStorage.getItem(STUDENT_TOKEN_KEY) || '';
    } catch {
      return '';
    }
  });

  const [examView, setExamView] = useState<StudentExamPayload | null>(() => {
    try {
      const saved = sessionStorage.getItem(STUDENT_TOKEN_KEY);
      return saved ? getStudentExamView(saved) : null;
    } catch {
      return null;
    }
  });

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    try {
      const auth = loginStudent({
        usn,
        dob,
        sessionCode,
      });
      const payload = getStudentExamView(auth.token);
      try {
        sessionStorage.setItem(STUDENT_TOKEN_KEY, auth.token);
      } catch {
        // Ignore storage error
      }
      setSessionToken(auth.token);
      setExamView(payload);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Details not found');
    }
  };

  const handleLogout = () => {
    if (sessionToken) {
      logoutStudentSession(sessionToken);
    }
    try {
      sessionStorage.removeItem(STUDENT_TOKEN_KEY);
    } catch {
      // Ignore
    }
    setSessionToken('');
    setExamView(null);
    setSelectedAnswers({});
  };

  return (
    <div className="min-h-screen bg-[#F5F7FB] text-[#1F2937]">
      <header className="bg-[#17243A] text-white px-6 py-4 flex items-center justify-between border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-[#2563EB] flex items-center justify-center font-bold text-sm">
            MIT
          </div>
          <div>
            <div className="text-sm font-bold">MIT Mysore · Offline Examination Student Portal</div>
            <div className="text-[11px] text-slate-300">
              Student Identity Verification & Assigned Exam Paper Delivery
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/admin/login"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-200 hover:text-white"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Staff Admin Portal</span>
          </Link>
          {examView && (
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-md"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>End Session</span>
            </button>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6">
        {!examView ? (
          <div className="max-w-md mx-auto mt-10 bg-white rounded-lg border border-[#D9E2EF] shadow-sm overflow-hidden">
            <div className="px-6 py-5 bg-[#17243A] text-white">
              <div className="flex items-center gap-2 text-xs font-semibold text-blue-300 mb-1">
                <ShieldCheck className="w-4 h-4" />
                <span>Authenticated Student Exam Login</span>
              </div>
              <h1 className="text-lg font-bold">Enter Examination Session</h1>
              <p className="text-xs text-slate-300 mt-1">
                Sign in with your USN, Date of Birth, and the Invigilator Session Code.
              </p>
            </div>

            <form onSubmit={handleLogin} className="p-6 space-y-4">
              {errorMsg && (
                <div className="p-3 rounded-md bg-red-50 border border-[#B42318]/30 text-xs font-semibold text-[#B42318] flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#1F2937] mb-1">
                  University Seat Number (USN)
                </label>
                <input
                  type="text"
                  required
                  value={usn}
                  onChange={(e) => setUsn(e.target.value.toUpperCase())}
                  placeholder="e.g., 4MH24CS001"
                  className="w-full px-3 py-2 text-sm font-mono uppercase border border-[#D9E2EF] rounded-md"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1F2937] mb-1 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-[#2563EB]" />
                  <span>Date of Birth (Picker Only)</span>
                </label>
                <input
                  type="date"
                  required
                  value={dob}
                  onKeyDown={(e) => e.preventDefault()}
                  onChange={(e) => setDob(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-[#D9E2EF] rounded-md bg-white"
                />
              </div>

              {settings?.sessionAccessCodeEnabled && (
                <div>
                  <label className="block text-xs font-semibold text-[#1F2937] mb-1 flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-[#6D5CE8]" />
                    <span>Session Access Code</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={sessionCode}
                    onChange={(e) => setSessionCode(e.target.value)}
                    placeholder="Ask invigilator for session code"
                    className="w-full px-3 py-2 text-sm font-mono border border-[#D9E2EF] rounded-md"
                  />
                </div>
              )}

              <button
                type="submit"
                className="w-full py-2.5 text-sm font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-md transition-colors cursor-pointer"
              >
                Verify & Launch My Exam
              </button>
            </form>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="bg-white rounded-lg border border-[#D9E2EF] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#16834A]">
                  <UserCheck className="w-4 h-4" />
                  <span>
                    {examView.student.usn} · {examView.student.studentName}
                  </span>
                </div>
                <h1 className="text-xl font-bold text-[#17243A]">
                  {examView.exam.subjectCode} — {examView.exam.subjectName}
                </h1>
                <p className="text-xs text-[#64748B]">
                  {examView.exam.examCycleName} · {examView.exam.examDate} · {examView.exam.sessionTime} · Room{' '}
                  {examView.roomCode} Seat #{examView.seatOrder}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="px-4 py-2 rounded-md bg-[#17243A] text-white text-center">
                  <div className="text-[10px] uppercase tracking-wider text-slate-300">Paper Set</div>
                  <div className="text-lg font-mono font-bold">Version {examView.assignedVersion}</div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {examView.questions.map((q) => (
                <div
                  key={q.questionId}
                  className="bg-white rounded-lg border border-[#D9E2EF] p-5 space-y-3"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-bold text-[#2563EB] flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>Question {q.orderNumber}</span>
                    </span>
                    {selectedAnswers[q.orderNumber] && (
                      <span className="inline-flex items-center gap-1 text-[#16834A] font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Selected {selectedAnswers[q.orderNumber]}</span>
                      </span>
                    )}
                  </div>

                  {q.imageDataUrl && (
                    <div className="bg-[#F5F7FB] border border-[#D9E2EF] rounded-md p-3 flex justify-start">
                      <img
                        src={q.imageDataUrl}
                        alt={`Question ${q.orderNumber} diagram`}
                        className="max-h-72 max-w-full w-auto h-auto object-contain"
                      />
                    </div>
                  )}

                  <div className="text-sm font-semibold text-[#17243A] leading-relaxed">
                    {q.questionText}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {(
                      [
                        ['A', q.optionA],
                        ['B', q.optionB],
                        ['C', q.optionC],
                        ['D', q.optionD],
                      ] as const
                    ).map(([letter, text]) => {
                      const active = selectedAnswers[q.orderNumber] === letter;
                      return (
                        <button
                          key={letter}
                          type="button"
                          onClick={() =>
                            setSelectedAnswers((prev) => ({
                              ...prev,
                              [q.orderNumber]: letter,
                            }))
                          }
                          className={`text-left p-3 rounded-md border text-xs transition-colors ${
                            active
                              ? 'bg-[#2563EB]/10 border-[#2563EB] text-[#17243A] font-semibold'
                              : 'bg-white border-[#D9E2EF] text-[#1F2937] hover:bg-slate-50'
                          }`}
                        >
                          <strong className="font-mono mr-1.5">{letter}.</strong>
                          {text}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

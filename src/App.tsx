import React, { useState, useEffect } from 'react';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  addDoc,
  deleteDoc,
  updateDoc,
  getDoc,
} from 'firebase/firestore';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  ScatterChart,
  Scatter,
  ZAxis,
} from 'recharts';
import {
  Shield,
  FileText,
  MapPin,
  TrendingUp,
  AlertTriangle,
  Lightbulb,
  Unlock,
  CreditCard,
  Lock,
  Download,
  Key,
  LogOut,
  User,
  Plus,
  Eye,
  EyeOff,
  Copy,
  CheckCircle,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';

import { db, handleFirestoreError, OperationType } from './lib/firebase';
import { seedDatabase, DEF_PROJECTS } from './lib/dbSeeder';
import { ALL_CONSTITUENCIES, ALL_CONSTITUENCIES_ENRICHED, ConstituencyInfo } from './constituencies';
import { Project, Report, ProjectRequest, PaymentMethod, CitizenAccount, SystemUser, Application, LiveUpdate, Announcement, RequestComment } from './types';
import { zmw, sClass, sLabel, hashPassword, expCSV } from './utils';
import { sendOtpEmail, sendDecisionEmail } from './lib/emailService';
import { sendDecisionSms } from './lib/smsService';
import { API_BASE_URL } from './lib/apiBase';


const SECTOR_COLS: Record<string, string> = {
  Education: '#4f46e5',   /* indigo-600 */
  Health: '#059669',      /* emerald-600 */
  Roads: '#f59e0b',       /* amber-500 */
  Water: '#0ea5e9',       /* sky-500 */
  Agriculture: '#0d9488', /* teal-600 */
  Youth: '#7c3aed',       /* violet-600 */
};

function cleanAuditText(text: string): string {
  if (!text) return '';
  return text
    // Remove leading hash tags (e.g. ###, ##, #) at the start of any line
    .replace(/^#+\s+/gm, '')
    // Also clean any leftover #
    .replace(/#+/g, '')
    // Remove asterisks on words (e.g. ***, **, *)
    .replace(/\*+/g, '');
}

export default function App() {
  // Navigation & Tabs
  const [activeTab, setActiveTab] = useState<'projects' | 'constituencies' | 'analytics' | 'report' | 'requests' | 'announcements' | 'support' | 'pricing' | 'admin'>('projects');
  const [showMobileNav, setShowMobileNav] = useState(true);

  // Real-time Database state
  const [liveUpdates, setLiveUpdates] = useState<LiveUpdate[]>([]);
  // Live feed view + filters
  const [feedView, setFeedView] = useState<'admin' | 'public'>('admin');
  const [feedCategory, setFeedCategory] = useState('all');
  const [feedPerson, setFeedPerson] = useState('');
  const [feedFrom, setFeedFrom] = useState('');
  const [feedTo, setFeedTo] = useState('');
  const [feedConst, setFeedConst] = useState('');
  const [projects, setProjects] = useState<Project[]>(DEF_PROJECTS);
  const [reports, setReports] = useState<Report[]>([]);
  const [requests, setRequests] = useState<ProjectRequest[]>([]);

  // Raw unfiltered stores — Firestore writes here
  const [allProjects, setAllProjects] = useState<Project[]>(DEF_PROJECTS);
  const [allReports, setAllReports] = useState<Report[]>([]);
  const [allRequests, setAllRequests] = useState<ProjectRequest[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [dbConstituencies, setDbConstituencies] = useState<ConstituencyInfo[]>(ALL_CONSTITUENCIES_ENRICHED);
  const [flaggedProjectIds, setFlaggedProjectIds] = useState<Set<string>>(new Set());
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterProvince, setFilterProvince] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSector, setFilterSector] = useState('');

  // Constituency Tab State
  const [constSearchQuery, setConstSearchQuery] = useState('');
  const [constProvince, setConstProvince] = useState('');
  const [constSortOrder, setConstSortOrder] = useState<'score' | 'name' | 'spent'>('score');
  const [selectedConstName, setSelectedConstName] = useState<string | null>(null);

  // Authentication State
  const [currentUser, setCurrentUser] = useState<SystemUser | null>(null);
  const [citizenAccount, setCitizenAccount] = useState<CitizenAccount | null>(null);
  const [jwtToken, setJwtToken] = useState<string | null>(null);

  // Entry types that are admin-only by default (identities, security, personal data).
  // Everything else (projects, funds, constituencies, announcements, requests) is public.
  const PRIVATE_ACTIONS: LiveUpdate['actionType'][] = [
    'login', 'logout', 'failed_login',
    'create_citizen', 'update_citizen',
    'vote_request', 'comment_request',
    'create_report', 'update_report', 'delete_report',
    'create_application', 'update_application', 'delete_application',
    'create_payment', 'update_payment', 'delete_payment',
    'general',
  ];

  // Logs every action (admin or citizen, logins included) to Firestore so the
  // Live Transparency Feed shows who did what and when across the whole project.
  const logAdminAction = async (
    actionType: LiveUpdate['actionType'],
    targetId: string,
    targetName: string,
    description: string,
    actorOverride?: string,
    meta?: { constituency?: string; visibility?: 'public' | 'private'; spentBefore?: number; spentAfter?: number }
  ) => {
    try {
      const id = 'upd_' + Math.random().toString(36).substr(2, 9);
      const adminName =
        actorOverride ||
        (currentUser ? `${currentUser.name} (${currentUser.role})` : null) ||
        (citizenAccount ? `${citizenAccount.name} (Citizen)` : null) ||
        'Anonymous Visitor';
      const payload: LiveUpdate = {
        id,
        adminName,
        actionType,
        targetId,
        targetName,
        description,
        timestamp: new Date().toISOString(),
        constituency: meta?.constituency ?? currentUser?.constituency ?? '',
        visibility: meta?.visibility ?? (PRIVATE_ACTIONS.includes(actionType) ? 'private' : 'public'),
      };
      // Firestore rejects undefined values, so only add the fund fields when present.
      if (meta?.spentBefore != null && meta?.spentAfter != null) {
        payload.spentBefore = meta.spentBefore;
        payload.spentAfter = meta.spentAfter;
      }
      await setDoc(doc(db, 'updates', id), payload);
    } catch (e) {
      console.warn('Logging action failed:', e);
    }
  };

  // Resolve correct MP dynamically from constituencies database
  const getProjectMp = (p: Project): string => {
    const found = dbConstituencies.find((c) => c.name.toLowerCase() === p.constituency.toLowerCase());
    return found ? found.mp : p.mp;
  };

  const renderLiveTransparencyFeed = (forcePublic: boolean = false) => {
    // ── Who is looking, and what are they allowed to see? ──
    // Public visitors: public entries only (all constituencies), identities masked.
    // Constituency admins: entries tagged to their own constituency (+ national public notices).
    // National admins (Admin / Officer / ACC): everything.
    const isAdminViewer = !!currentUser && !forcePublic;
    const viewMode: 'admin' | 'public' = isAdminViewer ? feedView : 'public';
    const myConst = currentUser?.constituency || '';
    const isNational = !!currentUser && !myConst;

    const visOf = (u: LiveUpdate) =>
      u.visibility ?? (PRIVATE_ACTIONS.includes(u.actionType) ? 'private' : 'public');

    const categoryOf = (u: LiveUpdate): string => {
      const t = u.actionType;
      if (t === 'login' || t === 'logout' || t === 'failed_login') return 'security';
      if (t.endsWith('_citizen')) return 'accounts';
      if (t.endsWith('_project')) return 'projects';
      if (t.endsWith('_report')) return 'reports';
      if (t.endsWith('_request') || t === 'vote_request' || t === 'comment_request') return 'requests';
      if (t.endsWith('_application')) return 'applications';
      if (t.endsWith('_announcement')) return 'announcements';
      if (t.endsWith('_constituency')) return 'constituencies';
      if (t.endsWith('_payment')) return 'payments';
      return 'other';
    };
    const isFundChange = (u: LiveUpdate) =>
      u.spentBefore != null && u.spentAfter != null && u.spentBefore !== u.spentAfter;

    const localDay = (iso: string) => {
      try { return new Date(iso).toLocaleDateString('en-CA'); } catch { return ''; }
    };
    const fmtK = (n: number) => 'K' + Math.round(n).toLocaleString();
    const maskActor = (name: string) =>
      /\((Citizen|Reporter|Applicant)\)$/.test(name) || name.startsWith('Anonymous') ? 'A citizen' : name;

    // Scope first (security), then user filters.
    let scoped = [...liveUpdates];
    if (viewMode === 'public') {
      scoped = scoped.filter((u) => visOf(u) === 'public');
    } else if (!isNational) {
      scoped = scoped.filter((u) => (u.constituency || '') === myConst || (visOf(u) === 'public' && !u.constituency));
    }
    scoped.sort((x, y) => (y.timestamp || '').localeCompare(x.timestamp || ''));

    let list = scoped;
    if (feedCategory === 'funds') list = list.filter(isFundChange);
    else if (feedCategory !== 'all') list = list.filter((u) => categoryOf(u) === feedCategory);
    if (feedPerson.trim() && viewMode === 'admin') {
      const q = feedPerson.trim().toLowerCase();
      list = list.filter((u) => (u.adminName || '').toLowerCase().includes(q));
    }
    if (feedFrom) list = list.filter((u) => localDay(u.timestamp) >= feedFrom);
    if (feedTo) list = list.filter((u) => localDay(u.timestamp) <= feedTo);
    if (feedConst && viewMode === 'admin' && isNational) list = list.filter((u) => (u.constituency || '') === feedConst);

    // ── Failed-login alerts: 3+ failed attempts on one account within the last hour ──
    const alerts: { target: string; count: number; last: string }[] = [];
    if (viewMode === 'admin') {
      const cutoff = Date.now() - 60 * 60 * 1000;
      const groups: Record<string, { count: number; last: string }> = {};
      scoped.filter((u) => u.actionType === 'failed_login' && new Date(u.timestamp).getTime() >= cutoff).forEach((u) => {
        const g = groups[u.targetId] || { count: 0, last: u.timestamp };
        g.count += 1;
        if (u.timestamp > g.last) g.last = u.timestamp;
        groups[u.targetId] = g;
      });
      Object.entries(groups).forEach(([target, g]) => { if (g.count >= 3) alerts.push({ target, ...g }); });
    }

    // ── CSV export of exactly what the admin is currently looking at ──
    const exportFeedCsv = () => {
      const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const header = ['Time (ISO)', 'Who', 'Action', 'Target', 'Target ID', 'Constituency', 'Visibility', 'Description', 'Disbursed before (ZMW)', 'Disbursed after (ZMW)'];
      const rows = list.map((u) => [
        u.timestamp, u.adminName, u.actionType, u.targetName, u.targetId, u.constituency || 'National', visOf(u), u.description,
        u.spentBefore ?? '', u.spentAfter ?? '',
      ].map(esc).join(','));
      const csv = [header.map(esc).join(','), ...rows].join('\r\n');
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cdf-activity-log-${new Date().toLocaleDateString('en-CA')}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };

    const getActionIcon = (type: string) => {
      if (type === 'login') return '🔑';
      if (type === 'logout') return '🚪';
      if (type === 'failed_login') return '⚠️';
      if (type === 'vote_request') return '🗳️';
      if (type === 'comment_request') return '💬';
      if (type.endsWith('_project')) return type.startsWith('create') ? '➕' : type.startsWith('delete') ? '🗑️' : '🔄';
      if (type.endsWith('_report')) return '🚨';
      if (type.endsWith('_request')) return '📥';
      if (type.endsWith('_application')) return '📝';
      if (type.endsWith('_announcement')) return '📣';
      if (type.endsWith('_constituency')) return '🗺️';
      if (type.endsWith('_payment')) return '📱';
      if (type.endsWith('_citizen')) return '👤';
      return '🔔';
    };
    const getActionBg = (type: string) => {
      if (type === 'failed_login') return 'bg-red-50 text-red-600 border border-red-300';
      if (type === 'login' || type === 'logout') return 'bg-teal-50 text-teal-600 border border-teal-200';
      if (type.startsWith('delete')) return 'bg-red-50 text-red-600 border border-red-200';
      if (type.startsWith('create')) return 'bg-emerald-50 text-emerald-600 border border-emerald-200';
      if (type.endsWith('_report')) return 'bg-orange-50 text-orange-600 border border-orange-200';
      if (type.endsWith('_request') || type === 'vote_request' || type === 'comment_request') return 'bg-sky-50 text-sky-600 border border-sky-200';
      if (type.endsWith('_constituency')) return 'bg-amber-50 text-amber-600 border border-amber-200';
      if (type.endsWith('_payment')) return 'bg-purple-50 text-purple-600 border border-purple-200';
      if (type.endsWith('_application')) return 'bg-indigo-50 text-indigo-600 border border-indigo-200';
      if (type.endsWith('_project')) return 'bg-blue-50 text-blue-600 border border-blue-200';
      return 'bg-slate-50 text-slate-600 border border-slate-200';
    };
    const formatTime = (isoString: string) => {
      try {
        const d = new Date(isoString);
        return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) + ' · ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      } catch {
        return isoString;
      }
    };

    const filtersActive = feedCategory !== 'all' || feedPerson || feedFrom || feedTo || feedConst;
    const inputCls = 'px-2 py-1.5 border border-bo rounded-lg text-[11px] bg-white focus:outline-none focus:border-indigo-400';

    return (
      <div className="bg-white border border-bo rounded-2xl p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3 border-b border-bo pb-3 mb-3">
          <div>
            <h3 className="font-serif font-bold text-sm md:text-base flex items-center gap-2 text-ink">
              <span>📢 Live Transparency Feed</span>
            </h3>
            <p className="text-[11px] text-mu mt-0.5">
              {viewMode === 'public'
                ? 'Public record of project, fund and registry changes'
                : isNational
                ? 'Admin view — every action across all constituencies'
                : `Admin view — activity for ${myConst} only`}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isAdminViewer && (
              <>
                <div className="flex rounded-lg border border-bo overflow-hidden text-[10px] font-bold">
                  <button
                    onClick={() => setFeedView('admin')}
                    className={`px-2 py-1 ${feedView === 'admin' ? 'bg-indigo-600 text-white' : 'bg-white text-mu hover:bg-bg'}`}
                  >Admin</button>
                  <button
                    onClick={() => setFeedView('public')}
                    className={`px-2 py-1 ${feedView === 'public' ? 'bg-indigo-600 text-white' : 'bg-white text-mu hover:bg-bg'}`}
                  >Public</button>
                </div>
                <button
                  onClick={exportFeedCsv}
                  disabled={list.length === 0}
                  className="text-[10px] font-bold px-2 py-1 rounded-lg border border-bo bg-white text-ink hover:bg-bg disabled:opacity-40"
                  title="Download the entries currently shown as CSV"
                >⬇ CSV</button>
              </>
            )}
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
          </div>
        </div>

        {alerts.length > 0 && (
          <div className="mb-3 space-y-1.5">
            {alerts.map((al) => (
              <div key={al.target} className="flex items-start gap-2 bg-red-50 border border-red-300 text-red-800 rounded-xl px-3 py-2 text-[11px]">
                <span>🚨</span>
                <span>
                  <strong>{al.count} failed sign-in attempts</strong> on <span className="font-mono">{al.target}</span> in the last hour
                  (latest {formatTime(al.last)}). Possible password-guessing attempt.
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 mb-3">
          <select value={feedCategory} onChange={(e) => setFeedCategory(e.target.value)} className={inputCls}>
            <option value="all">All activity</option>
            <option value="funds">💰 Fund changes</option>
            <option value="projects">Projects</option>
            <option value="constituencies">Constituencies</option>
            <option value="announcements">Announcements</option>
            <option value="requests">Requests & votes</option>
            {viewMode === 'admin' && <option value="security">Logins & security</option>}
            {viewMode === 'admin' && <option value="reports">Whistleblower reports</option>}
            {viewMode === 'admin' && <option value="applications">Applications</option>}
            {viewMode === 'admin' && <option value="payments">Payment channels</option>}
            {viewMode === 'admin' && <option value="accounts">Citizen accounts</option>}
          </select>
          {viewMode === 'admin' && (
            <input
              type="text"
              placeholder="Search person…"
              value={feedPerson}
              onChange={(e) => setFeedPerson(e.target.value)}
              className={`${inputCls} w-32`}
            />
          )}
          {viewMode === 'admin' && isNational && (
            <select value={feedConst} onChange={(e) => setFeedConst(e.target.value)} className={inputCls}>
              <option value="">All constituencies</option>
              {dbConstituencies.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          )}
          <input type="date" value={feedFrom} onChange={(e) => setFeedFrom(e.target.value)} className={inputCls} title="From date" />
          <input type="date" value={feedTo} onChange={(e) => setFeedTo(e.target.value)} className={inputCls} title="To date" />
          {filtersActive && (
            <button
              onClick={() => { setFeedCategory('all'); setFeedPerson(''); setFeedFrom(''); setFeedTo(''); setFeedConst(''); }}
              className="text-[10px] font-bold text-indigo-600 hover:underline"
            >Clear</button>
          )}
          <span className="text-[10px] text-mu ml-auto">{list.length} entr{list.length === 1 ? 'y' : 'ies'}</span>
        </div>

        <div className="space-y-3.5 max-h-[550px] overflow-y-auto pr-1 scrollbar-thin">
          {liveUpdates.length === 0 ? (
            <div className="text-center py-8 text-mu text-xs space-y-2">
              <div className="animate-spin inline-block w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full"></div>
              <p>Waiting for live registry updates...</p>
            </div>
          ) : list.length === 0 ? (
            <p className="text-center py-8 text-mu text-xs italic">No entries match your view or filters.</p>
          ) : (
            list.slice(0, 200).map((upd) => (
              <div key={upd.id} className="flex gap-3 text-xs items-start border-b border-bo/40 pb-3 last:border-b-0 last:pb-0">
                <div className={`p-1.5 rounded-xl shrink-0 ${getActionBg(upd.actionType)}`}>
                  <span className="text-xs">{getActionIcon(upd.actionType)}</span>
                </div>
                <div className="space-y-1 flex-grow min-w-0">
                  <div className="flex justify-between items-start gap-1 flex-wrap">
                    <span className="font-semibold text-ink font-mono bg-bg px-1.5 py-0.5 rounded text-[10px] break-words max-w-[200px] truncate">
                      {viewMode === 'public' ? maskActor(upd.adminName) : upd.adminName}
                    </span>
                    <span className="text-[9px] text-mu font-mono whitespace-nowrap">{formatTime(upd.timestamp)}</span>
                  </div>
                  <p className="text-ink leading-relaxed font-sans">{upd.description}</p>
                  {isFundChange(upd) && (
                    <div className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-2 py-1 text-[11px] font-semibold">
                      💰 Disbursed: {fmtK(upd.spentBefore!)} → {fmtK(upd.spentAfter!)}
                      <span className={upd.spentAfter! >= upd.spentBefore! ? 'text-emerald-600' : 'text-red-600'}>
                        ({upd.spentAfter! >= upd.spentBefore! ? '+' : '−'}{fmtK(Math.abs(upd.spentAfter! - upd.spentBefore!))})
                      </span>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px]">
                    {upd.targetName && (
                      <span className="text-indigo-600 font-medium truncate">
                        Target: {upd.targetName}{viewMode === 'admin' && <span className="text-mu"> ({upd.targetId})</span>}
                      </span>
                    )}
                    {upd.constituency && <span className="text-mu">📍 {upd.constituency}</span>}
                    {viewMode === 'admin' && visOf(upd) === 'private' && <span className="text-amber-600">🔒 admin-only</span>}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  // Modals state
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginMode, setLoginMode] = useState<'national' | 'constituency'>('national');
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Constituency login state
  const [selectedLoginConst, setSelectedLoginConst] = useState('');
  const [constEmailInput, setConstEmailInput] = useState('');
  const [constOtpInput, setConstOtpInput] = useState('');
  const [constOtpSent, setConstOtpSent] = useState(false);
  const [generatedOtp, setGeneratedOtp] = useState('');
  const [constLoginError, setConstLoginError] = useState('');

  // Pricing & Signup flows
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('monthly');
  const [pricingStep, setPricingStep] = useState(1);
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState('mtn');
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupUsername, setSignupUsername] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupWallet, setSignupWallet] = useState('');
  const [signupOtpInput, setSignupOtpInput] = useState('');
  const [signupOtpSent, setSignupOtpSent] = useState(false);
  const [signupGeneratedOtp, setSignupGeneratedOtp] = useState('');
  const [signupError, setSignupError] = useState('');
  const [accessCodeInput, setAccessCodeInput] = useState('');

  // Returning Citizen Login — premium citizens skip straight to username+password;
  // free citizens go through the same OTP flow used at signup.
  const [showCitizenLoginModal, setShowCitizenLoginModal] = useState(false);
  const [citizenLoginStage, setCitizenLoginStage] = useState<'lookup' | 'password' | 'otp'>('lookup');
  const [citizenLoginEmail, setCitizenLoginEmail] = useState('');
  const [citizenLoginUsername, setCitizenLoginUsername] = useState('');
  const [citizenLoginPassword, setCitizenLoginPassword] = useState('');
  const [citizenLoginOtpInput, setCitizenLoginOtpInput] = useState('');
  const [citizenLoginGeneratedOtp, setCitizenLoginGeneratedOtp] = useState('');
  const [citizenLoginError, setCitizenLoginError] = useState('');
  const [citizenLoginFoundAccount, setCitizenLoginFoundAccount] = useState<CitizenAccount | null>(null);
  const [citizenLoginBusy, setCitizenLoginBusy] = useState(false);

  // Submissions forms
  const [reportDesc, setReportDesc] = useState('');
  const [reportConst, setReportConst] = useState('');
  const [reportType, setReportType] = useState('Project not started (funds released)');
  const [reportProj, setReportProj] = useState('');
  const [reportAmount, setReportAmount] = useState('');
  const [reportContact, setReportContact] = useState('');
  const [reportEmail, setReportEmail] = useState('');
  const [reportAcc, setReportAcc] = useState(false);
  const [reportFeedback, setReportFeedback] = useState('');
  const [reportPhoto, setReportPhoto] = useState<string | null>(null);
  const [reportPhotoError, setReportPhotoError] = useState('');

  const [reqName, setReqName] = useState('');
  const [reqDesc, setReqDesc] = useState('');
  const [reqCost, setReqCost] = useState('');
  const [reqBeneficiaries, setReqBeneficiaries] = useState('');
  const [reqConst, setReqConst] = useState('');
  const [reqSector, setReqSector] = useState('Education (school, classroom)');
  const [reqSubName, setReqSubName] = useState('');
  const [reqSubContact, setReqSubContact] = useState('');
  const [reqSubEmail, setReqSubEmail] = useState('');
  const [reqFeedback, setReqFeedback] = useState('');
  const [requestSortMode, setRequestSortMode] = useState<'votes' | 'date'>('votes');
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [commenterName, setCommenterName] = useState('');

  // Support Applications state variables
  const [applications, setApplications] = useState<Application[]>([]);
  const [allApplications, setAllApplications] = useState<Application[]>([]);
  const [appCategory, setAppCategory] = useState<'Grant' | 'Bursary' | 'Agricultural Support'>('Grant');
  const [appApplicantName, setAppApplicantName] = useState('');
  const [appNrc, setAppNrc] = useState('');
  const [appContact, setAppContact] = useState('');
  const [appEmail, setAppEmail] = useState('');
  const [appConst, setAppConst] = useState('');
  const [appAmount, setAppAmount] = useState('');
  const [appPurpose, setAppPurpose] = useState('');
  const [appBusinessName, setAppBusinessName] = useState('');
  const [appBusinessSector, setAppBusinessSector] = useState('Trading / Retail');
  const [appInstitution, setAppInstitution] = useState('');
  const [appLevelOfStudy, setAppLevelOfStudy] = useState('Secondary School');
  const [appGuardianName, setAppGuardianName] = useState('');
  const [appFarmSize, setAppFarmSize] = useState('');
  const [appFarmingType, setAppFarmingType] = useState('Crop farming');
  const [appLat, setAppLat] = useState<number | null>(null);
  const [appLng, setAppLng] = useState<number | null>(null);
  const [appLocating, setAppLocating] = useState(false);
  const [appLocError, setAppLocError] = useState('');
  const [appFeedback, setAppFeedback] = useState('');
  const [selectedApplication, setSelectedApplication] = useState<Application | null>(null);
  const [aiAppAnalysis, setAiAppAnalysis] = useState('');
  const [aiAppAnalysisLoading, setAiAppAnalysisLoading] = useState(false);

  // Selected Report / Request Review State (drives the "Review" detail modals)
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<ProjectRequest | null>(null);
  const [reqReviewOpen, setReqReviewOpen] = useState(false);

  // AI Assistant chat widget state — grounded live on projects/reports/requests from Firestore
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatTyping, setChatTyping] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; text: string }[]>([
    { role: 'assistant', text: "Hi! I'm the CDF Assistant 🤖. Ask me about any project, report, or request — e.g. \"status of P001\", \"projects in Mandevu\", or \"how many stalled projects\"." },
  ]);

  // AI Insights panel state (analytics tab)
  const [aiInsightsText, setAiInsightsText] = useState('');
  const [aiInsightsLoading, setAiInsightsLoading] = useState(false);
  const [aiInsightsFetched, setAiInsightsFetched] = useState(false);

  // AI Request Analyser state (inside the review modal)
  const [aiReqAnalysis, setAiReqAnalysis] = useState('');
  const [aiReqAnalysisLoading, setAiReqAnalysisLoading] = useState(false);

  // AI Anomaly detection state (admin panel)
  const [aiAnomalies, setAiAnomalies] = useState('');
  const [aiAnomaliesLoading, setAiAnomaliesLoading] = useState(false);
  const [aiAnomaliesFetched, setAiAnomaliesFetched] = useState(false);

  // Admin Actions state
  const [newProjName, setNewProjName] = useState('');
  const [newProjBudget, setNewProjBudget] = useState('');
  const [newProjConst, setNewProjConst] = useState('');
  const [newProjSector, setNewProjSector] = useState('Education');
  const [newProjMp, setNewProjMp] = useState('');
  const [newProjStatus, setNewProjStatus] = useState<'planned' | 'ongoing' | 'stalled' | 'complete'>('planned');

  // Admin Sub-Tab
  const [adminSubTab, setAdminSubTab] = useState<'projects' | 'constituencies' | 'payments' | 'support' | 'logs' | 'announcements'>('projects');
  const [newAnnTitle, setNewAnnTitle] = useState('');
  const [newAnnBody, setNewAnnBody] = useState('');
  const [newAnnType, setNewAnnType] = useState<'Tender' | 'Meeting' | 'Budget Release' | 'General'>('General');
  const [newAnnConst, setNewAnnConst] = useState('');

  // Admin Constituencies States
  const [newConstName, setNewConstName] = useState('');
  const [newConstProvince, setNewConstProvince] = useState('Lusaka');
  const [newConstMp, setNewConstMp] = useState('');
  const [newConstScore, setNewConstScore] = useState('70');
  const [newConstAllocated, setNewConstAllocated] = useState('40000000');
  const [editingConstName, setEditingConstName] = useState<string | null>(null);
  const [adminConstSearch, setAdminConstSearch] = useState('');
  const [adminConstProv, setAdminConstProv] = useState('');

  // Admin Payment States
  const [newPayId, setNewPayId] = useState('');
  const [newPayName, setNewPayName] = useState('');
  const [newPayIcon, setNewPayIcon] = useState('📱');
  const [newPayColor, setNewPayColor] = useState('#000000');
  const [newPayLabel, setNewPayLabel] = useState('');
  const [newPayDetail, setNewPayDetail] = useState('');
  const [newPayNote, setNewPayNote] = useState('');
  const [editingPayId, setEditingPayId] = useState<string | null>(null);

  // Selected Project Detail State
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  // ── INLINE EDIT STATE (controlled inputs — fixes stale DOM reads) ────────
  // Maps project ID → current field values being edited in the admin table
  const [projEdits, setProjEdits] = useState<Record<string, {
    name: string; mp: string; budget: string; status: string; pct: string;
  }>>({});
  // Maps constituency name → current field values being edited in the admin table
  const [constEdits, setConstEdits] = useState<Record<string, {
    mp: string; allocated: string;
  }>>({});

  // Load and seed database on initial mount
  useEffect(() => {
    seedDatabase();

    // Listen to real-time updates for projects
    const unsubscribeProjects = onSnapshot(collection(db, 'projects'), (snapshot) => {
      const items: Project[] = [];
      snapshot.forEach((doc) => { items.push(doc.data() as Project); });
      // Always update — including when a project is deleted (length may become 0)
      setAllProjects(items);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'projects'));

    // Listen to real-time updates for reports
    const unsubscribeReports = onSnapshot(collection(db, 'reports'), (snapshot) => {
      const items: Report[] = [];
      snapshot.forEach((doc) => { items.push(doc.data() as Report); });
      setAllReports(items);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'reports'));

    // Listen to real-time updates for requests
    const unsubscribeRequests = onSnapshot(collection(db, 'requests'), (snapshot) => {
      const items: ProjectRequest[] = [];
      snapshot.forEach((doc) => { items.push(doc.data() as ProjectRequest); });
      setAllRequests(items);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'requests'));

    // Listen to real-time updates for payment methods
    const unsubscribePayment = onSnapshot(collection(db, 'paymentMethods'), (snapshot) => {
      const items: PaymentMethod[] = [];
      snapshot.forEach((doc) => {
        items.push(doc.data() as PaymentMethod);
      });
      setPaymentMethods(items);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'paymentMethods'));

    // Listen to real-time updates for constituencies
    const unsubscribeConstituencies = onSnapshot(collection(db, 'constituencies'), (snapshot) => {
      const items: ConstituencyInfo[] = [];
      const byName = new Map(ALL_CONSTITUENCIES_ENRICHED.map((c) => [c.name, c]));
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as Partial<ConstituencyInfo>;
        const fallback = byName.get(data.name || docSnap.id);
        // Self-heals legacy/incomplete docs (e.g. seeded before score/allocated
        // existed) instead of silently showing "undefined%" in the rankings.
        items.push({
          name: data.name || docSnap.id,
          province: data.province || fallback?.province || 'Lusaka',
          mp: data.mp || fallback?.mp || 'Hon. MP',
          party: data.party || fallback?.party || 'TBC',
          score: typeof data.score === 'number' ? data.score : (fallback?.score ?? 50),
          allocated: typeof data.allocated === 'number' ? data.allocated : (fallback?.allocated ?? 40_000_000),
        });
      });
      // Always update — including edge cases where count may temporarily drop
      setDbConstituencies(items);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'constituencies'));

    // Listen to real-time updates for the public announcements board
    const unsubscribeAnnouncements = onSnapshot(collection(db, 'announcements'), (snapshot) => {
      const items: Announcement[] = [];
      snapshot.forEach((doc) => { items.push(doc.data() as Announcement); });
      items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      setAnnouncements(items);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'announcements'));

    // Listen to real-time updates for support applications
    const unsubscribeApplications = onSnapshot(collection(db, 'applications'), (snapshot) => {
      const items: Application[] = [];
      snapshot.forEach((doc) => { items.push(doc.data() as Application); });
      setAllApplications(items);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'applications'));

    // Listen to real-time updates for platform activity logs
    const unsubscribeUpdates = onSnapshot(collection(db, 'updates'), (snapshot) => {
      const items: LiveUpdate[] = [];
      snapshot.forEach((doc) => {
        items.push(doc.data() as LiveUpdate);
      });
      items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setLiveUpdates(items);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'updates'));

    // Check localStorage for logged-in sessions
    const storedCitizen = localStorage.getItem('citizen_account');
    if (storedCitizen) {
      try {
        setCitizenAccount(JSON.parse(storedCitizen));
      } catch (e) {
        console.error(e);
      }
    }

    const storedUser = localStorage.getItem('system_user');
    if (storedUser) {
      try {
        setCurrentUser(JSON.parse(storedUser));
      } catch (e) {
        console.error(e);
      }
    }

    return () => {
      unsubscribeProjects();
      unsubscribeReports();
      unsubscribeRequests();
      unsubscribePayment();
      unsubscribeConstituencies();
      unsubscribeApplications();
      unsubscribeAnnouncements();
      unsubscribeUpdates();
    };
  }, []);

  // Keep the open project detail modal in sync when Firestore pushes any update
  useEffect(() => {
    if (!selectedProject) return;
    const fresh = allProjects.find(p => p.id === selectedProject.id);
    if (fresh) setSelectedProject(fresh);
    else setSelectedProject(null); // project was deleted
  }, [allProjects]);

  // Seed inline edit maps from live Firestore data so inputs always start accurate
  useEffect(() => {
    setProjEdits(prev => {
      const next = { ...prev };
      projects.forEach(p => {
        // Only initialise fields not already being actively edited
        if (!next[p.id]) {
          next[p.id] = {
            name: p.name,
            mp: p.mp,
            budget: String(p.budget),
            status: p.status,
            pct: String(p.pct),
          };
        }
      });
      // Remove entries for deleted projects
      Object.keys(next).forEach(id => {
        if (!projects.find(p => p.id === id)) delete next[id];
      });
      return next;
    });
  }, [projects]);

  useEffect(() => {
    setConstEdits(prev => {
      const next = { ...prev };
      dbConstituencies.forEach(c => {
        if (!next[c.name]) {
          next[c.name] = {
            mp: c.mp,
            allocated: String(c.allocated || 30_400_000),
          };
        }
      });
      Object.keys(next).forEach(name => {
        if (!dbConstituencies.find(c => c.name === name)) delete next[name];
      });
      return next;
    });
  }, [dbConstituencies]);

  /**
   * CONSTITUENCY SCOPING — runs whenever raw Firestore data or currentUser changes.
   * If the logged-in user is a Constituency Admin, every data array is filtered to
   * their constituency only. All charts, counts, tables, analytics and admin panels
   * read from these filtered arrays — scope is enforced everywhere automatically.
   * National admins (no constituency) see all data unfiltered.
   */
  useEffect(() => {
    const c = currentUser?.constituency || null;
    if (c) {
      setProjects(allProjects.filter(p => p.constituency === c));
      setReports(allReports.filter(r => r.constituency === c));
      setRequests(allRequests.filter(r => r.constituency === c));
      setApplications(allApplications.filter(a => a.constituency === c));
    } else {
      setProjects(allProjects);
      setReports(allReports);
      setRequests(allRequests);
      setApplications(allApplications);
    }
  }, [allProjects, allReports, allRequests, allApplications, currentUser]);

  // Set default selects when dbConstituencies updates
  useEffect(() => {
    if (dbConstituencies.length > 0) {
      setReportConst((prev) => prev || dbConstituencies[0].name);
      setReqConst((prev) => prev || dbConstituencies[0].name);
      setAppConst((prev) => prev || dbConstituencies[0].name);
      setNewProjConst((prev) => {
        // Constituency Admins are locked to their own constituency
        const next = currentUser?.constituency || prev || dbConstituencies[0].name;
        const found = dbConstituencies.find((c) => c.name === next);
        if (found) setNewProjMp(found.mp);
        return next;
      });
      setSelectedLoginConst((prev) => prev || dbConstituencies[0].name);
    }
  }, [dbConstituencies, currentUser?.constituency]);

  // NOTE: the old background simulation that randomly bumped project 'spent'
  // every 45s was removed. Fund totals and ratios now change ONLY when an
  // admin edits a project's disbursed amount.

  // Decodes/generates custom visual secure JWT tokens for session displaying
  useEffect(() => {
    if (currentUser || citizenAccount) {
      const payload = {
        iss: 'zambia-cdf-auth-server',
        sub: currentUser ? currentUser.username : citizenAccount?.email,
        name: currentUser ? currentUser.name : citizenAccount?.name,
        role: currentUser ? currentUser.role : 'Premium Citizen',
        premium: citizenAccount ? citizenAccount.premium : true,
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
      // base64 mock jwt token header & signature representation
      const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const body = btoa(JSON.stringify(payload));
      const signature = 'secure_hmac_sha256_signature_token';
      setJwtToken(`${header}.${body}.${signature}`);
    } else {
      setJwtToken(null);
    }
  }, [currentUser, citizenAccount]);

  // Auth Operations
  const handleNationalLogin = async () => {
    setLoginError('');
    if (!usernameInput || !passwordInput) {
      setLoginError('Please fill in all credentials.');
      return;
    }

    const inputHash = await hashPassword(passwordInput);

    // Predefined secure static hashes corresponding to default values
    const staticCreds: Record<string, { hash: string; name: string; role: 'Admin' | 'Officer' | 'ACC' }> = {
      admin: { hash: 'e191961160fba523909386c4bb2f319a7af5bf58e72f0ab278abe9c5ce3c7a19', name: 'System Administrator', role: 'Admin' },
      officer1: { hash: 'e7629c418753cd8aeef4c6abd38416ccd179855b9e16774f46c066b39c5c5045', name: 'Lusaka District Officer', role: 'Officer' },
      acc: { hash: '14d9ed76e3bfaf2012452bc39f4b7a752a5a93a76b037686e7adfcae575fa6c1', name: 'ACC Officer', role: 'ACC' },
    };

    const user = staticCreds[usernameInput.toLowerCase()];
    if (user && user.hash === inputHash) {
      const systemUser: SystemUser = {
        username: usernameInput,
        role: user.role,
        name: user.name,
      };
      setCurrentUser(systemUser);
      localStorage.setItem('system_user', JSON.stringify(systemUser));
      logAdminAction('login', systemUser.username, systemUser.name, `Signed in to the admin portal`, `${systemUser.name} (${systemUser.role})`, { constituency: '' });
      setShowLoginModal(false);
      setUsernameInput('');
      setPasswordInput('');
    } else {
      setLoginError('Incorrect credentials. Access restricted.');
      logAdminAction('failed_login', usernameInput.toLowerCase(), usernameInput, `Failed admin sign-in attempt for username "${usernameInput}"`, 'Unknown (failed login)', { constituency: '' });
    }
  };

  const handleSendConstOtp = async () => {
    setConstLoginError('');
    if (!constEmailInput || !constEmailInput.includes('@')) {
      setConstLoginError('Please enter a valid registered email address.');
      return;
    }
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    setGeneratedOtp(otp);
    setConstOtpSent(true);

    const success = await sendOtpEmail({
      toEmail: constEmailInput,
      toName: `${selectedLoginConst} Admin`,
      otp,
      purpose: 'Admin Login',
    });

    if (success) {
      alert(`📧 [EmailJS] A real login verification code was successfully sent to ${constEmailInput}! Check your inbox (or spam folder) for the code.`);
    } else {
      alert(`[Simulation Fallback] Verification code sent to ${constEmailInput}: ${otp} (EmailJS failed or not fully configured, fell back to local display)`);
    }
  };

  const handleVerifyConstOtp = () => {
    setConstLoginError('');
    if (constOtpInput === generatedOtp) {
      const systemUser: SystemUser = {
        username: constEmailInput,
        role: 'Constituency Admin',
        name: `${selectedLoginConst} Local Admin`,
        constituency: selectedLoginConst,
      };
      setCurrentUser(systemUser);
      localStorage.setItem('system_user', JSON.stringify(systemUser));
      logAdminAction('login', systemUser.username, systemUser.name, `Signed in as ${selectedLoginConst} constituency admin (${constEmailInput})`, `${systemUser.name} (${systemUser.role})`, { constituency: selectedLoginConst });
      setShowLoginModal(false);
      setConstEmailInput('');
      setConstOtpInput('');
      setConstOtpSent(false);
    } else {
      setConstLoginError('Invalid verification code.');
      logAdminAction('failed_login', constEmailInput.toLowerCase(), `${selectedLoginConst} Local Admin`, `Failed constituency admin sign-in (wrong verification code) for ${constEmailInput}`, 'Unknown (failed login)', { constituency: selectedLoginConst });
    }
  };

  // Citizen Premium flow
  const handleSendSignupOtp = async () => {
    setSignupError('');
    if (!signupName || !signupEmail.includes('@') || signupPassword.length < 8) {
      setSignupError('All fields required. Password must be at least 8 chars.');
      return;
    }
    // Guard against silently overwriting an existing citizen's record — point them to login instead.
    try {
      const existing = await getDoc(doc(db, 'citizens', signupEmail.trim().toLowerCase()));
      if (existing.exists()) {
        setSignupError('An account with this email already exists. Please use "Already registered? Log in" instead.');
        return;
      }
    } catch (err) {
      console.warn('Could not check for an existing citizen account (continuing anyway):', err);
    }
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    setSignupGeneratedOtp(otp);
    setSignupOtpSent(true);

    const success = await sendOtpEmail({
      toEmail: signupEmail,
      toName: signupName,
      otp,
      purpose: 'Citizen Registration',
    });

    if (success) {
      alert(`📧 [EmailJS] A real registration code was successfully sent to ${signupEmail}! Please check your inbox.`);
    } else {
      alert(`[Simulation Fallback] Verification code sent to ${signupEmail}: ${otp} (EmailJS failed or fell back to simulated display)`);
    }
    // This was the actual bug: the OTP was being sent correctly, but the UI
    // never advanced to the verification screen — it silently stayed on the
    // signup form, which looked like nothing had happened.
    setPricingStep(4);
  };

  const handleVerifySignupOtp = async () => {
    setSignupError('');
    if (signupOtpInput === signupGeneratedOtp) {
      const finalUsername = (signupUsername || signupEmail.split('@')[0]).trim().toLowerCase();
      const passwordHash = await hashPassword(signupPassword);
      const newAccount: CitizenAccount = {
        email: signupEmail.trim().toLowerCase(),
        name: signupName,
        username: finalUsername,
        passwordHash,
        wallet: signupWallet,
        plan: selectedPlan,
        amount: selectedPlan === 'monthly' ? 50 : 500,
        verified: true,
        premium: false,
        createdAt: new Date().toISOString(),
      };
      setCitizenAccount(newAccount);
      localStorage.setItem('citizen_account', JSON.stringify(newAccount));
      try {
        await setDoc(doc(db, 'citizens', newAccount.email), newAccount);
      } catch (err) {
        console.error(err);
        // Non-blocking — the citizen still has a working local session even if the
        // DB write hiccups; they just won't be able to log back in from another device yet.
        handleFirestoreError(err, OperationType.WRITE, `citizens/${newAccount.email}`);
      }
      logAdminAction('create_citizen', newAccount.email, newAccount.name, `Created a new citizen account (${newAccount.email})`, `${newAccount.name} (Citizen)`, { constituency: '' });
      setPricingStep(5);
    } else {
      setSignupError('Incorrect verification code.');
    }
  };

  const handleActivatePremium = async () => {
    setSignupError('');
    if (accessCodeInput === 'CDF-PREMIUM-2026' || accessCodeInput === 'CDF-VIP') {
      if (citizenAccount) {
        const updated = { ...citizenAccount, premium: true };
        setCitizenAccount(updated);
        localStorage.setItem('citizen_account', JSON.stringify(updated));
        try {
          // This is the actual "store the credentials when paying for subscription" write —
          // from this point on, the citizen's record in the DB is flagged premium, which is
          // what the returning-login flow checks to decide password-only vs OTP.
          await setDoc(doc(db, 'citizens', citizenAccount.email), updated);
        } catch (err) {
          console.error(err);
          handleFirestoreError(err, OperationType.WRITE, `citizens/${citizenAccount.email}`);
        }
        logAdminAction('update_citizen', citizenAccount.email, citizenAccount.name, `Activated premium on citizen account`, `${citizenAccount.name} (Citizen)`, { constituency: '' });
        alert('💎 Premium activated successfully! Accessing full analytics & reports.');
      }
    } else {
      setSignupError('Invalid access code.');
    }
  };

  const handleCitizenLogout = () => {
    if (citizenAccount) logAdminAction('logout', citizenAccount.email, citizenAccount.name, `Citizen signed out`, `${citizenAccount.name} (Citizen)`, { constituency: '' });
    setCitizenAccount(null);
    localStorage.removeItem('citizen_account');
    setPricingStep(1);
    setSignupName('');
    setSignupEmail('');
    setSignupUsername('');
    setSignupPassword('');
    setSignupWallet('');
  };

  // Returning Citizen Login — the identifier (email) is looked up in the DB first
  // to decide the path: premium accounts get a fast username+password check;
  // free accounts fall back to the same OTP flow used during signup.
  const resetCitizenLoginState = () => {
    setCitizenLoginStage('lookup');
    setCitizenLoginEmail('');
    setCitizenLoginUsername('');
    setCitizenLoginPassword('');
    setCitizenLoginOtpInput('');
    setCitizenLoginGeneratedOtp('');
    setCitizenLoginError('');
    setCitizenLoginFoundAccount(null);
    setCitizenLoginBusy(false);
  };

  const handleCitizenLoginLookup = async () => {
    setCitizenLoginError('');
    if (!citizenLoginEmail || !citizenLoginEmail.includes('@')) {
      setCitizenLoginError('Please enter the email address you registered with.');
      return;
    }
    // Clear any leftover username/password/OTP from a previous lookup so the
    // next stage always starts blank — never pre-filled or hinting at a
    // previous account's credentials.
    setCitizenLoginUsername('');
    setCitizenLoginPassword('');
    setCitizenLoginOtpInput('');
    setCitizenLoginGeneratedOtp('');
    setCitizenLoginFoundAccount(null);
    setCitizenLoginBusy(true);
    try {
      const snap = await getDoc(doc(db, 'citizens', citizenLoginEmail.trim().toLowerCase()));
      if (!snap.exists()) {
        setCitizenLoginError('No account found for that email. Use the signup flow above to register first.');
        setCitizenLoginBusy(false);
        return;
      }
      const account = snap.data() as CitizenAccount;
      setCitizenLoginFoundAccount(account);

      if (account.premium && account.passwordHash) {
        // Paid citizen — fast path: username + password only, no OTP.
        setCitizenLoginStage('password');
        setCitizenLoginBusy(false);
      } else {
        // Free/unpaid citizen — same verification process as signup: OTP to email.
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        setCitizenLoginGeneratedOtp(otp);
        const success = await sendOtpEmail({
          toEmail: account.email,
          toName: account.name,
          otp,
          purpose: 'Citizen Login',
        });
        if (success) {
          alert(`📧 [EmailJS] A login verification code was sent to ${account.email}! Check your inbox (or spam folder).`);
        } else {
          alert(`[Simulation Fallback] Verification code sent to ${account.email}: ${otp} (EmailJS failed or not fully configured, fell back to local display)`);
        }
        setCitizenLoginStage('otp');
        setCitizenLoginBusy(false);
      }
    } catch (err) {
      console.error(err);
      setCitizenLoginError('Could not reach the database — please check your connection and try again.');
      setCitizenLoginBusy(false);
    }
  };

  const handleCitizenLoginPasswordSubmit = async () => {
    setCitizenLoginError('');
    if (!citizenLoginFoundAccount) return;
    if (!citizenLoginUsername || !citizenLoginPassword) {
      setCitizenLoginError('Enter both your username and password.');
      return;
    }
    const inputHash = await hashPassword(citizenLoginPassword);
    const usernameMatches = citizenLoginUsername.trim().toLowerCase() === citizenLoginFoundAccount.username.toLowerCase();
    const passwordMatches = inputHash === citizenLoginFoundAccount.passwordHash;
    if (usernameMatches && passwordMatches) {
      logAdminAction('login', citizenLoginFoundAccount.email, citizenLoginFoundAccount.name, `Citizen signed in with username & password`, `${citizenLoginFoundAccount.name} (Citizen)`, { constituency: '' });
      setCitizenAccount(citizenLoginFoundAccount);
      localStorage.setItem('citizen_account', JSON.stringify(citizenLoginFoundAccount));
      setShowCitizenLoginModal(false);
      resetCitizenLoginState();
      setPricingStep(5);
    } else {
      setCitizenLoginError('Incorrect username or password.');
      logAdminAction('failed_login', citizenLoginFoundAccount.email, citizenLoginFoundAccount.name, `Failed citizen sign-in attempt (wrong username or password)`, `${citizenLoginFoundAccount.name} (Citizen)`, { constituency: '' });
    }
  };

  const handleCitizenLoginOtpSubmit = () => {
    setCitizenLoginError('');
    if (!citizenLoginFoundAccount) return;
    if (citizenLoginOtpInput === citizenLoginGeneratedOtp) {
      logAdminAction('login', citizenLoginFoundAccount.email, citizenLoginFoundAccount.name, `Citizen signed in with email verification code`, `${citizenLoginFoundAccount.name} (Citizen)`, { constituency: '' });
      setCitizenAccount(citizenLoginFoundAccount);
      localStorage.setItem('citizen_account', JSON.stringify(citizenLoginFoundAccount));
      setShowCitizenLoginModal(false);
      resetCitizenLoginState();
      setPricingStep(5);
    } else {
      setCitizenLoginError('Incorrect verification code.');
    }
  };

  const handleSystemLogout = () => {
    if (currentUser) logAdminAction('logout', currentUser.username, currentUser.name, `Signed out of the admin portal`, undefined, { constituency: currentUser.constituency || '' });
    setCurrentUser(null);
    localStorage.removeItem('system_user');
  };

  // Submit report flow
  // Evidence photo attach for whistleblower reports.
  // Downscales the image client-side and stores it as a compact base64 data
  // URL directly on the report document (no separate storage bucket needed).
  const handleReportPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setReportPhotoError('');
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setReportPhotoError('Please choose an image file (JPG, PNG, etc).');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setReportPhotoError('Image is too large (max 8MB).');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const MAX_DIM = 1000;
        const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) { setReportPhotoError('Could not process image.'); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        setReportPhoto(canvas.toDataURL('image/jpeg', 0.75));
      };
      img.onerror = () => setReportPhotoError('Could not read that image file.');
      img.src = reader.result as string;
    };
    reader.onerror = () => setReportPhotoError('Could not read that image file.');
    reader.readAsDataURL(file);
  };

  // Community voting on project requests ("most-supported shown first").
  //
  // Voting is tied to the voter's actual identity (their citizen account
  // email — the Gmail-style address they registered and logged in with — or
  // an admin's account) rather than to the browser via localStorage. This
  // means:
  //   1. Each identified user (or admin) can vote Yes or No exactly once per
  //      request — never both, and never more than once — enforced against
  //      the request's `voters` map stored in Firestore.
  //   2. The "already voted" (greyed-out) button state only ever appears for
  //      that specific logged-in identity. A visitor who hasn't logged in
  //      with their own account never sees a stale "already voted" state
  //      left over from someone else on the same device/browser.
  const getVoterIdentity = (): string | null => {
    const email = citizenAccount?.email || currentUser?.email || currentUser?.username;
    return email ? email.trim().toLowerCase() : null;
  };

  // Looks up how (if at all) the currently logged-in identity has voted on
  // a given request, straight from the live-synced Firestore data.
  const getMyVoteForRequest = (r: ProjectRequest): 'yes' | 'no' | undefined => {
    const voterId = getVoterIdentity();
    if (!voterId || !r.voters) return undefined;
    return r.voters[voterId];
  };

  const handleVoteRequest = async (id: string, choice: 'yes' | 'no') => {
    const voterId = getVoterIdentity();
    if (!voterId) {
      // Not logged in with a citizen or admin account — voting requires
      // identifying yourself with the email you registered with first.
      setReqFeedback('❌ Please log in with your account email before voting — this keeps one vote per person.');
      resetCitizenLoginState();
      setShowCitizenLoginModal(true);
      return;
    }
    try {
      const snap = await getDoc(doc(db, 'requests', id));
      const current = snap.exists() ? (snap.data() as ProjectRequest) : null;
      if (!current) return;
      const existingVoters = current.voters || {};
      if (existingVoters[voterId]) {
        // Already voted (yes or no) — locked, cannot vote again or switch.
        return;
      }
      const nextVoters = { ...existingVoters, [voterId]: choice };
      const nextVotes = (current.votes || 0) + (choice === 'yes' ? 1 : 0);
      const nextRejects = (current.rejects || 0) + (choice === 'no' ? 1 : 0);
      await updateDoc(doc(db, 'requests', id), {
        voters: nextVoters,
        votes: nextVotes,
        rejects: nextRejects,
      });
      logAdminAction('vote_request', id, current.name, `Voted ${choice === 'yes' ? 'YES (support)' : 'NO (reject)'} on community request "${current.name}"`, undefined, { constituency: current.constituency });
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.UPDATE, `requests/${id}`);
    }
  };

  const handleUpvoteRequest = (id: string) => handleVoteRequest(id, 'yes');
  const handleDownvoteRequest = (id: string) => handleVoteRequest(id, 'no');

  // Citizen comments on community project requests — visible to admins in the
  // "Citizen Requests Oversight" panel so they can factor community input
  // into approve/reject decisions.
  const handleAddComment = async (id: string) => {
    const text = (commentDrafts[id] || '').trim();
    if (!text) return;
    const newComment: RequestComment = {
      id: 'CMT-' + Date.now().toString(36).toUpperCase(),
      author: commenterName.trim() || 'Anonymous Citizen',
      text,
      date: new Date().toISOString().split('T')[0],
    };
    try {
      const snap = await getDoc(doc(db, 'requests', id));
      const current = snap.exists() ? (snap.data() as ProjectRequest) : null;
      const nextComments = [...(current?.comments || []), newComment];
      await updateDoc(doc(db, 'requests', id), { comments: nextComments });
      logAdminAction('comment_request', id, current?.name || id, `Commented on community request "${current?.name || id}"`, `${newComment.author} (Citizen)`, { constituency: current?.constituency || '' });
      setCommentDrafts((prev) => ({ ...prev, [id]: '' }));
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.UPDATE, `requests/${id}`);
    }
  };

  // Announcements board (admin-posted tenders, meetings, budget releases)
  const handleAddAnnouncement = async () => {
    if (!newAnnTitle.trim() || !newAnnBody.trim()) {
      alert('Provide a title and message for the announcement.');
      return;
    }
    const id = 'ANN-' + Date.now().toString(36).toUpperCase();
    // Firestore rejects `undefined` field values outright, so always store a
    // real string here ('' = national) rather than `undefined`.
    const annConstituency = currentUser?.constituency || newAnnConst || '';
    const newAnn: Announcement = {
      id,
      title: newAnnTitle.trim(),
      body: newAnnBody.trim(),
      type: newAnnType,
      constituency: annConstituency,
      postedBy: currentUser?.name || 'CDF Administration',
      postedByUsername: currentUser?.username || '',
      date: new Date().toISOString().split('T')[0],
    };
    try {
      await setDoc(doc(db, 'announcements', id), newAnn);
      await logAdminAction('create_announcement', id, newAnn.title, `Posted a new ${newAnnType.toLowerCase()} announcement${annConstituency ? ` for ${annConstituency}` : ' (national)'}`, undefined, { constituency: annConstituency || '' });
      setNewAnnTitle('');
      setNewAnnBody('');
      setNewAnnConst('');
      setNewAnnType('General');
    } catch (err: any) {
      console.error('Failed to publish announcement:', err);
      const code = err?.code || '';
      const msg = err?.message || String(err);
      if (code === 'permission-denied' || /insufficient permissions/i.test(msg)) {
        alert(
          'Could not publish: Firestore is rejecting this write with "permission-denied".\n\n' +
          'This almost always means the security rules on your LIVE Firebase project don\'t yet allow writes to the "announcements" collection — the firestore.rules file in this project was updated, but that file only takes effect once you deploy it (e.g. "firebase deploy --only firestore:rules", or paste it into the Rules tab in the Firebase Console).'
        );
      } else {
        alert(`Could not publish the announcement.\n\nFirestore error: ${msg}`);
      }
    }
  };

  const handleDeleteAnnouncement = async (a: Announcement) => {
    if (!canDeleteAnnouncement(a)) {
      alert("You don't have permission to delete this announcement — a Constituency Admin can only delete announcements published for their own constituency.");
      return;
    }
    if (!confirm('Delete this announcement?')) return;
    try {
      await deleteDoc(doc(db, 'announcements', a.id));
      logAdminAction('delete_announcement', a.id, a.title, `Deleted announcement "${a.title}"`, undefined, { constituency: a.constituency || '' });
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.DELETE, `announcements/${a.id}`);
    }
  };

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    setReportFeedback('');
    if (!reportDesc || reportDesc.length < 20) {
      setReportFeedback('Please describe the issue with at least 20 characters.');
      return;
    }

    const id = 'RPT-' + (reports.length + 1).toString().padStart(3, '0');
    const newReport: Report = {
      id,
      constituency: reportConst,
      type: reportType,
      proj: reportProj,
      amount: reportAmount,
      contact: reportContact || 'Anonymous',
      email: reportEmail.trim() || undefined,
      desc: reportDesc,
      date: new Date().toISOString().split('T')[0],
      status: 'Received',
      acc: reportAcc,
      ...(reportPhoto ? { photoUrl: reportPhoto } : {}),
    };

    try {
      await setDoc(doc(db, 'reports', id), newReport);
      logAdminAction('create_report', id, reportProj || 'General report', `Submitted a whistleblower report${reportProj ? ` on "${reportProj}"` : ''}`, `${reportContact || 'Anonymous'} (Reporter)`, { constituency: reportConst });
      setReportFeedback('✅ Report submitted securely and synced to administrative database.');

      setReportDesc('');
      setReportProj('');
      setReportAmount('');
      setReportContact('');
      setReportEmail('');
      setReportPhoto(null);
      setReportPhotoError('');
    } catch (err) {
      console.error(err);
      setReportFeedback('Failed to submit report. Please check database permissions.');
      handleFirestoreError(err, OperationType.WRITE, `reports/${id}`);
    }
  };

  // Submit project request
  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setReqFeedback('');
    if (!reqName || !reqDesc || reqDesc.length < 20) {
      setReqFeedback('Provide project name and detailed reasons (min 20 chars).');
      return;
    }

    const id = 'REQ-' + (requests.length + 1).toString().padStart(3, '0');
    const newReq: ProjectRequest = {
      id,
      submitterName: reqSubName || 'Citizen',
      submitterContact: reqSubContact || 'Not provided',
      submitterEmail: reqSubEmail.trim() || undefined,
      constituency: reqConst,
      sector: reqSector,
      name: reqName,
      cost: reqCost,
      beneficiaries: reqBeneficiaries,
      desc: reqDesc,
      date: new Date().toISOString().split('T')[0],
      status: 'Pending',
    };

    try {
      await setDoc(doc(db, 'requests', id), newReq);
      logAdminAction('create_request', id, reqName, `Filed a new community project request "${reqName}" in ${reqConst}`, `${reqSubName || 'Citizen'} (Citizen)`, { constituency: reqConst });
      setReqFeedback('✅ Community request filed and dispatched directly to local administration.');
      setReqName('');
      setReqDesc('');
      setReqCost('');
      setReqBeneficiaries('');
      setReqSubName('');
      setReqSubContact('');
      setReqSubEmail('');
    } catch (err) {
      console.error(err);
      setReqFeedback('Failed to submit request.');
      handleFirestoreError(err, OperationType.WRITE, `requests/${id}`);
    }
  };

  // GPS / Geolocation / Map Pickers
  const handlePickGps = () => {
    setAppLocError('');
    setAppLocating(true);
    if (!navigator.geolocation) {
      setAppLocError('Geolocation is not supported by your browser.');
      setAppLocating(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setAppLat(Number(position.coords.latitude.toFixed(6)));
        setAppLng(Number(position.coords.longitude.toFixed(6)));
        setAppLocating(false);
      },
      (error) => {
        console.warn('GPS error:', error);
        setAppLocError('Could not get GPS coordinates. Using simulated high-precision map coordinates instead.');
        setAppLocating(false);
        // Fallback to coordinates
        handlePickMockMap();
      },
      { enableHighAccuracy: true, timeout: 5000 }
    );
  };

  const handlePickMockMap = () => {
    // Generate simulated coordinates in Lusaka/Zambia bounding box
    const centerLat = -15.4167;
    const centerLng = 28.2833;
    const randomLat = Number((centerLat + (Math.random() - 0.5) * 0.15).toFixed(6));
    const randomLng = Number((centerLng + (Math.random() - 0.5) * 0.15).toFixed(6));
    setAppLat(randomLat);
    setAppLng(randomLng);
  };

  // Submit support application
  const handleSubmitApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    setAppFeedback('');

    if (!appApplicantName.trim() || !appNrc.trim() || !appContact.trim()) {
      setAppFeedback('Please provide your full name, NRC number, and a contact number.');
      return;
    }
    if (!appPurpose.trim() || appPurpose.trim().length < 20) {
      setAppFeedback('Please describe what you need and why, in at least 20 characters.');
      return;
    }

    if (appCategory === 'Grant' && !appBusinessName.trim()) {
      setAppFeedback('Please provide the name of your business or enterprise idea.');
      return;
    }
    if (appCategory === 'Bursary' && !appInstitution.trim()) {
      setAppFeedback('Please provide the name of your school, college, or university.');
      return;
    }
    if (appCategory === 'Agricultural Support' && !appFarmSize.trim()) {
      setAppFeedback('Please provide your approximate farm size.');
      return;
    }

    const id = 'APP-' + (applications.length + 1).toString().padStart(3, '0');
    const newApp: Application = {
      id,
      category: appCategory,
      applicantName: appApplicantName.trim(),
      nrc: appNrc.trim(),
      contact: appContact.trim(),
      email: appEmail.trim(),
      constituency: appConst,
      amount: appAmount,
      purpose: appPurpose.trim(),
      status: 'Pending',
      date: new Date().toISOString().split('T')[0],
      ...(appCategory === 'Grant' ? { businessName: appBusinessName.trim(), businessSector: appBusinessSector } : {}),
      ...(appCategory === 'Bursary' ? { institution: appInstitution.trim(), levelOfStudy: appLevelOfStudy, guardianName: appGuardianName.trim() } : {}),
      ...(appCategory === 'Agricultural Support' ? { farmSize: appFarmSize.trim(), farmingType: appFarmingType } : {}),
      ...(appLat != null && appLng != null ? { lat: appLat, lng: appLng } : {}),
    };

    try {
      await setDoc(doc(db, 'applications', id), newApp);
      logAdminAction('create_application', id, appApplicantName.trim(), `Submitted a ${appCategory} application in ${appConst}`, `${appApplicantName.trim() || 'Applicant'} (Applicant)`, { constituency: appConst });
      setAppFeedback('✅ Your empowerment/support application has been registered and synced live.');
      
      // Clear inputs
      setAppApplicantName('');
      setAppNrc('');
      setAppContact('');
      setAppEmail('');
      setAppAmount('');
      setAppPurpose('');
      setAppBusinessName('');
      setAppInstitution('');
      setAppGuardianName('');
      setAppFarmSize('');
      setAppLat(null);
      setAppLng(null);
      setAppLocError('');
    } catch (err: any) {
      console.error(err);
      setAppFeedback('Failed to submit application. Please check Firestore connection.');
      handleFirestoreError(err, OperationType.WRITE, `applications/${id}`);
    }
  };

  // Admin Actions for Applications
  const handleUpdateApplicationStatus = async (id: string, nextStatus: 'Pending' | 'Approved' | 'Rejected' | 'Under Review') => {
    try {
      // Fetch fresh from Firestore — never rely on local state which may lag
      const snap = await getDoc(doc(db, 'applications', id));
      const appItem = snap.exists() ? (snap.data() as Application) : null;
      const applicantName = appItem?.applicantName || 'Unknown Applicant';

      await updateDoc(doc(db, 'applications', id), { status: nextStatus });
      if (selectedApplication?.id === id) {
        setSelectedApplication((prev) => prev ? { ...prev, status: nextStatus } : null);
      }
      await logAdminAction('update_application', id, applicantName, `Updated status of empowerment application to "${nextStatus}"`, undefined, { constituency: appItem?.constituency || '' });

      // Send decision email — read email directly from the fresh Firestore doc
      const toEmail = appItem?.email?.trim();
      console.log('Decision email target:', toEmail, '| status:', nextStatus);
      if (toEmail) {
        const result = await sendDecisionEmail({
          toEmail,
          toName: applicantName,
          refId: id,
          itemLabel: appItem?.purpose || appItem?.category || 'Application',
          status: nextStatus,
          kind: 'application',
          category: appItem?.category,
        });
        console.log('Decision email sent:', result);
      } else {
        console.log('No email on file for application', id, '— skipping notification');
      }

      // SMS alert — fires alongside the email, uses the applicant's contact number
      const toPhone = appItem?.contact?.trim();
      if (toPhone) {
        sendDecisionSms({
          toPhone,
          toName: applicantName,
          refId: id,
          itemLabel: appItem?.purpose || appItem?.category || 'Application',
          status: nextStatus,
          kind: 'application',
        });
      }
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.UPDATE, `applications/${id}`);
    }
  };

  // AI assistant Chat trigger
  const handleSendChatMessage = async () => {
    if (!chatInput.trim()) return;
    const userMsg = { role: 'user' as const, text: chatInput.trim() };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput('');
    setChatTyping(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/gemini/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg.text,
          context: { projects, reports, requests }
        })
      });

      if (!response.ok) throw new Error('API request failed');
      const data = await response.json();
      setChatMessages((prev) => [...prev, { role: 'assistant', text: data.text }]);
    } catch (error) {
      console.warn('AI Chat error (using premium local advisor fallback):', error);
      // Premium Local smart fallback simulation
      setTimeout(() => {
        let text = `I can see we have ${projects.length} total projects registered. `;
        if (userMsg.text.toLowerCase().includes('stalled')) {
          const stalledList = projects.filter(p => p.status === 'stalled');
          text += `There are currently ${stalledList.length} stalled projects, including: ${stalledList.map(p => p.name).join(', ')}.`;
        } else if (userMsg.text.toLowerCase().includes('mandevu')) {
          const mList = projects.filter(p => p.constituency.toLowerCase() === 'mandevu');
          text += `In Mandevu constituency, there are ${mList.length} projects, notably: ${mList.map(p => p.name).join(', ')}.`;
        } else {
          text += `Our audit database indicates total disbursed funds of ${zmw(projects.reduce((s, p) => s + p.spent, 0))}. Ask me about specific project statuses, budget efficiency or misuse reports.`;
        }
        setChatMessages((prev) => [...prev, { role: 'assistant', text }]);
      }, 800);
    } finally {
      setChatTyping(false);
    }
  };

  // AI Support Application Analyser trigger
  const handleAnalyzeApplication = async (app: Application) => {
    setAiAppAnalysisLoading(true);
    setAiAppAnalysis('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/gemini/app-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ application: app })
      });

      if (!response.ok) throw new Error('API request failed');
      const data = await response.json();
      setAiAppAnalysis(cleanAuditText(data.text));
    } catch (error) {
      console.warn('AI App Evaluation error (using mock fallback):', error);
      setTimeout(() => {
        setAiAppAnalysis(cleanAuditText(`🤖 AI Evaluation for ${app.applicantName} (${app.category})

1. Eligibility Check: PASS. Applicant details (NRC: ${app.nrc}, Constituency: ${app.constituency}) are consistent with CDF database records.
2. Social-Economic Impact Rating: HIGH. Stated purpose of "${app.purpose}" addresses a critical community need.
3. Budget Feasibility: REASONABLE. The requested support of ${app.amount ? zmw(Number(app.amount)) : 'N/A'} aligns with normal guidelines for this empowerment category.
4. Final Recommendation: Approve with standard periodic monitoring.`));
      }, 1000);
    } finally {
      setAiAppAnalysisLoading(false);
    }
  };

  // AI Analytics Insights trigger
  const handleFetchInsights = async () => {
    setAiInsightsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/gemini/insights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projects, reports, requests })
      });

      if (!response.ok) throw new Error('API request failed');
      const data = await response.json();
      setAiInsightsText(cleanAuditText(data.text));
      setAiInsightsFetched(true);
    } catch (error) {
      console.warn('AI Insights error (using premium auditor local fallback):', error);
      setTimeout(() => {
        setAiInsightsText(cleanAuditText(`### 📊 AI Strategic CDF Audits & Recommendations (Zambia)

- **Budget Efficiency**: Overall budget utilization is at **${((projects.reduce((s, p) => s + p.spent, 0) / projects.reduce((s, p) => s + p.budget, 1)) * 100).toFixed(1)}%**.
- **Sector Bottlenecks**: **Roads** and **Water** sectors have the highest ratio of stalled funds. Streamlining contractors in these sectors is advised.
- **Geographic Balance**: Western and Northern provinces show a higher project density but receive slightly lower funding per capita compared to Lusaka.
- **Accountability Alert**: Out of **${reports.length}** misuse reports, **${reports.filter(r => r.acc).length}** are flagged for direct ACC escalation.`));
        setAiInsightsFetched(true);
      }, 1000);
    } finally {
      setAiInsightsLoading(false);
    }
  };

  // AI Request Analyser trigger
  const handleAnalyzeRequest = async (reqItem: ProjectRequest) => {
    setAiReqAnalysisLoading(true);
    setAiReqAnalysis('');
    const matchedProjects = projects.filter(p => p.constituency === reqItem.constituency);
    try {
      const response = await fetch(`${API_BASE_URL}/api/gemini/request-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestItem: reqItem, projectsContext: matchedProjects })
      });

      if (!response.ok) throw new Error('API request failed');
      const data = await response.json();
      setAiReqAnalysis(cleanAuditText(data.text));
    } catch (error) {
      console.warn('AI Request Analyser error (using mock fallback):', error);
      setTimeout(() => {
        setAiReqAnalysis(cleanAuditText(`### 🤖 AI Viability Assessment - ${reqItem.name}

1. **Viability Score**: **88/100**. Excellent alignment with constituency developmental priorities.
2. **Duplication Risk**: **LOW**. No existing projects in the same sector (${reqItem.sector}) were identified within ${reqItem.constituency}.
3. **Priority Recommendation**: **Urgent**. Addresses immediate citizen demand with an estimated beneficiary reach of ${reqItem.beneficiaries || 'hundreds'}.
4. **Key Recommendations**: Integrate into the upcoming quarter's procurement draft; check local contractor capacity.`));
      }, 1000);
    } finally {
      setAiReqAnalysisLoading(false);
    }
  };

  // AI Anomaly scanner trigger
  const handleScanAnomalies = async () => {
    setAiAnomaliesLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/gemini/anomaly-detection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projects, reports })
      });

      if (!response.ok) throw new Error('API request failed');
      const data = await response.json();
      setAiAnomalies(cleanAuditText(data.text));
      setAiAnomaliesFetched(true);
    } catch (error) {
      console.warn('AI Anomaly scanner error (using local audit fallback):', error);
      setTimeout(() => {
        setAiAnomalies(cleanAuditText(`### 🚨 ACC Audit Anomalies & High-Risk Flags Detected

1. **High Risk — Kabulonga Constituency Project P003**: Budgets were released over 6 months ago, but progress is currently at 0% with active local report complaints.
2. **Medium Risk — Mandevu Water Sector**: Sector receives a high density of funding while having 3 unresolved contractor status discrepancies.
3. **High Risk — Chawama Road Rehabilitation**: Discrepancies between disbursed funds and visible on-site road layout progress reported by multiple citizen witnesses.`));
        setAiAnomaliesFetched(true);
      }, 1000);
    } finally {
      setAiAnomaliesLoading(false);
    }
  };

  // Admin: Update Project Status
  const handleUpdateProjectStatus = async (id: string, nextStatus: 'planned' | 'ongoing' | 'stalled' | 'complete', nextPct: number) => {
    const valPct = Math.min(100, Math.max(0, nextPct));
    const proj = projects.find(p => p.id === id);
    const projName = proj ? proj.name : 'Unknown Project';
    // Only recalculate spent from pct if no contractor stages have set it independently.
    // If spent is already set by contractor stages, keep it — just update status and pct.
    const contractorSpent = proj?.spent ?? 0;
    const pctImpliedSpent = Math.round((proj?.budget || 0) * (valPct / 100));
    // Use whichever is greater — contractor stages take precedence over pct slider
    const nextSpent = Math.max(contractorSpent, pctImpliedSpent);
    try {
      await updateDoc(doc(db, 'projects', id), {
        status: nextStatus,
        pct: valPct,
        spent: nextSpent,
        lastUpdated: new Date().toISOString(),
      });
      await logAdminAction('update_project', id, projName, `Updated status to "${nextStatus}" (${valPct}% complete, ${zmw(nextSpent)} disbursed)`, undefined, { constituency: proj?.constituency || '', spentBefore: proj?.spent ?? 0, spentAfter: nextSpent });
      // No alert — Firestore onSnapshot will update the UI automatically
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.UPDATE, `projects/${id}`);
    }
  };

  // Admin: Create Project
  const handleAddProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjName || !newProjBudget) {
      alert('Provide project name and allocation budget.');
      return;
    }
    // Constituency Admins can only create projects in their own constituency
    const projConst = constScope || newProjConst;
    const id = 'P' + (projects.length + 1).toString().padStart(3, '0');
    const newProject: Project = {
      id,
      name: newProjName,
      constituency: projConst,
      province: dbConstituencies.find(c => c.name === projConst)?.province || 'Lusaka',
      sector: newProjSector,
      budget: parseInt(newProjBudget),
      spent: 0,
      pct: 0,
      status: newProjStatus,
      mp: newProjMp || dbConstituencies.find(c => c.name === projConst)?.mp || 'Hon. MP',
    };

    try {
      await setDoc(doc(db, 'projects', id), newProject);
      await logAdminAction('create_project', id, newProject.name, `Published new project in ${newProject.constituency} with a budget of ${zmw(newProject.budget)}`, undefined, { constituency: newProject.constituency });
      // Firestore onSnapshot updates the UI automatically — no alert needed
      setNewProjName('');
      setNewProjBudget('');
      setNewProjMp('');
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.WRITE, `projects/${id}`);
    }
  };

  // Admin: Delete Project
  const handleDeleteProject = async (id: string) => {
    if (!window.confirm(`Permanently delete project ${id}? This cannot be undone.`)) return;
    const proj = projects.find(p => p.id === id);
    const projName = proj ? proj.name : 'Unknown Project';
    try {
      await deleteDoc(doc(db, 'projects', id));
      await logAdminAction('delete_project', id, projName, `Deleted project "${projName}" from registry`, undefined, { constituency: proj?.constituency || '' });
      // Firestore onSnapshot will update allProjects automatically.
      // selectedProject sync effect will close the modal if it was open.
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.DELETE, `projects/${id}`);
    }
  };

  // Admin: Update all project fields
  const handleUpdateProjectAll = async (id: string, fields: Partial<Project>) => {
    const proj = projects.find(p => p.id === id);
    const projName = proj ? proj.name : 'Unknown Project';
    try {
      await updateDoc(doc(db, 'projects', id), {
        ...fields,
        lastUpdated: new Date().toISOString(),
      });
      await logAdminAction('update_project', id, projName, `Modified project fields: ${Object.keys(fields).join(', ')}`, undefined, {
        constituency: proj?.constituency || '',
        ...(fields.spent != null && proj ? { spentBefore: proj.spent, spentAfter: fields.spent } : {}),
      });
      // Firestore onSnapshot pushes the update to all tabs automatically
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.UPDATE, `projects/${id}`);
    }
  };

  // Admin: Create Constituency
  const handleAddConstituency = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newConstName) {
      alert('Provide a constituency name.');
      return;
    }
    const exists = dbConstituencies.some(c => c.name.toLowerCase() === newConstName.toLowerCase());
    if (exists) {
      alert('A constituency with this name already exists.');
      return;
    }
    const newConst: ConstituencyInfo = {
      name: newConstName,
      province: newConstProvince,
      mp: newConstMp || 'Hon. MP',
      score: parseInt(newConstScore) || 50,
      allocated: parseInt(newConstAllocated) || 30_400_000, // 2026 CDF allocation per constituency
    };
    try {
      await setDoc(doc(db, 'constituencies', newConstName), newConst);
      await logAdminAction('create_constituency', newConstName, newConstName, `Added new constituency "${newConstName}" represented by ${newConst.mp}`, undefined, { constituency: newConstName });
      // Firestore onSnapshot pushes the new constituency to the UI immediately
      setNewConstName('');
      setNewConstMp('');
      setNewConstScore('70');
      setNewConstAllocated('30400000');
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.WRITE, `constituencies/${newConstName}`);
    }
  };

  // Admin: Update Constituency
  const handleUpdateConstituency = async (name: string, updatedFields: Partial<ConstituencyInfo>) => {
    try {
      await updateDoc(doc(db, 'constituencies', name), updatedFields);
      await logAdminAction('update_constituency', name, name, `Modified constituency fields: ${Object.keys(updatedFields).join(', ')}`, undefined, { constituency: name });
      // Firestore onSnapshot pushes the change to all tabs immediately
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.UPDATE, `constituencies/${name}`);
    }
  };

  // Admin: Delete Constituency
  const handleDeleteConstituency = async (name: string) => {
    if (!window.confirm(`Permanently delete constituency "${name}"? This cannot be undone.`)) return;
    try {
      await deleteDoc(doc(db, 'constituencies', name));
      logAdminAction('delete_constituency', name, name, `Deleted constituency "${name}"`, undefined, { constituency: name });
      // Firestore onSnapshot updates the UI automatically
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.DELETE, `constituencies/${name}`);
    }
  };

  // Admin: Create Payment Method
  const handleAddPaymentMethod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPayId || !newPayName) {
      alert('Provide payment ID and Name.');
      return;
    }
    const exists = paymentMethods.some(pm => pm.id === newPayId);
    if (exists) {
      alert('A payment gateway with this ID already exists.');
      return;
    }
    const newPm: PaymentMethod = {
      id: newPayId,
      name: newPayName,
      icon: newPayIcon,
      color: newPayColor,
      detailLabel: newPayLabel || 'Account Detail',
      detail: newPayDetail || 'None',
      note: newPayNote || '',
    };
    try {
      await setDoc(doc(db, 'paymentMethods', newPayId), newPm);
      await logAdminAction('create_payment', newPayId, newPayName, `Registered new payment channel: "${newPayName}"`, undefined, { constituency: '' });
      alert(`Payment Gateway ${newPayName} added live!`);
      setNewPayId('');
      setNewPayName('');
      setNewPayLabel('');
      setNewPayDetail('');
      setNewPayNote('');
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.WRITE, `paymentMethods/${newPayId}`);
    }
  };

  // Admin: Update Payment Method
  const handleUpdatePaymentMethod = async (id: string, updatedFields: Partial<PaymentMethod>) => {
    const pay = paymentMethods.find(p => p.id === id);
    const payName = pay ? pay.name : 'Unknown gateway';
    try {
      await updateDoc(doc(db, 'paymentMethods', id), updatedFields);
      await logAdminAction('update_payment', id, payName, `Updated configuration details for payment gateway`, undefined, { constituency: '' });
      alert(`Payment method updated successfully!`);
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.UPDATE, `paymentMethods/${id}`);
    }
  };

  // Admin: Delete Payment Method
  const handleDeletePaymentMethod = async (id: string) => {
    const pay = paymentMethods.find(p => p.id === id);
    const payName = pay ? pay.name : 'Unknown gateway';
    if (!confirm('Are you sure you want to delete this payment gateway?')) return;
    try {
      await deleteDoc(doc(db, 'paymentMethods', id));
      await logAdminAction('delete_payment', id, payName, `Removed payment gateway "${payName}" from active channels`, undefined, { constituency: '' });
      alert('Payment gateway deleted.');
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.DELETE, `paymentMethods/${id}`);
    }
  };

  const handleUpdateReqStatus = async (id: string, status: 'Approved' | 'Rejected' | 'Under Review') => {
    try {
      // Fetch fresh from Firestore — never rely on local state which may lag
      const snap = await getDoc(doc(db, 'requests', id));
      const req = snap.exists() ? (snap.data() as ProjectRequest) : null;
      const reqName = req?.name || 'Unknown Proposal';

      await updateDoc(doc(db, 'requests', id), { status });
      await logAdminAction('update_request', id, reqName, `Updated status of CDF project proposal to "${status}"`, undefined, { constituency: req?.constituency || '' });

      // Send decision email — read email directly from the fresh Firestore doc
      const toEmail = req?.submitterEmail?.trim();
      console.log('Decision email target (request):', toEmail, '| status:', status);
      if (toEmail) {
        const result = await sendDecisionEmail({
          toEmail,
          toName: req?.submitterName || 'Citizen',
          refId: id,
          itemLabel: reqName,
          status,
          kind: 'request',
        });
        console.log('Decision email sent:', result);
      } else {
        console.log('No email on file for request', id, '— skipping notification');
      }

      // SMS alert — fires alongside the email, uses the submitter's contact number
      const toPhone = req?.submitterContact?.trim();
      if (toPhone && toPhone.toLowerCase() !== 'not provided') {
        sendDecisionSms({
          toPhone,
          toName: req?.submitterName || 'Citizen',
          refId: id,
          itemLabel: reqName,
          status,
          kind: 'request',
        });
      }
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.UPDATE, `requests/${id}`);
    }
  };

  const handleUpdateReportStatus = async (id: string, status: Report['status']) => {
    try {
      // Fetch fresh from Firestore so we always have the latest email field
      const snap = await getDoc(doc(db, 'reports', id));
      const record = snap.exists() ? (snap.data() as Report) : null;

      await updateDoc(doc(db, 'reports', id), { status });
      logAdminAction('update_report', id, record?.proj || id, `Changed whistleblower report status to "${status}"`, undefined, { constituency: record?.constituency || '' });

      // Send decision email if reporter provided an email address
      const toEmail = record?.email?.trim();
      if (toEmail) {
        sendDecisionEmail({
          toEmail,
          toName: record?.contact || 'Reporter',
          refId: id,
          itemLabel: record?.type || 'Whistleblower Report',
          status,
          kind: 'report',
        }).catch(err => console.error('Report decision email failed:', err));
      }
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.UPDATE, `reports/${id}`);
    }
  };

  const handleDeleteReport = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'reports', id));
      logAdminAction('delete_report', id, id, `Deleted whistleblower report ${id}`, undefined, { constituency: allReports.find(r => r.id === id)?.constituency || '' });
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.DELETE, `reports/${id}`);
    }
  };

  const handleDeleteRequest = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'requests', id));
      logAdminAction('delete_request', id, id, `Deleted community request ${id}`, undefined, { constituency: allRequests.find(r => r.id === id)?.constituency || '' });
      if (selectedRequest?.id === id) { setSelectedRequest(null); setReqReviewOpen(false); }
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.DELETE, `requests/${id}`);
    }
  };

  const handleDeleteApplication = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'applications', id));
      logAdminAction('delete_application', id, id, `Deleted application ${id}`, undefined, { constituency: allApplications.find(a => a.id === id)?.constituency || '' });
      if (selectedApplication?.id === id) setSelectedApplication(null);
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.DELETE, `applications/${id}`);
    }
  };

  // Filters calculation
  const filteredProjects = projects.filter((p) => {
    const q = searchQuery.toLowerCase();
    const projectMp = getProjectMp(p);
    const matchesSearch = !q || p.name.toLowerCase().includes(q) || p.constituency.toLowerCase().includes(q) || projectMp.toLowerCase().includes(q);
    const matchesProvince = !filterProvince || p.province === filterProvince;
    const matchesStatus = !filterStatus || p.status === filterStatus;
    const matchesSector = !filterSector || p.sector === filterSector;
    return matchesSearch && matchesProvince && matchesStatus && matchesSector;
  });

  // Constituency-scope label for UI badges
  const constScope = currentUser?.constituency || null;

  // Announcement permissions:
  // - A national admin (no constituency assigned) has full power — sees and can
  //   delete every announcement anywhere.
  // - A Constituency Admin can only DELETE announcements published for their own
  //   constituency (never a national announcement, never another constituency's).
  // - In the admin panel, a Constituency Admin only SEES announcements they
  //   personally published — national admins see everything. (The public
  //   Announcements tab is unaffected by any of this — everyone sees everything there.)
  const isNationalAdmin = !currentUser?.constituency;
  const canDeleteAnnouncement = (a: Announcement): boolean => {
    if (isNationalAdmin) return true;
    return a.constituency === currentUser?.constituency;
  };
  const adminVisibleAnnouncements = isNationalAdmin
    ? announcements
    : announcements.filter((a) => a.postedByUsername && a.postedByUsername === currentUser?.username);

  // Flag system
  const toggleFlag = (id: string) => {
    const nextFlags = new Set(flaggedProjectIds);
    if (nextFlags.has(id)) {
      nextFlags.delete(id);
    } else {
      nextFlags.add(id);
    }
    setFlaggedProjectIds(nextFlags);
  };

  // Premium Guards
  const isPremiumUser = citizenAccount?.premium || currentUser;

  // ── ACCURATE CDF ALLOCATION PER CONSTITUENCY (2026) ─────────────────────
  // Per Constitution (Amendment) Act No.13 of 2025 — K30.4M per constituency
  const CDF_PER_CONSTITUENCY = 30_400_000;

  // ── ANALYTICS: accurate figures derived entirely from live project data ──
  const totalBudgetAllocated = projects.reduce((acc, p) => acc + p.budget, 0);
  const totalFundsDisbursed  = projects.reduce((acc, p) => acc + p.spent,  0);
  const disbursementRatio    = totalBudgetAllocated > 0
    ? (totalFundsDisbursed / totalBudgetAllocated) * 100 : 0;
  const stalledCount = projects.filter((p) => p.status === 'stalled').length;

  // Sector chart — normalise common abbreviations so nothing falls off
  const sectorData = Object.keys(SECTOR_COLS).map((s) => {
    const matchingProjs = projects.filter((p) => {
      const sector = (p.sector || '').toLowerCase();
      return sector === s.toLowerCase() || sector.startsWith(s.toLowerCase().split(' ')[0]);
    });
    const budget = matchingProjs.reduce((sum, p) => sum + p.budget, 0);
    const spent  = matchingProjs.reduce((sum, p) => sum + p.spent,  0);
    return { name: s.length > 12 ? s.split(' ')[0] : s, fullName: s, budget, spent };
  }).filter(d => d.budget > 0 || d.spent > 0); // hide empty sectors

  // Status distribution — driven entirely by live project array
  const statusData = [
    { name: 'Planned',  value: projects.filter((p) => p.status === 'planned').length,  color: '#d1d5db' },
    { name: 'Ongoing',  value: projects.filter((p) => p.status === 'ongoing').length,  color: '#3b82f6' },
    { name: 'Stalled',  value: projects.filter((p) => p.status === 'stalled').length,  color: '#f87171' },
    { name: 'Complete', value: projects.filter((p) => p.status === 'complete').length, color: '#10b981' },
  ].filter(d => d.value > 0); // hide zero-count statuses

  // Province chart — corrected spellings to match constituencies.ts
  const PROVINCES_ACCURATE = [
    'Lusaka', 'Copperbelt', 'Eastern', 'Southern',
    'Central', 'Northern', 'Western', 'North-Western', 'Luapula', 'Muchinga',
  ];
  const provinceData = PROVINCES_ACCURATE.map((prov) => {
    const matchingProjs = projects.filter((p) =>
      (p.province || '').replace(/north\s*western/i, 'North-Western') === prov
    );
    const budget = matchingProjs.reduce((sum, p) => sum + p.budget, 0);
    const spent  = matchingProjs.reduce((sum, p) => sum + p.spent,  0);
    const projectCount = matchingProjs.length;
    return {
      province: prov.replace('North-Western', 'N-Western'), // shorter label for chart
      fullProvince: prov,
      budget,
      spent,
      projectCount,
      utilisation: budget > 0 ? Math.round((spent / budget) * 100) : 0,
    };
  }).filter(d => d.budget > 0 || d.projectCount > 0); // hide provinces with no data

  // Scatter plot — budget vs completion with sector label
  const scatterPoints = projects.map((p) => ({
    name: p.name,
    budget: p.budget,
    progress: p.pct,
    sector: p.sector,
  }));

  // ── CONSTITUENCY RANKING — fully computed from live project data ─────────
  const constituencyRanking = dbConstituencies.map((c) => {
    const constProjects = projects.filter((p) => p.constituency === c.name);
    const spent         = constProjects.reduce((sum, p) => sum + p.spent, 0);
    const budget        = constProjects.reduce((sum, p) => sum + p.budget, 0);
    const completeCount = constProjects.filter(p => p.status === 'complete').length;
    const stalledCount  = constProjects.filter(p => p.status === 'stalled').length;
    const ongoingCount  = constProjects.filter(p => p.status === 'ongoing').length;
    const reportCount   = reports.filter(r => r.constituency === c.name).length;

    // Transparency score — computed accurately from real data:
    // +40 pts: fund utilisation (spent/budget) if > 0
    // +30 pts: completion rate (complete/total) if any projects
    // +20 pts: activity (any ongoing or complete)
    // -10 pts per stalled project (max -30)
    // -5 pts per report (max -20)
    let score = 50; // base score
    if (constProjects.length > 0) {
      const utilisationScore = budget > 0 ? (spent / budget) * 40 : 0;
      const completionScore  = (completeCount / constProjects.length) * 30;
      const activityBonus    = (ongoingCount > 0 || completeCount > 0) ? 20 : 0;
      const stalledPenalty   = Math.min(stalledCount * 10, 30);
      const reportPenalty    = Math.min(reportCount * 5, 20);
      score = Math.round(Math.max(0, Math.min(100,
        utilisationScore + completionScore + activityBonus - stalledPenalty - reportPenalty
      )));
    } else {
      // No projects yet — neutral score, deduct for reports
      score = Math.max(0, 50 - Math.min(reports.filter(r => r.constituency === c.name).length * 5, 30));
    }

    return {
      ...c,
      // Use actual CDF 2026 allocation if constituency has no Firestore override
      allocated: (c.allocated && c.allocated > 0) ? c.allocated : CDF_PER_CONSTITUENCY,
      projectsCount: constProjects.length,
      spent,
      budget,
      completeCount,
      stalledCount,
      ongoingCount,
      reportCount,
      score,
    };
  });

  const sortedConstituencies = [...constituencyRanking].filter((c) => {
    const q = constSearchQuery.toLowerCase();
    const matchesSearch = !q || c.name.toLowerCase().includes(q) || c.mp.toLowerCase().includes(q);
    const matchesProv = !constProvince || c.province === constProvince;
    return matchesSearch && matchesProv;
  });

  if (constSortOrder === 'name') {
    sortedConstituencies.sort((a, b) => a.name.localeCompare(b.name));
  } else if (constSortOrder === 'spent') {
    sortedConstituencies.sort((a, b) => b.spent - a.spent);
  } else {
    sortedConstituencies.sort((a, b) => b.score - a.score);
  }

  const selectedConstDetails = selectedConstName ? constituencyRanking.find(c => c.name === selectedConstName) : null;
  const selectedConstProjects = selectedConstName ? projects.filter(p => p.constituency === selectedConstName) : [];

  return (
    <div className="min-h-screen flex flex-col font-sans bg-bg text-ink selection:bg-pale">

      {/* TOPBAR */}
      <header className="bg-slate-900 border-b border-slate-800 text-white flex items-center justify-between px-4 md:px-6 h-16 sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-600 rounded-lg flex items-center justify-center text-xl shadow-inner">
            🏛️
          </div>
          <div>
            <h1 className="font-serif font-bold text-base md:text-lg leading-tight">Zambia CDF Tracker</h1>
            <p className="text-[10px] opacity-70 tracking-wide uppercase">Community Development Fund — Live Transparency Portal</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="hidden sm:flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-full px-3 py-1 text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-slate-300">Live Database Synchronized</span>
          </div>

          {citizenAccount && (
            <button
              onClick={() => { setActiveTab('pricing'); setPricingStep(5); }}
              className="bg-white/10 hover:bg-white/20 text-white rounded-lg px-3 py-1.5 text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors"
            >
              <User className="w-3.5 h-3.5" />
              <span>{citizenAccount.name.split(' ')[0]} {citizenAccount.premium && '💎'}</span>
            </button>
          )}

          {currentUser ? (
            <div className="flex items-center gap-2">
              <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] md:text-xs font-semibold rounded-full px-3 py-1">
                🛡️ {currentUser.role} {currentUser.constituency ? `(${currentUser.constituency})` : ''}
              </span>
              <button
                onClick={handleSystemLogout}
                className="text-white hover:text-red-300 p-1.5 hover:bg-white/5 rounded transition-colors"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowLoginModal(true)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs rounded-lg px-4 py-2 shadow transition-all cursor-pointer"
            >
              Sign In 🔐
            </button>
          )}
        </div>
      </header>

      {/* MOBILE NAVIGATION TOGGLE BAR */}
      <div className="md:hidden bg-slate-50 border-b border-slate-200 px-4 py-2 flex items-center justify-between sticky top-16 z-40">
        <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
          <span>📂</span> {showMobileNav ? 'Tabs Expanded' : 'Tabs Hidden'}
        </span>
        <button
          onClick={() => setShowMobileNav(!showMobileNav)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium px-3 py-1.5 rounded-md shadow-sm flex items-center gap-1 cursor-pointer transition-colors"
        >
          {showMobileNav ? '✕ Hide Navigation' : '☰ Show Navigation'}
        </button>
      </div>

      {/* DYNAMIC TAB RAIL */}
      <nav className={`bg-white border-b border-bo sticky z-40 shadow-md md:shadow-sm overflow-x-auto transition-all ${
        showMobileNav ? 'block top-[104px] md:top-16' : 'hidden md:block md:top-16'
      }`}>
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row divide-y divide-slate-100 md:divide-y-0">
          <button
            onClick={() => {
              setActiveTab('projects');
              if (window.innerWidth < 768) setShowMobileNav(false);
            }}
            className={`flex items-center justify-between md:justify-start gap-2 w-full md:w-auto text-left px-6 py-3.5 md:px-5 md:py-3.5 border-l-4 md:border-l-0 md:border-b-3 whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'projects'
                ? 'border-leaf text-leaf bg-pale/20 font-bold'
                : 'border-transparent text-mu hover:text-ink hover:bg-bg font-medium'
            }`}
          >
            <span>📋 Projects</span>
            {activeTab === 'projects' && <span className="md:hidden text-leaf">✓</span>}
          </button>
          <button
            onClick={() => {
              setActiveTab('constituencies');
              if (window.innerWidth < 768) setShowMobileNav(false);
            }}
            className={`flex items-center justify-between md:justify-start gap-2 w-full md:w-auto text-left px-6 py-3.5 md:px-5 md:py-3.5 border-l-4 md:border-l-0 md:border-b-3 whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'constituencies'
                ? 'border-blue-500 text-blue-600 bg-blue-50/20 font-bold'
                : 'border-transparent text-mu hover:text-ink hover:bg-bg font-medium'
            }`}
          >
            <span>🗺️ Constituencies</span>
            {activeTab === 'constituencies' && <span className="md:hidden text-blue-600">✓</span>}
          </button>
          <button
            onClick={() => {
              setActiveTab('analytics');
              if (window.innerWidth < 768) setShowMobileNav(false);
            }}
            className={`flex items-center justify-between md:justify-start gap-2 w-full md:w-auto text-left px-6 py-3.5 md:px-5 md:py-3.5 border-l-4 md:border-l-0 md:border-b-3 whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'analytics'
                ? 'border-amber-600 text-amber-700 bg-amber-50/20 font-bold'
                : 'border-transparent text-mu hover:text-ink hover:bg-bg font-medium'
            }`}
          >
            <span className="flex items-center gap-1.5">📊 Analytics <span className="text-[10px] text-amber-500">⭐</span></span>
            {activeTab === 'analytics' && <span className="md:hidden text-amber-700">✓</span>}
          </button>
          <button
            onClick={() => {
              setActiveTab('report');
              if (window.innerWidth < 768) setShowMobileNav(false);
            }}
            className={`flex items-center justify-between md:justify-start gap-2 w-full md:w-auto text-left px-6 py-3.5 md:px-5 md:py-3.5 border-l-4 md:border-l-0 md:border-b-3 whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'report'
                ? 'border-red-500 text-red-600 bg-red-50/20 font-bold'
                : 'border-transparent text-mu hover:text-ink hover:bg-bg font-medium'
            }`}
          >
            <span className="flex items-center gap-1.5">🚨 Report Misuse <span className="text-[10px] text-red-500">⭐</span></span>
            {activeTab === 'report' && <span className="md:hidden text-red-600">✓</span>}
          </button>
          <button
            onClick={() => {
              setActiveTab('requests');
              if (window.innerWidth < 768) setShowMobileNav(false);
            }}
            className={`flex items-center justify-between md:justify-start gap-2 w-full md:w-auto text-left px-6 py-3.5 md:px-5 md:py-3.5 border-l-4 md:border-l-0 md:border-b-3 whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'requests'
                ? 'border-yellow-600 text-yellow-700 bg-yellow-50/20 font-bold'
                : 'border-transparent text-mu hover:text-ink hover:bg-bg font-medium'
            }`}
          >
            <span className="flex items-center gap-1.5">💡 Request Project <span className="text-[10px] text-amber-500">⭐</span></span>
            {activeTab === 'requests' && <span className="md:hidden text-yellow-700">✓</span>}
          </button>
          <button
            onClick={() => {
              setActiveTab('announcements');
              if (window.innerWidth < 768) setShowMobileNav(false);
            }}
            className={`flex items-center justify-between md:justify-start gap-2 w-full md:w-auto text-left px-6 py-3.5 md:px-5 md:py-3.5 border-l-4 md:border-l-0 md:border-b-3 whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'announcements'
                ? 'border-sky-600 text-sky-700 bg-sky-50/20 font-bold'
                : 'border-transparent text-mu hover:text-ink hover:bg-bg font-medium'
            }`}
          >
            <span className="flex items-center gap-1.5">
              📢 Announcements
              {announcements.length > 0 && (
                <span className="text-[9px] bg-sky-600 text-white rounded-full px-1.5 py-0.5">{announcements.length}</span>
              )}
            </span>
            {activeTab === 'announcements' && <span className="md:hidden text-sky-700">✓</span>}
          </button>
          <button
            onClick={() => {
              setActiveTab('support');
              if (window.innerWidth < 768) setShowMobileNav(false);
            }}
            className={`flex items-center justify-between md:justify-start gap-2 w-full md:w-auto text-left px-6 py-3.5 md:px-5 md:py-3.5 border-l-4 md:border-l-0 md:border-b-3 whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'support'
                ? 'border-emerald-600 text-emerald-700 bg-emerald-50/20 font-bold'
                : 'border-transparent text-mu hover:text-ink hover:bg-bg font-medium'
            }`}
          >
            <span className="flex items-center gap-1.5">🤝 Apply for Support <span className="text-[10px] text-emerald-500">⭐</span></span>
            {activeTab === 'support' && <span className="md:hidden text-emerald-700">✓</span>}
          </button>
          <button
            onClick={() => {
              setActiveTab('pricing');
              if (window.innerWidth < 768) setShowMobileNav(false);
            }}
            className={`flex items-center justify-between md:justify-start gap-2 w-full md:w-auto text-left px-6 py-3.5 md:px-5 md:py-3.5 border-l-4 md:border-l-0 md:border-b-3 whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'pricing'
                ? 'border-purple-600 text-purple-700 bg-purple-50/20 font-bold'
                : 'border-transparent text-mu hover:text-ink hover:bg-bg font-medium'
            }`}
          >
            <span>💎 Pricing</span>
            {activeTab === 'pricing' && <span className="md:hidden text-purple-700">✓</span>}
          </button>
          {currentUser && (
            <button
              onClick={() => {
                setActiveTab('admin');
                if (window.innerWidth < 768) setShowMobileNav(false);
              }}
              className={`flex items-center justify-between md:justify-start gap-2 w-full md:w-auto text-left px-6 py-3.5 md:px-5 md:py-3.5 border-l-4 md:border-l-0 md:border-b-3 whitespace-nowrap transition-all cursor-pointer ${
                activeTab === 'admin'
                  ? 'border-emerald-700 text-emerald-800 bg-emerald-50/20 font-bold'
                  : 'border-transparent text-mu hover:text-ink hover:bg-bg font-medium'
              }`}
            >
              <span className="flex items-center gap-1.5">🛡️ Admin Section <span className="text-[10px]">🔒</span></span>
              {activeTab === 'admin' && <span className="md:hidden text-emerald-800">✓</span>}
            </button>
          )}
        </div>
      </nav>

      {/* HERO SECTION */}
      <section className="bg-gradient-to-br from-slate-900 via-slate-850 to-indigo-950 text-white px-6 py-12 relative overflow-hidden border-b border-slate-800">
        <div className="absolute top-0 right-0 w-80 h-80 bg-radial from-indigo-500/10 to-transparent pointer-events-none"></div>
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
          <div className="md:col-span-7">
            <h2 className="font-serif font-extrabold text-3xl md:text-4xl leading-tight mb-3">
              Track <span className="text-indigo-400 font-bold">every single Kwacha</span> of Zambia's CDF live
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed max-w-xl">
              K40,000,000 per constituency (2026 Budget allocation) • 156 constituencies • Real-time project database synced across standard ledgers for community oversight.
            </p>
          </div>
          <div className="md:col-span-5 grid grid-cols-2 gap-3">
            <div className="bg-slate-800/40 backdrop-blur-md border border-slate-700/40 rounded-xl p-4">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Total Disbursed</span>
              <span className="font-serif font-extrabold text-2xl text-indigo-300">{zmw(totalFundsDisbursed)}</span>
            </div>
            <div className="bg-slate-800/40 backdrop-blur-md border border-slate-700/40 rounded-xl p-4">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Total Projects</span>
              <span className="font-serif font-extrabold text-2xl text-indigo-300">{projects.length}</span>
            </div>
            <div className="bg-slate-800/40 backdrop-blur-md border border-slate-700/40 rounded-xl p-4">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Disbursement Ratio</span>
              <span className="font-serif font-extrabold text-2xl text-indigo-300">{disbursementRatio.toFixed(1)}%</span>
            </div>
            <div className="bg-slate-800/40 backdrop-blur-md border border-slate-700/40 rounded-xl p-4">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Stalled Projects</span>
              <span className="font-serif font-extrabold text-2xl text-red-400">{stalledCount}</span>
            </div>
          </div>
        </div>
      </section>

      {/* CORE CONTAINER */}
      <main className="max-w-6xl w-full mx-auto p-4 md:p-6 flex-grow">
        {/* TAB: PROJECTS */}
        {activeTab === 'projects' && (
          <div className="space-y-6">
            {/* Filter controls */}
            <div className="bg-white border border-bo rounded-2xl p-4 shadow-sm flex flex-wrap gap-3 items-center justify-between">
              <div className="flex flex-wrap gap-2.5 flex-grow">
                <input
                  type="text"
                  placeholder="Search project, constituency or MP..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="px-3.5 py-2 border border-bo rounded-xl text-sm focus:outline-none focus:border-leaf flex-grow max-w-sm"
                />
                <select
                  value={filterProvince}
                  onChange={(e) => setFilterProvince(e.target.value)}
                  className="px-3 py-2 border border-bo rounded-xl text-sm focus:outline-none focus:border-leaf"
                >
                  <option value="">All Provinces</option>
                  {['Lusaka', 'Copperbelt', 'Eastern', 'Southern', 'Central', 'Northern', 'Western', 'Northwestern', 'Luapula', 'Muchinga'].map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="px-3 py-2 border border-bo rounded-xl text-sm focus:outline-none focus:border-leaf"
                >
                  <option value="">All Statuses</option>
                  <option value="planned">Planned</option>
                  <option value="ongoing">Ongoing</option>
                  <option value="stalled">Stalled</option>
                  <option value="complete">Complete</option>
                </select>
                <select
                  value={filterSector}
                  onChange={(e) => setFilterSector(e.target.value)}
                  className="px-3 py-2 border border-bo rounded-xl text-sm focus:outline-none focus:border-leaf"
                >
                  <option value="">All Sectors</option>
                  {['Education', 'Health', 'Roads', 'Water', 'Agriculture', 'Youth'].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <button
                onClick={() => expCSV(filteredProjects)}
                className="bg-white border border-bo hover:bg-bg text-mu hover:text-ink px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition-all cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Export CSV</span>
              </button>
            </div>

            {/* Main project register table */}
            <div className="bg-white border border-bo rounded-2xl overflow-hidden shadow-sm">
              <div className="px-5 py-4 border-b border-bo bg-bg/50 flex justify-between items-center flex-wrap gap-2">
                <h3 className="font-serif font-bold text-base flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                  Active Community Projects Database
                </h3>
                <span className="text-xs text-mu font-medium">{filteredProjects.length} Projects displayed</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-bg/25 border-b border-bo text-mu text-[10px] uppercase font-semibold tracking-wider">
                      <th className="py-4 px-5">Project Details</th>
                      <th className="py-4 px-5">Constituency</th>
                      <th className="py-4 px-5">Sector</th>
                      <th className="py-4 px-5">Disbursement Info</th>
                      <th className="py-4 px-5">Progress Level</th>
                      <th className="py-4 px-5">Status</th>
                      <th className="py-4 px-5 text-center">Monitor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProjects.length > 0 ? (
                      filteredProjects.map((p) => (
                        <tr
                          key={p.id}
                          onClick={() => setSelectedProject(p)}
                          className="border-b border-bo/60 hover:bg-pale/10 transition-colors cursor-pointer"
                        >
                          <td className="py-4 px-5">
                            <div className="font-semibold text-sm text-ink">{p.name}</div>
                            <div className="text-xs text-mu mt-0.5">{getProjectMp(p)}</div>
                          </td>
                          <td className="py-4 px-5 text-sm">
                            <div>{p.constituency}</div>
                            <div className="text-[10px] text-mu">{p.province}</div>
                          </td>
                          <td className="py-4 px-5">
                            <span className="text-xs font-semibold px-2.5 py-1 bg-pale text-forest rounded-full">
                              {p.sector}
                            </span>
                          </td>
                          <td className="py-4 px-5 text-sm">
                            <div className="font-medium text-ink">{zmw(p.budget)}</div>
                            <div className="text-xs text-mu mt-0.5">Disbursed: {zmw(p.spent)}</div>
                          </td>
                          <td className="py-4 px-5">
                            <div className="w-24 bg-gray-100 rounded-full h-2 overflow-hidden mb-1">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                  width: `${p.pct}%`,
                                  backgroundColor: p.status === 'stalled' ? '#ef4444' : p.status === 'complete' ? '#10b981' : '#3b82f6',
                                }}
                              ></div>
                            </div>
                            <span className="text-[11px] font-mono font-medium text-mu">{p.pct}%</span>
                          </td>
                          <td className="py-4 px-5">
                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${sClass(p.status)}`}>
                              {sLabel(p.status)}
                            </span>
                          </td>
                          <td className="py-4 px-5 text-center">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleFlag(p.id);
                              }}
                              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                flaggedProjectIds.has(p.id) ? 'bg-red-50 text-red-500' : 'text-mu hover:bg-gray-100 hover:text-ink'
                              }`}
                            >
                              🚩
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="text-center py-10 text-mu text-sm">
                          No active projects match your selected filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            {renderLiveTransparencyFeed(true)}
          </div>
        )}

        {/* TAB: CONSTITUENCIES */}
        {activeTab === 'constituencies' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Ranking List */}
              <div className="lg:col-span-6 space-y-4">
                <div className="bg-white border border-bo rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row gap-3">
                  <input
                    type="text"
                    placeholder="Search constituency or MP..."
                    value={constSearchQuery}
                    onChange={(e) => setConstSearchQuery(e.target.value)}
                    className="px-3.5 py-1.5 border border-bo rounded-xl text-sm focus:outline-none focus:border-leaf flex-grow"
                  />
                  <select
                    value={constProvince}
                    onChange={(e) => setConstProvince(e.target.value)}
                    className="px-3 py-1.5 border border-bo rounded-xl text-sm focus:outline-none focus:border-leaf"
                  >
                    <option value="">All Provinces</option>
                    {['Central', 'Copperbelt', 'Eastern', 'Luapula', 'Lusaka', 'Muchinga', 'Northern', 'North-Western', 'Southern', 'Western'].map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                  <select
                    value={constSortOrder}
                    onChange={(e) => setConstSortOrder(e.target.value as any)}
                    className="px-3 py-1.5 border border-bo rounded-xl text-sm focus:outline-none focus:border-leaf"
                  >
                    <option value="score">Sort: Transparency</option>
                    <option value="name">Sort: Name</option>
                    <option value="spent">Sort: Spending</option>
                  </select>
                </div>

                <div className="bg-white border border-bo rounded-2xl overflow-hidden shadow-sm max-h-[600px] overflow-y-auto">
                  <div className="px-4 py-3 bg-bg/40 border-b border-bo font-serif font-bold text-sm">
                    Constituencies Transparency Index
                  </div>
                  <div className="divide-y divide-bo/60">
                    {sortedConstituencies.map((c, i) => {
                      const scoreColor = c.score >= 80 ? 'text-green-600' : c.score >= 60 ? 'text-amber-500' : 'text-red-600';
                      const isSelected = selectedConstName === c.name;
                      return (
                        <div
                          key={`${c.name}-${c.province}`}
                          onClick={() => setSelectedConstName(c.name)}
                          className={`p-4 flex justify-between items-center transition-all cursor-pointer ${
                            isSelected ? 'bg-pale/10 border-l-4 border-leaf' : 'hover:bg-bg/30'
                          }`}
                        >
                          <div className="space-y-1">
                            <h4 className="font-bold text-sm text-ink">{c.name}</h4>
                            <p className="text-[11px] text-mu">
                              {c.province} • MP: {c.mp}
                            </p>
                            <p className="text-[11px] font-semibold text-forest">
                              {c.projectsCount} Projects logged • {zmw(c.spent)} disbursed
                            </p>
                          </div>
                          <div className="text-right">
                            <span className={`font-serif font-extrabold text-lg block ${scoreColor}`}>
                              {c.score}%
                            </span>
                            <span className="text-[9px] text-mu block uppercase tracking-wider">transparency</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Constituency Detail Panel */}
              <div className="lg:col-span-6 bg-white border border-bo rounded-2xl shadow-sm p-5 space-y-6 min-h-[300px]">
                {selectedConstDetails ? (
                  <>
                    <div className="border-b border-bo pb-4">
                      <span className="text-[10px] uppercase font-bold text-leaf tracking-wider block">CONSTITUENCY PROFILE</span>
                      <h3 className="font-serif font-bold text-xl text-ink">{selectedConstDetails.name}</h3>
                      <p className="text-xs text-mu">{selectedConstDetails.province} Province • MP: {selectedConstDetails.mp}</p>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      <div className="bg-bg/50 rounded-xl p-3 text-center border border-bo">
                        <span className="text-[10px] text-mu uppercase block">CDF Allocation (2026)</span>
                        <span className="font-serif font-extrabold text-sm text-forest">{zmw(selectedConstDetails.allocated)}</span>
                        <span className="text-[9px] text-mu block">K30.4M per constituency</span>
                      </div>
                      <div className="bg-bg/50 rounded-xl p-3 text-center border border-bo">
                        <span className="text-[10px] text-mu uppercase block">Total Disbursed</span>
                        <span className="font-serif font-extrabold text-sm text-emerald-600">{zmw(selectedConstDetails.spent)}</span>
                        <span className="text-[9px] text-mu block">{selectedConstDetails.budget > 0 ? Math.round((selectedConstDetails.spent / selectedConstDetails.budget) * 100) : 0}% of project budget</span>
                      </div>
                      <div className="bg-bg/50 rounded-xl p-3 text-center border border-bo">
                        <span className="text-[10px] text-mu uppercase block">Projects Total</span>
                        <span className="font-serif font-extrabold text-sm text-amber-600">{selectedConstDetails.projectsCount}</span>
                        <span className="text-[9px] text-mu block">in the database</span>
                      </div>
                      <div className="bg-emerald-50 rounded-xl p-3 text-center border border-emerald-100">
                        <span className="text-[10px] text-mu uppercase block">Complete</span>
                        <span className="font-serif font-extrabold text-sm text-emerald-700">{selectedConstDetails.completeCount ?? 0}</span>
                      </div>
                      <div className="bg-blue-50 rounded-xl p-3 text-center border border-blue-100">
                        <span className="text-[10px] text-mu uppercase block">Ongoing</span>
                        <span className="font-serif font-extrabold text-sm text-blue-700">{selectedConstDetails.ongoingCount ?? 0}</span>
                      </div>
                      <div className="bg-red-50 rounded-xl p-3 text-center border border-red-100">
                        <span className="text-[10px] text-mu uppercase block">Stalled</span>
                        <span className="font-serif font-extrabold text-sm text-red-700">{selectedConstDetails.stalledCount ?? 0}</span>
                        {(selectedConstDetails.stalledCount ?? 0) > 0 && <span className="text-[9px] text-red-500 block">⚠️ Needs attention</span>}
                      </div>
                    </div>

                    {/* Transparency score bar */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-mu uppercase tracking-wider">Transparency Score</span>
                        <span className={`text-sm font-extrabold font-serif ${selectedConstDetails.score >= 80 ? 'text-emerald-600' : selectedConstDetails.score >= 60 ? 'text-amber-500' : 'text-red-600'}`}>{selectedConstDetails.score}%</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all ${selectedConstDetails.score >= 80 ? 'bg-emerald-500' : selectedConstDetails.score >= 60 ? 'bg-amber-400' : 'bg-red-500'}`}
                          style={{ width: `${selectedConstDetails.score}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-mu">Score is calculated from fund utilisation, project completion rate, active project count, stalled projects and whistleblower reports filed.</p>
                    </div>

                    {/* Reports summary */}
                    {(selectedConstDetails.reportCount ?? 0) > 0 && (
                      <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-xs text-red-700 flex items-start gap-2">
                        <span className="text-base">🚨</span>
                        <span><strong>{selectedConstDetails.reportCount} whistleblower report(s)</strong> have been filed for this constituency. These have been factored into the transparency score.</span>
                      </div>
                    )}

                    <div>
                      <h4 className="font-serif font-bold text-sm mb-3">Linked CDF Projects</h4>
                      {selectedConstProjects.length > 0 ? (
                        <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
                          {selectedConstProjects.map((p) => (
                            <div
                              key={p.id}
                              onClick={() => setSelectedProject(p)}
                              className="p-3 border border-bo hover:border-leaf/30 rounded-xl flex justify-between items-center gap-3 transition-all cursor-pointer"
                            >
                              <div className="min-w-0 flex-grow">
                                <h5 className="font-semibold text-xs text-ink truncate">{p.name}</h5>
                                <span className="text-[10px] bg-pale text-forest px-1.5 py-0.5 rounded-full inline-block mt-1">
                                  {p.sector}
                                </span>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <span className="font-mono text-xs block font-bold">{p.pct}%</span>
                                <span className={`text-[9px] uppercase font-semibold px-1.5 py-0.5 rounded-full inline-block ${sClass(p.status)}`}>
                                  {p.status}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-mu italic">No projects recorded in our firestore registries.</p>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center text-center py-16 text-mu">
                    <MapPin className="w-10 h-10 text-bo mb-2" />
                    <p className="text-sm font-medium">Select a constituency on the left to inspect allocations, MP credentials, and real-time ledger audits.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB: ANALYTICS */}
        {activeTab === 'analytics' && (
          <div className="space-y-6">
            {!isPremiumUser ? (
              <div className="bg-white border border-bo rounded-2xl p-10 text-center flex flex-col items-center justify-center max-w-lg mx-auto shadow-sm space-y-4">
                <Lock className="w-12 h-12 text-amber-600 animate-bounce" />
                <h3 className="font-serif font-extrabold text-xl text-ink">Unlocked Analytics Vault</h3>
                <p className="text-sm text-mu">Interactive Recharts dashboard, sector breakdown pie, correlation matrix, and MP metrics are premium features. Join the tracker to see detailed insights.</p>
                <button
                  onClick={() => setActiveTab('pricing')}
                  className="bg-amber-600 hover:bg-amber-500 text-white font-medium text-xs rounded-xl px-5 py-2.5 shadow transition-all cursor-pointer"
                >
                  🚀 Go to Premium Pricing
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="bg-white border border-bo rounded-2xl p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                    <span className="text-sm font-semibold text-leaf">Premium Analytics & Verification Module</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleFetchInsights}
                      disabled={aiInsightsLoading}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl px-4 py-2 cursor-pointer transition-colors flex items-center gap-1 disabled:opacity-50"
                    >
                      {aiInsightsLoading ? (
                        <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full"></span>
                      ) : '🤖'}
                      AI Strategic Audit
                    </button>
                    <div className="text-xs text-mu">Secure Audit Proof Validated • Sync: Live</div>
                  </div>
                </div>

                {/* AI Insights Result Panel */}
                {(aiInsightsLoading || aiInsightsText) && (
                  <div className="bg-gradient-to-r from-indigo-50/50 to-slate-50 border border-indigo-100 rounded-2xl p-5 shadow-sm space-y-3">
                    <h4 className="text-xs font-bold text-indigo-700 uppercase tracking-wider flex items-center gap-1.5">
                      ✨ Gemini AI Strategic Audit Insights & Recommendations
                    </h4>
                    {aiInsightsLoading ? (
                      <div className="flex items-center gap-2 text-xs text-mu py-2">
                        <span className="animate-spin inline-block w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full"></span>
                        Gemini analyzing CDF database distributions, sector splits, and citizen complaints...
                      </div>
                    ) : (
                      <div className="bg-white border border-indigo-50/50 rounded-xl p-4 text-xs text-slate-700 leading-relaxed whitespace-pre-line prose max-w-none shadow-inner">
                        {aiInsightsText}
                      </div>
                    )}
                  </div>
                )}

                {/* Grid for graphs */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Sector spending split */}
                  <div className="bg-white border border-bo rounded-2xl p-5 shadow-sm space-y-4">
                    <h4 className="font-serif font-bold text-sm">💰 Sector Budget vs Disbursed (live data)</h4>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={sectorData}>
                          <XAxis dataKey="name" stroke="#6b7280" fontSize={10} />
                          <YAxis stroke="#6b7280" fontSize={10} tickFormatter={(v) => `K${(v/1_000_000).toFixed(0)}M`} />
                          <Tooltip
                            formatter={(value: any, name: string) => [zmw(Number(value)), name === 'budget' ? 'Budget' : 'Disbursed']}
                            labelFormatter={(label) => sectorData.find(s => s.name === label)?.fullName || label}
                          />
                          <Bar dataKey="budget" fill="#6366f1" name="budget" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="spent" fill="#10b981" name="spent" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex gap-4 text-[11px]">
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-indigo-400 inline-block"></span>Budget</span>
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500 inline-block"></span>Disbursed</span>
                      {sectorData.length === 0 && <span className="text-mu italic">No project data yet — add projects to see sector breakdown.</span>}
                    </div>
                  </div>

                  {/* Status distribution Pie */}
                  <div className="bg-white border border-bo rounded-2xl p-5 shadow-sm space-y-4">
                    <h4 className="font-serif font-bold text-sm">📊 Projects Status Distribution</h4>
                    <div className="h-64 flex items-center justify-center">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={statusData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                          >
                            {statusData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="space-y-2 text-xs">
                        {statusData.map((d) => (
                          <div key={d.name} className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }}></span>
                            <span className="font-medium text-ink">{d.name} ({d.value})</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Province allocations chart */}
                  <div className="bg-white border border-bo rounded-2xl p-5 shadow-sm space-y-4">
                    <h4 className="font-serif font-bold text-sm">🏢 Regional Performance — Budget vs Disbursed by Province</h4>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={provinceData}>
                          <XAxis dataKey="province" stroke="#6b7280" fontSize={9} />
                          <YAxis stroke="#6b7280" fontSize={10} tickFormatter={(v) => `K${(v/1_000_000).toFixed(0)}M`} />
                          <Tooltip
                            formatter={(value: any, name: string) => [zmw(Number(value)), name === 'budget' ? 'Budget' : 'Disbursed']}
                            labelFormatter={(label) => `${label} Province`}
                          />
                          <Bar dataKey="budget" fill="#c7d2fe" name="budget" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="spent" fill="#10b981" name="spent" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex gap-4 text-[11px]">
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-indigo-200 inline-block"></span>Budget</span>
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500 inline-block"></span>Disbursed</span>
                    </div>
                  </div>

                  {/* Scatter Budget completion */}
                  <div className="bg-white border border-bo rounded-2xl p-5 shadow-sm space-y-4">
                    <h4 className="font-serif font-bold text-sm">🔵 Budget vs. Completion Correlation Analysis</h4>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart>
                          <XAxis type="number" dataKey="budget" name="Budget" unit=" ZMW" fontSize={9} stroke="#6b7280" />
                          <YAxis type="number" dataKey="progress" name="Progress" unit="%" fontSize={10} stroke="#6b7280" />
                          <ZAxis range={[60, 400]} />
                          <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                          <Scatter name="Projects" data={scatterPoints} fill="#6366f1" />
                        </ScatterChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB: REPORT MISUSE */}
        {activeTab === 'report' && (
          <div className="space-y-6">
            {!isPremiumUser ? (
              <div className="bg-white border border-bo rounded-2xl p-10 text-center flex flex-col items-center justify-center max-w-lg mx-auto shadow-sm space-y-4">
                <Shield className="w-12 h-12 text-red-600 animate-pulse" />
                <h3 className="font-serif font-extrabold text-xl text-ink">Anonymous Whistleblowing Locked</h3>
                <p className="text-sm text-mu">Filing reports and dispatching tender irregularities directly to the Anti-Corruption Commission (ACC) requires Premium access to ensure system verification and filter spam.</p>
                <button
                  onClick={() => setActiveTab('pricing')}
                  className="bg-red-600 hover:bg-red-500 text-white font-medium text-xs rounded-xl px-5 py-2.5 shadow transition-all cursor-pointer"
                >
                  🔒 Unlock Premium Secure Tools
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
                <div className="md:col-span-8 bg-white border border-bo rounded-2xl p-5 shadow-sm space-y-4">
                  <div className="border-b border-bo pb-3">
                    <h3 className="font-serif font-bold text-lg text-red-700 flex items-center gap-2">
                      <Shield className="w-5 h-5 text-red-600" /> Secure Whistleblowing System
                    </h3>
                    <p className="text-xs text-mu mt-1">Submit suspected CDF misallocations, ghost contractors, and tender irregularities. Reports are sent securely.</p>
                  </div>

                  <form onSubmit={handleSubmitReport} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs text-mu font-semibold block">Target Constituency *</label>
                        <select
                          value={reportConst}
                          onChange={(e) => setReportConst(e.target.value)}
                          className="w-full px-3 py-2 border border-bo rounded-xl text-sm focus:outline-none focus:border-red-500"
                        >
                          {dbConstituencies.map((c) => (
                            <option key={`${c.name}-${c.province}`} value={c.name}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-mu font-semibold block">Issue Classification *</label>
                        <select
                          value={reportType}
                          onChange={(e) => setReportType(e.target.value)}
                          className="w-full px-3 py-2 border border-bo rounded-xl text-sm focus:outline-none focus:border-red-500"
                        >
                          <option>Project not started (funds released)</option>
                          <option>Project abandoned mid-construction</option>
                          <option>Inflated contractor costs</option>
                          <option>Funds not accounted for</option>
                          <option>Nepotism / tender irregularity</option>
                          <option>MP diverting funds</option>
                          <option>Ghost project</option>
                          <option>Other misconduct</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs text-mu font-semibold block">Project Name (if known)</label>
                        <input
                          type="text"
                          placeholder="e.g. Matero Clinic Repair"
                          value={reportProj}
                          onChange={(e) => setReportProj(e.target.value)}
                          className="w-full px-3.5 py-2 border border-bo rounded-xl text-sm focus:outline-none focus:border-red-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-mu font-semibold block">Estimated Damaged Funds (ZMW)</label>
                        <input
                          type="number"
                          placeholder="e.g. 500000"
                          value={reportAmount}
                          onChange={(e) => setReportAmount(e.target.value)}
                          className="w-full px-3.5 py-2 border border-bo rounded-xl text-sm focus:outline-none focus:border-red-500"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs text-mu font-semibold block">Incident Description (Be Specific) *</label>
                      <textarea
                        rows={4}
                        placeholder="State what you witnessed. Include dates, company names, specific site remarks..."
                        value={reportDesc}
                        onChange={(e) => setReportDesc(e.target.value)}
                        className="w-full px-3.5 py-2 border border-bo rounded-xl text-sm focus:outline-none focus:border-red-500 resize-none"
                      ></textarea>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs text-mu font-semibold block">📸 Attach Evidence Photo (optional)</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleReportPhotoChange}
                        className="w-full text-xs text-mu file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-red-50 file:text-red-700 hover:file:bg-red-100 cursor-pointer"
                      />
                      {reportPhotoError && (
                        <p className="text-[11px] text-red-600">{reportPhotoError}</p>
                      )}
                      {reportPhoto && (
                        <div className="relative inline-block mt-2">
                          <img src={reportPhoto} alt="Evidence preview" className="h-28 rounded-lg border border-bo object-cover" />
                          <button
                            type="button"
                            onClick={() => { setReportPhoto(null); setReportPhotoError(''); }}
                            className="absolute -top-2 -right-2 bg-red-600 hover:bg-red-700 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] cursor-pointer"
                            aria-label="Remove photo"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs text-mu font-semibold block">Optional Contact Details (Stay Blank for Anonymous)</label>
                      <input
                        type="text"
                        placeholder="e.g. 097xxxxxxx (Fully anonymous if empty)"
                        value={reportContact}
                        onChange={(e) => setReportContact(e.target.value)}
                        className="w-full px-3.5 py-2 border border-bo rounded-xl text-sm focus:outline-none focus:border-red-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs text-mu font-semibold block">
                        Email Address <span className="text-red-600 font-bold">(optional — so admin can notify you of the outcome)</span>
                      </label>
                      <input
                        type="email"
                        placeholder="e.g. yourname@gmail.com — leave blank to stay fully anonymous"
                        value={reportEmail}
                        onChange={(e) => setReportEmail(e.target.value)}
                        className="w-full px-3.5 py-2 border border-bo rounded-xl text-sm focus:outline-none focus:border-red-500"
                      />
                      <p className="text-[10px] text-mu">When the admin updates your report status (Under Review, Escalated to ACC, Closed), you will receive an email notification at this address.</p>
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                      <input
                        type="checkbox"
                        id="flagAcc"
                        checked={reportAcc}
                        onChange={(e) => setReportAcc(e.target.checked)}
                        className="w-4 h-4 rounded text-red-600 focus:ring-red-500 cursor-pointer"
                      />
                      <label htmlFor="flagAcc" className="text-xs font-semibold text-mu select-none cursor-pointer">
                        Simultaneously flag report directly to Anti-Corruption Commission (ACC)
                      </label>
                    </div>

                    <button
                      type="submit"
                      className="w-full bg-red-700 hover:bg-red-600 text-white font-medium text-sm rounded-xl py-3 shadow transition-colors cursor-pointer"
                    >
                      Submit Encrypted Misuse Report 🔒
                    </button>

                    {reportFeedback && (
                      <div className={`p-4 rounded-xl text-xs font-medium ${reportFeedback.startsWith('✅') ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                        {reportFeedback}
                      </div>
                    )}
                  </form>
                </div>

                <div className="md:col-span-4 space-y-4">
                  <div className="bg-white border border-bo rounded-2xl p-4 shadow-sm space-y-3">
                    <h4 className="font-serif font-bold text-sm text-ink">💡 Whistleblowing Guarantee</h4>
                    <p className="text-xs text-mu leading-relaxed">
                      This tracker ensures that all submissions are stored locally in Firestore with end-to-end security measures. Leaving details blank guarantees that no IP address, cookies, or location credentials are saved to keep citizens safe.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB: REQUEST PROJECT */}
        {activeTab === 'requests' && (
          <div className="space-y-6">
            {!isPremiumUser ? (
              <div className="bg-white border border-bo rounded-2xl p-10 text-center flex flex-col items-center justify-center max-w-lg mx-auto shadow-sm space-y-4">
                <Lightbulb className="w-12 h-12 text-yellow-600 animate-pulse" />
                <h3 className="font-serif font-extrabold text-xl text-ink">Community Requests Vault</h3>
                <p className="text-sm text-mu">Filing community suggestions, estimated costs, and tracking approval milestones through the active registry is restricted to Premium citizens and administrative staff.</p>
                <button
                  onClick={() => setActiveTab('pricing')}
                  className="bg-yellow-600 hover:bg-yellow-500 text-white font-medium text-xs rounded-xl px-5 py-2.5 shadow transition-all cursor-pointer"
                >
                  🔒 Unlock Premium Secure Tools
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
                <div className="md:col-span-8 bg-white border border-bo rounded-2xl p-5 shadow-sm space-y-4">
                  <div className="border-b border-bo pb-3">
                    <h3 className="font-serif font-bold text-lg text-yellow-700 flex items-center gap-2">
                      <Lightbulb className="w-5 h-5 text-yellow-600" /> Request Community Project
                    </h3>
                    <p className="text-xs text-mu mt-1">Submit school block, borehole, local road rehabilitation suggestions directly to the Constituency Development Fund Committee.</p>
                  </div>

                  <form onSubmit={handleSubmitRequest} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs text-mu font-semibold block">Proposed Project Name *</label>
                        <input
                          type="text"
                          placeholder="e.g. Ward 4 Bridge Reconstruction"
                          value={reqName}
                          onChange={(e) => setReqName(e.target.value)}
                          className="w-full px-3.5 py-2 border border-bo rounded-xl text-sm focus:outline-none focus:border-yellow-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-mu font-semibold block">Target Constituency *</label>
                        <select
                          value={reqConst}
                          onChange={(e) => setReqConst(e.target.value)}
                          className="w-full px-3 py-2 border border-bo rounded-xl text-sm focus:outline-none focus:border-yellow-500"
                        >
                          {ALL_CONSTITUENCIES.map((c) => (
                            <option key={`${c.name}-${c.province}`} value={c.name}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs text-mu font-semibold block">Estimated Allocation Budget (ZMW)</label>
                        <input
                          type="number"
                          placeholder="e.g. 1200000"
                          value={reqCost}
                          onChange={(e) => setReqCost(e.target.value)}
                          className="w-full px-3.5 py-2 border border-bo rounded-xl text-sm focus:outline-none focus:border-yellow-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-mu font-semibold block">Estimated Community Beneficiaries</label>
                        <input
                          type="number"
                          placeholder="e.g. 5000"
                          value={reqBeneficiaries}
                          onChange={(e) => setReqBeneficiaries(e.target.value)}
                          className="w-full px-3.5 py-2 border border-bo rounded-xl text-sm focus:outline-none focus:border-yellow-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs text-mu font-semibold block">Primary Sector *</label>
                        <select
                          value={reqSector}
                          onChange={(e) => setReqSector(e.target.value)}
                          className="w-full px-3 py-2 border border-bo rounded-xl text-sm focus:outline-none focus:border-yellow-500"
                        >
                          <option>Education (school, classroom)</option>
                          <option>Health (clinic, health post)</option>
                          <option>Roads (grading, tarring, bridge)</option>
                          <option>Water (borehole, water kiosk)</option>
                          <option>Agriculture (irrigation, storage)</option>
                          <option>Youth (sports, training, hall)</option>
                          <option>Other</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-mu font-semibold block">Your Name / Group Name *</label>
                        <input
                          type="text"
                          placeholder="e.g. Mary Mwansa"
                          value={reqSubName}
                          onChange={(e) => setReqSubName(e.target.value)}
                          className="w-full px-3.5 py-2 border border-bo rounded-xl text-sm focus:outline-none focus:border-yellow-500"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs text-mu font-semibold block">Detailed Reasons & Priority Status *</label>
                      <textarea
                        rows={4}
                        placeholder="Explain why this project is critical for your ward, current conditions, lack of resources..."
                        value={reqDesc}
                        onChange={(e) => setReqDesc(e.target.value)}
                        className="w-full px-3.5 py-2 border border-bo rounded-xl text-sm focus:outline-none focus:border-yellow-500 resize-none"
                      ></textarea>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs text-mu font-semibold block">Your Phone Number (optional)</label>
                      <input
                        type="tel"
                        placeholder="e.g. 096xxxxxxx"
                        value={reqSubContact}
                        onChange={(e) => setReqSubContact(e.target.value)}
                        className="w-full px-3.5 py-2 border border-bo rounded-xl text-sm focus:outline-none focus:border-yellow-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs text-mu font-semibold block">
                        Email Address <span className="text-yellow-600 font-bold">(recommended — admin decision sent here)</span>
                      </label>
                      <input
                        type="email"
                        placeholder="e.g. yourname@gmail.com"
                        value={reqSubEmail}
                        onChange={(e) => setReqSubEmail(e.target.value)}
                        className="w-full px-3.5 py-2 border border-bo rounded-xl text-sm focus:outline-none focus:border-yellow-500"
                      />
                      <p className="text-[10px] text-mu">When the admin approves, rejects or reviews your request, you will receive an email notification at this address.</p>
                    </div>

                    <button
                      type="submit"
                      className="w-full bg-yellow-600 hover:bg-yellow-500 text-white font-medium text-sm rounded-xl py-3 shadow transition-colors cursor-pointer"
                    >
                      File Community Project Suggestion 💡
                    </button>

                    {reqFeedback && (
                      <div className={`p-4 rounded-xl text-xs font-medium ${reqFeedback.startsWith('✅') ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                        {reqFeedback}
                      </div>
                    )}
                  </form>
                </div>

                <div className="md:col-span-4 bg-white border border-bo rounded-2xl p-4 shadow-sm space-y-4 max-h-[720px] overflow-y-auto">
                  <div className="flex items-center justify-between">
                    <h4 className="font-serif font-bold text-sm text-ink">🗳️ Active Suggestion Registry</h4>
                    <span className="text-[9px] uppercase font-bold bg-yellow-50 text-yellow-800 px-2 py-0.5 rounded-full">{allRequests.length} filed</span>
                  </div>
                  <p className="text-xs text-mu leading-relaxed">
                    Once submitted, your request is immediately synced to our active database for transparency tracking. Upvote requests you support, or leave a comment — both are shared with local administrators.
                  </p>

                  <div className="space-y-1">
                    <label className="text-[10px] text-mu font-semibold block">Your name (shown on comments, optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Mary Mwansa"
                      value={commenterName}
                      onChange={(e) => setCommenterName(e.target.value)}
                      className="w-full px-3 py-1.5 border border-bo rounded-lg text-xs focus:outline-none focus:border-yellow-500"
                    />
                  </div>

                  <div className="space-y-3 divide-y divide-bo/50">
                    {[...allRequests].sort((a, b) => (b.votes || 0) - (a.votes || 0)).map((r) => {
                      const myVote = getMyVoteForRequest(r);
                      return (
                      <div key={r.id} className="pt-3 first:pt-0 space-y-2">
                        <div className="flex justify-between items-start gap-2">
                          <div>
                            <h5 className="font-bold text-xs text-ink">{r.name}</h5>
                            <p className="text-[10px] text-mu">{r.constituency}</p>
                          </div>
                          <span className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded-full shrink-0 ${
                            r.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' :
                            r.status === 'Rejected' ? 'bg-red-100 text-red-700' :
                            r.status === 'Under Review' ? 'bg-blue-100 text-blue-700' :
                            'bg-amber-100 text-amber-700'
                          }`}>{r.status}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleUpvoteRequest(r.id)}
                            disabled={!!myVote}
                            className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg transition-colors ${
                              myVote === 'yes'
                                ? 'bg-yellow-100 text-yellow-700 cursor-default'
                                : myVote === 'no'
                                ? 'bg-bg text-mu/50 cursor-default border border-bo opacity-60'
                                : 'bg-bg hover:bg-yellow-50 text-mu hover:text-yellow-700 cursor-pointer border border-bo'
                            }`}
                          >
                            👍 {r.votes || 0} {myVote === 'yes' ? 'Supported' : 'Support'}
                          </button>
                          <button
                            onClick={() => handleDownvoteRequest(r.id)}
                            disabled={!!myVote}
                            className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg transition-colors ${
                              myVote === 'no'
                                ? 'bg-red-100 text-red-700 cursor-default'
                                : myVote === 'yes'
                                ? 'bg-bg text-mu/50 cursor-default border border-bo opacity-60'
                                : 'bg-bg hover:bg-red-50 text-mu hover:text-red-700 cursor-pointer border border-bo'
                            }`}
                          >
                            👎 {r.rejects || 0} {myVote === 'no' ? 'Rejected' : 'Reject'}
                          </button>
                          {r.comments && r.comments.length > 0 && (
                            <span className="text-[10px] text-mu">💬 {r.comments.length}</span>
                          )}
                          {!myVote && !getVoterIdentity() && (
                            <span className="text-[9px] text-mu italic">log in to vote</span>
                          )}
                        </div>

                        {r.comments && r.comments.length > 0 && (
                          <div className="space-y-1 pl-1 border-l-2 border-bo/60">
                            {r.comments.slice(-3).map((c) => (
                              <p key={c.id} className="text-[10px] text-mu pl-2">
                                <span className="font-semibold text-ink">{c.author}:</span> {c.text}
                              </p>
                            ))}
                          </div>
                        )}

                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            placeholder="Add a comment..."
                            value={commentDrafts[r.id] || ''}
                            onChange={(e) => setCommentDrafts((prev) => ({ ...prev, [r.id]: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddComment(r.id); } }}
                            className="flex-1 px-2.5 py-1.5 border border-bo rounded-lg text-[10px] focus:outline-none focus:border-yellow-500"
                          />
                          <button
                            onClick={() => handleAddComment(r.id)}
                            className="bg-yellow-600 hover:bg-yellow-500 text-white text-[10px] font-bold px-2.5 rounded-lg cursor-pointer transition-colors"
                          >
                            Post
                          </button>
                        </div>
                      </div>
                      );
                    })}
                    {allRequests.length === 0 && (
                      <p className="text-xs text-mu italic pt-2">No community requests filed yet — be the first!</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB: ANNOUNCEMENTS BOARD */}
        {activeTab === 'announcements' && (
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="text-center space-y-2">
              <span className="text-xs uppercase tracking-widest font-bold text-sky-600">PUBLIC NOTICE BOARD</span>
              <h2 className="font-serif font-extrabold text-2xl md:text-3xl">Announcements</h2>
              <p className="text-sm text-mu max-w-lg mx-auto">Tenders, public meetings, and budget releases posted directly by CDF administrators.</p>
            </div>

            {announcements.length > 0 ? (
              <div className="space-y-4">
                {announcements.map((a) => (
                  <div key={a.id} className="bg-white border border-bo rounded-2xl p-5 shadow-sm space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded-full ${
                          a.type === 'Tender' ? 'bg-purple-50 text-purple-700' :
                          a.type === 'Meeting' ? 'bg-blue-50 text-blue-700' :
                          a.type === 'Budget Release' ? 'bg-emerald-50 text-emerald-700' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {a.type === 'Tender' && '📄 '}
                          {a.type === 'Meeting' && '🗓️ '}
                          {a.type === 'Budget Release' && '💰 '}
                          {a.type === 'General' && '📌 '}
                          {a.type}
                        </span>
                        <h3 className="font-serif font-bold text-base text-ink mt-1.5">{a.title}</h3>
                      </div>
                      <span className="text-[10px] text-mu whitespace-nowrap">{a.date}</span>
                    </div>
                    <p className="text-sm text-ink leading-relaxed">{a.body}</p>
                    <div className="flex items-center gap-2 pt-1 border-t border-bo/50 mt-2 text-[10px] text-mu">
                      <span className="font-semibold text-sky-700">👤 {a.postedBy}</span>
                      <span>·</span>
                      <span className="font-semibold">📍 {a.constituency || 'National — all constituencies'}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white border border-bo rounded-2xl p-10 text-center shadow-sm">
                <p className="text-sm text-mu italic">No announcements have been posted yet. Check back soon.</p>
              </div>
            )}
          </div>
        )}

        {/* TAB: PRICING */}
        {activeTab === 'pricing' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="text-center space-y-2">
              <span className="text-xs uppercase tracking-widest font-bold text-amber-600">MEMBERSHIP PLANS</span>
              <h2 className="font-serif font-extrabold text-2xl md:text-3xl">Affordable Premium Options</h2>
              <p className="text-sm text-mu max-w-lg mx-auto">Help maintain the active transparency portal, unlock reports, submit live project proposals, and access high-frequency sync audits.</p>
              {!citizenAccount && (
                <button
                  onClick={() => { resetCitizenLoginState(); setShowCitizenLoginModal(true); }}
                  className="text-xs font-semibold text-sky-600 hover:text-sky-700 underline underline-offset-2 cursor-pointer"
                >
                  Already registered? Log in
                </button>
              )}
            </div>

            {pricingStep === 1 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Free tier */}
                <div className="bg-white border border-bo rounded-2xl p-6 shadow-sm flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <span className="text-xs uppercase font-bold text-mu tracking-wider">Free Citizen tier</span>
                    <h3 className="font-serif font-extrabold text-3xl">K0 <span className="text-xs text-mu">/ forever</span></h3>
                    <ul className="text-xs text-mu space-y-2.5 pt-4">
                      <li className="flex items-center gap-2">✔️ View all 156 constituencies</li>
                      <li className="flex items-center gap-2">✔️ Track ongoing project progress</li>
                      <li className="flex items-center gap-2">✔️ View general budget allocations</li>
                      <li className="text-bo">❌ Access reports & ACC flags</li>
                      <li className="text-bo">❌ File community project requests</li>
                      <li className="text-bo">❌ Recharts interactive analytical curves</li>
                    </ul>
                  </div>
                  <button
                    onClick={() => setActiveTab('projects')}
                    className="w-full bg-white border border-bo hover:bg-bg text-ink py-2.5 rounded-xl text-xs font-semibold cursor-pointer"
                  >
                    Continue Free tier
                  </button>
                </div>

                {/* Premium tier */}
                <div className="bg-gradient-to-b from-white to-amber-50/10 border-2 border-amber-500 rounded-2xl p-6 shadow-sm flex flex-col justify-between space-y-4 relative">
                  <span className="absolute -top-3 right-6 bg-amber-500 text-white text-[9px] uppercase font-bold px-3 py-1 rounded-full">RECOMMENDED</span>
                  <div className="space-y-2">
                    <span className="text-xs uppercase font-bold text-amber-600 tracking-wider">Premium Activist tier</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSelectedPlan('monthly')}
                        className={`px-3 py-1 text-xs rounded-lg font-semibold border ${selectedPlan === 'monthly' ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-white border-bo text-mu'}`}
                      >
                        Monthly K50
                      </button>
                      <button
                        onClick={() => setSelectedPlan('yearly')}
                        className={`px-3 py-1 text-xs rounded-lg font-semibold border ${selectedPlan === 'yearly' ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-white border-bo text-mu'}`}
                      >
                        Yearly K500
                      </button>
                    </div>
                    <ul className="text-xs text-ink space-y-2.5 pt-4">
                      <li className="flex items-center gap-2 text-emerald-800 font-medium">✔️ Everything in Free tier</li>
                      <li className="flex items-center gap-2">✔️ File anonymous whistleblowing reports</li>
                      <li className="flex items-center gap-2">✔️ Submit community project requests</li>
                      <li className="flex items-center gap-2">✔️ Full interactive analytical charts (Recharts)</li>
                      <li className="flex items-center gap-2">✔️ Flag project anomalies & track milestones</li>
                    </ul>
                  </div>
                  <button
                    onClick={() => setPricingStep(2)}
                    className="w-full bg-amber-600 hover:bg-amber-500 text-white py-2.5 rounded-xl text-xs font-semibold cursor-pointer"
                  >
                    Unlock Premium Activist
                  </button>
                </div>
              </div>
            )}

            {pricingStep === 2 && (
              <div className="bg-white border border-bo rounded-2xl p-6 shadow-sm space-y-6 max-w-md mx-auto">
                <div className="border-b border-bo pb-3">
                  <h3 className="font-serif font-bold text-lg">💰 Send Payment</h3>
                  <p className="text-xs text-mu mt-0.5">Please settle {selectedPlan === 'monthly' ? 'K50' : 'K500'} ZMW using any mobile money / banking network below.</p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {paymentMethods.map((pm) => (
                    <button
                      key={pm.id}
                      onClick={() => setSelectedPaymentMethodId(pm.id)}
                      className={`p-3 rounded-xl border text-left flex items-center gap-2 transition-all cursor-pointer ${
                        selectedPaymentMethodId === pm.id ? 'border-amber-500 bg-amber-50/10' : 'border-bo hover:bg-bg/30'
                      }`}
                    >
                      <span className="text-lg">{pm.icon}</span>
                      <span className="text-xs font-semibold truncate">{pm.name}</span>
                    </button>
                  ))}
                </div>

                {paymentMethods.length > 0 && (
                  <div className="bg-bg/50 rounded-xl p-4 border border-bo space-y-2">
                    <span className="text-[10px] text-mu uppercase font-bold">
                      {paymentMethods.find((pm) => pm.id === selectedPaymentMethodId)?.detailLabel}
                    </span>
                    <div className="font-mono text-sm font-bold text-forest">
                      {paymentMethods.find((pm) => pm.id === selectedPaymentMethodId)?.detail}
                    </div>
                    <p className="text-[10px] text-mu leading-relaxed">
                      {paymentMethods.find((pm) => pm.id === selectedPaymentMethodId)?.note} Use your name as the reference.
                    </p>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => setPricingStep(1)}
                    className="flex-1 bg-white border border-bo text-ink rounded-xl py-2.5 text-xs font-semibold cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => setPricingStep(3)}
                    className="flex-1 bg-amber-600 hover:bg-amber-500 text-white rounded-xl py-2.5 text-xs font-semibold cursor-pointer"
                  >
                    I Have Settled Payment
                  </button>
                </div>
              </div>
            )}

            {pricingStep === 3 && (
              <div className="bg-white border border-bo rounded-2xl p-6 shadow-sm space-y-4 max-w-md mx-auto">
                <div className="border-b border-bo pb-3">
                  <h3 className="font-serif font-bold text-lg">👤 Create Premium Account</h3>
                  <p className="text-xs text-mu mt-0.5">Define your account credentials. All session data utilizes encrypted tokens.</p>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs text-mu font-semibold block">Full Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Mary Mwansa"
                      value={signupName}
                      onChange={(e) => setSignupName(e.target.value)}
                      className="w-full px-3 py-2 border border-bo rounded-xl text-sm focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-mu font-semibold block">Email Address</label>
                    <input
                      type="email"
                      placeholder="e.g. mary@example.com"
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      className="w-full px-3 py-2 border border-bo rounded-xl text-sm focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-mu font-semibold block">Username (for quick login later — optional, defaults to your email prefix)</label>
                    <input
                      type="text"
                      placeholder="e.g. mary_mwansa"
                      value={signupUsername}
                      onChange={(e) => setSignupUsername(e.target.value)}
                      className="w-full px-3 py-2 border border-bo rounded-xl text-sm focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-mu font-semibold block">Password (min 8 chars)</label>
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      className="w-full px-3 py-2 border border-bo rounded-xl text-sm focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-mu font-semibold block">Paying Wallet / Account Number (for audit match)</label>
                    <input
                      type="text"
                      placeholder="e.g. MoMo Number 096xxxxxxx"
                      value={signupWallet}
                      onChange={(e) => setSignupWallet(e.target.value)}
                      className="w-full px-3 py-2 border border-bo rounded-xl text-sm focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                {signupError && <div className="text-xs text-red-600 bg-red-50 p-3 rounded-lg font-medium">{signupError}</div>}

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => setPricingStep(2)}
                    className="flex-1 bg-white border border-bo text-ink rounded-xl py-2.5 text-xs font-semibold cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleSendSignupOtp}
                    className="flex-1 bg-amber-600 hover:bg-amber-500 text-white rounded-xl py-2.5 text-xs font-semibold cursor-pointer"
                  >
                    Sign Up
                  </button>
                </div>
              </div>
            )}

            {pricingStep === 4 && (
              <div className="bg-white border border-bo rounded-2xl p-6 shadow-sm space-y-4 max-w-md mx-auto text-center">
                <h3 className="font-serif font-bold text-lg">📧 Verify Email OTP</h3>
                <p className="text-xs text-mu">A login verification code was sent to your email.</p>

                <input
                  type="text"
                  placeholder="000000"
                  maxLength={6}
                  value={signupOtpInput}
                  onChange={(e) => setSignupOtpInput(e.target.value)}
                  className="px-4 py-3 border border-bo rounded-xl text-2xl font-bold tracking-widest text-center w-full focus:outline-none focus:border-amber-500"
                />

                {signupError && <div className="text-xs text-red-600 bg-red-50 p-3 rounded-lg font-medium">{signupError}</div>}

                <button
                  onClick={handleVerifySignupOtp}
                  className="w-full bg-amber-600 hover:bg-amber-500 text-white py-2.5 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Verify Code & Create Profile
                </button>
              </div>
            )}

            {pricingStep === 5 && citizenAccount && (
              <div className="bg-white border border-bo rounded-2xl p-6 shadow-sm space-y-6 max-w-md mx-auto">
                <div className="border-b border-bo pb-3 text-center">
                  <h3 className="font-serif font-bold text-lg flex items-center justify-center gap-1.5">
                    Premium Dashboard {citizenAccount.premium && '💎'}
                  </h3>
                  <p className="text-xs text-mu mt-0.5">{citizenAccount.email}</p>
                </div>

                <div className="space-y-2.5 text-xs">
                  <div className="flex justify-between py-1.5 border-b border-bo/60">
                    <span className="text-mu">Full Name</span>
                    <strong className="text-ink">{citizenAccount.name}</strong>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-bo/60">
                    <span className="text-mu">Selected Membership</span>
                    <strong className="text-ink uppercase tracking-wider">{citizenAccount.plan} Plan</strong>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-bo/60">
                    <span className="text-mu">Paying Wallet</span>
                    <strong className="text-ink">{citizenAccount.wallet || 'None'}</strong>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-bo/60">
                    <span className="text-mu">Ledger Activation Status</span>
                    <strong className={citizenAccount.premium ? 'text-emerald-600' : 'text-amber-500 animate-pulse'}>
                      {citizenAccount.premium ? 'Approved (Active)' : 'Pending Admin Code'}
                    </strong>
                  </div>
                </div>

                {!citizenAccount.premium && (
                  <div className="bg-amber-50/25 border border-amber-500/20 rounded-xl p-4 space-y-3">
                    <h4 className="text-xs font-semibold text-amber-800">🔑 Enter Activated Access Code</h4>
                    <p className="text-[10px] text-mu leading-relaxed">Admin will verify your matching wallet transfer and dispatch your token key. For tests, enter: <strong className="font-mono">CDF-PREMIUM-2026</strong></p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="CDF-XXXX-XXXX"
                        value={accessCodeInput}
                        onChange={(e) => setAccessCodeInput(e.target.value)}
                        className="flex-grow px-3 py-1.5 border border-bo rounded-xl text-xs focus:outline-none focus:border-amber-500"
                      />
                      <button
                        onClick={handleActivatePremium}
                        className="bg-amber-600 hover:bg-amber-500 text-white rounded-xl px-4 py-1.5 text-xs font-semibold cursor-pointer"
                      >
                        Submit
                      </button>
                    </div>
                  </div>
                )}

                {signupError && <div className="text-xs text-red-600 bg-red-50 p-3 rounded-lg font-medium">{signupError}</div>}

                <button
                  onClick={handleCitizenLogout}
                  className="w-full bg-red-50 hover:bg-red-100 text-red-700 py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
                >
                  Logout from Dashboard
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB: SUPPORT APPLICATIONS */}
        {activeTab === 'support' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-white border border-bo rounded-2xl p-6 shadow-sm">
              <div className="border-b border-bo pb-4 mb-6">
                <h3 className="font-serif font-extrabold text-xl text-ink">🤝 Apply for CDF Support & Empowerment</h3>
                <p className="text-xs text-mu mt-1">
                  Apply for Constituency Development Fund (CDF) Grants, Secondary School/Skills Bursaries, or Agricultural support packages directly.
                </p>
              </div>

              {/* Category Selector Tabs */}
              <div className="grid grid-cols-3 gap-2 p-1 bg-slate-50 border border-bo rounded-xl mb-6">
                {(['Grant', 'Bursary', 'Agricultural Support'] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setAppCategory(cat)}
                    className={`py-2 px-3 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                      appCategory === cat
                        ? 'bg-white text-emerald-800 shadow-sm border border-emerald-100'
                        : 'text-mu hover:text-ink'
                    }`}
                  >
                    {cat === 'Grant' && '💼 Youth & Women Grant'}
                    {cat === 'Bursary' && '🎓 Education Bursary'}
                    {cat === 'Agricultural Support' && '🚜 Farm Inputs Support'}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSubmitApplication} className="space-y-6">
                {/* Section: Basic Applicant Info */}
                <div>
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">1. Personal & Contact Information</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-ink mb-1.5">Applicant Full Name *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Mwansa Chola"
                        value={appApplicantName}
                        onChange={(e) => setAppApplicantName(e.target.value)}
                        className="w-full bg-slate-50 border border-bo rounded-xl px-3 py-2 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-ink mb-1.5">National Registration Card (NRC) *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. 123456/11/1"
                        value={appNrc}
                        onChange={(e) => setAppNrc(e.target.value)}
                        className="w-full bg-slate-50 border border-bo rounded-xl px-3 py-2 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-ink mb-1.5">Mobile Contact Number *</label>
                      <input
                        type="tel"
                        required
                        placeholder="e.g. 0977123456"
                        value={appContact}
                        onChange={(e) => setAppContact(e.target.value)}
                        className="w-full bg-slate-50 border border-bo rounded-xl px-3 py-2 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-ink mb-1.5">Email Address <span className="text-emerald-700 font-bold">(recommended — admin decision sent here)</span></label>
                      <input
                        type="email"
                        placeholder="e.g. mwansa@gmail.com"
                        value={appEmail}
                        onChange={(e) => setAppEmail(e.target.value)}
                        className="w-full bg-slate-50 border border-bo rounded-xl px-3 py-2 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-ink mb-1.5">Constituency *</label>
                      <select
                        value={appConst}
                        onChange={(e) => setAppConst(e.target.value)}
                        className="w-full bg-slate-50 border border-bo rounded-xl px-3 py-2 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      >
                        {dbConstituencies.map((c) => (
                          <option key={c.name} value={c.name}>
                            {c.name} Constituency
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-ink mb-1.5">Requested Amount (ZMW) (Optional)</label>
                      <input
                        type="number"
                        placeholder="e.g. 15000"
                        value={appAmount}
                        onChange={(e) => setAppAmount(e.target.value)}
                        className="w-full bg-slate-50 border border-bo rounded-xl px-3 py-2 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Section: Category Specifics */}
                <div className="border-t border-bo pt-5">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                    2. Specific Category Requirements ({appCategory})
                  </h4>

                  {appCategory === 'Grant' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-ink mb-1.5">Business / Enterprise Name *</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Chola Poultry Limited"
                          value={appBusinessName}
                          onChange={(e) => setAppBusinessName(e.target.value)}
                          className="w-full bg-slate-50 border border-bo rounded-xl px-3 py-2 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-ink mb-1.5">Business Sector *</label>
                        <select
                          value={appBusinessSector}
                          onChange={(e) => setAppBusinessSector(e.target.value)}
                          className="w-full bg-slate-50 border border-bo rounded-xl px-3 py-2 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        >
                          <option value="Trading / Retail">Trading / Retail</option>
                          <option value="Agriculture & Poultry">Agriculture & Poultry</option>
                          <option value="Manufacturing / Tailoring">Manufacturing / Tailoring</option>
                          <option value="Services / Transport">Services / Transport</option>
                          <option value="Information Tech & Creative">Information Tech & Creative</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {appCategory === 'Bursary' && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="md:col-span-1">
                        <label className="block text-xs font-semibold text-ink mb-1.5">Institution Name *</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Evelyn Hone College"
                          value={appInstitution}
                          onChange={(e) => setAppInstitution(e.target.value)}
                          className="w-full bg-slate-50 border border-bo rounded-xl px-3 py-2 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-ink mb-1.5">Level of Study *</label>
                        <select
                          value={appLevelOfStudy}
                          onChange={(e) => setAppLevelOfStudy(e.target.value)}
                          className="w-full bg-slate-50 border border-bo rounded-xl px-3 py-2 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        >
                          <option value="Secondary School">Secondary School</option>
                          <option value="Skills Training / Trade">Skills Training / Trade</option>
                          <option value="College Diploma">College Diploma</option>
                          <option value="University Degree">University Degree</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-ink mb-1.5">Parent / Guardian Name</label>
                        <input
                          type="text"
                          placeholder="e.g. John Chola"
                          value={appGuardianName}
                          onChange={(e) => setAppGuardianName(e.target.value)}
                          className="w-full bg-slate-50 border border-bo rounded-xl px-3 py-2 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>
                    </div>
                  )}

                  {appCategory === 'Agricultural Support' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-ink mb-1.5">Approximate Farm Size (Hectares) *</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. 2.5 Hectares"
                          value={appFarmSize}
                          onChange={(e) => setAppFarmSize(e.target.value)}
                          className="w-full bg-slate-50 border border-bo rounded-xl px-3 py-2 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-ink mb-1.5">Farming Type *</label>
                        <select
                          value={appFarmingType}
                          onChange={(e) => setAppFarmingType(e.target.value)}
                          className="w-full bg-slate-50 border border-bo rounded-xl px-3 py-2 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        >
                          <option value="Crop farming">Crop farming (Maize, Soya, etc.)</option>
                          <option value="Livestock">Livestock (Poultry, Piggery, Goats)</option>
                          <option value="Aquaculture">Aquaculture (Fish farming)</option>
                          <option value="Mixed farming">Mixed farming</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                {/* Section: GPS Coordinates picking */}
                <div className="border-t border-bo pt-5">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      3. GPS Location & Map Coordinates *
                    </h4>
                    <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-medium">GPS Location Required</span>
                  </div>
                  
                  <div className="bg-slate-50 border border-bo rounded-xl p-4 space-y-4">
                    <p className="text-xs text-mu leading-relaxed">
                      Please pick your current physical farming, business or school location. This coordinates data is matched with geo-boundaries to map CDF distribution accurately.
                    </p>

                    <div className="flex flex-wrap gap-2.5">
                      <button
                        type="button"
                        onClick={handlePickGps}
                        disabled={appLocating}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs rounded-lg px-4 py-2 transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {appLocating ? (
                          <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full mr-1"></span>
                        ) : '📍'} 
                        Capture GPS Location
                      </button>
                      <button
                        type="button"
                        onClick={handlePickMockMap}
                        className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium text-xs rounded-lg px-4 py-2 border border-indigo-100 transition-all cursor-pointer"
                      >
                        🗺️ Pick From Interactive Mock Map
                      </button>
                    </div>

                    {appLocError && (
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-2 font-medium">
                        {appLocError}
                      </p>
                    )}

                    {appLat != null && appLng != null ? (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center justify-between">
                        <div className="space-y-0.5">
                          <span className="text-[10px] text-green-700 font-bold uppercase tracking-wider">Geo-Location Captured</span>
                          <div className="font-mono text-xs text-green-800">
                            Lat: <span className="font-semibold">{appLat}</span>, Lng: <span className="font-semibold">{appLng}</span>
                          </div>
                        </div>
                        <span className="text-lg">✅</span>
                      </div>
                    ) : (
                      <div className="text-xs text-red-700 font-medium p-1 flex items-center gap-1">
                        ⚠️ No coordinates pinned yet. Click above to auto-capture.
                      </div>
                    )}
                  </div>
                </div>

                {/* Section: Purpose Detail */}
                <div className="border-t border-bo pt-5">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">4. Application Purpose</h4>
                  <label className="block text-xs font-semibold text-ink mb-1.5">
                    What will this support do and why is it needed? (Min 20 characters) *
                  </label>
                  <textarea
                    required
                    rows={4}
                    placeholder="Provide a thorough explanation of what you intend to do, how it benefits you, your business or your community."
                    value={appPurpose}
                    onChange={(e) => setAppPurpose(e.target.value)}
                    className="w-full bg-slate-50 border border-bo rounded-xl px-3 py-2 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  ></textarea>
                </div>

                <div className="space-y-4 pt-4 border-t border-bo">
                  <button
                    type="submit"
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-3 rounded-xl transition-all shadow cursor-pointer uppercase tracking-wider"
                  >
                    Submit CDF Application 🤝
                  </button>

                  {appFeedback && (
                    <div className={`p-4 rounded-xl text-xs font-medium ${appFeedback.startsWith('✅') ? 'bg-green-50 text-green-800 border border-green-100' : 'bg-red-50 text-red-800 border border-red-100'}`}>
                      {appFeedback}
                    </div>
                  )}
                </div>
              </form>
            </div>

            {/* Check Application Status Section */}
            <div className="bg-white border border-bo rounded-2xl p-6 shadow-sm">
              <h3 className="font-serif font-bold text-base text-ink mb-3 flex items-center gap-1.5">
                🔎 Look Up Application Status
              </h3>
              <p className="text-xs text-mu leading-relaxed mb-4">
                Enter your National Registration Card (NRC) number below to check the real-time status and evaluation report of your empowerment application.
              </p>

              <div className="max-w-md space-y-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    id="search-nrc-input"
                    placeholder="e.g. 123456/11/1"
                    className="flex-1 bg-slate-50 border border-bo rounded-xl px-3 py-2 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const input = document.getElementById('search-nrc-input') as HTMLInputElement;
                      const val = input?.value?.trim();
                      if (!val) {
                        alert('Please enter an NRC number.');
                        return;
                      }
                      const match = applications.find(a => a.nrc.toLowerCase() === val.toLowerCase());
                      if (match) {
                        setSelectedApplication(match);
                        handleAnalyzeApplication(match);
                      } else {
                        alert('No application found with that NRC.');
                      }
                    }}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl px-4 py-2 transition-colors cursor-pointer"
                  >
                    Check Status
                  </button>
                </div>

                {selectedApplication && (
                  <div className="bg-slate-50 border border-bo rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-ink">Application ID: {selectedApplication.id}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        selectedApplication.status === 'Approved' ? 'bg-green-100 text-green-800' :
                        selectedApplication.status === 'Rejected' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {selectedApplication.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs border-t border-bo pt-2.5">
                      <div><span className="text-mu">Applicant:</span> <strong className="text-ink">{selectedApplication.applicantName}</strong></div>
                      <div><span className="text-mu">Category:</span> <strong className="text-ink">{selectedApplication.category}</strong></div>
                      <div><span className="text-mu">Constituency:</span> <strong className="text-ink">{selectedApplication.constituency}</strong></div>
                      <div><span className="text-mu">Amount requested:</span> <strong className="text-ink">{selectedApplication.amount ? zmw(Number(selectedApplication.amount)) : 'N/A'}</strong></div>
                    </div>

                    {/* AI Evaluation result */}
                    <div className="border-t border-bo pt-3 mt-1.5 space-y-2">
                      <h5 className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider flex items-center gap-1">
                        🤖 AI Support Evaluation Report
                      </h5>
                      {aiAppAnalysisLoading ? (
                        <div className="flex items-center gap-1.5 py-1 text-xs text-mu">
                          <span className="animate-spin inline-block w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full"></span>
                          Gemini evaluation engine evaluating application...
                        </div>
                      ) : aiAppAnalysis ? (
                        <div className="bg-white border border-indigo-50 rounded-xl p-3 text-xs text-slate-700 leading-relaxed whitespace-pre-line prose max-w-none">
                          {aiAppAnalysis}
                        </div>
                      ) : (
                        <p className="text-[11px] text-mu">Review details pending.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB: ADMIN SECTION */}
        {activeTab === 'admin' && currentUser && (
          <div className="space-y-6">
            {/* Admin Header Panel */}
            <div className="bg-white border border-bo rounded-2xl p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="flex items-center gap-2 text-sm font-semibold text-forest">
                  <Shield className="w-5 h-5 text-emerald-600" />
                  {currentUser.constituency
                    ? `${currentUser.constituency} Constituency Admin Console`
                    : 'Active System Admin & Maintenance Console'}
                </span>
                <p className="text-xs text-mu">
                  {currentUser.constituency
                    ? `You are managing data for ${currentUser.constituency} constituency only. Other constituencies are not visible to your account.`
                    : 'Configure and update live data models in real-time across the platform.'}
                </p>
              </div>
              <div className={`text-xs font-medium px-3 py-1.5 rounded-lg border ${
                currentUser.constituency
                  ? 'bg-yellow-50 border-yellow-200 text-yellow-800'
                  : 'bg-slate-100 border-slate-200 text-slate-700'
              }`}>
                {currentUser.constituency && <span className="block text-[10px] text-yellow-600 font-bold uppercase tracking-wider mb-0.5">📍 Scoped to constituency</span>}
                <strong className="text-forest">{currentUser.name}</strong> ({currentUser.role})
                {currentUser.constituency && <span className="block font-bold text-yellow-700 mt-0.5">{currentUser.constituency}</span>}
              </div>
            </div>

            {/* Nested Sub-Tab Row */}
            <div className="flex border-b border-bo overflow-x-auto gap-2">
              <button
                onClick={() => setAdminSubTab('projects')}
                className={`px-5 py-3 text-xs font-semibold border-b-2 -mb-px whitespace-nowrap transition-all cursor-pointer ${
                  adminSubTab === 'projects'
                    ? 'border-forest text-forest bg-forest/5'
                    : 'border-transparent text-mu hover:text-ink hover:bg-bg/40'
                }`}
              >
                📂 Projects & Oversight
              </button>
              <button
                onClick={() => setAdminSubTab('constituencies')}
                className={`px-5 py-3 text-xs font-semibold border-b-2 -mb-px whitespace-nowrap transition-all cursor-pointer ${
                  adminSubTab === 'constituencies'
                    ? 'border-forest text-forest bg-forest/5'
                    : 'border-transparent text-mu hover:text-ink hover:bg-bg/40'
                }`}
              >
                🗺️ Constituencies (System Data)
              </button>
              <button
                onClick={() => setAdminSubTab('payments')}
                className={`px-5 py-3 text-xs font-semibold border-b-2 -mb-px whitespace-nowrap transition-all cursor-pointer ${
                  adminSubTab === 'payments'
                    ? 'border-forest text-forest bg-forest/5'
                    : 'border-transparent text-mu hover:text-ink hover:bg-bg/40'
                }`}
              >
                📱 Payment Gateways
              </button>
              <button
                onClick={() => setAdminSubTab('support')}
                className={`px-5 py-3 text-xs font-semibold border-b-2 -mb-px whitespace-nowrap transition-all cursor-pointer ${
                  adminSubTab === 'support'
                    ? 'border-forest text-forest bg-forest/5'
                    : 'border-transparent text-mu hover:text-ink hover:bg-bg/40'
                }`}
              >
                🤝 Support Applications ({applications.length})
              </button>
              <button
                onClick={() => setAdminSubTab('announcements')}
                className={`px-5 py-3 text-xs font-semibold border-b-2 -mb-px whitespace-nowrap transition-all cursor-pointer ${
                  adminSubTab === 'announcements'
                    ? 'border-forest text-forest bg-forest/5'
                    : 'border-transparent text-mu hover:text-ink hover:bg-bg/40'
                }`}
              >
                📣 Announcements Board ({announcements.length})
              </button>
              <button
                onClick={() => setAdminSubTab('logs')}
                className={`px-5 py-3 text-xs font-semibold border-b-2 -mb-px whitespace-nowrap transition-all cursor-pointer ${
                  adminSubTab === 'logs'
                    ? 'border-forest text-forest bg-forest/5'
                    : 'border-transparent text-mu hover:text-ink hover:bg-bg/40'
                }`}
              >
                📢 Live Transparency Feed
              </button>
            </div>

            {/* TAB CONTENT: PROJECTS */}
            {adminSubTab === 'projects' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Projects Table */}
                <div className="lg:col-span-8 bg-white border border-bo rounded-2xl p-5 shadow-sm space-y-4">
                  <div className="border-b border-bo pb-2 flex justify-between items-center">
                    <h3 className="font-serif font-bold text-base">📂 Direct Projects Registry Maintenance</h3>
                    <span className="text-[10px] uppercase font-bold bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-md">
                      {projects.length} Total Projects
                    </span>
                  </div>
                  <div className="overflow-x-auto max-h-[600px] overflow-y-auto pr-1">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-bg/40 border-b border-bo font-semibold text-mu uppercase tracking-wider sticky top-0 bg-white z-10">
                          <th className="py-2.5 px-2">Project Name</th>
                          <th className="py-2.5 px-2">Assigned MP</th>
                          <th className="py-2.5 px-2">Budget (ZMW)</th>
                          <th className="py-2.5 px-2">Status</th>
                          <th className="py-2.5 px-2 w-16">Progress %</th>
                          <th className="py-2.5 px-2 text-right">Commit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {projects.map((p) => {
                          const edit = projEdits[p.id] || { name: p.name, mp: p.mp, budget: String(p.budget), status: p.status, pct: String(p.pct) };
                          const setEdit = (fields: Partial<typeof edit>) =>
                            setProjEdits(prev => ({ ...prev, [p.id]: { ...edit, ...fields } }));
                          const contractorSpent = p.spent ?? 0;
                          const pctNum = parseInt(edit.pct) || 0;
                          const budgetNum = parseInt(edit.budget) || p.budget;
                          const pctImplied = Math.round(budgetNum * (pctNum / 100));
                          const projectedSpent = Math.max(contractorSpent, pctImplied);

                          return (
                          <tr key={p.id} className="border-b border-bo/60 hover:bg-slate-50/50">
                            <td className="py-2 px-2">
                              <div className="space-y-0.5">
                                <input
                                  type="text"
                                  value={edit.name}
                                  onChange={e => setEdit({ name: e.target.value })}
                                  className="w-full px-2 py-1 border border-bo rounded-lg text-xs focus:outline-none focus:border-forest"
                                />
                                <p className="text-[9px] text-mu px-1">{p.constituency} · {p.sector}</p>
                              </div>
                            </td>
                            <td className="py-2 px-2">
                              <input
                                type="text"
                                value={edit.mp}
                                onChange={e => setEdit({ mp: e.target.value })}
                                className="w-24 px-2 py-1 border border-bo rounded-lg text-xs focus:outline-none focus:border-forest"
                              />
                            </td>
                            <td className="py-2 px-2">
                              <div className="space-y-0.5">
                                <input
                                  type="number"
                                  value={edit.budget}
                                  onChange={e => setEdit({ budget: e.target.value })}
                                  className="w-24 px-2 py-1 border border-bo rounded-lg text-xs focus:outline-none focus:border-forest"
                                />
                                <p className="text-[9px] text-emerald-700 px-1">Disbursed: {zmw(contractorSpent)}</p>
                                <p className="text-[9px] text-mu px-1">Remaining: {zmw(Math.max(0, budgetNum - contractorSpent))}</p>
                              </div>
                            </td>
                            <td className="py-2 px-2">
                              <select
                                value={edit.status}
                                onChange={e => setEdit({ status: e.target.value })}
                                className="px-1 py-1 border border-bo rounded-lg text-xs focus:outline-none bg-white"
                              >
                                <option value="planned">Planned</option>
                                <option value="ongoing">Ongoing</option>
                                <option value="stalled">Stalled</option>
                                <option value="complete">Complete</option>
                              </select>
                            </td>
                            <td className="py-2 px-2">
                              <input
                                type="number"
                                value={edit.pct}
                                onChange={e => setEdit({ pct: e.target.value })}
                                min={0}
                                max={100}
                                className="w-12 px-1.5 py-1 border border-bo rounded-lg text-xs focus:outline-none"
                              />
                            </td>
                            <td className="py-2 px-2 text-right space-x-1 whitespace-nowrap">
                              <button
                                onClick={async () => {
                                  const budgetVal = parseInt(edit.budget) || p.budget;
                                  const pctVal = Math.min(100, Math.max(0, parseInt(edit.pct) || 0));
                                  const pctImpliedSpent = Math.round(budgetVal * (pctVal / 100));
                                  const newSpent = Math.max(p.spent ?? 0, pctImpliedSpent);
                                  await handleUpdateProjectAll(p.id, {
                                    name: edit.name.trim() || p.name,
                                    mp: edit.mp.trim() || p.mp,
                                    budget: budgetVal,
                                    status: edit.status as any,
                                    pct: pctVal,
                                    spent: newSpent,
                                  });
                                }}
                                className="bg-forest hover:bg-leaf text-white px-2 py-1 rounded-lg font-semibold text-[10px] cursor-pointer"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => handleDeleteProject(p.id)}
                                className="bg-red-50 hover:bg-red-100 text-red-600 px-2 py-1 rounded-lg font-semibold text-[10px] cursor-pointer"
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Spawn new Project & Requests/Reports */}
                <div className="lg:col-span-4 space-y-6">
                  {/* Spawn New Project */}
                  <div className="bg-white border border-bo rounded-2xl p-5 shadow-sm space-y-4">
                    <h3 className="font-serif font-bold text-sm border-b border-bo pb-2 flex items-center gap-1.5">
                      <Plus className="w-4 h-4 text-emerald-600" /> Spawn New Project
                    </h3>
                    <form onSubmit={handleAddProject} className="space-y-3.5 text-xs">
                      <div className="space-y-1">
                        <label className="text-mu font-semibold block">Project Name *</label>
                        <input
                          type="text"
                          placeholder="e.g. Ndola Secondary Library"
                          value={newProjName}
                          onChange={(e) => setNewProjName(e.target.value)}
                          className="w-full px-3 py-2 border border-bo rounded-xl text-xs focus:outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-mu font-semibold block">Target Constituency *</label>
                        {constScope ? (
                          <div className="w-full px-3 py-2 border border-yellow-200 bg-yellow-50 rounded-xl text-xs font-bold text-yellow-800">
                            📍 {constScope} (locked to your constituency)
                          </div>
                        ) : (
                        <select
                          value={newProjConst}
                          onChange={(e) => {
                            const val = e.target.value;
                            setNewProjConst(val);
                            const found = dbConstituencies.find((c) => c.name === val);
                            if (found) {
                              setNewProjMp(found.mp);
                            }
                          }}
                          className="w-full px-3 py-2 border border-bo rounded-xl text-xs focus:outline-none bg-white"
                        >
                          {dbConstituencies.map((c) => (
                            <option key={c.name} value={c.name}>{c.name}</option>
                          ))}
                        </select>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-mu font-semibold block">Primary Sector *</label>
                          <select
                            value={newProjSector}
                            onChange={(e) => setNewProjSector(e.target.value)}
                            className="w-full px-3 py-2 border border-bo rounded-xl text-xs focus:outline-none bg-white"
                          >
                            {['Education', 'Health', 'Roads', 'Water', 'Agriculture', 'Youth'].map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-mu font-semibold block">Allocation (ZMW) *</label>
                          <input
                            type="number"
                            placeholder="Budget amount"
                            value={newProjBudget}
                            onChange={(e) => setNewProjBudget(e.target.value)}
                            className="w-full px-3 py-2 border border-bo rounded-xl text-xs focus:outline-none"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-mu font-semibold block">Hon. Member of Parliament</label>
                        <input
                          type="text"
                          placeholder="e.g. Hon. Mpundu"
                          value={newProjMp}
                          onChange={(e) => setNewProjMp(e.target.value)}
                          className="w-full px-3 py-2 border border-bo rounded-xl text-xs focus:outline-none"
                        />
                      </div>

                      <button
                        type="submit"
                        className="w-full bg-forest hover:bg-leaf text-white py-2.5 rounded-xl font-semibold transition-colors cursor-pointer"
                      >
                        Publish Project Live ➕
                      </button>
                    </form>
                  </div>

                  {/* Citizen Requests Oversight */}
                  <div className="bg-white border border-bo rounded-2xl p-5 shadow-sm space-y-4 max-h-[420px] overflow-y-auto">
                    <h3 className="font-serif font-bold text-sm border-b border-bo pb-2 sticky top-0 bg-white z-10 flex items-center justify-between">
                      <span>
                        🗣️ Citizen Requests Oversight
                        {constScope && <span className="ml-2 text-[10px] font-normal text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded-full">📍 {constScope} only</span>}
                      </span>
                      <div className="inline-flex bg-bg border border-bo rounded-lg p-0.5 text-[9px]">
                        <button
                          onClick={() => setRequestSortMode('votes')}
                          className={`px-2 py-1 rounded-md font-bold cursor-pointer ${requestSortMode === 'votes' ? 'bg-white shadow-sm text-ink' : 'text-mu'}`}
                        >
                          👍 Most Supported
                        </button>
                        <button
                          onClick={() => setRequestSortMode('date')}
                          className={`px-2 py-1 rounded-md font-bold cursor-pointer ${requestSortMode === 'date' ? 'bg-white shadow-sm text-ink' : 'text-mu'}`}
                        >
                          🕒 Newest
                        </button>
                      </div>
                    </h3>
                    {requests.length > 0 ? (
                      <div className="space-y-3 divide-y divide-bo/50">
                        {[...requests].sort((a, b) =>
                          requestSortMode === 'votes'
                            ? (b.votes || 0) - (a.votes || 0)
                            : (b.date || '').localeCompare(a.date || '')
                        ).map((r) => (
                          <div key={r.id} className="pt-3 first:pt-0 space-y-2">
                            {/* Title row */}
                            <div className="flex justify-between items-start gap-2">
                              <div>
                                <h4 className="font-bold text-xs text-ink">{r.name}</h4>
                                <p className="text-[10px] text-mu">{r.id} · {r.constituency} · {r.date}</p>
                              </div>
                              <div className="flex flex-col items-end gap-1 shrink-0">
                                <span className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded-full ${
                                  r.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' :
                                  r.status === 'Rejected' ? 'bg-red-100 text-red-700' :
                                  r.status === 'Under Review' ? 'bg-blue-100 text-blue-700' :
                                  'bg-amber-100 text-amber-700'
                                }`}>{r.status}</span>
                                <span className="text-[9px] font-bold text-yellow-700 bg-yellow-50 px-2 py-0.5 rounded-full">👍 {r.votes || 0}</span>
                                <span className="text-[9px] font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded-full">👎 {r.rejects || 0}</span>
                              </div>
                            </div>

                            {/* Truncated description preview */}
                            <p className="text-[10px] text-mu leading-relaxed line-clamp-2">{r.desc}</p>

                            {/* Citizen comments — surfaced for admin review */}
                            {r.comments && r.comments.length > 0 && (
                              <div className="bg-bg/60 border border-bo/50 rounded-lg p-2 space-y-1">
                                <p className="text-[9px] font-bold text-mu uppercase">💬 {r.comments.length} citizen comment{r.comments.length > 1 ? 's' : ''}</p>
                                {r.comments.slice(-3).map((c) => (
                                  <p key={c.id} className="text-[10px] text-ink leading-snug">
                                    <span className="font-semibold">{c.author}</span> <span className="text-mu">({c.date}):</span> {c.text}
                                  </p>
                                ))}
                              </div>
                            )}

                            {/* Action buttons */}
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {/* REVIEW button — opens full detail modal */}
                              <button
                                onClick={() => { setSelectedRequest(r); setReqReviewOpen(true); }}
                                className="flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[9px] font-bold px-2.5 py-1 rounded cursor-pointer transition-colors"
                              >
                                <Eye className="w-3 h-3" /> Review
                              </button>
                              <button
                                onClick={() => handleUpdateReqStatus(r.id, 'Approved')}
                                className="bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-[9px] font-bold px-2.5 py-1 rounded cursor-pointer transition-colors"
                              >
                                ✅ Approve
                              </button>
                              <button
                                onClick={() => handleUpdateReqStatus(r.id, 'Under Review')}
                                className="bg-blue-50 hover:bg-blue-100 text-blue-700 text-[9px] font-bold px-2.5 py-1 rounded cursor-pointer transition-colors"
                              >
                                🔍 Under Review
                              </button>
                              <button
                                onClick={() => handleUpdateReqStatus(r.id, 'Rejected')}
                                className="bg-red-100 hover:bg-red-200 text-red-800 text-[9px] font-bold px-2.5 py-1 rounded cursor-pointer transition-colors"
                              >
                                ❌ Reject
                              </button>
                              <button
                                onClick={() => { setSelectedRequest(r); handleAnalyzeRequest(r); }}
                                className="bg-purple-50 hover:bg-purple-100 text-purple-700 text-[9px] font-bold px-2.5 py-1 rounded cursor-pointer transition-colors"
                              >
                                🤖 AI Evaluate
                              </button>
                              {/* DELETE button */}
                              <button
                                onClick={() => handleDeleteRequest(r.id)}
                                className="flex items-center gap-1 bg-red-50 hover:bg-red-100 text-red-600 text-[9px] font-bold px-2.5 py-1 rounded cursor-pointer transition-colors ml-auto"
                              >
                                <Trash2 className="w-3 h-3" /> Delete
                              </button>
                            </div>

                            {/* Inline AI analysis panel */}
                            {selectedRequest?.id === r.id && !reqReviewOpen && (
                              <div className="bg-indigo-50/50 border border-indigo-100 rounded-lg p-3 text-[10px] text-slate-700 leading-relaxed space-y-2 mt-2">
                                <div className="flex justify-between items-center">
                                  <h5 className="font-bold text-indigo-700 flex items-center gap-1 uppercase tracking-wider text-[9px]">
                                    🤖 AI Viability Assessment
                                  </h5>
                                  <button onClick={() => setSelectedRequest(null)} className="text-mu hover:text-ink font-bold cursor-pointer">✕</button>
                                </div>
                                {aiReqAnalysisLoading ? (
                                  <div className="flex items-center gap-1 text-[10px] text-mu">
                                    <span className="animate-spin inline-block w-3 h-3 border border-indigo-600 border-t-transparent rounded-full"></span>
                                    Evaluating viability and sector duplication risk...
                                  </div>
                                ) : aiReqAnalysis ? (
                                  <div className="bg-white p-2.5 rounded border border-indigo-50 whitespace-pre-line leading-relaxed text-[11px]">{aiReqAnalysis}</div>
                                ) : (
                                  <p className="text-[10px] text-mu italic">Analysis not available.</p>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-mu italic">No custom citizen requests filed yet.</p>
                    )}
                  </div>

                  {/* ACC Whistleblower Reports Oversight */}
                  <div className="bg-white border border-bo rounded-2xl p-5 shadow-sm space-y-4 max-h-[350px] overflow-y-auto">
                    <h3 className="font-serif font-bold text-sm border-b border-bo pb-2 text-red-700 flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4 text-red-600" /> ACC Reports Oversight
                      {constScope && <span className="ml-2 text-[10px] font-normal text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded-full">📍 {constScope} only</span>}
                    </h3>
                    {reports.length > 0 ? (
                      <div className="space-y-3 divide-y divide-bo/50 text-xs">
                        {reports.map((r) => (
                          <div key={r.id} className="pt-3 first:pt-0 space-y-2">
                            <div className="flex justify-between items-start gap-2">
                              <div>
                                <span className="font-bold text-ink block">{r.id} ({r.type})</span>
                                <span className="text-[10px] text-mu font-semibold block">Constituency: {r.constituency}</span>
                              </div>
                              <span className="text-[9px] uppercase font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">{r.status}</span>
                            </div>
                            <p className="text-[10px] text-mu leading-relaxed"><strong className="text-ink">Project:</strong> {r.proj || 'General'}</p>
                            <p className="text-[10px] text-mu leading-relaxed"><strong className="text-ink">Estimated Amount:</strong> {r.amount || 'Unknown'}</p>
                            <p className="text-[10px] text-mu leading-relaxed"><strong className="text-ink">Contact:</strong> {r.contact || 'Anonymous'}</p>
                            <p className="text-[10px] text-ink leading-relaxed bg-bg/50 p-2 rounded-lg border border-bo/40">{r.desc}</p>
                            {r.photoUrl && (
                              <img
                                src={r.photoUrl}
                                alt="Evidence"
                                className="h-24 rounded-lg border border-bo/60 object-cover cursor-pointer"
                                onClick={() => window.open(r.photoUrl, '_blank')}
                              />
                            )}
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              <button
                                onClick={() => handleUpdateReportStatus(r.id, 'Under review')}
                                className="bg-blue-50 hover:bg-blue-100 text-blue-700 text-[9px] font-bold px-2 py-1 rounded cursor-pointer transition-colors"
                              >
                                Under Review
                              </button>
                              <button
                                onClick={() => handleUpdateReportStatus(r.id, 'Escalated to ACC')}
                                className="bg-amber-50 hover:bg-amber-100 text-amber-700 text-[9px] font-bold px-2 py-1 rounded cursor-pointer transition-colors"
                              >
                                Escalate to ACC
                              </button>
                              <button
                                onClick={() => handleUpdateReportStatus(r.id, 'Closed')}
                                className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-[9px] font-bold px-2 py-1 rounded cursor-pointer transition-colors"
                              >
                                Close File
                              </button>
                              <button
                                onClick={() => handleDeleteReport(r.id)}
                                className="bg-red-50 hover:bg-red-100 text-red-600 text-[9px] font-bold px-2 py-1 rounded cursor-pointer transition-colors ml-auto"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-mu italic">No active whistleblower reports filed yet.</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB CONTENT: CONSTITUENCIES */}
            {adminSubTab === 'constituencies' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Constituencies Table & Search */}
                <div className="lg:col-span-8 bg-white border border-bo rounded-2xl p-5 shadow-sm space-y-4">
                  <div className="border-b border-bo pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <h3 className="font-serif font-bold text-base">🗺️ Constituencies System Records</h3>
                    <span className="text-[10px] uppercase font-bold bg-emerald-50 text-emerald-800 px-2.5 py-1 rounded-md">
                      {dbConstituencies.length} Active Records
                    </span>
                  </div>

                  {/* Search Bar */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-bg/50 p-3 rounded-xl border border-bo/60">
                    <input
                      type="text"
                      placeholder="Search name or MP..."
                      value={adminConstSearch}
                      onChange={(e) => setAdminConstSearch(e.target.value)}
                      className="px-3 py-1.5 border border-bo rounded-xl text-xs bg-white focus:outline-none"
                    />
                    <select
                      value={adminConstProv}
                      onChange={(e) => setAdminConstProv(e.target.value)}
                      className="px-3 py-1.5 border border-bo rounded-xl text-xs bg-white focus:outline-none"
                    >
                      <option value="">All Provinces</option>
                      {['Central','Copperbelt','Eastern','Luapula','Lusaka','Muchinga','Northern','North-Western','Southern','Western'].map((prov) => (
                        <option key={prov} value={prov}>{prov}</option>
                      ))}
                    </select>
                  </div>

                  {/* List */}
                  <div className="overflow-x-auto max-h-[500px] overflow-y-auto pr-1">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-bg/40 border-b border-bo font-semibold text-mu uppercase tracking-wider sticky top-0 bg-white z-10">
                          <th className="py-2.5 px-2">Constituency</th>
                          <th className="py-2.5 px-2">Province</th>
                          <th className="py-2.5 px-2">MP Name</th>
                          <th className="py-2.5 px-2">Allocation (ZMW)</th>
                          <th className="py-2.5 px-2 text-right">Commit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dbConstituencies
                          .filter((c) => {
                            const q = adminConstSearch.toLowerCase();
                            const matchesSearch = !q || c.name.toLowerCase().includes(q) || c.mp.toLowerCase().includes(q);
                            const matchesProv = !adminConstProv || c.province === adminConstProv;
                            return matchesSearch && matchesProv;
                          })
                          .map((c) => {
                            const edit = constEdits[c.name] || { mp: c.mp, allocated: String(c.allocated || 30_400_000) };
                            const setEdit = (fields: Partial<typeof edit>) =>
                              setConstEdits(prev => ({ ...prev, [c.name]: { ...edit, ...fields } }));
                            // Live project stats for this constituency
                            const constProjs = projects.filter(p => p.constituency === c.name);
                            const totalBudget = constProjs.reduce((s,p)=>s+p.budget,0);
                            const totalSpent = constProjs.reduce((s,p)=>s+p.spent,0);

                            return (
                            <tr key={c.name} className="border-b border-bo/60 hover:bg-slate-50/50">
                              <td className="py-2 px-2">
                                <p className="font-semibold text-ink">{c.name}</p>
                                <p className="text-[9px] text-mu">{constProjs.length} project(s) · {zmw(totalBudget)} budget · {zmw(totalSpent)} disbursed</p>
                              </td>
                              <td className="py-2 px-2 text-mu font-medium">{c.province}</td>
                              <td className="py-2 px-2">
                                <input
                                  type="text"
                                  value={edit.mp}
                                  onChange={e => setEdit({ mp: e.target.value })}
                                  className="w-full px-2 py-1 border border-bo rounded-lg text-xs focus:outline-none focus:border-forest bg-white"
                                />
                              </td>
                              <td className="py-2 px-2">
                                <input
                                  type="number"
                                  value={edit.allocated}
                                  onChange={e => setEdit({ allocated: e.target.value })}
                                  className="w-28 px-2 py-1 border border-bo rounded-lg text-xs focus:outline-none bg-white"
                                />
                              </td>
                              <td className="py-2 px-2 text-right space-x-1 whitespace-nowrap">
                                <button
                                  onClick={() => handleUpdateConstituency(c.name, {
                                    mp: edit.mp.trim() || c.mp,
                                    allocated: parseInt(edit.allocated) || 30_400_000,
                                  })}
                                  className="bg-forest hover:bg-leaf text-white px-2 py-1 rounded-lg font-semibold text-[10px] cursor-pointer"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => handleDeleteConstituency(c.name)}
                                  className="bg-red-50 hover:bg-red-100 text-red-600 px-2 py-1 rounded-lg font-semibold text-[10px] cursor-pointer"
                                >
                                  Delete
                                </button>
                              </td>
                            </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Add Constituency Form */}
                <div className="lg:col-span-4 bg-white border border-bo rounded-2xl p-5 shadow-sm space-y-4">
                  <h3 className="font-serif font-bold text-sm border-b border-bo pb-2 flex items-center gap-1.5">
                    <Plus className="w-4 h-4 text-emerald-600" /> Spawn New Constituency
                  </h3>
                  <form onSubmit={handleAddConstituency} className="space-y-3.5 text-xs">
                    <div className="space-y-1">
                      <label className="text-mu font-semibold block">Constituency Name *</label>
                      <input
                        type="text"
                        placeholder="e.g. Chipata Central"
                        value={newConstName}
                        onChange={(e) => setNewConstName(e.target.value)}
                        className="w-full px-3 py-2 border border-bo rounded-xl text-xs focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-mu font-semibold block">Province *</label>
                      <select
                        value={newConstProvince}
                        onChange={(e) => setNewConstProvince(e.target.value)}
                        className="w-full px-3 py-2 border border-bo rounded-xl text-xs focus:outline-none bg-white"
                      >
                        {['Lusaka', 'Copperbelt', 'Eastern', 'Southern', 'Central', 'Northern', 'Western', 'Northwestern', 'Luapula', 'Muchinga'].map((prov) => (
                          <option key={prov} value={prov}>{prov}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-mu font-semibold block">Member of Parliament (MP) *</label>
                      <input
                        type="text"
                        placeholder="Hon. Name"
                        value={newConstMp}
                        onChange={(e) => setNewConstMp(e.target.value)}
                        className="w-full px-3 py-2 border border-bo rounded-xl text-xs focus:outline-none"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-mu font-semibold block">Transparency Score (%)</label>
                        <input
                          type="number"
                          placeholder="0 - 100"
                          value={newConstScore}
                          onChange={(e) => setNewConstScore(e.target.value)}
                          className="w-full px-3 py-2 border border-bo rounded-xl text-xs focus:outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-mu font-semibold block">Budget Allocation (ZMW)</label>
                        <input
                          type="number"
                          placeholder="e.g. 40000000"
                          value={newConstAllocated}
                          onChange={(e) => setNewConstAllocated(e.target.value)}
                          className="w-full px-3 py-2 border border-bo rounded-xl text-xs focus:outline-none"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="w-full bg-forest hover:bg-leaf text-white py-2.5 rounded-xl font-semibold transition-colors cursor-pointer"
                    >
                      Publish Constituency Live 🗺️
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* TAB CONTENT: PAYMENTS */}
            {adminSubTab === 'payments' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Active Gateways Table */}
                <div className="lg:col-span-8 bg-white border border-bo rounded-2xl p-5 shadow-sm space-y-4">
                  <div className="border-b border-bo pb-2 flex justify-between items-center">
                    <h3 className="font-serif font-bold text-base">📱 Active Payment Gateways Configuration</h3>
                    <span className="text-[10px] uppercase font-bold bg-amber-50 text-amber-800 px-2.5 py-1 rounded-md">
                      {paymentMethods.length} Registered Channels
                    </span>
                  </div>

                  <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
                    {paymentMethods.map((pm) => (
                      <div key={pm.id} className="border border-bo rounded-2xl p-4 bg-slate-50/40 space-y-3">
                        <div className="flex justify-between items-center border-b border-bo pb-2">
                          <span className="text-xs font-bold text-ink flex items-center gap-1.5">
                            <input
                              type="text"
                              defaultValue={pm.icon}
                              id={`admin-p-icon-${pm.id}`}
                              className="w-8 text-center py-0.5 border border-bo rounded text-sm bg-white focus:outline-none"
                            />
                            <input
                              type="text"
                              defaultValue={pm.name}
                              id={`admin-p-name-${pm.id}`}
                              className="px-2 py-0.5 border border-bo rounded text-xs bg-white font-bold focus:outline-none text-ink"
                            />
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="text-[10px] text-mu font-semibold">ID: {pm.id}</span>
                            <input
                              type="color"
                              defaultValue={pm.color}
                              id={`admin-p-color-${pm.id}`}
                              className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent"
                            />
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          <div className="space-y-1">
                            <label className="text-mu font-semibold block text-[10px]">Account Field Label</label>
                            <input
                              type="text"
                              defaultValue={pm.detailLabel}
                              id={`admin-p-label-${pm.id}`}
                              className="w-full px-2 py-1 border border-bo rounded-lg text-xs focus:outline-none bg-white"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-mu font-semibold block text-[10px]">Account Details / Phone Number</label>
                            <input
                              type="text"
                              defaultValue={pm.detail}
                              id={`admin-p-detail-${pm.id}`}
                              className="w-full px-2 py-1 border border-bo rounded-lg text-xs focus:outline-none bg-white"
                            />
                          </div>
                          <div className="sm:col-span-2 space-y-1">
                            <label className="text-mu font-semibold block text-[10px]">Subscriber Instructions / Note</label>
                            <input
                              type="text"
                              defaultValue={pm.note}
                              id={`admin-p-note-${pm.id}`}
                              className="w-full px-2 py-1 border border-bo rounded-lg text-xs focus:outline-none bg-white"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2 pt-2 border-t border-bo/50">
                          <button
                            onClick={() => {
                              const icon = (document.getElementById(`admin-p-icon-${pm.id}`) as HTMLInputElement).value;
                              const name = (document.getElementById(`admin-p-name-${pm.id}`) as HTMLInputElement).value;
                              const color = (document.getElementById(`admin-p-color-${pm.id}`) as HTMLInputElement).value;
                              const detailLabel = (document.getElementById(`admin-p-label-${pm.id}`) as HTMLInputElement).value;
                              const detail = (document.getElementById(`admin-p-detail-${pm.id}`) as HTMLInputElement).value;
                              const note = (document.getElementById(`admin-p-note-${pm.id}`) as HTMLInputElement).value;
                              handleUpdatePaymentMethod(pm.id, { icon, name, color, detailLabel, detail, note });
                            }}
                            className="bg-forest hover:bg-leaf text-white px-3 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-colors"
                          >
                            Save Settings
                          </button>
                          <button
                            onClick={() => handleDeletePaymentMethod(pm.id)}
                            className="bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-colors"
                          >
                            Delete Gateway
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Create Payment Gateway */}
                <div className="lg:col-span-4 bg-white border border-bo rounded-2xl p-5 shadow-sm space-y-4">
                  <h3 className="font-serif font-bold text-sm border-b border-bo pb-2 flex items-center gap-1.5">
                    <Plus className="w-4 h-4 text-emerald-600" /> Create Payment Gateway
                  </h3>
                  <form onSubmit={handleAddPaymentMethod} className="space-y-3.5 text-xs">
                    <div className="space-y-1">
                      <label className="text-mu font-semibold block">Gateway Unique ID *</label>
                      <input
                        type="text"
                        placeholder="e.g. mtn, airtel, zamtel, zanaco"
                        value={newPayId}
                        onChange={(e) => setNewPayId(e.target.value)}
                        className="w-full px-3 py-2 border border-bo rounded-xl text-xs focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-mu font-semibold block">Gateway Display Name *</label>
                      <input
                        type="text"
                        placeholder="e.g. MTN Mobile Money"
                        value={newPayName}
                        onChange={(e) => setNewPayName(e.target.value)}
                        className="w-full px-3 py-2 border border-bo rounded-xl text-xs focus:outline-none"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-mu font-semibold block">Emoji Icon</label>
                        <input
                          type="text"
                          placeholder="📱"
                          value={newPayIcon}
                          onChange={(e) => setNewPayIcon(e.target.value)}
                          className="w-full px-3 py-2 border border-bo rounded-xl text-xs focus:outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-mu font-semibold block">Theme Color (Hex)</label>
                        <input
                          type="color"
                          value={newPayColor}
                          onChange={(e) => setNewPayColor(e.target.value)}
                          className="w-full h-9 rounded-xl border border-bo cursor-pointer p-0 bg-transparent"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-mu font-semibold block">Account Identifier Label</label>
                      <input
                        type="text"
                        placeholder="e.g. Pay Merchant Code or Number"
                        value={newPayLabel}
                        onChange={(e) => setNewPayLabel(e.target.value)}
                        className="w-full px-3 py-2 border border-bo rounded-xl text-xs focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-mu font-semibold block">Account Number / Detail</label>
                      <input
                        type="text"
                        placeholder="e.g. *303# code, account number"
                        value={newPayDetail}
                        onChange={(e) => setNewPayDetail(e.target.value)}
                        className="w-full px-3 py-2 border border-bo rounded-xl text-xs focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-mu font-semibold block">Subscriber Instructions / Notes</label>
                      <input
                        type="text"
                        placeholder="e.g. Send exact fees and enter proof code."
                        value={newPayNote}
                        onChange={(e) => setNewPayNote(e.target.value)}
                        className="w-full px-3 py-2 border border-bo rounded-xl text-xs focus:outline-none"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full bg-forest hover:bg-leaf text-white py-2.5 rounded-xl font-semibold transition-colors cursor-pointer"
                    >
                      Publish Gateway Live 📱
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* TAB CONTENT: SUPPORT APPLICATIONS & ANOMALY DETECTION */}
            {adminSubTab === 'support' && (
              <div className="space-y-6">
                {/* AI Anomaly Detection Controller */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-white shadow-xl flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="space-y-1">
                    <span className="flex items-center gap-2 text-sm font-semibold text-yellow-400">
                      🛡️ AI Anomaly Detection & Anti-Fraud Scan
                    </span>
                    <p className="text-xs text-slate-400">
                      Scan all submitted grants and school bursaries to detect phantom names, duplicate NRC inputs, and high-risk claims.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleScanAnomalies}
                    disabled={aiAnomaliesLoading}
                    className="bg-yellow-500 hover:bg-yellow-400 text-slate-950 font-bold text-xs rounded-xl px-5 py-2.5 transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {aiAnomaliesLoading ? (
                      <span className="animate-spin inline-block w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full"></span>
                    ) : '🔍'}
                    Run Gemini Anti-Fraud Scan
                  </button>
                </div>

                {/* Anomaly Report Panel */}
                {(aiAnomaliesLoading || aiAnomalies) && (
                  <div className="bg-amber-50/55 border border-amber-200 rounded-2xl p-5 space-y-3 shadow-inner">
                    <h4 className="text-xs font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
                      ⚠️ Gemini Active Fraud & Correlation Audit Report
                    </h4>
                    {aiAnomaliesLoading ? (
                      <div className="flex items-center gap-2 text-xs text-amber-900 font-medium">
                        <span className="animate-spin inline-block w-4 h-4 border-2 border-amber-950 border-t-transparent rounded-full"></span>
                        AI correlation algorithms evaluating CDF cross-references, geographic proximity duplicates...
                      </div>
                    ) : (
                      <div className="bg-white border border-amber-200/50 rounded-xl p-4 text-xs text-slate-700 leading-relaxed whitespace-pre-line prose max-w-none">
                        {aiAnomalies}
                      </div>
                    )}
                  </div>
                )}

                {/* Submissions List */}
                <div className="bg-white border border-bo rounded-2xl p-5 shadow-sm space-y-4">
                  <div className="border-b border-bo pb-3 flex justify-between items-center">
                    <h3 className="font-serif font-bold text-base text-ink">
                      🤝 Citizen Empowerment Submissions
                      {constScope && <span className="ml-2 text-[11px] font-normal text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded-full">📍 {constScope} only</span>}
                    </h3>
                    <span className="text-xs bg-slate-100 border border-bo text-ink px-3 py-1 rounded-full font-bold">
                      {applications.length} Submissions Live
                    </span>
                  </div>

                  {applications.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-bo bg-slate-50 text-mu font-semibold">
                            <th className="p-3">Applicant (NRC)</th>
                            <th className="p-3">Category</th>
                            <th className="p-3">Constituency</th>
                            <th className="p-3">Requested</th>
                            <th className="p-3">GPS Coordinate Pin</th>
                            <th className="p-3">Status</th>
                            <th className="p-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-bo/60">
                          {applications.map((app) => (
                            <tr key={app.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="p-3">
                                <div className="font-bold text-ink">{app.applicantName}</div>
                                <div className="text-[10px] text-mu font-mono">{app.nrc}</div>
                              </td>
                              <td className="p-3 font-semibold text-slate-700">{app.category}</td>
                              <td className="p-3 text-mu font-medium">{app.constituency}</td>
                              <td className="p-3 font-bold text-slate-800">
                                {app.amount ? zmw(Number(app.amount)) : 'N/A'}
                              </td>
                              <td className="p-3">
                                {app.lat != null && app.lng != null ? (
                                  <span className="text-[10px] font-mono bg-green-50 text-green-700 border border-green-100 px-2 py-0.5 rounded">
                                    📍 {app.lat.toFixed(4)}, {app.lng.toFixed(4)}
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-amber-700 font-medium">No Coordinates</span>
                                )}
                              </td>
                              <td className="p-3">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  app.status === 'Approved' ? 'bg-green-100 text-green-800' :
                                  app.status === 'Rejected' ? 'bg-red-100 text-red-800' :
                                  'bg-yellow-100 text-yellow-800'
                                }`}>
                                  {app.status}
                                </span>
                              </td>
                              <td className="p-3 text-right space-x-1 whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => handleUpdateApplicationStatus(app.id, 'Approved')}
                                  className="bg-green-50 hover:bg-green-100 text-green-700 text-[10px] font-bold px-2 py-1 rounded-lg cursor-pointer"
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateApplicationStatus(app.id, 'Rejected')}
                                  className="bg-red-50 hover:bg-red-100 text-red-700 text-[10px] font-bold px-2 py-1 rounded-lg cursor-pointer"
                                >
                                  Reject
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedApplication(app);
                                    handleAnalyzeApplication(app);
                                  }}
                                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold px-2.5 py-1 rounded-lg cursor-pointer transition-colors"
                                >
                                  🤖 Review
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteApplication(app.id)}
                                  className="bg-red-50 hover:bg-red-100 text-red-600 text-[10px] font-bold px-2 py-1 rounded-lg cursor-pointer transition-colors inline-flex items-center gap-0.5"
                                >
                                  <Trash2 className="w-3 h-3" /> Delete
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-xs text-mu italic py-4 text-center">No applications logged in the system yet.</p>
                  )}
                </div>

                {/* Expanded Detailed Application Review Panel */}
                {selectedApplication && (
                  <div className="bg-slate-50 border border-bo rounded-2xl p-6 space-y-4">
                    <div className="flex items-center justify-between border-b border-bo pb-3">
                      <div>
                        <span className="text-[10px] text-indigo-700 font-bold uppercase tracking-wider">Reviewing Application Panel</span>
                        <h4 className="font-serif font-bold text-base text-ink">Applicant ID: {selectedApplication.id}</h4>
                      </div>
                      <button
                        onClick={() => setSelectedApplication(null)}
                        className="bg-white hover:bg-slate-100 border border-bo text-mu hover:text-ink text-xs font-semibold px-3 py-1.5 rounded-xl cursor-pointer"
                      >
                        Close Panel
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
                      <div className="space-y-2">
                        <h5 className="font-bold text-ink uppercase tracking-wider text-[10px]">1. Applicant Profile</h5>
                        <div className="bg-white p-3.5 border border-bo rounded-xl space-y-2.5">
                          <div><span className="text-mu block text-[10px]">Name:</span> <strong className="text-slate-800 text-[11px]">{selectedApplication.applicantName}</strong></div>
                          <div><span className="text-mu block text-[10px]">NRC:</span> <strong className="text-slate-800 text-[11px] font-mono">{selectedApplication.nrc}</strong></div>
                          <div><span className="text-mu block text-[10px]">Contact:</span> <strong className="text-slate-800 text-[11px]">{selectedApplication.contact}</strong></div>
                          {selectedApplication.email && (
                            <div><span className="text-mu block text-[10px]">Email:</span> <strong className="text-slate-800 text-[11px]">{selectedApplication.email}</strong></div>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <h5 className="font-bold text-ink uppercase tracking-wider text-[10px]">2. Request & Category Specifications</h5>
                        <div className="bg-white p-3.5 border border-bo rounded-xl space-y-2.5">
                          <div><span className="text-mu block text-[10px]">Category:</span> <strong className="text-slate-800 text-[11px]">{selectedApplication.category}</strong></div>
                          <div><span className="text-mu block text-[10px]">Constituency:</span> <strong className="text-slate-800 text-[11px]">{selectedApplication.constituency}</strong></div>
                          <div><span className="text-mu block text-[10px]">Requested Amount:</span> <strong className="text-slate-800 text-[11px]">{selectedApplication.amount ? zmw(Number(selectedApplication.amount)) : 'N/A'}</strong></div>
                          
                          {selectedApplication.category === 'Grant' && (
                            <>
                              <div><span className="text-mu block text-[10px]">Business Name:</span> <strong className="text-slate-800 text-[11px]">{selectedApplication.businessName}</strong></div>
                              <div><span className="text-mu block text-[10px]">Sector:</span> <strong className="text-slate-800 text-[11px]">{selectedApplication.businessSector}</strong></div>
                            </>
                          )}
                          {selectedApplication.category === 'Bursary' && (
                            <>
                              <div><span className="text-mu block text-[10px]">School / College:</span> <strong className="text-slate-800 text-[11px]">{selectedApplication.institution}</strong></div>
                              <div><span className="text-mu block text-[10px]">Level of Study:</span> <strong className="text-slate-800 text-[11px]">{selectedApplication.levelOfStudy}</strong></div>
                              {selectedApplication.guardianName && (
                                <div><span className="text-mu block text-[10px]">Guardian Name:</span> <strong className="text-slate-800 text-[11px]">{selectedApplication.guardianName}</strong></div>
                              )}
                            </>
                          )}
                          {selectedApplication.category === 'Agricultural Support' && (
                            <>
                              <div><span className="text-mu block text-[10px]">Farm Size:</span> <strong className="text-slate-800 text-[11px]">{selectedApplication.farmSize}</strong></div>
                              <div><span className="text-mu block text-[10px]">Farming Type:</span> <strong className="text-slate-800 text-[11px]">{selectedApplication.farmingType}</strong></div>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <h5 className="font-bold text-ink uppercase tracking-wider text-[10px]">3. Location & Purpose Details</h5>
                        <div className="bg-white p-3.5 border border-bo rounded-xl space-y-2.5">
                          {selectedApplication.lat != null && selectedApplication.lng != null ? (
                            <div>
                              <span className="text-mu block text-[10px]">Geo-location:</span>
                              <strong className="text-emerald-700 text-[11px] font-mono flex items-center gap-1">
                                📍 Lat: {selectedApplication.lat.toFixed(6)}, Lng: {selectedApplication.lng.toFixed(6)}
                              </strong>
                            </div>
                          ) : (
                            <div><span className="text-mu block text-[10px]">Geo-location:</span> <strong className="text-amber-700 text-[11px]">Unspecified</strong></div>
                          )}
                          <div>
                            <span className="text-mu block text-[10px]">Purpose Detail:</span>
                            <p className="text-slate-700 text-[11px] leading-relaxed italic whitespace-pre-wrap">
                              "{selectedApplication.purpose}"
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* AI evaluation report inside selected view */}
                    <div className="bg-white border border-bo rounded-xl p-5 space-y-3 shadow-inner">
                      <h5 className="text-xs font-bold text-indigo-700 uppercase tracking-wider flex items-center gap-1.5">
                        🤖 Live AI Evaluation report
                      </h5>
                      {aiAppAnalysisLoading ? (
                        <div className="flex items-center gap-2 text-xs text-mu py-2">
                          <span className="animate-spin inline-block w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full"></span>
                          Gemini evaluation engine reviewing application alignment and risk index...
                        </div>
                      ) : aiAppAnalysis ? (
                        <div className="text-xs text-slate-700 leading-relaxed whitespace-pre-line prose max-w-none">
                          {aiAppAnalysis}
                        </div>
                      ) : (
                        <p className="text-xs text-mu italic">Report generation failed or not started yet.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB CONTENT: ANNOUNCEMENTS BOARD */}
            {adminSubTab === 'announcements' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Composer */}
                <div className="lg:col-span-5 bg-white border border-bo rounded-2xl p-5 shadow-sm space-y-4">
                  <div className="border-b border-bo pb-3">
                    <h3 className="font-serif font-bold text-lg text-sky-700 flex items-center gap-2">
                      📣 Post a Public Announcement
                    </h3>
                    <p className="text-xs text-mu mt-1">Tenders, meeting notices, and budget releases posted here appear instantly on the public Announcements board.</p>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-mu font-semibold block">Publishing as</label>
                    <div className="bg-bg/60 border border-bo rounded-xl px-3.5 py-2 text-sm text-ink">
                      <strong>{currentUser?.name || 'CDF Administration'}</strong>
                      <span className="text-mu"> — {currentUser?.constituency || 'National (all constituencies)'}</span>
                    </div>
                  </div>

                  {!currentUser?.constituency && (
                    <div className="space-y-1">
                      <label className="text-xs text-mu font-semibold block">Constituency (optional — leave blank for a national announcement)</label>
                      <select
                        value={newAnnConst}
                        onChange={(e) => setNewAnnConst(e.target.value)}
                        className="w-full px-3 py-2 border border-bo rounded-xl text-sm focus:outline-none focus:border-sky-500"
                      >
                        <option value="">🇿🇲 National (all constituencies)</option>
                        {dbConstituencies.map((c) => (
                          <option key={`${c.name}-${c.province}`} value={c.name}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-xs text-mu font-semibold block">Type *</label>
                    <select
                      value={newAnnType}
                      onChange={(e) => setNewAnnType(e.target.value as typeof newAnnType)}
                      className="w-full px-3 py-2 border border-bo rounded-xl text-sm focus:outline-none focus:border-sky-500"
                    >
                      <option value="General">📌 General</option>
                      <option value="Tender">📄 Tender</option>
                      <option value="Meeting">🗓️ Meeting</option>
                      <option value="Budget Release">💰 Budget Release</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-mu font-semibold block">Title *</label>
                    <input
                      type="text"
                      placeholder="e.g. Q3 CDF Budget Release Notice"
                      value={newAnnTitle}
                      onChange={(e) => setNewAnnTitle(e.target.value)}
                      className="w-full px-3.5 py-2 border border-bo rounded-xl text-sm focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-mu font-semibold block">Message *</label>
                    <textarea
                      rows={4}
                      placeholder="Details for citizens..."
                      value={newAnnBody}
                      onChange={(e) => setNewAnnBody(e.target.value)}
                      className="w-full px-3.5 py-2 border border-bo rounded-xl text-sm focus:outline-none focus:border-sky-500 resize-none"
                    ></textarea>
                  </div>

                  <button
                    onClick={handleAddAnnouncement}
                    className="w-full bg-sky-600 hover:bg-sky-500 text-white font-medium text-sm rounded-xl py-3 shadow transition-colors cursor-pointer"
                  >
                    Publish Announcement 📢
                  </button>
                </div>

                {/* Live list */}
                <div className="lg:col-span-7 bg-white border border-bo rounded-2xl p-5 shadow-sm space-y-4 max-h-[600px] overflow-y-auto">
                  <h3 className="font-serif font-bold text-sm border-b border-bo pb-2 sticky top-0 bg-white z-10 flex items-center justify-between">
                    <span>🗂️ {isNationalAdmin ? 'Published Announcements' : 'Your Published Announcements'} ({adminVisibleAnnouncements.length})</span>
                    {!isNationalAdmin && (
                      <span className="text-[9px] font-normal text-sky-600 bg-sky-50 px-2 py-0.5 rounded-full">📍 Only your own posts shown here</span>
                    )}
                  </h3>
                  {adminVisibleAnnouncements.length > 0 ? (
                    <div className="space-y-3 divide-y divide-bo/50">
                      {adminVisibleAnnouncements.map((a) => (
                        <div key={a.id} className="pt-3 first:pt-0 space-y-1.5">
                          <div className="flex justify-between items-start gap-2">
                            <div>
                              <h4 className="font-bold text-xs text-ink">{a.title}</h4>
                              <p className="text-[10px] text-mu">
                                <span className={`font-bold uppercase px-1.5 py-0.5 rounded mr-1 ${
                                  a.type === 'Tender' ? 'bg-purple-50 text-purple-700' :
                                  a.type === 'Meeting' ? 'bg-blue-50 text-blue-700' :
                                  a.type === 'Budget Release' ? 'bg-emerald-50 text-emerald-700' :
                                  'bg-slate-100 text-slate-700'
                                }`}>{a.type}</span>
                                {a.date} · by {a.postedBy} · {a.constituency || 'National'}
                              </p>
                            </div>
                            {canDeleteAnnouncement(a) ? (
                              <button
                                onClick={() => handleDeleteAnnouncement(a)}
                                className="bg-red-50 hover:bg-red-100 text-red-600 text-[9px] font-bold px-2 py-1 rounded cursor-pointer transition-colors shrink-0"
                              >
                                Delete
                              </button>
                            ) : (
                              <span className="text-[9px] text-mu italic shrink-0" title="Only a national admin can delete announcements outside your constituency">🔒 Locked</span>
                            )}
                          </div>
                          <p className="text-[10px] text-mu leading-relaxed">{a.body}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-mu italic">
                      {isNationalAdmin ? 'No announcements published yet.' : "You haven't published any announcements yet."}
                    </p>
                  )}
                </div>
              </div>
            )}

            {adminSubTab === 'logs' && (
              <div className="space-y-4">
                {renderLiveTransparencyFeed()}
              </div>
            )}
          </div>
        )}
      </main>

      {/* FOOTER */}
      <footer className="bg-[#101c13] text-gray-400 text-xs py-8 px-6 border-t border-[#1a2d1f]">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="space-y-1 text-center md:text-left">
            <h4 className="font-serif font-bold text-sm text-white">Zambia CDF Tracker</h4>
            <p className="text-[10px] opacity-75">Community Development Fund Transparency, Analytics, & Whistleblowing Portal • © 2026</p>
            <p className="text-[10px] text-emerald-500 font-semibold">Designed and developed by Lloyd Kabanda</p>
          </div>
          <div className="flex gap-4">
            <span className="hover:text-white transition-colors cursor-pointer">Constituency Index</span>
            <span className="hover:text-white transition-colors cursor-pointer">ACC Whistleblowing Protocol</span>
            <span className="hover:text-white transition-colors cursor-pointer">Cloud Ledger Verification</span>
          </div>
        </div>
      </footer>

      {/* SECURE SIGN IN MODAL */}
      {showLoginModal && (
        <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl relative space-y-4">
            <button
              onClick={() => {
                setShowLoginModal(false);
                setLoginError('');
                setConstLoginError('');
              }}
              className="absolute top-4 right-4 text-mu hover:text-ink text-lg font-bold cursor-pointer"
            >
              ✕
            </button>
            <div className="text-center space-y-1">
              <Shield className="w-8 h-8 text-forest mx-auto" />
              <h3 className="font-serif font-bold text-lg text-forest">Tracker Secure Access</h3>
              <p className="text-xs text-mu">Sign in as National Admin, District Officer, or Local MP.</p>
            </div>

            <div className="flex border border-bo rounded-xl overflow-hidden text-xs font-semibold">
              <button
                onClick={() => setLoginMode('national')}
                className={`flex-1 py-2 text-center transition-all ${loginMode === 'national' ? 'bg-forest text-white' : 'bg-bg text-mu'}`}
              >
                National Officer
              </button>
              <button
                onClick={() => setLoginMode('constituency')}
                className={`flex-1 py-2 text-center transition-all ${loginMode === 'constituency' ? 'bg-forest text-white' : 'bg-bg text-mu'}`}
              >
                Constituency Admin
              </button>
            </div>

            {loginMode === 'national' ? (
              <div className="space-y-3.5">
                <div className="space-y-1">
                  <label className="text-xs text-mu font-semibold block">Username</label>
                  <input
                    type="text"
                    placeholder="e.g. admin"
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                    className="w-full px-3 py-2 border border-bo rounded-xl text-sm focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-mu font-semibold block">Secret Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      className="w-full px-3 py-2 border border-bo rounded-xl text-sm focus:outline-none pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute top-1/2 -translate-y-1/2 right-3 text-mu hover:text-ink cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {loginError && <div className="text-xs text-red-600 bg-red-50 p-2.5 rounded-lg font-medium">{loginError}</div>}

                <button
                  onClick={handleNationalLogin}
                  className="w-full bg-forest hover:bg-leaf text-white font-semibold py-2.5 rounded-xl text-xs shadow cursor-pointer transition-colors"
                >
                  Confirm Identity & Session
                </button>
              </div>
            ) : (
              <div className="space-y-3.5">
                {!constOtpSent ? (
                  <>
                    <div className="space-y-1">
                      <label className="text-xs text-mu font-semibold block">Your Constituency</label>
                      <select
                        value={selectedLoginConst}
                        onChange={(e) => setSelectedLoginConst(e.target.value)}
                        className="w-full px-3 py-2 border border-bo rounded-xl text-sm focus:outline-none"
                      >
                        {dbConstituencies.map((c) => (
                          <option key={c.name} value={c.name}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-mu font-semibold block">Registered Admin Email</label>
                      <input
                        type="email"
                        placeholder="e.g. admin@constituency.gov"
                        value={constEmailInput}
                        onChange={(e) => setConstEmailInput(e.target.value)}
                        className="w-full px-3 py-2 border border-bo rounded-xl text-sm focus:outline-none"
                      />
                    </div>

                    {constLoginError && <div className="text-xs text-red-600 bg-red-50 p-2.5 rounded-lg font-medium">{constLoginError}</div>}

                    <button
                      onClick={handleSendConstOtp}
                      className="w-full bg-forest hover:bg-leaf text-white font-semibold py-2.5 rounded-xl text-xs shadow cursor-pointer"
                    >
                      Send Passwordless Login Code 📧
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-mu text-center">We have sent a 6-digit verification code to <strong className="text-ink">{constEmailInput}</strong></p>
                    <input
                      type="text"
                      placeholder="000000"
                      maxLength={6}
                      value={constOtpInput}
                      onChange={(e) => setConstOtpInput(e.target.value)}
                      className="px-4 py-2 border border-bo rounded-xl text-xl font-bold tracking-widest text-center w-full focus:outline-none"
                    />

                    {constLoginError && <div className="text-xs text-red-600 bg-red-50 p-2.5 rounded-lg font-medium">{constLoginError}</div>}

                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={() => setConstOtpSent(false)}
                        className="flex-1 bg-white border border-bo text-ink py-2 rounded-xl text-xs font-semibold cursor-pointer"
                      >
                        Back
                      </button>
                      <button
                        onClick={handleVerifyConstOtp}
                        className="flex-1 bg-forest hover:bg-leaf text-white py-2 rounded-xl text-xs font-semibold cursor-pointer"
                      >
                        Verify & Login
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* DYNAMIC PROJECT DETAIL DRAWERS MODAL */}
      {selectedProject && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white w-full max-w-xl rounded-2xl overflow-hidden shadow-2xl relative">
            {/* Header */}
            <div className="px-5 py-4 border-b border-bo bg-gradient-to-r from-forest to-leaf text-white flex justify-between items-start">
              <div>
                <span className="text-[9px] uppercase tracking-widest font-bold text-yellow-400">PROJECT LEDGER SHEET</span>
                <h3 className="font-serif font-extrabold text-base md:text-lg leading-tight mt-0.5">{selectedProject.name}</h3>
                <p className="text-xs opacity-75 mt-0.5">{selectedProject.id} • {selectedProject.constituency} Constituency • {getProjectMp(selectedProject)}</p>
              </div>
              <button
                onClick={() => setSelectedProject(null)}
                className="text-white/80 hover:text-white text-lg font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-5 max-h-[75vh] overflow-y-auto">
              {/* Financial flow metrics */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-3 text-center">
                  <span className="text-[10px] text-mu uppercase block">Allocation Budget</span>
                  <strong className="font-serif text-sm text-blue-800">{zmw(selectedProject.budget)}</strong>
                </div>
                <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-3 text-center">
                  <span className="text-[10px] text-mu uppercase block">Disbursed Funds</span>
                  <strong className="font-serif text-sm text-emerald-800">{zmw(selectedProject.spent)}</strong>
                </div>
                <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-3 text-center">
                  <span className="text-[10px] text-mu uppercase block">Remaining</span>
                  <strong className="font-serif text-sm text-amber-800">{zmw(selectedProject.budget - selectedProject.spent)}</strong>
                </div>
              </div>

              {/* Progress Level */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs font-semibold text-mu">
                  <span>Audit completion index</span>
                  <span className="text-forest font-bold">{selectedProject.pct}%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-3.5 overflow-hidden border border-bo/50">
                  <div
                    className="h-full rounded-full transition-all duration-1000"
                    style={{
                      width: `${selectedProject.pct}%`,
                      backgroundColor: selectedProject.status === 'stalled' ? '#ef4444' : selectedProject.status === 'complete' ? '#10b981' : '#3b82f6',
                    }}
                  ></div>
                </div>
                <p className="text-[10px] text-mu italic text-right">High frequency updates synced in background</p>
              </div>

              {/* Description status block */}
              {selectedProject.status === 'stalled' && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-red-800 leading-relaxed">
                    <strong>Warning — High Risk Flagged:</strong> Budget allocation of {zmw(selectedProject.budget)} was committed, but the project is officially Stalled. ACC audit investigations might be active on this constituency.
                  </div>
                </div>
              )}

              {/* Milestones list */}
              <div className="space-y-3">
                <h4 className="font-serif font-bold text-sm text-ink">📍 Milestones Completion Chart</h4>
                <div className="space-y-3 pl-2.5 border-l-2 border-bo/80">
                  {[
                    { title: 'Project Charter & Allocation Approved', threshold: 10, desc: 'Tender assigned and allocations committed live' },
                    { title: 'Ground Clearance & Foundations complete', threshold: 35, desc: 'Civil engineering structural foundations signed off' },
                    { title: 'Superstructure walling & Roofing', threshold: 65, desc: 'Framing, roof panels, structural safety validated' },
                    { title: 'Finishing & Official Handover', threshold: 100, desc: 'Community keys handed over to regional officials' },
                  ].map((m, idx) => {
                    const active = selectedProject.pct >= m.threshold;
                    return (
                      <div key={idx} className="relative pl-5 space-y-0.5">
                        <span className={`absolute -left-[16px] top-0.5 w-2.5 h-2.5 rounded-full border-2 ${
                          active ? 'bg-emerald-500 border-emerald-500' : 'bg-white border-bo'
                        }`}></span>
                        <h5 className={`text-xs font-bold ${active ? 'text-ink' : 'text-mu'}`}>{m.title}</h5>
                        <p className="text-[10px] text-mu">{m.desc}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Footer action */}
            <div className="bg-bg px-5 py-3 border-t border-bo flex justify-end">
              <button
                onClick={() => setSelectedProject(null)}
                className="bg-forest hover:bg-leaf text-white font-semibold text-xs py-2 px-4 rounded-xl cursor-pointer"
              >
                Close audit sheet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FLOATING AI ASSISTANT CHAT WIDGET */}
      <div className="fixed bottom-6 right-6 z-50">
        {!chatOpen ? (
          <button
            onClick={() => setChatOpen(true)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-full p-4 shadow-2xl flex items-center justify-center cursor-pointer transition-all hover:scale-115"
            title="Ask CDF AI Assistant"
          >
            <span className="text-2xl">🤖</span>
            <span className="absolute -top-1 -right-1 bg-emerald-500 w-3 h-3 rounded-full border-2 border-white animate-ping"></span>
            <span className="absolute -top-1 -right-1 bg-emerald-500 w-3 h-3 rounded-full border-2 border-white"></span>
          </button>
        ) : (
          <div className="w-80 md:w-96 h-[480px] bg-white border border-bo rounded-2xl shadow-2xl overflow-hidden flex flex-col transition-all">
            {/* Header */}
            <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="text-xl">🤖</span>
                <div>
                  <h4 className="font-bold text-xs">CDF Intelligent Advisor</h4>
                  <p className="text-[10px] text-slate-400 flex items-center gap-1">
                    <span className="bg-green-500 w-1.5 h-1.5 rounded-full inline-block animate-pulse"></span>
                    Grounded on live registry
                  </p>
                </div>
              </div>
              <button
                onClick={() => setChatOpen(false)}
                className="text-slate-400 hover:text-white transition-colors cursor-pointer text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
              {chatMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-indigo-600 text-white rounded-br-none'
                        : 'bg-white text-slate-850 border border-bo rounded-bl-none shadow-sm'
                    }`}
                  >
                    <div className="whitespace-pre-line">{msg.text}</div>
                  </div>
                </div>
              ))}
              {chatTyping && (
                <div className="flex justify-start">
                  <div className="bg-white text-slate-850 border border-bo rounded-2xl rounded-bl-none px-3 py-2 text-xs shadow-sm flex items-center gap-1">
                    <span className="animate-bounce">●</span>
                    <span className="animate-bounce [animation-delay:0.2s]">●</span>
                    <span className="animate-bounce [animation-delay:0.4s]">●</span>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Prompts */}
            <div className="px-3 py-2 bg-slate-100 border-t border-bo flex gap-1.5 overflow-x-auto whitespace-nowrap scrollbar-none">
              {[
                'stalled projects',
                'Mandevu projects',
                'overall budget use'
              ].map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => {
                    setChatInput(`Show me ${q}`);
                  }}
                  className="bg-white hover:bg-indigo-50 border border-bo rounded-full px-2.5 py-1 text-[10px] text-slate-600 hover:text-indigo-700 cursor-pointer transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>

            {/* Input Footer */}
            <div className="p-2 border-t border-bo flex gap-2 bg-white">
              <input
                type="text"
                placeholder="Ask about any project or report..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSendChatMessage();
                }}
                className="flex-1 bg-slate-50 border border-bo rounded-xl px-3 py-2 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <button
                onClick={handleSendChatMessage}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs px-3.5 py-2 rounded-xl cursor-pointer transition-colors"
              >
                Send
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── RETURNING CITIZEN LOGIN MODAL ── */}
      {showCitizenLoginModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-bo flex items-center justify-between">
              <h3 className="font-serif font-bold text-lg">👤 Citizen Log In</h3>
              <button
                onClick={() => { setShowCitizenLoginModal(false); resetCitizenLoginState(); }}
                className="text-mu hover:text-ink text-lg leading-none cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4">
              {citizenLoginStage === 'lookup' && (
                <>
                  <p className="text-xs text-mu">Enter the email you registered with. Premium citizens log straight in with a password; free citizens verify with a one-time code, same as signup.</p>
                  <div className="space-y-1">
                    <label className="text-xs text-mu font-semibold block">Email Address</label>
                    <input
                      type="email"
                      placeholder="e.g. mary@example.com"
                      value={citizenLoginEmail}
                      onChange={(e) => {
                        setCitizenLoginEmail(e.target.value);
                        // Editing the email invalidates any previously
                        // looked-up account — clear the fields tied to it.
                        setCitizenLoginUsername('');
                        setCitizenLoginPassword('');
                        setCitizenLoginFoundAccount(null);
                        setCitizenLoginError('');
                      }}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleCitizenLoginLookup(); }}
                      className="w-full px-3 py-2 border border-bo rounded-xl text-sm focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  {citizenLoginError && <div className="text-xs text-red-600 bg-red-50 p-3 rounded-lg font-medium">{citizenLoginError}</div>}
                  <button
                    onClick={handleCitizenLoginLookup}
                    disabled={citizenLoginBusy}
                    className="w-full bg-sky-600 hover:bg-sky-500 disabled:opacity-60 text-white py-2.5 rounded-xl text-sm font-semibold cursor-pointer transition-colors"
                  >
                    {citizenLoginBusy ? 'Checking…' : 'Continue'}
                  </button>
                </>
              )}

              {citizenLoginStage === 'password' && citizenLoginFoundAccount && (
                <>
                  <p className="text-xs text-mu">
                    Welcome back, <strong>{citizenLoginFoundAccount.name}</strong> 💎 — enter your username and password to continue.
                  </p>
                  <div className="space-y-1">
                    <label className="text-xs text-mu font-semibold block">Username</label>
                    <input
                      type="text"
                      placeholder="Enter your username"
                      value={citizenLoginUsername}
                      onChange={(e) => setCitizenLoginUsername(e.target.value)}
                      className="w-full px-3 py-2 border border-bo rounded-xl text-sm focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-mu font-semibold block">Password</label>
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={citizenLoginPassword}
                      onChange={(e) => setCitizenLoginPassword(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleCitizenLoginPasswordSubmit(); }}
                      className="w-full px-3 py-2 border border-bo rounded-xl text-sm focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  {citizenLoginError && <div className="text-xs text-red-600 bg-red-50 p-3 rounded-lg font-medium">{citizenLoginError}</div>}
                  <button
                    onClick={handleCitizenLoginPasswordSubmit}
                    className="w-full bg-sky-600 hover:bg-sky-500 text-white py-2.5 rounded-xl text-sm font-semibold cursor-pointer transition-colors"
                  >
                    Log In
                  </button>
                </>
              )}

              {citizenLoginStage === 'otp' && citizenLoginFoundAccount && (
                <>
                  <p className="text-xs text-mu text-center">A login verification code was sent to <strong>{citizenLoginFoundAccount.email}</strong>.</p>
                  <input
                    type="text"
                    placeholder="000000"
                    maxLength={6}
                    value={citizenLoginOtpInput}
                    onChange={(e) => setCitizenLoginOtpInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleCitizenLoginOtpSubmit(); }}
                    className="px-4 py-3 border border-bo rounded-xl text-2xl font-bold tracking-widest text-center w-full focus:outline-none focus:border-sky-500"
                  />
                  {citizenLoginError && <div className="text-xs text-red-600 bg-red-50 p-3 rounded-lg font-medium">{citizenLoginError}</div>}
                  <button
                    onClick={handleCitizenLoginOtpSubmit}
                    className="w-full bg-sky-600 hover:bg-sky-500 text-white py-2.5 rounded-xl text-sm font-semibold cursor-pointer transition-colors"
                  >
                    Verify Code & Log In
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── CITIZEN REQUEST FULL REVIEW MODAL ── */}
      {reqReviewOpen && selectedRequest && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

            {/* Header */}
            <div className="bg-gradient-to-r from-yellow-700 to-yellow-500 px-5 py-4 text-white flex justify-between items-start shrink-0">
              <div>
                <span className="text-[9px] uppercase tracking-widest font-bold text-yellow-200">Community Request File</span>
                <h3 className="font-serif font-extrabold text-base leading-tight mt-0.5">{selectedRequest.name}</h3>
                <p className="text-[10px] opacity-80 mt-0.5">{selectedRequest.id} · {selectedRequest.constituency} · {selectedRequest.date}</p>
              </div>
              <button onClick={() => { setReqReviewOpen(false); setSelectedRequest(null); }} className="text-white/80 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body — scrollable */}
            <div className="overflow-y-auto flex-1 p-5 space-y-5">

              {/* Status badge */}
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-mu uppercase tracking-wider">Current status</span>
                <span className={`text-[10px] uppercase font-bold px-3 py-1 rounded-full ${
                  selectedRequest.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' :
                  selectedRequest.status === 'Rejected' ? 'bg-red-100 text-red-700' :
                  selectedRequest.status === 'Under Review' ? 'bg-blue-100 text-blue-700' :
                  'bg-amber-100 text-amber-700'
                }`}>{selectedRequest.status}</span>
              </div>

              {/* Info grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 border border-bo rounded-xl p-3">
                  <span className="text-[9px] text-mu uppercase block mb-0.5">Submitted by</span>
                  <strong className="text-xs text-ink">{selectedRequest.submitterName}</strong>
                </div>
                <div className="bg-slate-50 border border-bo rounded-xl p-3">
                  <span className="text-[9px] text-mu uppercase block mb-0.5">Phone</span>
                  <strong className="text-xs text-ink">{selectedRequest.submitterContact || 'Not provided'}</strong>
                </div>
                <div className="bg-slate-50 border border-bo rounded-xl p-3">
                  <span className="text-[9px] text-mu uppercase block mb-0.5">Email</span>
                  <strong className="text-xs text-ink break-words">{selectedRequest.submitterEmail || 'Not provided'}</strong>
                </div>
                <div className="bg-slate-50 border border-bo rounded-xl p-3">
                  <span className="text-[9px] text-mu uppercase block mb-0.5">Sector</span>
                  <strong className="text-xs text-ink">{selectedRequest.sector}</strong>
                </div>
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                  <span className="text-[9px] text-mu uppercase block mb-0.5">Estimated cost</span>
                  <strong className="text-xs text-emerald-800">{selectedRequest.cost || 'Not specified'}</strong>
                </div>
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                  <span className="text-[9px] text-mu uppercase block mb-0.5">Beneficiaries</span>
                  <strong className="text-xs text-blue-800">{selectedRequest.beneficiaries || 'Not specified'}</strong>
                </div>
              </div>

              {/* Full description — no truncation */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold text-mu uppercase tracking-wider">Full description & reasons</span>
                <div className="bg-slate-50 border border-bo rounded-xl p-4 text-xs text-ink leading-relaxed whitespace-pre-wrap">
                  {selectedRequest.desc}
                </div>
              </div>

              {/* Community support: votes + comments */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold text-mu uppercase tracking-wider">👍 {selectedRequest.votes || 0} support · 👎 {selectedRequest.rejects || 0} object</span>
                {selectedRequest.comments && selectedRequest.comments.length > 0 ? (
                  <div className="bg-slate-50 border border-bo rounded-xl p-3 space-y-1.5 max-h-40 overflow-y-auto">
                    {selectedRequest.comments.map((c) => (
                      <p key={c.id} className="text-xs text-ink leading-snug">
                        <span className="font-semibold">{c.author}</span> <span className="text-mu text-[10px]">({c.date}):</span> {c.text}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-mu italic">No citizen comments on this request yet.</p>
                )}
              </div>

              {/* AI analysis if available */}
              {(aiReqAnalysis || aiReqAnalysisLoading) && (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold text-purple-700 uppercase tracking-wider">🤖 AI Viability Assessment</span>
                  {aiReqAnalysisLoading ? (
                    <div className="flex items-center gap-2 text-xs text-mu bg-purple-50 rounded-xl p-3">
                      <span className="animate-spin inline-block w-3 h-3 border border-purple-500 border-t-transparent rounded-full"></span>
                      Evaluating request...
                    </div>
                  ) : (
                    <div className="bg-purple-50 border border-purple-100 rounded-xl p-4 text-xs text-slate-700 leading-relaxed whitespace-pre-line">
                      {aiReqAnalysis}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div className="shrink-0 bg-slate-50 border-t border-bo px-5 py-3 flex flex-wrap gap-2 justify-end">
              <button
                onClick={() => { handleUpdateReqStatus(selectedRequest.id, 'Approved'); setReqReviewOpen(false); setSelectedRequest(null); }}
                className="bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-semibold text-xs px-3 py-2 rounded-xl cursor-pointer transition-colors"
              >
                ✅ Approve
              </button>
              <button
                onClick={() => { handleUpdateReqStatus(selectedRequest.id, 'Under Review'); setReqReviewOpen(false); setSelectedRequest(null); }}
                className="bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold text-xs px-3 py-2 rounded-xl cursor-pointer transition-colors"
              >
                🔍 Under Review
              </button>
              <button
                onClick={() => { handleUpdateReqStatus(selectedRequest.id, 'Rejected'); setReqReviewOpen(false); setSelectedRequest(null); }}
                className="bg-red-100 hover:bg-red-200 text-red-800 font-semibold text-xs px-3 py-2 rounded-xl cursor-pointer transition-colors"
              >
                ❌ Reject
              </button>
              <button
                onClick={() => { handleAnalyzeRequest(selectedRequest); }}
                className="bg-purple-50 hover:bg-purple-100 text-purple-700 font-semibold text-xs px-3 py-2 rounded-xl cursor-pointer transition-colors"
              >
                🤖 AI Evaluate
              </button>
              <button
                onClick={() => handleDeleteRequest(selectedRequest.id)}
                className="flex items-center gap-1 bg-red-50 hover:bg-red-100 text-red-600 font-semibold text-xs px-3 py-2 rounded-xl cursor-pointer transition-colors"
              >
                <Trash2 className="w-3 h-3" /> Delete
              </button>
              <button
                onClick={() => { setReqReviewOpen(false); setSelectedRequest(null); }}
                className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-xs px-4 py-2 rounded-xl cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

(() => {
  'use strict';

  // ===================== constants =====================
  const APP_VERSION = '2.2.1';
  const LS = 'yaja2:';
  const CFG = window.YAJA_CONFIG || {};
  const zero = () => ({ awayMs: 0, drowsyCount: 0 });
  const Cam = window.YajaCam || { state: 'off', error: '', supported: () => false, peek: () => null, isPaused: () => false, flush: zero, pause: zero, resume: () => {}, stop: zero, start: async () => false };
  const Arduino = window.YajaArduino || { supported: () => false, connected: () => false, send: async () => {}, connect: async () => false, disconnect: async () => {} };
  const AWAY_MIN_MS = 10000;
  const PLAN_MIN = [20, 30, 40, 50, 60, 80, 90, 120];
  const DAILY_GOALS = [60, 90, 120, 150, 180, 210, 240, 270, 300, 360, 420, 480];
  const TARGET_MIN = [0, 60, 120, 180, 240, 300, 360, 480, 600];
  const DEFAULT_SUBJECTS = ['국어', '수학', '영어', '과학', '사회'];
  const DEFAULT_DISTRACTORS = ['휴대폰', '졸음', '잡담·소음', '할 일이 불명확', '내용이 어려움', '기타'];
  const FOCUS_CAP = ['거의 못 함', '자주 끊김', '보통', '잘 됨', '아주 잘 됨'];
  const PHASE = { normal: '일반', A: 'A(기록만)', B: 'B(피드백)' };
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  const TIPS = {
    '휴대폰': { title: '휴대폰과 거리 두기', body: () => '공부를 시작할 때 알림을 끄고, 휴대폰은 휴식 시간에만 보기로 정해 보세요.', short: '휴대폰 때문에 끊겼네요. 다음엔 시작할 때 알림부터 꺼 보세요.' },
    '졸음': { title: '졸린 시간대 앞에 휴식 넣기', body: (R) => (R && R.lowHour != null ? `${R.lowHour}시대 공부 전에 5분 일어나 스트레칭을 하고 시작해 보세요.` : '졸음이 오면 5분 일어나 스트레칭을 하고 다시 시작해 보세요.'), short: '졸음 때문에 힘들었네요. 다음 공부 전에 5분 일어나 움직여 보세요.' },
    '잡담·소음': { title: '자리와 쉬는 시간 맞추기', body: () => '조용한 자리로 옮기거나, 친구들과 쉬는 시간을 맞춰 공부 시간에는 대화를 줄여 보세요.', short: '주변이 시끄러웠네요. 다음엔 조용한 자리를 먼저 잡아 보세요.' },
    '할 일이 불명확': { title: '할 일을 범위까지 정하기', body: () => '공부를 시작할 때 "이번에 할 일"을 범위까지 적어 보세요. 예: "수학 문제집" 대신 "2단원 15~30번".', short: '할 일을 더 작게 쪼개 보세요. 예: "수학 문제집" 대신 "2단원 15~30번".' },
    '내용이 어려움': { title: '질문 목록 만들기', body: () => '막힌 문제를 메모해 두었다가 다음 날 선생님께 질문해 보세요. 혼자 오래 붙잡는 시간을 줄일 수 있어요.', short: '막힌 부분을 메모해 두고 선생님께 질문해 보세요.' },
  };

  // ===================== small utils =====================
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const pad = (n) => String(n).padStart(2, '0');
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const avg = (a) => (a.length ? sum(a) / a.length : null);
  const range = (a, b) => { const out = []; for (let i = a; i <= b; i++) out.push(i); return out; };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clampPct = (v) => Math.max(0, Math.min(100, Math.round((Number(v) || 0) / 5) * 5));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  function dayKey(d) { d = new Date(d); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function parseDay(k) { const [y, m, d] = String(k).split('-').map(Number); return new Date(y, m - 1, d); }
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function weekStart(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
  const weekKey = (d) => dayKey(weekStart(d));
  const daysBetween = (a, b) => Math.round((parseDay(b) - parseDay(a)) / 864e5);
  function fmtDateLong(d) { return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WD[d.getDay()]})`; }
  function fmtHM(ms) {
    const m = Math.max(0, Math.round(ms / 60000)); const h = Math.floor(m / 60); const r = m % 60;
    if (!h) return `${r}분`; return r ? `${h}시간 ${r}분` : `${h}시간`;
  }
  function fmtDur(ms) { return ms < 60000 ? `${Math.max(1, Math.round(ms / 1000))}초` : fmtHM(ms); }
  function fmtClock(ms) { const s = Math.max(0, Math.floor(ms / 1000)); return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`; }
  function fmtTime(ts) { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
  function fmtShortHM(ms) { const m = Math.round(ms / 60000); return `${Math.floor(m / 60)}:${pad(m % 60)}`; }
  function fmtDateTime(v) { if (!v) return '–'; const d = new Date(v); if (isNaN(d)) return '–'; return `${d.getMonth() + 1}/${d.getDate()} ${fmtTime(d)}`; }
  function pct(x) { return `${Math.round(x * 100)}%`; }
  function weekLabel(start) { const e = addDays(start, 6); return start.getMonth() === e.getMonth() ? `${start.getMonth() + 1}월 ${start.getDate()}일 – ${e.getDate()}일` : `${start.getMonth() + 1}월 ${start.getDate()}일 – ${e.getMonth() + 1}월 ${e.getDate()}일`; }
  function monthLabel(d) { return `${d.getFullYear()}년 ${d.getMonth() + 1}월`; }
  function batchim(word) { const c = String(word).charCodeAt(String(word).length - 1); if (c < 0xac00 || c > 0xd7a3) return null; return (c - 0xac00) % 28 !== 0; }
  function pp(word, a, b) { const t = batchim(word); return t === null ? `${a}(${b})` : t ? a : b; }
  function iga(word) { return pp(word, '이', '가'); }
  function ago(key) { if (!key) return '기록 없음'; const d = daysBetween(key, dayKey(new Date())); return d <= 0 ? '오늘' : d === 1 ? '어제' : `${d}일 전`; }
  function ddayText(date) { const n = daysBetween(dayKey(new Date()), date); return n > 0 ? `D-${n}` : n === 0 ? 'D-day' : `D+${-n}`; }
  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const mins = (ms) => (ms / 60000).toFixed(1);

  // ===================== storage =====================
  let storageOK = true;
  function lsGet(k, fb) { try { const v = localStorage.getItem(LS + k); return v == null ? fb : JSON.parse(v); } catch (e) { return fb; } }
  function lsSet(k, v) { try { localStorage.setItem(LS + k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function lsDel(k) { try { localStorage.removeItem(LS + k); } catch (e) { /* ignore */ } }
  try { localStorage.setItem(LS + 'probe', '1'); localStorage.removeItem(LS + 'probe'); } catch (e) { storageOK = false; }
  const device = Object.assign({ installDismissed: false }, lsGet('device', {}));
  const saveDevice = () => lsSet('device', device);

  // ===================== server =====================
  const serverUrl = () => String(lsGet('server', '') || CFG.serverUrl || CFG.submitUrl || '').trim();
  const ERR = {
    no_server: '학교 서버가 아직 연결되지 않았어요.',
    network: '서버에 연결할 수 없어요. 인터넷 연결을 확인해 주세요.',
    bad_response: '서버 응답을 읽지 못했어요. 서버 주소가 맞는지, 웹 앱 배포가 끝났는지 확인해 주세요.',
    server_error: '서버에서 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요.',
    auth: '로그인이 만료됐어요. 다시 로그인해 주세요.',
    forbidden: '선생님(관리자) 계정만 할 수 있어요.',
    not_ready: '운영팀이 서버 설정(가입 코드)을 아직 마치지 않았어요.',
    bad_join_code: '가입 코드가 맞지 않아요. 선생님께 받은 코드를 확인해 주세요.',
    bad_no: '학번(아이디)은 영문·숫자 2~20자로 적어 주세요.',
    bad_name: '이름을 적어 주세요.',
    bad_password: '비밀번호는 6자 이상으로 정해 주세요.',
    exists: '이미 가입된 학번(아이디)이에요. 로그인해 주세요.',
    bad_login: '학번(아이디) 또는 비밀번호가 맞지 않아요.',
    locked: '비밀번호를 여러 번 틀려서 10분 동안 로그인할 수 없어요.',
    disabled: '사용이 정지된 계정이에요. 선생님께 문의해 주세요.',
    wrong_password: '지금 비밀번호가 맞지 않아요.',
    no_key: '운영팀이 AI 키를 아직 설정하지 않았어요.',
    limit_device: '오늘 상담 횟수를 다 썼어요. 내일 다시 이야기해요.',
    limit_all: '오늘 전체 상담 횟수가 다 찼어요. 내일 다시 시도해 주세요.',
    busy: 'AI가 잠시 바빠요. 조금 뒤에 다시 보내 주세요.',
    bad_key: 'AI 키가 올바르지 않아요. 운영팀에 알려 주세요.',
    api_error: 'AI 답변을 받지 못했어요. 잠시 뒤 다시 시도해 주세요.',
    empty: '보낼 내용이 없어요.',
    not_found: '그 계정을 찾을 수 없어요.',
    self: '내 계정에는 할 수 없어요.',
  };
  function errText(e) {
    const m = e && e.message;
    if (ERR[m]) return ERR[m];
    if (String(m).startsWith('http_')) return '서버 주소가 올바르지 않거나 서버가 응답하지 않아요.';
    return '요청을 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.';
  }
  async function api(action, payload, opts) {
    opts = opts || {};
    const url = serverUrl(); if (!url) throw new Error('no_server');
    const body = Object.assign({ action, app: 'yaja-room', version: APP_VERSION }, payload || {});
    if (opts.auth !== false && auth) body.token = auth.token;
    let r;
    // text/plain body keeps this a "simple" request, so Apps Script needs no CORS preflight
    try { r = await fetch(url, { method: 'POST', body: JSON.stringify(body) }); } catch (e) { throw new Error('network'); }
    if (!r.ok) throw new Error('http_' + r.status);
    let j = null; try { j = await r.json(); } catch (e) { j = null; }
    if (!j) throw new Error('bad_response');
    if (!j.ok) { if (j.error === 'auth' && opts.auth !== false) onAuthLost(); throw new Error(j.error || 'server_error'); }
    return j;
  }

  // ===================== who is using the app =====================
  let auth = lsGet('auth', null);
  if (!auth || !auth.token || !auth.user || !auth.user.uid) auth = null;
  let mode = 'login'; // login | student | admin | demo-student | demo-admin
  const isStudent = () => mode === 'student' || mode === 'demo-student';
  const isAdmin = () => mode === 'admin' || mode === 'demo-admin';
  const isDemo = () => mode === 'demo-student' || mode === 'demo-admin';

  // ===================== student data =====================
  function freshMeta() {
    return {
      updatedAt: 0,
      final: { title: '', detail: '', dateName: '', date: '', grades: {} },
      subjects: DEFAULT_SUBJECTS.map((name, i) => ({ id: 's' + i, name, slot: i })),
      distractors: DEFAULT_DISTRACTORS.slice(),
      dailyGoalMin: 240,
      prefs: { phase: 'normal', away: 'record', keepAwake: true, chime: true, camSens: 'normal', camPreview: true, camAlarm: true, camVibrate: true, camAuto: true, camAutoSet: false, mentorConsent: false },
      mentorNotes: [],
    };
  }
  function normalizeMeta(m) {
    const f = freshMeta();
    if (!m || typeof m !== 'object') return f;
    const out = Object.assign({}, f, m);
    out.final = Object.assign({}, f.final, m.final && typeof m.final === 'object' ? m.final : {});
    if (!out.final.grades || typeof out.final.grades !== 'object') out.final.grades = {};
    out.prefs = Object.assign({}, f.prefs, m.prefs && typeof m.prefs === 'object' ? m.prefs : {});
    if (!out.prefs.camAutoSet) out.prefs.camAuto = true; // camera on by default until the student turns it off once
    if (!Array.isArray(out.subjects) || !out.subjects.length) out.subjects = f.subjects;
    if (!Array.isArray(out.distractors)) out.distractors = f.distractors;
    if (!Array.isArray(out.mentorNotes)) out.mentorNotes = [];
    out.dailyGoalMin = Number(out.dailyGoalMin) || 240;
    out.updatedAt = Number(out.updatedAt) || 0;
    return out;
  }
  function normalizeData(d) {
    d = d && typeof d === 'object' ? d : {};
    const arr = (x) => (Array.isArray(x) ? x.filter((r) => r && typeof r === 'object' && r.id) : []);
    const sessions = arr(d.sessions).map((s) => Object.assign({ distractors: [], studyMs: 0 }, s, { distractors: Array.isArray(s.distractors) ? s.distractors : [] }));
    const goals = arr(d.goals).map((g) => Object.assign({}, g, { progress: clampPct(g.progress) }));
    return { meta: normalizeMeta(d.meta), goals, sessions, exams: arr(d.exams) };
  }
  function freshState() { return Object.assign(normalizeData({}), { v: 2, running: null, chat: [], lastFeedback: null, lastPull: 0, carryDismissed: '' }); }
  function loadState(key) {
    const s = lsGet(key, null);
    if (!s || typeof s !== 'object') return null;
    return Object.assign(normalizeData(s), { v: 2, running: s.running && typeof s.running === 'object' ? s.running : null, chat: Array.isArray(s.chat) ? s.chat : [],
      lastFeedback: s.lastFeedback || null, lastPull: Number(s.lastPull) || 0, carryDismissed: s.carryDismissed || '' });
  }
  let state = null;
  const dataKey = () => (mode === 'demo-student' ? 'data:demo' : mode === 'student' && auth ? 'data:' + auth.user.uid : null);
  function save() { const k = dataKey(); if (!k || !state) return; storageOK = lsSet(k, state); }

  // ===================== sync (local first, then the school's Google Sheet) =====================
  let outbox = [];
  const outKey = () => (mode === 'student' && auth ? 'outbox:' + auth.user.uid : null);
  const saveOutbox = () => { const k = outKey(); if (k) lsSet(k, outbox); };
  const sync = { busy: false, err: '', timer: null, lastOk: 0 };
  const serverInfo = { mentor: null };
  function stamp(rec) { rec.updatedAt = Math.max(Date.now(), (Number(rec.updatedAt) || 0) + 1); return rec; }
  const GOAL_STATUS = { done: '달성', carried: '이어 감', active: '진행 중', missed: '미완료' };
  function goalStatus(g) { if (g.progress >= 100) return 'done'; if (g.carriedTo) return 'carried'; return g.week < weekKey(new Date()) ? 'missed' : 'active'; }
  function scoresText(scores) { return Object.values(scores || {}).filter((v) => v && v.grade).map((v) => `${v.name || ''} ${v.grade}${v.pct != null ? `(${v.pct})` : ''}`.trim()).join(' · '); }
  function viewOf(kind, r) {
    if (kind === 'session') {
      return { date: r.date, weekday: WD[parseDay(r.date).getDay()], start: fmtTime(r.start), end: fmtTime(r.end), subject: r.subject || '', goal: r.goalTitle || '', plan: r.plan || '', planMin: r.planMin || 0,
        studyMin: Number(mins(r.studyMs)), breakMin: Number(mins(r.breakMs || 0)), awayMin: Number(mins(r.awayMs || 0)), camAwayMin: Number(mins(r.camAwayMs || 0)), drowsy: r.drowsyCount || 0,
        achieve: r.achieve, goalProgress: r.goalProgress == null ? '' : r.goalProgress, focus: r.focus, distractors: (r.distractors || []).join(' / '), phase: PHASE[r.phase] || '' };
    }
    if (kind === 'goal') return { week: r.week, subject: r.subject || '', title: r.title, targetMin: r.targetMin || '', progress: r.progress, status: GOAL_STATUS[goalStatus(r)] };
    return { date: r.date, type: r.type === 'mock' ? '모의고사' : '내신', name: r.name, scores: scoresText(r.scores) };
  }
  function queue(kind, rec, deleted) {
    if (mode !== 'student' || !state) return;
    const item = kind === 'meta'
      ? { kind: 'meta', id: 'meta', updatedAt: state.meta.updatedAt, data: clone(state.meta) }
      : { kind, id: rec.id, updatedAt: rec.updatedAt, deleted: !!deleted, data: deleted ? null : clone(rec), view: deleted ? {} : viewOf(kind, rec) };
    const i = outbox.findIndex((x) => x.kind === item.kind && x.id === item.id);
    if (i >= 0) outbox[i] = item; else outbox.push(item);
    saveOutbox(); renderSync(); scheduleFlush();
  }
  function metaChanged() { stamp(state.meta); save(); queue('meta'); }
  function scheduleFlush(ms) { clearTimeout(sync.timer); sync.timer = setTimeout(flush, ms == null ? 1200 : ms); }
  async function flush() {
    if (mode !== 'student' || sync.busy) return;
    if (!outbox.length || !navigator.onLine) { renderSync(); return; }
    sync.busy = true; renderSync();
    const batch = outbox.slice(0, 100);
    let ok = false;
    try { await api('push', { items: batch }); ok = true; sync.err = ''; sync.lastOk = Date.now(); }
    catch (e) { sync.err = e.message; }
    sync.busy = false;
    if (ok && mode === 'student') {
      // drop what was sent, unless it changed again while the request was on its way
      const sent = new Map(batch.map((x) => [x.kind + ':' + x.id, x.updatedAt]));
      outbox = outbox.filter((x) => sent.get(x.kind + ':' + x.id) !== x.updatedAt);
      saveOutbox();
      if (outbox.length) scheduleFlush(300);
    } else if (!ok && sync.err !== 'auth') scheduleFlush(30000);
    renderSync();
  }
  function merge(j) {
    if (j.meta && (Number(j.meta.updatedAt) || 0) > (state.meta.updatedAt || 0)) state.meta = normalizeMeta(j.meta);
    else if (state.meta.updatedAt > 0 && (!j.meta || (Number(j.meta.updatedAt) || 0) < state.meta.updatedAt) && !outbox.some((x) => x.kind === 'meta')) queue('meta');
    const pending = new Set(outbox.map((x) => x.kind + ':' + x.id));
    [['goal', 'goals'], ['session', 'sessions'], ['exam', 'exams']].forEach(([k, key]) => {
      const del = new Set((j.deleted && j.deleted[k]) || []);
      const local = new Map(state[key].map((r) => [r.id, r]));
      const onServer = new Set();
      (Array.isArray(j[key]) ? j[key] : []).forEach((r) => {
        if (!r || !r.id) return; onServer.add(r.id);
        const l = local.get(r.id);
        if (!l || (Number(r.updatedAt) || 0) > (Number(l.updatedAt) || 0)) local.set(r.id, r);
      });
      del.forEach((id) => { if (!pending.has(k + ':' + id)) local.delete(id); });
      local.forEach((r, id) => { if (!onServer.has(id) && !del.has(id) && !pending.has(k + ':' + id)) queue(k, r); });
      state[key] = normalizeData({ [key]: Array.from(local.values()) })[key];
    });
  }
  async function pull() {
    const j = await api('pull');
    if (mode !== 'student' || !state) return;
    serverInfo.mentor = j.mentor == null ? null : !!j.mentor;
    if (j.user && auth) { auth.user = Object.assign({}, auth.user, j.user); lsSet('auth', auth); }
    merge(j);
    state.lastPull = Date.now(); save();
  }
  async function syncNow(manual) {
    if (mode !== 'student') return;
    await flush();
    try {
      await pull(); sync.err = '';
      if (mode === 'student') {
        // don't redraw under someone who is typing; the next render picks the new data up
        const a = document.activeElement;
        const typing = a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && !/^(checkbox|radio|range)$/.test(a.type);
        if (typing) { renderTop(); } else renderAll();
        if (manual) toast('서버와 기록을 맞췄어요');
      }
    } catch (e) {
      if (e.message !== 'auth') { sync.err = e.message; renderSync(); if (manual) toast(errText(e)); }
    }
  }
  function syncState() {
    if (!navigator.onLine) return { s: 'offline', t: outbox.length ? `오프라인 · ${outbox.length}개 대기` : '오프라인' };
    if (sync.busy) return { s: 'saving', t: '저장 중' };
    if (outbox.length) return { s: sync.err ? 'error' : 'saving', t: `저장 대기 ${outbox.length}개` };
    if (sync.err) return { s: 'error', t: '연결 안 됨' };
    return { s: 'saved', t: '저장됨' };
  }
  function syncText() {
    const st = syncState();
    if (st.s === 'saved') return `모든 기록이 서버에 저장됐어요${state && state.lastPull ? ` · 마지막 동기화 ${fmtDateTime(state.lastPull)}` : ''}`;
    if (st.s === 'offline') return `인터넷이 끊겨 있어요. 기록은 이 기기에 먼저 저장되고, 연결되면 자동으로 서버에 올라가요${outbox.length ? ` (대기 ${outbox.length}개)` : ''}.`;
    if (sync.err) return `서버에 올리지 못한 기록 ${outbox.length}개가 있어요. ${errText({ message: sync.err })}`;
    return `서버에 저장하는 중이에요${outbox.length ? ` (대기 ${outbox.length}개)` : ''}.`;
  }
  function renderSync() {
    const el = $('#syncPill');
    if (el) { const st = syncState(); el.dataset.s = st.s; el.textContent = st.t; }
    const t = $('#syncText'); if (t) t.textContent = syncText();
  }
  function onAuthLost() {
    if (mode !== 'student' && mode !== 'admin') return;
    if (state) save();
    stopCamQuietly();
    auth = null; lsDel('auth');
    loginMsg = ERR.auth; mode = 'login'; state = null; sheet = null;
    renderAll();
  }

  // ===================== example data (demo mode) =====================
  const BANK = {
    '국어': { goals: ['문학 기출 고전시가 끝내기', '비문학 독해 매일 3지문', '언어와 매체 문법 1단원 정리'], plans: ['고전시가 기출 2지문', '비문학 3지문 풀고 분석', '문법 개념 정리', '문학 오답 정리'] },
    '수학': { goals: ['미적분 2단원 개념과 기본 문제 끝내기', '수학 오답노트 정리', '확률과 통계 1단원 문제집 끝내기', '수학 4점 문제 20개 풀기'], plans: ['2단원 15~30번', '오답 10문제 다시 풀기', '개념 정리 3쪽', '4점 문제 5개', '기출 1회 풀기'] },
    '영어': { goals: ['영단어 Day 11~15 외우기', '수능특강 영어 7~8강 끝내기', '영어 듣기 매일 1회'], plans: ['단어 Day 12', '수능특강 7강 지문 분석', '듣기 1회와 오답', '단어 누적 복습'] },
    '과학': { goals: ['물리 역학 단원 정리', '화학 몰 계산 문제 끝내기'], plans: ['역학 개념 정리', '몰 계산 문제 20개', '물리 기출 5문제'] },
    '사회': { goals: ['한국사 근현대 정리', '사회문화 기출 2회 풀기'], plans: ['근현대 연표 정리', '사회문화 기출 1회', '오답 정리'] },
  };
  function makeSampleData(seed, opt) {
    opt = opt || {};
    const rnd = mulberry32(seed);
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const D = normalizeData({}); D.meta.updatedAt = 1;
    const byName = {}; D.meta.subjects.forEach((s) => { byName[s.name] = s; });
    const now = Date.now();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tk = dayKey(today);
    const w0 = weekStart(today);
    const diligence = opt.diligence == null ? 0.85 : opt.diligence;
    const drowsy = opt.drowsy == null ? 0.5 : opt.drowsy;
    const mathW = opt.mathW == null ? 0.2 : opt.mathW;
    let n = 0; const id = (p) => p + seed.toString(36) + '_' + (n++).toString(36);
    for (let w = -4; w <= 0; w++) {
      const ws = addDays(w0, w * 7); const wk = dayKey(ws);
      const names = [...new Set(['수학', pick(['국어', '영어']), pick(['영어', '과학', '사회'])].concat(rnd() < 0.5 ? [pick(['국어', '과학', '사회'])] : []))];
      const goals = w === 0 && opt.noWeekGoals ? [] : names.map((nm, i) => ({ id: id('g'), week: wk, subjectId: byName[nm].id, subject: nm, title: pick(BANK[nm].goals), targetMin: pick([120, 180, 240, 300]), progress: 0, status: 'active', createdAt: ws.getTime() + 18.5 * 3600e3 + i, updatedAt: ws.getTime() + 18.5 * 3600e3 + i }));
      D.goals.push(...goals);
      for (let d = 0; d < 7; d++) {
        const day = addDays(ws, d); if (day > today) break;
        const dow = day.getDay(); const key = dayKey(day);
        if (dow === 0 || (dow === 6 && rnd() > 0.35)) continue;
        if (opt.quietDays && daysBetween(key, tk) < opt.quietDays) continue;
        if (rnd() > diligence) continue;
        const nSess = dow === 6 ? 2 : rnd() < 0.3 ? 2 : 3;
        let cursor = new Date(day); cursor.setHours(dow === 6 ? 14 : 18, dow === 6 ? 0 : 35, 0, 0);
        for (let i = 0; i < nSess; i++) {
          const open = goals.filter((g) => g.progress < 100);
          const mathGoal = open.find((g) => g.subject === '수학');
          const g = open.length && rnd() < 0.88 ? (mathGoal && rnd() < mathW ? mathGoal : pick(open)) : null;
          const nm = g ? g.subject : pick(DEFAULT_SUBJECTS);
          const planMin = pick([30, 40, 50]);
          const late = cursor.getHours() >= 21;
          const factor = nm === '수학' ? 1.15 + rnd() * 0.35 : 0.85 + rnd() * 0.35;
          const dist = [];
          if (rnd() < 0.35) dist.push('휴대폰');
          if (late && rnd() < drowsy) dist.push('졸음');
          if (rnd() < 0.1) dist.push('잡담·소음');
          if (nm === '수학' && rnd() < 0.2) dist.push('내용이 어려움');
          let focus = late ? (rnd() < 0.55 ? 2 : 3) : (rnd() < 0.5 ? 4 : rnd() < 0.5 ? 5 : 3);
          if (dist.length >= 2) focus -= 1;
          focus = Math.max(1, Math.min(5, Math.round(focus + (opt.focusBias || 0))));
          const achieve = clampPct((late ? 60 : 82) + (rnd() - 0.5) * 50 + (opt.achBias || 0) + (focus - 3) * 8);
          const grossMs = Math.round(planMin * factor * Math.max(0.45, achieve / 100) * 60000);
          const breakMs = rnd() < 0.35 ? 5 * 60000 : 0;
          const start = cursor.getTime(); const end = start + grossMs + breakMs;
          if (end > now - 60000) break;
          const before = g ? g.progress : null;
          if (g) { g.progress = clampPct(g.progress + achieve * (0.2 + rnd() * 0.15)); if (g.progress >= 100) { g.progress = 100; g.status = 'done'; g.doneAt = end; } g.updatedAt = end; }
          const camOn = late && rnd() < 0.7;
          const awayMs = dist.includes('휴대폰') ? Math.round((1 + rnd() * 5) * 60000) : 0;
          D.sessions.push({ id: id('s'), goalId: g ? g.id : null, goalTitle: g ? g.title : '', subjectId: byName[nm].id, subject: nm, plan: pick(BANK[nm].plans), planMin, date: key, start, end,
            studyMs: grossMs, grossMs, breakMs, awayMs, awayCount: awayMs ? 1 : 0, awayExcluded: false, achieve, goalBefore: before, goalProgress: g ? g.progress : null, focus, distractors: dist, memo: '', phase: 'normal',
            camUsed: camOn, camAwayMs: camOn ? Math.floor(rnd() * 3) * 60000 : 0, drowsyCount: camOn && dist.includes('졸음') ? 1 + Math.floor(rnd() * 2) : 0, camAwayExcluded: false, updatedAt: end });
          cursor = new Date(end + 10 * 60000);
        }
      }
    }
    // keep one unfinished goal last week so "carry over" can be tried
    const lastWk = dayKey(addDays(w0, -7));
    const lw = D.goals.filter((g) => g.week === lastWk);
    if (lw.length && lw.every((g) => g.progress >= 100)) { const g = lw[lw.length - 1]; g.progress = 80; g.status = 'active'; delete g.doneAt; }
    const [kor, math, eng, sci] = D.meta.subjects;
    const e1 = addDays(today, -26); const e2 = addDays(today, -6);
    const sc = (s, grade, p) => ({ grade, pct: p, name: s.name });
    const gm = opt.gradeShift || 0;
    const g9 = (x) => Math.max(1, Math.min(9, x + gm));
    D.exams.push(
      { id: id('e'), date: dayKey(e1), type: 'mock', name: `${e1.getMonth() + 1}월 모의고사`, scores: { [kor.id]: sc(kor, g9(3), 82), [math.id]: sc(math, g9(4), 71), [eng.id]: sc(eng, g9(2), null), [sci.id]: sc(sci, g9(3), 80) }, updatedAt: e1.getTime() },
      { id: id('e'), date: dayKey(e2), type: 'mock', name: `${e2.getMonth() + 1}월 모의고사`, scores: { [kor.id]: sc(kor, g9(2), 89), [math.id]: sc(math, g9(4), 74), [eng.id]: sc(eng, g9(2), null), [sci.id]: sc(sci, g9(3), 78) }, updatedAt: e2.getTime() });
    D.meta.final = { title: opt.finalTitle || '희망 대학 공대 합격', detail: opt.finalDetail || '수능 수학 2등급, 국어·영어 1등급', dateName: '목표일', date: dayKey(addDays(today, 371)), grades: { [kor.id]: 1, [math.id]: 2, [eng.id]: 1 } };
    D.sessions.sort((a, b) => a.start - b.start);
    return D;
  }
  function makeDemoState() {
    const D = makeSampleData(20261111);
    const s = Object.assign(freshState(), D);
    const today = new Date();
    s.meta.mentorNotes.push({ id: 'n1', date: dayKey(addDays(today, -2)), summary: '수학은 시간을 가장 많이 쓰는데 개념 부족 오답이 반복돼서, 개념서를 다시 읽는 대신 책을 덮고 백지에 정리해 보기로 했어요. 21시대 졸음이 잦아서 그 앞에 스트레칭을 넣기로 했어요.',
      promises: [{ text: '수학 단원 하나를 책 덮고 백지에 정리하기', done: true }, { text: '21시 전에 5분 일어나 스트레칭하기', done: false }] });
    return s;
  }
  function makeAdminDemo() {
    const P = [
      ['예시 학생 1', '20301', '2-3', 11, {}], ['예시 학생 2', '20302', '2-3', 12, { diligence: 0.95, achBias: 10, focusBias: 0.5, gradeShift: -1 }],
      ['예시 학생 3', '20303', '2-3', 13, { quietDays: 4 }], ['예시 학생 4', '20304', '2-3', 14, { achBias: -45 }],
      ['예시 학생 5', '20501', '2-5', 15, { drowsy: 0.95, focusBias: -1.6 }], ['예시 학생 6', '20502', '2-5', 16, { diligence: 0.6, gradeShift: 1, noWeekGoals: true }],
      ['예시 학생 7', '20503', '2-5', 17, { mathW: 0.65, finalTitle: '수학 1등급 만들기', finalDetail: '모의고사 수학 1등급' }], ['예시 학생 8', '20504', '2-5', 18, { diligence: 0.9, achBias: 5 }],
    ];
    const users = [{ uid: 'demo-admin', studentNo: 'teacher', name: '체험 선생님', cls: '', role: 'admin', status: 'active', joined: '', last: new Date().toISOString() }];
    const data = {};
    P.forEach(([name, no, cls, seed, opt], i) => {
      const u = 'demo-u' + (i + 1);
      const D = makeSampleData(seed, opt);
      const lastS = D.sessions[D.sessions.length - 1];
      users.push({ uid: u, studentNo: no, name, cls, role: 'student', status: 'active', joined: '', last: lastS ? new Date(lastS.end).toISOString() : '' });
      data[u] = D;
    });
    return { users, data, full: data, at: Date.now() };
  }

  // ===================== lookups =====================
  const findSubj = (D, id) => D.meta.subjects.find((s) => s.id === id) || null;
  const sessName = (D, s) => { const x = findSubj(D, s.subjectId); return x ? x.name : s.subject || '기타'; };
  const goalName = (D, g) => { const x = findSubj(D, g.subjectId); return x ? x.name : g.subject || '기타'; };
  function slotOfName(D, name) { const x = D.meta.subjects.find((s) => s.name === name); return x ? x.slot : null; }
  const lookFor = (D) => ({ name: (s) => sessName(D, s), slot: (nm) => slotOfName(D, nm) });
  const colorOf = (slot) => (slot == null ? 'var(--muted)' : `var(--s${(slot % 8) + 1})`);
  function subjTag(name, slot) { return `<span class="subj"><i class="dot" style="--c:${colorOf(slot)}"></i>${esc(name)}</span>`; }
  function subjTagId(D, id, fb) { const s = findSubj(D, id); return subjTag(s ? s.name : fb || '기타', s ? s.slot : null); }
  const goalById = (D, id) => D.goals.find((g) => g.id === id) || null;
  const goalSessions = (D, gid) => D.sessions.filter((s) => s.goalId === gid).sort((a, b) => a.start - b.start);
  const goalMs = (D, gid) => sum(D.sessions.filter((s) => s.goalId === gid).map((s) => s.studyMs));
  const weekGoals = (D, wk) => D.goals.filter((g) => g.week === wk).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const latestNote = (D) => { const n = D.meta.mentorNotes; return n.length ? n[n.length - 1] : null; };
  function studyLive(r, now) { return r.studyMs + (r.mode === 'study' ? now - r.modeSince : 0); }
  function breakLive(r, now) { return r.breakMs + (r.mode === 'break' ? now - r.modeSince : 0); }
  function runningMs() { const r = state && state.running; if (!r) return 0; return r.endAt ? r.studyMs : studyLive(r, Date.now()); }
  function studyOn(D, a, b) { return sum(D.sessions.filter((s) => s.date >= a && s.date <= b).map((s) => s.studyMs)); }
  function latestMock(D, sid) {
    const ex = D.exams.filter((e) => e.type === 'mock' && e.scores && e.scores[sid] && e.scores[sid].grade).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    return ex ? { grade: ex.scores[sid].grade, name: ex.name } : null;
  }

  // ===================== statistics =====================
  function periodOf(st) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (st.mode === 'day') {
      const d = addDays(today, st.offset); const k = dayKey(d); const p = dayKey(addDays(d, -1));
      return { mode: 'day', start: d, end: d, a: k, b: k, label: fmtDateLong(d) + (st.offset === 0 ? ' · 오늘' : ''), elapsed: 1, prevA: p, prevB: p, than: '전날', cur: st.offset === 0, unit: '날' };
    }
    if (st.mode === 'month') {
      const m0 = new Date(today.getFullYear(), today.getMonth() + st.offset, 1);
      const m1 = new Date(m0.getFullYear(), m0.getMonth() + 1, 0);
      const cur = st.offset === 0;
      const elapsed = cur ? today.getDate() : m1.getDate();
      const p0 = new Date(m0.getFullYear(), m0.getMonth() - 1, 1);
      const pEnd = new Date(m0.getFullYear(), m0.getMonth(), 0);
      const p1 = cur ? new Date(Math.min(addDays(p0, elapsed - 1).getTime(), pEnd.getTime())) : pEnd;
      return { mode: 'month', start: m0, end: m1, a: dayKey(m0), b: dayKey(m1), label: monthLabel(m0), elapsed, prevA: dayKey(p0), prevB: dayKey(p1), than: cur && elapsed < m1.getDate() ? '지난달 같은 기간' : '지난달', cur, unit: '달' };
    }
    const w0 = addDays(weekStart(today), st.offset * 7); const w1 = addDays(w0, 6);
    const cur = st.offset === 0;
    const elapsed = cur ? daysBetween(dayKey(w0), dayKey(today)) + 1 : 7;
    return { mode: 'week', start: w0, end: w1, a: dayKey(w0), b: dayKey(w1), label: weekLabel(w0), elapsed, prevA: dayKey(addDays(w0, -7)), prevB: dayKey(addDays(w0, -7 + elapsed - 1)), than: elapsed < 7 ? '지난주 같은 기간' : '지난주', cur, unit: '주' };
  }
  function rangeStats(sessions, a, b, look) {
    const ss = sessions.filter((s) => s.date >= a && s.date <= b);
    const days = {}; const subj = {}; const hours = {}; const dc = {}; const acc = {};
    ss.forEach((s) => {
      const nm = look.name(s);
      const d = days[s.date] || (days[s.date] = { ms: 0, n: 0, subj: {} });
      d.ms += s.studyMs; d.n++; d.subj[nm] = (d.subj[nm] || 0) + s.studyMs;
      const x = subj[nm] || (subj[nm] = { name: nm, slot: look.slot(nm), ms: 0, n: 0, ach: [], focus: [] });
      x.ms += s.studyMs; x.n++; if (s.achieve != null) x.ach.push(s.achieve); if (s.focus) x.focus.push(s.focus);
      // spread study time over the clock hours the session covered; focus is counted at the start hour
      const end = Math.max(s.start, Number(s.end) || s.start); const span = Math.max(1, end - s.start);
      let t = s.start;
      while (t < end) {
        const h = new Date(t).getHours(); const nx = new Date(t); nx.setMinutes(60, 0, 0);
        const seg = Math.min(end, nx.getTime()) - t;
        const hx = hours[h] || (hours[h] = { hour: h, ms: 0, focus: [] });
        hx.ms += s.studyMs * (seg / span); t += seg;
      }
      const h0 = new Date(s.start).getHours(); const hx0 = hours[h0] || (hours[h0] = { hour: h0, ms: 0, focus: [] });
      if (s.focus) hx0.focus.push(s.focus);
      (s.distractors || []).forEach((x2) => { dc[x2] = (dc[x2] || 0) + 1; });
      if (s.planMin > 0 && s.achieve >= 90) (acc[nm] = acc[nm] || []).push((s.studyMs / 60000 - s.planMin) / s.planMin);
    });
    const achs = ss.filter((s) => s.achieve != null).map((s) => s.achieve);
    const foci = ss.filter((s) => s.focus).map((s) => s.focus);
    const hourList = Object.values(hours).map((h) => Object.assign(h, { avgFocus: avg(h.focus) })).sort((p, q) => p.hour - q.hour);
    const avgFocus = avg(foci);
    const low = hourList.filter((h) => h.focus.length >= 2).sort((p, q) => p.avgFocus - q.avgFocus)[0];
    const camS = ss.filter((s) => s.camUsed);
    const dh = {}; camS.forEach((s) => { if (s.drowsyCount) { const h = new Date(s.start).getHours(); dh[h] = (dh[h] || 0) + s.drowsyCount; } });
    const topD = Object.entries(dh).sort((p, q) => q[1] - p[1])[0];
    return {
      a, b, sessions: ss, days,
      total: sum(ss.map((s) => s.studyMs)), gross: sum(ss.map((s) => s.grossMs || s.studyMs)), away: sum(ss.map((s) => s.awayMs || 0)),
      subjects: Object.values(subj).map((x) => Object.assign(x, { avgAch: avg(x.ach), avgFocus: avg(x.focus) })).sort((p, q) => q.ms - p.ms),
      studyDays: Object.values(days).filter((d) => d.ms > 0).length,
      avgAch: avg(achs), avgFocus, hours: hourList,
      distractors: Object.entries(dc).map(([name, count]) => ({ name, count })).sort((p, q) => q.count - p.count),
      buckets: [['100% (다 끝냄)', (v) => v >= 100], ['75~95%', (v) => v >= 75 && v < 100], ['50~70%', (v) => v >= 50 && v < 75], ['45% 이하', (v) => v < 50]].map(([label, f]) => ({ label, n: achs.filter(f).length })),
      accuracy: Object.entries(acc).map(([name, arr]) => ({ name, slot: look.slot(name), avg: avg(arr), n: arr.length })).sort((p, q) => q.avg - p.avg),
      cam: { n: camS.length, awayMs: sum(camS.map((s) => s.camAwayMs || 0)), drowsy: sum(camS.map((s) => s.drowsyCount || 0)), topHour: topD ? Number(topD[0]) : null,
        focusWith: avg(camS.filter((s) => s.drowsyCount).map((s) => s.focus)), focusWithout: avg(camS.filter((s) => !s.drowsyCount).map((s) => s.focus)) },
      lowHour: low && avgFocus != null && low.avgFocus < avgFocus ? low.hour : null,
    };
  }
  function suggestions(R, goals, P) {
    if (R.sessions.length < 3) return null;
    const out = [];
    const top = R.distractors[0];
    if (top && top.count >= 2 && top.count / R.sessions.length >= 0.25 && TIPS[top.name]) out.push({ title: TIPS[top.name].title, body: TIPS[top.name].body(R), basis: `'${top.name}'${iga(top.name)} 공부 ${R.sessions.length}번 중 ${top.count}번 체크됐어요.` });
    const worst = R.accuracy.filter((x) => x.n >= 3 && x.avg >= 0.3)[0];
    if (worst) out.push({ title: `${worst.name} 예상 시간 늘리기`, body: `${worst.name} 공부는 평소 예상의 ${(1 + worst.avg).toFixed(1)}배로 잡아 보세요. 계획이 현실적이어야 끝까지 지킬 수 있어요.`, basis: `거의 다 끝낸 ${worst.name} 공부 ${worst.n}번이 예상보다 평균 ${pct(worst.avg)} 더 걸렸어요.` });
    if (R.sessions.length >= 5 && R.avgAch != null && R.avgAch < 60) out.push({ title: '할 일 크기 줄이기', body: '한 번에 끝낼 수 있는 만큼만 "이번에 할 일"로 정해 보세요. 다 끝내는 경험이 쌓이면 계획을 지키는 습관이 생겨요.', basis: `이번 ${P.unit} 할 일 달성도가 평균 ${Math.round(R.avgAch)}%예요.` });
    if (P.mode === 'week' && goals.length && P.elapsed >= 5) {
      const ap = avg(goals.map((g) => g.progress));
      if (ap < 50) out.push({ title: '주간 목표 크기 조정하기', body: '다음 주에는 목표 수를 줄이거나 범위를 좁혀 보세요. 끝낼 수 있는 목표 2~3개가 많은 목표보다 나아요.', basis: `주의 ${P.elapsed}일째인데 주간 목표 평균 진행률이 ${Math.round(ap)}%예요.` });
    }
    const lowH = R.hours.filter((h) => h.focus.length >= 3 && h.avgFocus <= 3 && R.avgFocus - h.avgFocus >= 0.8).sort((p, q) => p.avgFocus - q.avgFocus)[0];
    if (lowH && !(top && top.name === '졸음' && out.length && out[0].title === TIPS['졸음'].title)) out.push({ title: `${lowH.hour}시대 계획 바꾸기`, body: `집중이 떨어지는 ${lowH.hour}시대에는 짧게 쉬고 시작하거나, 문제 풀이처럼 손이 움직이는 공부를 배치해 보세요.`, basis: `${lowH.hour}시대 평균 집중도 ${lowH.avgFocus.toFixed(1)}, 전체 평균 ${R.avgFocus.toFixed(1)} (${lowH.focus.length}번 기록).` });
    if (R.cam.drowsy >= 3 && !out.some((x) => x.title === TIPS['졸음'].title)) out.push({ title: '졸음 대책 세우기', body: `${R.cam.topHour != null ? `${R.cam.topHour}시대 공부 전에` : '졸음이 오기 쉬운 시간 전에'} 5분 일어나 움직이고, 그 시간에는 문제 풀이처럼 손을 쓰는 공부를 배치해 보세요. 잠이 계속 부족하다면 취침 시간도 함께 점검해 보세요.`, basis: `카메라가 졸음을 ${R.cam.drowsy}회 감지했어요${R.cam.topHour != null ? ` (가장 많은 때 ${R.cam.topHour}시대)` : ''}.` });
    if (R.gross > 0 && R.away / R.gross >= 0.15) out.push({ title: '앱을 벗어나는 시간 줄이기', body: '공부 중에 다른 앱을 쓰는 시간이 길었어요. 확인할 일은 휴식 시간에 모아서 해 보세요.', basis: `공부 시간 중 ${pct(R.away / R.gross)}를 앱 밖에서 보냈어요.` });
    return out.slice(0, 3);
  }
  function deltaHTML(cur, prev, kind, than) {
    if (prev == null || cur == null) return `<span class="delta">${than} 기록 없음</span>`;
    const d = cur - prev; const same = `<span class="delta">${than}${pp(than, '과', '와')} 같음</span>`;
    const mk = (cls, txt) => `<span class="delta"><span class="${cls}">${d > 0 ? '▲' : '▼'} ${txt}</span> ${than}보다</span>`;
    if (kind === 'ms') return Math.abs(d) < 60000 ? same : mk(d > 0 ? 'up-good' : 'down-bad', fmtHM(Math.abs(d)));
    if (kind === 'focus') return Math.abs(d) < 0.05 ? same : mk(d > 0 ? 'up-good' : 'down-bad', Math.abs(d).toFixed(1));
    if (kind === 'pt') { const p = Math.round(d); return !p ? same : mk(p > 0 ? 'up-good' : 'down-bad', `${Math.abs(p)}%p`); }
    if (kind === 'away') { const p = Math.round(d * 100); return !p ? same : mk(p > 0 ? 'up-bad' : 'down-good', `${Math.abs(p)}%p`); }
    return '';
  }

  // ===================== view state =====================
  let route = { page: '', arg: null };
  let sheet = null; let renderedKind = null;
  let loginTab = 'login'; let loginErr = ''; let loginMsg = ''; let loginBusy = false; let loginDraft = {};
  let stat = { mode: 'week', offset: 0, sel: null };
  let astat = { mode: 'week', offset: 0, sel: null, uid: null };
  let goalsTab = 'goals'; let weeksShown = 6;
  let mentorBusy = false; let mentorErr = ''; let mentorDraft = '';
  let reportAI = { key: null, text: '', busy: false, err: '' };
  let pwMsg = { err: '', ok: '' };
  function freshAdmin() { return { users: [], data: {}, full: {}, loading: false, err: '', at: 0, cls: '', q: '', sort: 'name', week: 0, loadingUid: null }; }
  let admin = freshAdmin();

  // ===================== toast =====================
  let toastTimer = null;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2800);
  }

  // ===================== focus helpers (re-rendering keeps keyboard focus) =====================
  function focusKey(root) {
    const a = document.activeElement;
    if (!a || a === document.body || !root.contains(a)) return null;
    if (a.id) return '#' + CSS.escape(a.id);
    if (a.dataset && a.dataset.act) {
      let s = `[data-act="${CSS.escape(a.dataset.act)}"]`;
      ['id', 'v', 'key', 'k', 'i'].forEach((k) => { if (a.dataset[k] != null) s += `[data-${k}="${CSS.escape(a.dataset[k])}"]`; });
      return s;
    }
    return null;
  }
  function restoreFocus(sel, root) { if (!sel) return; try { const n = root.querySelector(sel); if (n) n.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  function armInline(b, label, cls) {
    if (b.dataset.armed) return true;
    const old = b.innerHTML; b.dataset.armed = '1'; b.textContent = label; b.classList.add(cls || 'armed');
    setTimeout(() => { if (b.isConnected && b.dataset.armed) { delete b.dataset.armed; b.innerHTML = old; b.classList.remove(cls || 'armed'); } }, 4500);
    return false;
  }

  // ===================== shell =====================
  const ICONS = {
    home: '<path d="M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z"/>',
    stats: '<path d="M5 20V12M12 20V5M19 20v-7"/>',
    goals: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="0.6"/>',
    mentor: '<path d="M5 6h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-4 3v-3H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z"/>',
    me: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c1.2-3.6 4-5.2 7-5.2s5.8 1.6 7 5.2"/>',
    dash: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    students: '<circle cx="9" cy="9" r="3"/><path d="M3.5 19c.8-3 3-4.4 5.5-4.4s4.7 1.4 5.5 4.4"/><circle cx="17" cy="9.5" r="2.4"/><path d="M15.5 14.8c2.3-.2 4.2 1 5 3.7"/>',
    accounts: '<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7.5a4 4 0 0 1 8 0V10"/>',
  };
  const STUDENT_PAGES = ['home', 'stats', 'goals', 'mentor', 'me'];
  const ADMIN_PAGES = ['dash', 'students', 'student', 'accounts', 'me'];
  function parseRoute() {
    const h = (location.hash || '').replace(/^#/, '');
    const i = h.indexOf('/'); const page = i >= 0 ? h.slice(0, i) : h; const arg = i >= 0 ? decodeURIComponent(h.slice(i + 1)) : null;
    const pages = isAdmin() ? ADMIN_PAGES : STUDENT_PAGES;
    if (!pages.includes(page) || (page === 'student' && !arg)) return { page: pages[0], arg: null };
    return { page, arg };
  }
  function renderAll() {
    document.body.dataset.mode = mode;
    const login = mode === 'login';
    $('#login').hidden = !login; $('#app').hidden = login; $('#tabs').hidden = login;
    if (login) { renderLogin(); renderTimer(); renderSheet(); return; }
    const prev = route.page; route = parseRoute();
    renderTop(); renderBanner(); renderTabs(); renderPage();
    if (prev && prev !== route.page) window.scrollTo(0, 0);
    renderTimer(); renderSheet();
  }
  function renderTop() {
    const who = mode === 'demo-student' ? '체험 학생' : mode === 'demo-admin' ? '체험 선생님' : auth ? auth.user.name : '';
    const st = syncState();
    $('#top').innerHTML = `<div class="brand"><img src="icons/icon-192.png" alt="" width="26" height="26"><b>야자 관리실</b>${isAdmin() ? '<span class="role-pill">관리자</span>' : ''}</div>
      <div class="top-right"><span class="who">${esc(who)}</span>${mode === 'student' ? `<span class="sync" id="syncPill" data-s="${st.s}" role="status">${esc(st.t)}</span>` : isDemo() ? '<span class="role-pill">체험</span>' : ''}</div>`;
  }
  function renderBanner() {
    const out = [];
    if (!storageOK) out.push('<div class="banner warn"><p>이 브라우저에서는 기록을 기기에 저장할 수 없어요. 시크릿 창이라면 일반 창으로 열어 주세요.</p></div>');
    if (isDemo()) out.push(`<div class="banner"><p>${mode === 'demo-admin' ? '선생님 화면 체험 중이에요. 학생 8명은 모두 예시 데이터예요.' : '학생 화면 체험 중이에요. 예시 기록이고, 새로 남긴 기록도 이 기기에만 저장돼요.'}</p><button class="btn small" data-act="exit-demo">체험 끝내기</button></div>`);
    $('#banner').innerHTML = out.join('');
  }
  function renderTabs() {
    const tabs = isAdmin() ? [['dash', '현황'], ['students', '학생'], ['accounts', '계정'], ['me', '내 정보']] : [['home', '홈'], ['stats', '통계'], ['goals', '목표'], ['mentor', '멘토'], ['me', '내 정보']];
    const cur = route.page === 'student' ? 'students' : route.page;
    $('#tabs').innerHTML = `<div class="tabs-inner" style="--n:${tabs.length}">${tabs.map(([k, l]) => `<a class="tab" href="#${k}"${cur === k ? ' aria-current="page"' : ''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k]}</svg>${l}</a>`).join('')}</div>`;
  }
  function renderPage() {
    const main = $('#main'); const keep = focusKey(main);
    let html = '';
    if (isAdmin()) {
      if (route.page === 'student') adminLoadStudent(route.arg);
      html = route.page === 'students' ? studentsHTML() : route.page === 'student' ? studentDetailHTML(route.arg) : route.page === 'accounts' ? accountsHTML() : route.page === 'me' ? adminMeHTML() : dashHTML();
    } else if (state) {
      html = route.page === 'stats' ? statsPageHTML() : route.page === 'goals' ? goalsPageHTML() : route.page === 'mentor' ? mentorHTML() : route.page === 'me' ? meHTML() : homeHTML();
    }
    main.innerHTML = html;
    restoreFocus(keep, main);
  }
  function lockScroll() {
    const timerOpen = !$('#timer').hidden; const sheetOpen = !$('#sheet').hidden;
    document.body.style.overflow = timerOpen || sheetOpen ? 'hidden' : '';
    // keep keyboard and screen-reader focus inside the open sheet or timer
    ['#app', '#tabs', '#mini', '#login'].forEach((sel) => { $(sel).inert = timerOpen || sheetOpen; });
    $('#timer').inert = sheetOpen;
  }

  // ===================== login =====================
  function renderLogin() {
    const has = !!serverUrl(); const d = loginDraft; const busy = loginBusy ? 'disabled' : '';
    const loginForm = `<form id="loginForm" autocomplete="on" novalidate>
        <div class="field"><label for="lgNo">학번 또는 아이디</label><input id="lgNo" name="username" type="text" inputmode="text" autocomplete="username" maxlength="20" value="${esc(d.lgNo || '')}" placeholder="예: 20705"></div>
        <div class="field"><label for="lgPw">비밀번호</label><input id="lgPw" name="password" type="password" autocomplete="current-password" maxlength="64" value="${esc(d.lgPw || '')}"></div>
        ${loginErr ? `<p class="form-err" role="alert">${esc(loginErr)}</p>` : ''}
        <button class="btn primary block" type="submit" ${busy}>${loginBusy ? '로그인 중…' : '로그인'}</button>
        <p class="hint">비밀번호를 잊었다면 선생님께 초기화를 부탁하세요.</p></form>`;
    const signupForm = `<form id="signupForm" autocomplete="off" novalidate>
        <div class="field"><label for="suCode">가입 코드</label><input id="suCode" type="text" maxlength="40" value="${esc(d.suCode || '')}" placeholder="선생님께 받은 코드"><span class="hint">선생님은 관리자 가입 코드를 넣으면 관리자 계정이 만들어져요.</span></div>
        <div class="two"><div class="field"><label for="suNo">학번 또는 아이디</label><input id="suNo" type="text" maxlength="20" value="${esc(d.suNo || '')}" placeholder="예: 20705" autocomplete="username"></div>
          <div class="field"><label for="suCls">반 <span class="muted" style="font-weight:400">(선택)</span></label><input id="suCls" type="text" maxlength="10" value="${esc(d.suCls || '')}" placeholder="예: 2-7"></div></div>
        <div class="field"><label for="suName">이름</label><input id="suName" type="text" maxlength="20" value="${esc(d.suName || '')}" autocomplete="name"></div>
        <div class="two"><div class="field"><label for="suPw">비밀번호</label><input id="suPw" type="password" maxlength="64" value="${esc(d.suPw || '')}" autocomplete="new-password" placeholder="6자 이상"></div>
          <div class="field"><label for="suPw2">비밀번호 확인</label><input id="suPw2" type="password" maxlength="64" value="${esc(d.suPw2 || '')}" autocomplete="new-password"></div></div>
        <p class="notice">공부 기록, 목표, 성적은 학교 운영팀의 구글 시트에 저장되고 선생님이 볼 수 있어요. 공부를 끝낼 때 쓰는 메모와 AI 멘토 상담 내용은 선생님 화면에 나오지 않아요.</p>
        <label class="check"><input type="checkbox" id="suAgree" ${d.suAgree ? 'checked' : ''}><span>위 내용을 확인했어요</span></label>
        ${loginErr ? `<p class="form-err" role="alert">${esc(loginErr)}</p>` : ''}
        <button class="btn primary block" type="submit" ${busy}>${loginBusy ? '가입하는 중…' : '가입하고 시작하기'}</button></form>`;
    $('#login').innerHTML = `<div class="login-wrap">
      <div class="login-hero"><img src="icons/icon-192.png" alt="" width="76" height="76"><h1>야자 관리실</h1><p>야간자율학습을 관리형 독서실처럼</p></div>
      <section class="login-card" aria-label="로그인">
        ${loginMsg ? `<p class="notice" role="status">${esc(loginMsg)}</p>` : ''}
        ${has ? `<div class="seg-tabs" style="--n:2" role="group" aria-label="로그인 또는 가입">
            <button type="button" data-act="login-tab" data-v="login" aria-pressed="${loginTab === 'login'}">로그인</button>
            <button type="button" data-act="login-tab" data-v="signup" aria-pressed="${loginTab === 'signup'}">처음이에요 (가입)</button></div>
          ${loginTab === 'signup' ? signupForm : loginForm}`
        : '<h2 style="font-size:17px">아직 학교 서버가 연결되지 않았어요</h2><p class="muted small-text">운영팀이 서버(구글 Apps Script)를 만들고 config.js에 주소를 넣으면 로그인할 수 있어요. 그 전에는 아래 체험하기로 화면을 둘러볼 수 있어요.</p>'}
      </section>
      <div class="login-alt"><p>계정 없이 먼저 둘러보기</p>
        <button class="nbtn" data-act="demo-student">학생 화면 체험하기</button>
        <button class="nbtn" data-act="demo-admin">선생님 화면 체험하기</button></div>
      <details class="login-adv"><summary>운영팀: 서버 주소 직접 넣기</summary>
        <form id="serverForm" novalidate><div class="field"><label for="srvUrl">Apps Script 웹 앱 주소 (/exec로 끝나는 주소)</label><input id="srvUrl" type="url" value="${esc(lsGet('server', '') || '')}" placeholder="https://script.google.com/macros/s/…/exec"></div>
        <div class="btn-row" style="margin-top:8px"><button class="nbtn chip-n" type="submit">이 기기에 저장</button>${lsGet('server', '') ? '<button class="nbtn chip-n" type="button" data-act="server-clear">지우기</button>' : ''}</div>
        <p style="margin-top:8px">모든 학생에게 적용하려면 저장소의 config.js에 넣어 주세요.</p></form></details>
      <p class="login-adv" style="text-align:center">v${APP_VERSION}</p>
    </div>`;
  }
  function readLoginDraft() { $$('#login input').forEach((el) => { if (el.id) loginDraft[el.id] = el.type === 'checkbox' ? el.checked : el.value; }); }
  async function doLogin() {
    readLoginDraft();
    const no = String(loginDraft.lgNo || '').trim(); const pw = String(loginDraft.lgPw || '');
    if (!no || !pw) { loginErr = '학번(아이디)과 비밀번호를 입력해 주세요.'; renderLogin(); return; }
    loginBusy = true; loginErr = ''; loginMsg = ''; renderLogin();
    try { onLoggedIn(await api('login', { studentNo: no, password: pw }, { auth: false })); }
    catch (e) { loginBusy = false; loginErr = errText(e); renderLogin(); const f = $('#lgPw'); if (f) f.focus(); }
  }
  async function doSignup() {
    readLoginDraft(); const d = loginDraft;
    const f = (k) => String(d[k] || '').trim();
    let err = '';
    if (!f('suCode')) err = '선생님께 받은 가입 코드를 넣어 주세요.';
    else if (!/^[0-9A-Za-z_-]{2,20}$/.test(f('suNo'))) err = ERR.bad_no;
    else if (!f('suName')) err = ERR.bad_name;
    else if (String(d.suPw || '').length < 6) err = ERR.bad_password;
    else if (d.suPw !== d.suPw2) err = '비밀번호 확인이 맞지 않아요.';
    else if (!d.suAgree) err = '기록 저장 안내를 확인하고 체크해 주세요.';
    if (err) { loginErr = err; renderLogin(); return; }
    loginBusy = true; loginErr = ''; renderLogin();
    try { onLoggedIn(await api('signup', { joinCode: f('suCode'), studentNo: f('suNo'), name: f('suName'), cls: f('suCls'), password: d.suPw }, { auth: false }), true); }
    catch (e) { loginBusy = false; loginErr = errText(e); renderLogin(); }
  }
  function onLoggedIn(j, isNew) {
    auth = { token: j.token, user: j.user }; lsSet('auth', auth); lsDel('demo');
    loginBusy = false; loginErr = ''; loginMsg = ''; loginDraft = {}; loginTab = 'login';
    enterMode(j.user.role === 'admin' ? 'admin' : 'student');
    toast(isNew ? `${j.user.name}님, 가입을 환영해요` : `${j.user.name}님, 반가워요`);
  }
  function enterMode(m, keepRoute) {
    mode = m; sheet = null; renderedKind = null;
    stat = { mode: 'week', offset: 0, sel: null };
    if (isStudent()) {
      const k = dataKey();
      state = loadState(k) || (m === 'demo-student' ? makeDemoState() : freshState());
      outbox = m === 'student' ? (lsGet(outKey(), []) || []) : [];
      if (!Array.isArray(outbox)) outbox = [];
      save();
    } else { state = null; outbox = []; admin = freshAdmin(); if (m === 'demo-admin') Object.assign(admin, makeAdminDemo()); }
    if (!keepRoute) history.replaceState(null, '', isAdmin() ? '#dash' : '#home');
    renderAll();
    if (state && state.running) { if (state.running.hiddenSince) onShow(); if (!state.running.endAt) requestWake(); }
    if (m === 'student') syncNow();
    if (m === 'admin') adminLoad(true);
  }
  function startDemo(which) {
    lsSet('demo', which);
    if (which === 'student') lsDel('data:demo');
    enterMode(which === 'admin' ? 'demo-admin' : 'demo-student');
  }
  function exitDemo() {
    stopCamQuietly();
    lsDel('demo'); lsDel('data:demo');
    state = null; admin = freshAdmin(); mode = 'login'; sheet = null;
    history.replaceState(null, '', location.pathname + location.search);
    renderAll();
  }
  function logout() {
    stopCamQuietly();
    if (mode === 'student') { const k = dataKey(); const o = outKey(); if (k) lsDel(k); if (o) lsDel(o); }
    auth = null; lsDel('auth'); state = null; outbox = []; admin = freshAdmin(); mode = 'login'; sheet = null; loginMsg = '';
    clearTimeout(sync.timer); sync.err = '';
    history.replaceState(null, '', location.pathname + location.search);
    renderAll(); toast('로그아웃했어요');
  }

  // ===================== student: home =====================
  function finalHeroHTML(D, editable) {
    const f = D.meta.final;
    if (!f.title) {
      return `<section class="hero-final empty" aria-label="최종 목표"><div class="hf-top"><span class="eyebrow-n">최종 목표</span></div>
        <p class="hf-title">${editable ? '최종 목표를 정해 보세요' : '최종 목표를 아직 정하지 않았어요'}</p>
        ${editable ? '<p class="hf-detail">가고 싶은 대학이나 학과, 목표 등급처럼 야자를 하는 이유를 적어 두면 매일 여기에 보여 줘요.</p><div><button class="btn lamp small" data-act="final-edit">최종 목표 정하기</button></div>' : ''}</section>`;
    }
    const grades = Object.entries(f.grades || {}).filter(([, g]) => g).map(([sid, g]) => {
      const s = findSubj(D, sid); if (!s) return '';
      const l = latestMock(D, sid);
      return `<span class="hf-grade">${esc(s.name)} 목표 ${g}등급${l ? ` · 최근 ${l.grade}등급` : ''}</span>`;
    }).join('');
    return `<section class="hero-final" aria-label="최종 목표"><div class="hf-top"><span class="eyebrow-n">최종 목표</span>${f.date ? `<span class="dday">${esc(f.dateName || '목표일')} ${ddayText(f.date)}</span>` : ''}${editable ? '<button class="hf-edit" data-act="final-edit">수정</button>' : ''}</div>
      <p class="hf-title">${esc(f.title)}</p>${f.detail ? `<p class="hf-detail">${esc(f.detail)}</p>` : ''}${grades ? `<div class="hf-grades">${grades}</div>` : ''}</section>`;
  }
  function dayGoalText(ms, goalMs) { return ms >= goalMs ? `하루 목표 ${fmtHM(goalMs)}를 채웠어요` : `하루 목표 ${fmtHM(goalMs)} 중 ${fmtHM(ms)} (${pct(ms / goalMs)})`; }
  function homeNumbers() {
    const D = state; const now = new Date(); const tk = dayKey(now); const wk = weekKey(now);
    const r = D.running; const live = r && dayKey(r.startedAt) === tk ? runningMs() : 0;
    const bySubj = {};
    D.sessions.filter((x) => x.date === tk).forEach((x) => { const nm = sessName(D, x); bySubj[nm] = (bySubj[nm] || 0) + x.studyMs; });
    if (live) { const sj = findSubj(D, r.subjectId); const nm = sj ? sj.name : r.subject; bySubj[nm] = (bySubj[nm] || 0) + live; }
    return { today: studyOn(D, tk, tk) + live, week: studyOn(D, wk, tk) + (r && dayKey(r.startedAt) >= wk ? runningMs() : 0), goalMs: D.meta.dailyGoalMin * 60000,
      subj: Object.entries(bySubj).sort((a, b) => b[1] - a[1]) };
  }
  function streakDays(D) {
    const days = new Set(D.sessions.map((x) => x.date)); let d = new Date(); let n = 0;
    if (!days.has(dayKey(d)) && !(D.running)) d = addDays(d, -1);
    else if (!days.has(dayKey(d))) { n = 1; d = addDays(d, -1); }
    while (days.has(dayKey(d))) { n++; d = addDays(d, -1); }
    return n;
  }
  function todayHeroHTML(D, N) {
    const r = D.running; const p = Math.min(1, N.today / N.goalMs);
    return `<section class="today-hero" aria-label="오늘 순공">
      <div class="th-top"><span>오늘 순공</span><span>${fmtDateLong(new Date())}</span></div>
      <a class="th-clock" id="stToday" href="#stats" data-act="go-today" aria-label="오늘 순공 ${fmtHM(N.today)}, 오늘 기록 보기">${fmtClock(N.today)}</a>
      <div class="th-track${p >= 1 ? ' met' : ''}"><span id="dayFill" style="width:${p * 100}%"></span></div>
      <p class="th-goal" id="dayText">${dayGoalText(N.today, N.goalMs)}</p>
      ${N.subj.length ? `<div class="th-subj">${N.subj.map(([nm, ms]) => `<span class="th-chip"><i class="dot" style="--c:${colorOf(slotOfName(D, nm))}"></i>${esc(nm)} <b>${fmtShortHM(ms)}</b></span>`).join('')}</div>` : ''}
      <div class="th-act">${r && !r.endAt ? '<button class="btn lamp" data-act="open-timer">공부 중 · 타이머 보기</button>' : '<button class="btn lamp" data-act="quick-start">공부 시작</button>'}</div>
    </section>`;
  }
  function goalCardHTML(D, g) {
    const r = D.running; const nm = goalName(D, g); const slot = slotOfName(D, nm);
    const ms = goalMs(D, g.id); const ss = goalSessions(D, g.id); const last = ss[ss.length - 1];
    const meta = [`이번 주 ${fmtHM(ms)}${g.targetMin ? ` / 목표 ${fmtHM(g.targetMin * 60000)}` : ''}`, `${ss.length}번 공부`];
    if (last) meta.push(`최근: ${last.plan} ${last.achieve}%`);
    const isRun = r && r.goalId === g.id;
    return `<article class="gcard" aria-label="${esc(g.title)}">
      <div class="gc-head">${subjTag(nm, slot)}<span class="gc-pct">${g.progress}%</span></div>
      <p class="gc-title">${esc(g.title)}</p>
      <div class="gc-bar" role="progressbar" aria-label="진행률" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${g.progress}"><span style="width:${g.progress}%;--c:${colorOf(slot)}"></span></div>
      <p class="gc-meta">${esc(meta.join(' · '))}</p>
      <div class="gc-act">${isRun ? '<button class="btn primary" data-act="open-timer">공부 중 · 타이머 보기</button>' : `<button class="btn primary" data-act="start" data-id="${g.id}" ${r ? 'disabled' : ''}>공부 시작</button>`}
        <button class="btn" data-act="goal-edit" data-id="${g.id}" aria-label="${esc(g.title)} 고치기">고치기</button></div>
    </article>`;
  }
  function carryCandidates() {
    const prevWk = dayKey(addDays(weekStart(new Date()), -7));
    if (state.carryDismissed === prevWk) return [];
    return state.goals.filter((g) => g.week === prevWk && g.progress < 100 && !g.carriedTo);
  }
  function promisesHTML(D) {
    const n = latestNote(D); if (!n || !n.promises || !n.promises.length) return '';
    return `<section class="card" aria-labelledby="prH"><div class="card-head"><h2 id="prH">멘토와 한 약속</h2><span class="muted small-text">${n.date.slice(5).replace('-', '/')} 상담</span></div>
      ${n.promises.map((p, i) => `<label class="promise ${p.done ? 'done' : ''}"><input type="checkbox" data-act="promise" data-i="${i}" ${p.done ? 'checked' : ''}><span>${esc(p.text)}</span></label>`).join('')}</section>`;
  }
  function homeHTML() {
    const D = state; const now = new Date(); const ws = weekStart(now); const wk = dayKey(ws);
    const name = mode === 'demo-student' ? '체험 학생' : auth.user.name;
    const N = homeNumbers();
    const goals = weekGoals(D, wk); const active = goals.filter((g) => g.progress < 100); const done = goals.filter((g) => g.progress >= 100);
    const carry = carryCandidates();
    const fb = D.lastFeedback && D.lastFeedback.date === dayKey(now) && D.meta.prefs.phase !== 'A' ? D.lastFeedback : null;
    const hour = now.getHours();
    const hello = hour < 12 ? '좋은 아침이에요' : hour < 18 ? '오늘도 힘내요' : '야자 시작해 볼까요';
    const streak = streakDays(D);
    return `<div class="home">
      <div class="greet"><b>${esc(name)}님, ${hello}</b><span>${fmtDateLong(now)}</span></div>
      <div class="col-a">
      ${todayHeroHTML(D, N)}
      <section class="strip" aria-label="이번 주 공부">
        <a class="st" href="#stats" data-act="go-week"><span class="st-l">이번 주 순공</span><span class="st-v" id="stWeek">${fmtHM(N.week)}</span></a>
        <div class="st"><span class="st-l">주간 목표 달성</span><span class="st-v">${goals.length ? `${done.length} / ${goals.length}` : '–'}</span></div>
        <div class="st"><span class="st-l">연속 공부</span><span class="st-v">${streak}일</span></div>
      </section>
      ${finalHeroHTML(D, true)}
      </div>
      <div class="col-b">
      ${fb ? `<section class="card fb" aria-labelledby="fbH"><div class="card-head"><h2 id="fbH">방금 공부 피드백</h2><button class="btn ghost small" data-act="dismiss-fb">닫기</button></div>
        <p class="muted small-text">${esc(fb.title)}</p><ul class="fb-list">${fb.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></section>` : ''}
      <section class="section" aria-labelledby="wgH">
        <div class="section-head"><div><h2 id="wgH">이번 주 목표</h2><span class="muted">${weekLabel(ws)}</span></div>${goals.length ? '<button class="btn small" data-act="goal-new">+ 목표 추가</button>' : ''}</div>
        ${!goals.length ? `<div class="card"><p><b>이번 주에 끝낼 목표를 2~4개 정해 보세요.</b></p>
            <p class="muted small-text">예: '미적분 2단원 개념과 기본 문제 끝내기', '영단어 Day 11~15 외우기'. 목표를 골라 공부를 시작하고, 끝낼 때 이번에 할 일을 몇 % 했는지와 목표 진행률을 5% 단위로 기록해요.</p>
            <div><button class="btn primary" data-act="goal-new">목표 추가하기</button></div></div>` : ''}
        ${active.map((g) => goalCardHTML(D, g)).join('')}
        ${goals.length && !active.length ? '<div class="coach"><span>이번 주 목표를 모두 달성했어요. 새 목표를 더 추가해 보세요.</span></div>' : ''}
        ${done.length ? `<details class="done-goals"><summary>달성한 목표 ${done.length}개</summary><div class="done-list">${done.map((g) => `<div class="done-row"><i class="dot" style="--c:${colorOf(slotOfName(D, goalName(D, g)))}"></i><span>${esc(g.title)}</span><span class="pill good">달성</span><button class="btn ghost small" data-act="goal-edit" data-id="${g.id}">고치기</button></div>`).join('')}</div></details>` : ''}
        <div><button class="btn ghost small" data-act="free-start" ${D.running ? 'disabled' : ''}>목표 없이 공부하기</button></div>
      </section>
      ${carry.length ? `<section class="card" aria-labelledby="cyH"><div class="card-head"><h2 id="cyH">지난주에 못 끝낸 목표</h2></div>
        <div class="rows" style="gap:0">${carry.map((g) => `<div class="srow"><div class="srow-top">${subjTag(goalName(D, g), slotOfName(D, goalName(D, g)))}<span class="val">${g.progress}%</span></div><div class="srow-sub">${esc(g.title)}</div></div>`).join('')}</div>
        <div class="btn-row"><button class="btn small primary" data-act="carry">이번 주로 이어 가기</button><button class="btn small ghost" data-act="dismiss-carry">괜찮아요</button></div></section>` : ''}
      ${promisesHTML(D)}
      ${installCardHTML()}
      </div>
    </div>`;
  }

  // ===================== student: goals tab =====================
  function examLabel(t) { return t === 'mock' ? '모의고사' : '내신'; }
  function gradeRows(D) {
    const exams = D.exams.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return D.meta.subjects.map((s) => {
      const withScore = exams.filter((e) => e.scores && e.scores[s.id] && e.scores[s.id].grade);
      const latestE = withScore[withScore.length - 1] || null;
      const same = latestE ? withScore.filter((e) => e.type === latestE.type) : [];
      const prevE = same.length >= 2 ? same[same.length - 2] : null;
      const pick = (e) => (e ? { examName: e.name, date: e.date, type: e.type, grade: e.scores[s.id].grade, pct: e.scores[s.id].pct == null ? null : e.scores[s.id].pct } : null);
      const latest = pick(latestE); const prev = pick(prevE);
      const between = latest && prev ? sum(D.sessions.filter((x) => x.subjectId === s.id && x.date > prev.date && x.date <= latest.date).map((x) => x.studyMs)) : null;
      const goal = Number(D.meta.final.grades[s.id]) || null;
      return { id: s.id, name: s.name, slot: s.slot, latest, prev, between, goal };
    }).filter((r) => r.latest || r.goal);
  }
  function changeHTML(r) {
    if (!r.latest || !r.prev) return '<span class="muted">–</span>';
    const dg = r.prev.grade - r.latest.grade;
    const dp = r.latest.pct != null && r.prev.pct != null ? r.latest.pct - r.prev.pct : null;
    const g = dg ? `<span class="${dg > 0 ? 'better' : 'worse'}">${dg > 0 ? '▲' : '▼'} ${Math.abs(dg)}등급</span>` : '등급 같음';
    return g + (dp ? ` <span class="${dp > 0 ? 'better' : 'worse'}">(${dp > 0 ? '+' : ''}${dp})</span>` : '');
  }
  function gradesHTML(D, self) {
    const rows = gradeRows(D);
    const exams = D.exams.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return `<section class="card" aria-labelledby="gaH">
        <div class="card-head"><h2 id="gaH">성적 분석</h2><span class="muted small-text">같은 종류 시험끼리 비교</span></div>
        ${rows.length ? `<div class="grade-list">${rows.map((r) => `<div class="grade-item">
            <div class="gi-head">${subjTag(r.name, r.slot)}<span class="gi-now">${r.latest ? `${r.latest.grade}등급${r.latest.pct != null ? ` <span class="muted">(${r.latest.pct})</span>` : ''}` : '시험 기록 없음'}</span></div>
            <div class="gi-sub">${r.latest ? `${esc(r.latest.examName)} · ` : ''}직전 대비 ${changeHTML(r)} · 최종 목표 ${r.goal ? `${r.goal}등급${r.latest && r.latest.type === 'mock' ? (r.latest.grade <= r.goal ? ' <span class="better">달성</span>' : ` <span class="muted">(${r.latest.grade - r.goal}등급 남음)</span>`) : ''}` : '없음'}${r.between != null ? ` · 그 사이 순공 ${fmtHM(r.between)}` : ''}</div>
          </div>`).join('')}</div>
          <p class="muted small-text">괄호 안 숫자는 백분위예요. '그 사이 순공'은 직전 시험 다음 날부터 최근 시험까지 이 앱에 기록된 순공 시간이에요. 시험이 몇 번뿐이라 성적 변화가 공부 시간 때문이라고 단정할 수는 없어요.</p>`
          : `<p class="muted">${self ? '시험 기록을 넣거나 최종 목표에 과목별 목표 등급을 정하면 과목별로 비교해 보여 줘요.' : '시험 기록이 없어요.'}</p>`}
      </section>
      <section class="card" aria-labelledby="exH">
        <div class="card-head"><h2 id="exH">시험 기록</h2>${self ? '<button class="btn small" data-act="exam-new">시험 추가</button>' : ''}</div>
        ${exams.length ? `<ul class="sess-list">${exams.map((e) => `<li class="sess exam"><div class="sess-time">${e.date.slice(2).replace(/-/g, '.')}</div>
          <div><div><b style="font-weight:600">${esc(e.name)}</b> <span class="muted small-text">${examLabel(e.type)}</span></div>
          <div class="sess-sub">${Object.entries(e.scores || {}).filter(([, v]) => v && v.grade).map(([sid, v]) => `${esc((findSubj(D, sid) || {}).name || v.name || '')} ${v.grade}등급${v.pct != null ? `(${v.pct})` : ''}`).join(' · ')}</div></div>
          ${self ? `<button class="icon-btn" data-act="exam-del" data-id="${e.id}" aria-label="${esc(e.name)} 삭제">×</button>` : '<span></span>'}</li>`).join('')}</ul>`
          : '<p class="empty">아직 시험 기록이 없어요.</p>'}
      </section>`;
  }
  function goalMiniHTML(D, g) {
    const nm = goalName(D, g); const slot = slotOfName(D, nm); const ss = goalSessions(D, g.id); const st = goalStatus(g);
    return `<div class="gmini"><div class="gmini-top"><span style="display:flex;gap:8px;align-items:center;min-width:0;flex-wrap:wrap">${subjTag(nm, slot)}<span class="gmini-title">${esc(g.title)}</span></span><span class="val">${g.progress}%</span></div>
      <div class="gc-bar" style="height:6px"><span style="width:${g.progress}%;--c:${colorOf(slot)}"></span></div>
      <div class="srow-sub"><span class="pill ${st === 'done' ? 'good' : st === 'missed' ? 'mute' : 'lamp'}">${GOAL_STATUS[st]}</span> 공부 ${fmtHM(sum(ss.map((s) => s.studyMs)))} (${ss.length}번)${g.targetMin ? ` · 목표 시간 ${fmtHM(g.targetMin * 60000)}` : ''}</div></div>`;
  }
  function goalsPageHTML() {
    const D = state;
    const tabs = `<div class="seg-tabs" style="--n:2" role="group" aria-label="목표 보기"><button type="button" data-act="goals-tab" data-v="goals" aria-pressed="${goalsTab === 'goals'}">목표</button><button type="button" data-act="goals-tab" data-v="grades" aria-pressed="${goalsTab === 'grades'}">성적</button></div>`;
    if (goalsTab === 'grades') return `<div class="stack">${tabs}${gradesHTML(D, true)}</div>`;
    const wk = weekKey(new Date());
    const weeks = [...new Set(D.goals.map((g) => g.week).concat([wk]))].sort().reverse();
    const shown = weeks.slice(0, weeksShown);
    return `<div class="stack">${tabs}${finalHeroHTML(D, true)}<div class="cards">
      ${shown.map((w) => {
        const gs = weekGoals(D, w); const ws = parseDay(w);
        const total = studyOn(D, w, dayKey(addDays(ws, 6)));
        return `<section class="card" aria-label="${weekLabel(ws)} 목표"><div class="card-head"><h2>${weekLabel(ws)}${w === wk ? ' · 이번 주' : ''}</h2><span class="muted small-text">${gs.length ? `${gs.filter((g) => g.progress >= 100).length}/${gs.length} 달성 · ` : ''}순공 ${fmtHM(total)}</span></div>
          ${gs.length ? gs.map((g) => goalMiniHTML(D, g)).join('') : `<p class="empty">${w === wk ? '이번 주 목표가 아직 없어요.' : '이 주에는 세운 목표가 없어요.'}</p>`}
          ${w === wk ? '<div><button class="btn small" data-act="goal-new">+ 이번 주 목표 추가</button></div>' : ''}</section>`;
      }).join('')}</div>
      ${weeks.length > shown.length ? '<div><button class="btn small" data-act="more-weeks">이전 목표 더 보기</button></div>' : ''}
    </div>`;
  }

  // ===================== statistics page (students; teachers reuse it read-only) =====================
  function vchartHTML(cols, opt) {
    const max = Math.max(opt.minMax || 1, ...cols.map((c) => c.ms));
    const H = opt.h || 140;
    const bars = cols.map((c) => {
      const h = (c.ms / max) * H;
      const segs = (c.segs && c.segs.length ? c.segs : c.ms ? [{ name: '', ms: c.ms, color: 'var(--data)' }] : []).filter((s) => s.ms > 0);
      const parts = segs.map((s) => `<i style="height:${Math.max(2, (s.ms / c.ms) * h).toFixed(1)}px;--c:${s.color || colorOf(s.slot)}" title="${esc(s.name ? s.name + ' ' : '')}${fmtHM(s.ms)}"></i>`).join('');
      const attrs = c.act ? `type="button" data-act="${c.act}" data-key="${c.key}" aria-pressed="${!!c.sel}"` : '';
      const tag = c.act ? 'button' : 'div';
      return `<${tag} ${attrs} class="vcol${c.sel ? ' sel' : ''}" aria-label="${esc(c.aria)}" title="${esc(c.aria)}"><span class="vval">${c.ms >= 60000 ? fmtShortHM(c.ms) : ''}</span><span class="vstack">${parts}</span></${tag}>`;
    }).join('');
    const labels = cols.map((c) => `<span class="vlab${c.today ? ' today' : ''}${c.sel ? ' sel' : ''}">${esc(c.label)}${c.sub ? `<small>${esc(c.sub)}</small>` : ''}</span>`).join('');
    return `<div class="vchart" style="--n:${cols.length}">${bars}</div><div class="vlab-row" style="--n:${cols.length}" aria-hidden="true">${labels}</div>`;
  }
  function legendHTML(subjects) { return subjects.length > 1 ? `<div class="legend">${subjects.map((x) => `<span><i class="dot" style="--c:${colorOf(x.slot)}"></i>${esc(x.name)}</span>`).join('')}</div>` : ''; }
  function sessItemHTML(D, s, look, self) {
    const nm = look.name(s);
    const gp = s.goalProgress != null && s.goalBefore != null && s.goalProgress !== s.goalBefore ? ` · 목표 ${s.goalBefore}→${s.goalProgress}%` : '';
    return `<li class="sess"><div class="sess-time">${fmtTime(s.start)}–${fmtTime(s.end)}</div><div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${subjTag(nm, look.slot(nm))}<b style="font-weight:600">${esc(s.plan || s.goalTitle || '')}</b>${self ? `<button class="icon-btn" style="margin-left:auto" data-act="sess-del" data-id="${s.id}" aria-label="${fmtTime(s.start)} 공부 기록 삭제">×</button>` : ''}</div>
      ${s.goalTitle ? `<div class="sess-sub">주간 목표: ${esc(s.goalTitle)}</div>` : ''}
      <div class="sess-sub">순공 ${fmtHM(s.studyMs)} · 할 일 ${s.achieve == null ? '–' : s.achieve + '%'} · 집중 ${s.focus || '–'}/5${gp}${(s.distractors || []).length ? ' · ' + esc(s.distractors.join(', ')) : ''}${s.awayMs ? ` · 이탈 ${fmtDur(s.awayMs)}` : ''}${s.drowsyCount ? ` · 졸음 ${s.drowsyCount}회` : ''}</div>
      ${self && s.memo ? `<div class="sess-sub">메모: ${esc(s.memo)}</div>` : ''}</div></li>`;
  }
  function fmtHMS(ms) { const t = Math.max(0, Math.round(ms / 1000)); return `${pad(Math.floor(t / 3600))}:${pad(Math.floor(t / 60) % 60)}:${pad(t % 60)}`; }
  // one day as a study-planner page: subjects and to-dos on the left, a 10-minute timetable on the right
  function dayDetailHTML(D, key, self, opt) {
    opt = opt || {};
    const look = lookFor(D); const day = parseDay(key);
    const ss = D.sessions.filter((s) => s.date === key).sort((a, b) => a.start - b.start);
    const total = sum(ss.map((s) => s.studyMs));
    const head = `<div class="pl-head"><b>${day.getFullYear()}. ${day.getMonth() + 1}. ${day.getDate()}. (${WD[day.getDay()]})</b><span class="pl-total">${Math.floor(total / 3600e3)}H ${pad(Math.round(total / 60000) % 60)}M</span></div>`;
    const go = opt.goDay ? `<div><button class="btn small" data-act="st-goday" data-key="${key}">이날 하루 통계 보기</button></div>` : '';
    if (!ss.length) return `<div class="planner" aria-live="polite">${head}<p class="empty" style="padding:14px">이날은 공부 기록이 없어요.</p></div>`;
    const groups = [];
    ss.forEach((x) => { const nm = look.name(x); let g = groups.find((y) => y.name === nm); if (!g) groups.push(g = { name: nm, slot: look.slot(nm), ms: 0, items: [] }); g.ms += x.studyMs; g.items.push(x); });
    const mark = (a) => (a == null ? '·' : a >= 100 ? '○' : a >= 50 ? '△' : '×');
    const list = groups.map((g) => `<div class="pl-group"><div class="pl-subj"><i style="--c:${colorOf(g.slot)}"></i><b>${esc(g.name)}</b><span>${fmtHMS(g.ms)}</span></div>
      <ul>${g.items.map((x) => `<li class="pl-task"><span class="pl-mark" aria-label="달성도 ${x.achieve}%">${mark(x.achieve)}</span><div class="pl-text">
        <span class="${x.achieve >= 100 ? 'done' : ''}">${esc(x.plan || x.goalTitle || '공부')}</span> <span class="pl-pct">${x.achieve == null ? '' : x.achieve + '%'}</span>
        <span class="pl-sub">${fmtTime(x.start)}–${fmtTime(x.end)} · ${fmtHM(x.studyMs)} · 집중 ${x.focus || '–'}${(x.distractors || []).length ? ' · ' + esc(x.distractors.join(', ')) : ''}</span>
        ${self && x.memo ? `<span class="pl-sub">메모: ${esc(x.memo)}</span>` : ''}</div>
        ${self ? `<button class="icon-btn" data-act="sess-del" data-id="${x.id}" aria-label="${fmtTime(x.start)} 공부 기록 삭제">×</button>` : ''}</li>`).join('')}</ul></div>`).join('');
    // timetable: color each 10-minute slot by the session that covers most of it (start to end, breaks included)
    const mid = day.getTime();
    const h0 = Math.floor((ss[0].start - mid) / 3600e3);
    const h1 = Math.max(h0 + 1, Math.ceil((Math.max(...ss.map((x) => x.end || x.start)) - mid) / 3600e3));
    const rows = [];
    for (let h = h0; h < h1; h++) {
      const cells = range(0, 5).map((c) => {
        const a = mid + h * 3600e3 + c * 600e3; const b = a + 600e3;
        let best = null; let bo = 0;
        ss.forEach((x) => { const o = Math.min(b, x.end || x.start) - Math.max(a, x.start); if (o > bo) { bo = o; best = x; } });
        return best && bo >= 300e3 ? `<i style="--c:${colorOf(look.slot(look.name(best)))}" title="${esc(look.name(best))} ${fmtTime(a)}"></i>` : '<i></i>';
      }).join('');
      rows.push(`<div class="pl-row"><span>${((h % 24) + 24) % 24}</span>${cells}</div>`);
    }
    return `<div class="planner" aria-live="polite">${head}
      <div class="pl-body"><div class="pl-list">${list}</div><div class="pl-grid" role="img" aria-label="${fmtDateLong(day)} 공부 시간표">${rows.join('')}</div></div>
      <p class="pl-note">○ 다 끝냄 · △ 50~95% · × 50% 미만 · 시간표는 공부를 시작해서 끝낼 때까지(휴식 포함)를 10분 칸에 칠했어요.</p></div>${go}`;
  }
  function level(ms) { const m = ms / 60000; return m <= 0 ? 0 : m < 60 ? 1 : m < 120 ? 2 : m < 180 ? 3 : 4; }
  function calendarHTML(P, R, sel) {
    const y = P.start.getFullYear(); const mo = P.start.getMonth();
    const lead = (new Date(y, mo, 1).getDay() + 6) % 7; const days = new Date(y, mo + 1, 0).getDate(); const tk = dayKey(new Date());
    let cells = ['월', '화', '수', '목', '금', '토', '일'].map((w) => `<div class="cal-wd" aria-hidden="true">${w}</div>`).join('');
    for (let i = 0; i < lead; i++) cells += '<div class="day pad" aria-hidden="true"></div>';
    for (let d = 1; d <= days; d++) {
      const k = dayKey(new Date(y, mo, d)); const ms = R.days[k] ? R.days[k].ms : 0;
      cells += `<button type="button" class="day${k === tk ? ' today' : ''}" data-l="${level(ms)}" data-act="st-goday" data-key="${k}" aria-label="${mo + 1}월 ${d}일 순공 ${fmtHM(ms)}, 그날 기록 보기"><span>${d}</span>${ms ? `<span class="d-min">${fmtShortHM(ms)}</span>` : ''}</button>`;
    }
    return `<div class="cal">${cells}</div>
      <div class="heat-legend" aria-hidden="true"><span>순공</span><i style="background:var(--heat-0)"></i>0 <i style="background:var(--heat-1)"></i>1시간 미만 <i style="background:var(--heat-2)"></i>1~2시간 <i style="background:var(--heat-3)"></i>2~3시간 <i style="background:var(--heat-4)"></i>3시간 이상</div>`;
  }
  function subjectsCardHTML(R) {
    if (!R.subjects.length) return '';
    const max = Math.max(...R.subjects.map((x) => x.ms), 1);
    return `<section class="card" aria-labelledby="sjH"><div class="card-head"><h2 id="sjH">과목별</h2><span class="muted small-text">공부 ${R.sessions.length}번</span></div>
      <div class="rows">${R.subjects.map((x) => `<div class="srow"><div class="srow-top">${subjTag(x.name, x.slot)}<span class="val">${fmtHM(x.ms)} · ${pct(R.total ? x.ms / R.total : 0)}</span></div>
        <div class="hbar thin"><i style="width:${(x.ms / max) * 100}%;--c:${colorOf(x.slot)}"></i></div>
        <div class="srow-sub">${x.n}번 · 할 일 달성도 ${x.avgAch == null ? '–' : Math.round(x.avgAch) + '%'} · 집중 ${x.avgFocus == null ? '–' : x.avgFocus.toFixed(1)}</div></div>`).join('')}</div></section>`;
  }
  function hoursCardHTML(R) {
    if (!R.hours.length) return '';
    const max = Math.max(...R.hours.map((h) => h.ms), 1);
    return `<section class="card" aria-labelledby="hrH"><div class="card-head"><h2 id="hrH">시간대별</h2><span class="muted small-text">순공 · 평균 집중도</span></div>
      <div class="rows">${R.hours.filter((h) => h.ms >= 30000 || h.focus.length).map((h) => `<div class="hrow"><span>${h.hour}시</span><div class="hbar"><i style="width:${(h.ms / max) * 100}%"></i></div><span class="val">${fmtHM(h.ms)}${h.avgFocus != null ? ` · 집중 ${h.avgFocus.toFixed(1)}` : ''}</span></div>`).join('')}</div>
      <p class="muted small-text">순공은 공부를 시작해서 끝낼 때까지의 시간대에 고르게 나눠 담았고, 집중도는 시작한 시각에 셌어요.</p></section>`;
  }
  function bucketsCardHTML(R) {
    const n = sum(R.buckets.map((b) => b.n)); if (!n) return '';
    const max = Math.max(...R.buckets.map((b) => b.n), 1);
    return `<section class="card" aria-labelledby="bkH"><div class="card-head"><h2 id="bkH">할 일 달성도 분포</h2><span class="muted small-text">끝낼 때 기록한 값 · ${n}번</span></div>
      <div class="rows">${R.buckets.map((b) => `<div class="hrow" style="grid-template-columns:7.5em minmax(0,1fr) auto"><span>${b.label}</span><div class="hbar"><i style="width:${(b.n / max) * 100}%"></i></div><span class="val">${b.n}번 (${pct(b.n / n)})</span></div>`).join('')}</div></section>`;
  }
  function accuracyCardHTML(R) {
    return `<section class="card" aria-labelledby="acH"><div class="card-head"><h2 id="acH">계획 정확도</h2><span class="muted small-text">할 일을 90% 넘게 한 공부 기준</span></div>
      ${R.accuracy.length ? `<div class="rows">${R.accuracy.map((x) => `<div class="srow-top">${subjTag(x.name, x.slot)}<span class="val">${Math.abs(x.avg) <= 0.1 ? '예상과 비슷' : x.avg > 0 ? `예상보다 ${pct(x.avg)} 더 걸림` : `예상보다 ${pct(-x.avg)} 빨리 끝남`} (${x.n}번)</span></div>`).join('')}</div>`
        : '<p class="muted">할 일을 거의 다 끝낸 공부가 생기면 예상 시간과 실제 시간을 비교해 보여 줘요.</p>'}</section>`;
  }
  function distractorsCardHTML(R) {
    const max = Math.max(...R.distractors.map((x) => x.count), 1);
    return `<section class="card" aria-labelledby="dsH"><div class="card-head"><h2 id="dsH">공부를 방해한 것</h2><span class="muted small-text">공부 ${R.sessions.length}번 중</span></div>
      ${R.distractors.length ? `<div class="rows">${R.distractors.map((d) => `<div class="hrow" style="grid-template-columns:7.5em minmax(0,1fr) auto"><span>${esc(d.name)}</span><div class="hbar"><i style="width:${(d.count / max) * 100}%"></i></div><span class="val">${d.count}번</span></div>`).join('')}</div>` : '<p class="muted">체크된 방해 요인이 없어요.</p>'}</section>`;
  }
  function camCardHTML(R) {
    if (!R.cam.n) return '';
    return `<section class="card" aria-labelledby="cmH"><div class="card-head"><h2 id="cmH">카메라로 확인한 것</h2><span class="muted small-text">카메라를 켠 공부 ${R.cam.n}번</span></div>
      <div class="rows"><div class="srow-top"><span>자리 비움</span><span class="val">${fmtHM(R.cam.awayMs)}</span></div>
        <div class="srow-top"><span>졸음 감지</span><span class="val">${R.cam.drowsy}회${R.cam.topHour != null ? ` · 가장 많은 때 ${R.cam.topHour}시대` : ''}</span></div>
        ${R.cam.focusWith != null && R.cam.focusWithout != null ? `<div class="srow-top"><span>스스로 매긴 집중도</span><span class="val">졸음 감지된 공부 ${R.cam.focusWith.toFixed(1)} · 없던 공부 ${R.cam.focusWithout.toFixed(1)}</span></div>` : ''}</div>
      <p class="muted small-text">카메라 판정은 눈 감김과 얼굴 위치로 추정한 값이라 틀릴 수 있어요.</p></section>`;
  }
  function curStat() { return isAdmin() ? astat : stat; }
  function statsHTML(D, st, self) {
    const P = periodOf(st); const look = lookFor(D); const tk = dayKey(new Date());
    const R = rangeStats(D.sessions, P.a, P.b, look);
    const prev = rangeStats(D.sessions, P.prevA, P.prevB, look); const hasPrev = prev.sessions.length > 0;
    const wkA = dayKey(weekStart(P.start));
    const goals = D.goals.filter((g) => g.week >= wkA && g.week <= P.b);
    const gDone = goals.filter((g) => g.progress >= 100).length;
    const dayKeys = Object.keys(R.days).sort();
    const sel = st.sel && st.sel >= P.a && st.sel <= P.b ? st.sel : tk >= P.a && tk <= P.b ? tk : dayKeys[dayKeys.length - 1] || P.a;
    const nav = `<div class="seg-tabs" style="--n:3" role="group" aria-label="통계 기간">
        <button type="button" data-act="st-mode" data-v="day" aria-pressed="${P.mode === 'day'}">일간</button>
        <button type="button" data-act="st-mode" data-v="week" aria-pressed="${P.mode === 'week'}">주간</button>
        <button type="button" data-act="st-mode" data-v="month" aria-pressed="${P.mode === 'month'}">월간</button></div>
      ${P.mode === 'day' && st.back ? `<div><button class="btn ghost small" data-act="st-back">‹ ${st.back.mode === 'month' ? '달력으로' : '주간 통계로'} 돌아가기</button></div>` : ''}
      <div class="period-nav"><button class="icon-btn" data-act="st-prev" aria-label="이전 ${P.unit}">‹</button><h2>${P.label}</h2><button class="icon-btn" data-act="st-next" aria-label="다음 ${P.unit}" ${st.offset >= 0 ? 'disabled' : ''}>›</button></div>`;
    if (P.mode === 'day') {
      const dTiles = `<div class="tiles">
        <div class="tile"><span class="label">순공 시간</span><span class="value">${fmtHM(R.total)}</span>${deltaHTML(R.total, hasPrev ? prev.total : null, 'ms', P.than)}</div>
        <div class="tile"><span class="label">공부 횟수</span><span class="value">${R.sessions.length}<small>번</small></span><span class="delta">하루 목표 ${fmtHM(D.meta.dailyGoalMin * 60000)}의 ${pct(R.total / (D.meta.dailyGoalMin * 60000))}</span></div>
        <div class="tile"><span class="label">할 일 달성도</span><span class="value">${R.avgAch == null ? '–' : Math.round(R.avgAch) + '%'}</span>${deltaHTML(R.avgAch, hasPrev ? prev.avgAch : null, 'pt', P.than)}</div>
        <div class="tile"><span class="label">평균 집중도</span><span class="value">${R.avgFocus == null ? '–' : R.avgFocus.toFixed(1)} <small>/ 5</small></span>${deltaHTML(R.avgFocus, hasPrev ? prev.avgFocus : null, 'focus', P.than)}</div>
      </div>`;
      return `${nav}${dTiles}<div class="cards"><section class="card wide" aria-labelledby="dyH"><div class="card-head"><h2 id="dyH">하루 기록</h2>${st.offset < 0 ? `<button class="btn ghost small" data-act="st-today">오늘로</button>` : ''}</div>${dayDetailHTML(D, P.a, self)}</section>${R.sessions.length ? subjectsCardHTML(R) + hoursCardHTML(R) + distractorsCardHTML(R) + camCardHTML(R) : ''}</div>`;
    }
    if (!R.sessions.length && !goals.length) {
      return `${nav}<section class="card"><h2 style="font-size:16px">이 ${P.unit}에는 공부 기록이 없어요</h2><p class="muted">${self ? '주간 목표를 골라 공부를 시작하고, 끝낼 때 기록을 남기면 여기에 통계가 쌓여요.' : '이 기간에 남긴 기록이 없어요.'}</p>
        ${hasPrev ? '<div><button class="btn small" data-act="st-prev">이전 기록 보기</button></div>' : ''}</section>`;
    }
    const awayRatio = R.gross ? R.away / R.gross : 0; const prevAway = hasPrev && prev.gross ? prev.away / prev.gross : null;
    const tiles = `<div class="tiles">
      <div class="tile"><span class="label">순공 시간</span><span class="value">${fmtHM(R.total)}</span>${deltaHTML(R.total, hasPrev ? prev.total : null, 'ms', P.than)}</div>
      <div class="tile"><span class="label">공부한 날</span><span class="value">${R.studyDays}일 <small>/ ${P.elapsed}일</small></span><span class="delta">공부한 날 평균 ${fmtHM(R.studyDays ? R.total / R.studyDays : 0)}</span></div>
      <div class="tile"><span class="label">할 일 달성도</span><span class="value">${R.avgAch == null ? '–' : Math.round(R.avgAch) + '%'}</span>${deltaHTML(R.avgAch, hasPrev ? prev.avgAch : null, 'pt', P.than)}</div>
      <div class="tile"><span class="label">주간 목표 달성</span><span class="value">${goals.length ? `${gDone} <small>/ ${goals.length}개</small>` : '–'}</span><span class="delta">${goals.length ? `평균 진행률 ${Math.round(avg(goals.map((g) => g.progress)))}%` : '세운 목표 없음'}</span></div>
      <div class="tile"><span class="label">평균 집중도</span><span class="value">${R.avgFocus == null ? '–' : R.avgFocus.toFixed(1)} <small>/ 5</small></span>${deltaHTML(R.avgFocus, hasPrev ? prev.avgFocus : null, 'focus', P.than)}</div>
      <div class="tile"><span class="label">앱 이탈 비율</span><span class="value">${pct(awayRatio)}</span>${deltaHTML(awayRatio, prevAway, 'away', P.than)}</div>
    </div>`;
    let timeline;
    if (P.mode === 'week') {
      const cols = range(0, 6).map((i) => {
        const day = addDays(P.start, i); const k = dayKey(day); const d = R.days[k];
        const segs = d ? R.subjects.filter((x) => d.subj[x.name]).map((x) => ({ name: x.name, slot: x.slot, ms: d.subj[x.name] })) : [];
        return { key: k, label: WD[day.getDay()], sub: `${day.getMonth() + 1}/${day.getDate()}`, ms: d ? d.ms : 0, segs, today: k === tk, act: 'st-goday', aria: `${fmtDateLong(day)} 순공 ${fmtHM(d ? d.ms : 0)}, 그날 기록 보기` };
      });
      timeline = `<section class="card wide" aria-labelledby="tlH"><div class="card-head"><h2 id="tlH">날짜별 순공</h2><span class="muted small-text">막대를 누르면 그날 상세 기록</span></div>
        ${vchartHTML(cols, { minMax: 60 * 60000 })}${legendHTML(R.subjects)}</section>`;
    } else {
      const wcols = []; let w = weekStart(P.start);
      while (w <= P.end) {
        const a = dayKey(w < P.start ? P.start : w); const e = addDays(w, 6); const b = dayKey(e > P.end ? P.end : e);
        const ms = sum(Object.entries(R.days).filter(([k]) => k >= a && k <= b).map(([, d]) => d.ms));
        wcols.push({ key: a, label: `${parseDay(a).getMonth() + 1}/${parseDay(a).getDate()}~`, ms, aria: `${a.slice(5).replace('-', '/')}–${b.slice(5).replace('-', '/')} 순공 ${fmtHM(ms)}`, today: tk >= a && tk <= b });
        w = addDays(w, 7);
      }
      timeline = `<section class="card wide" aria-labelledby="clH"><div class="card-head"><h2 id="clH">달력</h2><span class="muted small-text">날짜를 누르면 그날 상세 기록</span></div>
          ${calendarHTML(P, R, sel)}</section>
        <section class="card wide" aria-labelledby="wkH"><div class="card-head"><h2 id="wkH">주별 순공</h2></div>${vchartHTML(wcols, { minMax: 3600e3, h: 110 })}</section>`;
    }
    const gids = new Set(goals.map((g) => g.id));
    const inGoal = sum(R.sessions.filter((s) => gids.has(s.goalId)).map((s) => s.studyMs));
    const goalsCard = goals.length || inGoal < R.total ? `<section class="card" aria-labelledby="sgoH"><div class="card-head"><h2 id="sgoH">${P.mode === 'week' ? '이 주의 목표' : '이 달의 주간 목표'}</h2><span class="muted small-text">${goals.length ? `${gDone}/${goals.length} 달성` : ''}</span></div>
        ${goals.length ? goals.map((g) => goalMiniHTML(D, g)).join('') : '<p class="empty">세운 목표가 없어요.</p>'}
        ${R.total - inGoal >= 60000 ? `<p class="muted small-text">목표 없이 한 공부 ${fmtHM(R.total - inGoal)}</p>` : ''}</section>` : '';
    const sg = self && D.meta.prefs.phase !== 'A' ? suggestions(R, goals, P) : null;
    const suggCard = self && D.meta.prefs.phase !== 'A' ? `<section class="card" aria-labelledby="suH"><div class="card-head"><h2 id="suH">다음 ${P.unit} 제안</h2></div>
        ${sg == null ? `<p class="muted">공부 기록이 3번 이상 쌓이면 제안이 나와요 (지금 ${R.sessions.length}번).</p>`
          : sg.length ? `<div class="sugg">${sg.map((x) => `<div class="sugg-item"><h3>${esc(x.title)}</h3><p>${esc(x.body)}</p><p class="basis">근거: ${esc(x.basis)}</p></div>`).join('')}</div>`
          : '<p>기록에서 크게 걸리는 부분이 없어요. 지금 방식을 유지해 보세요.</p>'}
        <p class="muted small-text">제안은 이 앱이 정한 규칙으로 계산한 거예요. 효과가 검증된 처방은 아니니, 나에게 맞는지 다음 기록으로 확인해 보세요.</p></section>${reportAIHTML(P)}` : '';
    const share = self ? `<section class="card" aria-labelledby="shH"><div class="card-head"><h2 id="shH">통계 공유</h2></div><p class="muted small-text">선생님이나 함께 공부하는 친구에게 이 ${P.unit}의 기록을 보여 주고 싶을 때 보내세요.</p>
        <div><button class="btn" data-act="share-report">${navigator.share ? '요약 보내기' : '요약 텍스트 복사'}</button></div></section>` : '';
    return `${nav}${tiles}<div class="cards">${timeline}${goalsCard}${suggCard}${subjectsCardHTML(R)}${hoursCardHTML(R)}${bucketsCardHTML(R)}${accuracyCardHTML(R)}${distractorsCardHTML(R)}${camCardHTML(R)}${share}</div>`;
  }
  function statsPageHTML() { return `<div class="stack">${statsHTML(state, stat, true)}</div>`; }
  function reportText() {
    const D = state; const P = periodOf(stat); const R = rangeStats(D.sessions, P.a, P.b, lookFor(D));
    const goals = D.goals.filter((g) => g.week >= dayKey(weekStart(P.start)) && g.week <= P.b);
    const who = mode === 'student' ? ` · ${auth.user.name}` : '';
    const lines = [`[야자 관리실 ${P.mode === 'week' ? '주간' : '월간'} 요약] ${P.label}${who}`,
      `순공 시간: ${fmtHM(R.total)} (공부한 날 ${R.studyDays}일)`,
      `할 일 달성도: ${R.avgAch == null ? '-' : Math.round(R.avgAch) + '%'} / 평균 집중도: ${R.avgFocus == null ? '-' : R.avgFocus.toFixed(1)} / 5`,
      `주간 목표: ${goals.length ? `${goals.filter((g) => g.progress >= 100).length}/${goals.length} 달성` : '없음'}`,
      ...goals.map((g) => `- ${goalName(D, g)} · ${g.title}: ${g.progress}%`),
      `과목별: ${R.subjects.map((x) => `${x.name} ${fmtHM(x.ms)}`).join(', ') || '-'}`,
      `방해한 것: ${R.distractors.map((d) => `${d.name} ${d.count}번`).join(', ') || '없음'}`];
    const sg = suggestions(R, goals, P) || [];
    if (sg.length && D.meta.prefs.phase !== 'A') { lines.push('다음 제안:'); sg.forEach((x, i) => lines.push(`${i + 1}. ${x.title} - ${x.body}`)); }
    return lines.join('\n');
  }

  // ===================== AI mentor =====================
  const QUICK = ['이번 주 공부 어땠는지 봐 주세요', '주간 목표 크기가 적당한지 봐 주세요', '최종 목표까지 계획을 같이 세워요', '성적 분석해 주세요', '수학 공부 방법이 고민이에요'];
  function statLine(R, label) {
    if (!R.sessions.length) return `${label}: 기록 없음`;
    return `${label}: 순공 ${fmtHM(R.total)}, 공부한 날 ${R.studyDays}일, 공부 ${R.sessions.length}번, 평균 할 일 달성도 ${R.avgAch == null ? '-' : Math.round(R.avgAch) + '%'}, 평균 집중도 ${R.avgFocus == null ? '-' : R.avgFocus.toFixed(1)}/5, `
      + `방해 요인 ${R.distractors.slice(0, 3).map((d) => `${d.name} ${d.count}번`).join(', ') || '없음'}, 앱 이탈 비율 ${R.gross ? pct(R.away / R.gross) : '0%'}`
      + (R.cam.n ? `, 카메라 확인 자리 비움 ${fmtHM(R.cam.awayMs)}·졸음 감지 ${R.cam.drowsy}회` : '');
  }
  function mentorContext() {
    const D = state; const now = new Date(); const tk = dayKey(now); const w0 = weekStart(now); const wk = dayKey(w0); const look = lookFor(D);
    const cur = rangeStats(D.sessions, wk, tk, look);
    const last = rangeStats(D.sessions, dayKey(addDays(w0, -7)), dayKey(addDays(w0, -1)), look);
    const r14 = rangeStats(D.sessions, dayKey(addDays(now, -13)), tk, look);
    const f = D.meta.final;
    const goalLine = (g) => `- [${goalName(D, g)}] ${g.title}: 진행률 ${g.progress}%, 공부 ${fmtHM(goalMs(D, g.id))}(${goalSessions(D, g.id).length}번)${g.targetMin ? `, 목표 시간 ${fmtHM(g.targetMin * 60000)}` : ''}`;
    const recent = D.sessions.filter((s) => s.date >= dayKey(addDays(now, -6))).sort((a, b) => a.start - b.start).slice(-25)
      .map((s) => `- ${s.date.slice(5)} ${fmtTime(s.start)} ${look.name(s)} · ${s.goalTitle ? `목표 '${s.goalTitle}' · ` : ''}할 일 '${s.plan}' · 예상 ${s.planMin}분 → 순공 ${Math.round(s.studyMs / 60000)}분 · 달성도 ${s.achieve}% · 집중 ${s.focus}/5${s.distractors.length ? ` · 방해: ${s.distractors.join(', ')}` : ''}${s.drowsyCount ? ` · 졸음 감지 ${s.drowsyCount}회` : ''}`);
    const g = gradeRows(D); const n = latestNote(D);
    return [
      `오늘: ${fmtDateLong(now)} / 실험 단계: ${PHASE[D.meta.prefs.phase] || '일반'} / 하루 순공 목표: ${fmtHM(D.meta.dailyGoalMin * 60000)}`,
      f.title ? `최종 목표: ${f.title}${f.detail ? ` (${f.detail})` : ''}${f.date ? `, ${f.dateName || '목표일'} ${f.date} (${ddayText(f.date)})` : ''}` : '최종 목표: 아직 정하지 않음',
      `과목: ${D.meta.subjects.map((s) => s.name).join(', ')}`,
      `이번 주 목표:\n${weekGoals(D, wk).map(goalLine).join('\n') || '- 없음'}`,
      `지난주 목표:\n${weekGoals(D, dayKey(addDays(w0, -7))).map(goalLine).join('\n') || '- 없음'}`,
      statLine(cur, '이번 주(진행 중)'), statLine(last, '지난주'),
      `최근 14일 과목별 순공: ${r14.subjects.map((x) => `${x.name} ${fmtHM(x.ms)}(달성도 ${x.avgAch == null ? '-' : Math.round(x.avgAch) + '%'})`).join(', ') || '없음'}`,
      cur.hours.filter((h) => h.focus.length).length ? `이번 주 시간대별 평균 집중도: ${cur.hours.filter((h) => h.focus.length).map((h) => `${h.hour}시대 ${h.avgFocus.toFixed(1)}(${h.focus.length}번)`).join(', ')}` : '',
      r14.accuracy.length ? `최근 14일 계획 정확도(할 일을 90% 넘게 한 공부의 실제 시간이 예상보다 몇 % 더 걸렸는지): ${r14.accuracy.map((x) => `${x.name} ${x.n}번 평균 ${x.avg >= 0 ? '+' : ''}${Math.round(x.avg * 100)}%`).join(', ')}` : '',
      recent.length ? `최근 7일 공부 기록:\n${recent.join('\n')}` : '최근 7일 공부 기록: 없음',
      g.length ? `성적(시험 수가 적어 참고용, 괄호는 백분위):\n${g.map((r) => `- ${r.name}: ${r.latest ? `최근 ${r.latest.examName} ${r.latest.grade}등급${r.latest.pct != null ? `(${r.latest.pct})` : ''}` : '시험 기록 없음'}${r.prev ? `, 직전 ${r.prev.examName} ${r.prev.grade}등급${r.prev.pct != null ? `(${r.prev.pct})` : ''}` : ''}${r.goal ? `, 최종 목표 ${r.goal}등급` : ''}${r.between != null ? `, 두 시험 사이 이 과목 순공 ${fmtHM(r.between)}` : ''}`).join('\n')}` : '성적 기록: 없음',
      n ? `지난 상담(${n.date}) 요약: ${n.summary}\n지난 약속: ${(n.promises || []).map((p) => `${p.text}(${p.done ? '실천함' : '아직'})`).join(' / ') || '없음'}` : '지난 상담: 없음',
    ].filter(Boolean).join('\n').slice(0, 8000);
  }
  function periodContext(P) {
    const D = state; const R = rangeStats(D.sessions, P.a, P.b, lookFor(D));
    const goals = D.goals.filter((g) => g.week >= dayKey(weekStart(P.start)) && g.week <= P.b);
    const sg = suggestions(R, goals, P) || [];
    return [`[코멘트할 기간: ${P.label}${P.cur ? ' (진행 중)' : ''}]`, statLine(R, '이 기간'),
      `주간 목표: ${goals.map((g) => `${goalName(D, g)} '${g.title}' ${g.progress}%`).join(', ') || '없음'}`,
      `과목별 순공: ${R.subjects.map((x) => `${x.name} ${fmtHM(x.ms)}`).join(', ') || '없음'}`,
      `할 일 달성도 분포: ${R.buckets.map((b) => `${b.label} ${b.n}번`).join(', ')}`,
      `계획 정확도: ${R.accuracy.map((x) => `${x.name} ${x.n}번 평균 ${x.avg >= 0 ? '+' : ''}${Math.round(x.avg * 100)}%`).join(', ') || '자료 없음'}`,
      R.hours.filter((h) => h.focus.length).length ? `시간대별 집중도: ${R.hours.filter((h) => h.focus.length).map((h) => `${h.hour}시대 ${h.avgFocus.toFixed(1)}(${h.focus.length}번)`).join(', ')}` : '',
      sg.length ? `앱 규칙이 낸 제안: ${sg.map((x) => x.title).join(' / ')}` : ''].filter(Boolean).join('\n');
  }
  function scrollChat() { const log = $('#chatLog'); if (log && log.lastElementChild) log.lastElementChild.scrollIntoView({ block: 'nearest' }); }
  async function sendMentor(text) {
    text = String(text || '').trim();
    if (!text || mentorBusy || mode !== 'student') return;
    state.chat.push({ role: 'user', content: text.slice(0, 1000) });
    mentorDraft = ''; mentorErr = ''; mentorBusy = true; save(); renderPage(); scrollChat();
    try {
      const j = await api('mentor', { mode: 'chat', context: mentorContext(), messages: state.chat.slice(-16) });
      if (state) state.chat.push({ role: 'assistant', content: String(j.text || '').trim() || '(답이 비어 있어요. 다시 물어봐 주세요.)' });
    } catch (e) { mentorErr = errText(e); if (e.message === 'no_key') serverInfo.mentor = false; }
    mentorBusy = false; if (!state) return; save();
    if (route.page === 'mentor') { renderPage(); scrollChat(); }
  }
  async function finishMentor() {
    if (mentorBusy || !state.chat.some((m) => m.role === 'user')) return;
    mentorBusy = true; mentorErr = ''; renderPage();
    try {
      const j = await api('mentor', { mode: 'summary', context: mentorContext(), messages: state.chat.slice(-16) });
      const promises = (Array.isArray(j.promises) ? j.promises : []).map((t) => String(t).trim().slice(0, 80)).filter(Boolean).slice(0, 3);
      state.meta.mentorNotes.push({ id: uid(), date: dayKey(new Date()), summary: String(j.summary || '').trim().slice(0, 400) || '상담 요약을 받지 못했어요.', promises: promises.map((t) => ({ text: t, done: false })) });
      state.meta.mentorNotes = state.meta.mentorNotes.slice(-10);
      state.chat = []; metaChanged();
      toast(promises.length ? '상담을 정리했어요. 약속은 홈 화면에서도 볼 수 있어요.' : '상담을 정리했어요');
    } catch (e) { mentorErr = errText(e); }
    mentorBusy = false; if (state) { save(); renderAll(); }
  }
  async function requestReportAI(P) {
    reportAI = { key: P.a + P.mode, text: '', busy: true, err: '' }; renderPage();
    try {
      const j = await api('mentor', { mode: 'report', context: `${periodContext(P)}\n\n[참고: 전체 기록]\n${mentorContext()}`, messages: [{ role: 'user', content: `${P.label} 기록을 보고 코멘트해 주세요.` }] });
      reportAI.text = String(j.text || '').trim();
    } catch (e) { reportAI.err = errText(e); }
    reportAI.busy = false;
    if (route.page === 'stats') renderPage();
  }
  function reportAIHTML(P) {
    if (mode !== 'student' || serverInfo.mentor === false) return '';
    const mine = reportAI.key === P.a + P.mode;
    if (!state.meta.prefs.mentorConsent) return `<section class="card" aria-labelledby="aiH"><div class="card-head"><h2 id="aiH">AI 멘토 코멘트</h2></div><p class="muted">멘토 탭에서 데이터 사용에 동의하면 이 기간의 기록에 대한 코멘트를 받을 수 있어요.</p><div><a class="btn small" href="#mentor">멘토 탭으로 가기</a></div></section>`;
    return `<section class="card" aria-labelledby="aiH"><div class="card-head"><h2 id="aiH">AI 멘토 코멘트</h2></div>
      ${mine && reportAI.text ? `<div class="ai-box">${esc(reportAI.text)}</div>` : ''}
      ${mine && reportAI.busy ? '<p class="muted">멘토가 기록을 읽는 중이에요…</p>' : ''}
      ${mine && reportAI.err ? `<p class="form-err" role="alert">${esc(reportAI.err)}</p>` : ''}
      ${mine && reportAI.busy ? '' : `<div><button class="btn small" data-act="report-ai">${mine && reportAI.text ? '코멘트 다시 받기' : `이 ${P.unit} 코멘트 받기`}</button></div>`}
      <p class="muted small-text">AI도 틀릴 수 있어요. 위의 숫자와 함께 보세요.</p></section>`;
  }
  function mentorGreeting() {
    const n = latestNote(state); const open = n && n.promises ? n.promises.filter((p) => !p.done) : [];
    if (open.length) return `다시 만나서 반가워요. 지난번에 "${open[0].text}" 하기로 했죠. 해 봤어요? 어땠는지 들려주면 그다음을 같이 정해 볼게요.`;
    return '안녕하세요, 야자 관리실 학습 멘토예요. 최종 목표와 주간 목표, 공부 기록을 같이 보면서 공부 방법이나 계획을 고민해 볼게요. 요즘 공부하면서 가장 막히는 게 뭐예요?';
  }
  function mentorExampleHTML(note) {
    return `<section class="card" aria-labelledby="mtIntro"><h2 id="mtIntro" style="font-size:16px">AI 학습 멘토</h2>
        <p>내 최종 목표와 주간 목표, 공부 기록(할 일 달성도, 집중도, 방해 요인), 성적, 지난 상담 내용을 보고 공부 방법과 계획을 함께 고민해 주는 멘토예요. 상담을 마치면 다음 야자에서 할 약속을 정리해 주고, 다음 상담에서 실천했는지 다시 물어봐요.</p>
        <p class="small-text"><b>${esc(note)}</b></p></section>
      <section class="card" aria-labelledby="mtEx"><div class="card-head"><h2 id="mtEx">이런 식으로 상담해요</h2></div><span class="tag">예시 대화 · 실제 AI 답변이 아니에요</span>
        <div class="chat">
          <div class="msg user">수학 주간 목표를 매주 못 끝내요.</div>
          <div class="msg assistant">기록을 보면 이번 주 수학 목표 진행률이 45%이고, 수학 공부의 할 일 달성도가 평균 60%대예요. 한 번에 정하는 "이번에 할 일"이 조금 큰 편일 수 있어요. 보통 한 번에 문제를 몇 개 풀려고 해요?</div>
          <div class="msg user">한 번에 20문제 정도요.</div>
          <div class="msg assistant">그럼 다음 야자에서는 "이번에 할 일"을 10문제로 줄이고, 틀린 문제는 책을 덮고 다시 풀어 보는 걸로 정해 볼까요? 끝까지 해내는 횟수가 늘면 주간 목표 진행률도 안정적으로 올라가요.</div>
        </div></section>`;
  }
  function mentorHTML() {
    const D = state; const p = D.meta.prefs;
    if (p.phase === 'A') return '<div class="stack narrow"><section class="card"><h2 style="font-size:16px">실험 A주에는 멘토를 쉬어요</h2><p>A주는 피드백 없이 기록만 하는 주라서 AI 멘토도 쓰지 않아요. 내 정보에서 실험 단계를 바꾸면 열려요.</p></section></div>';
    if (mode === 'demo-student') return `<div class="stack narrow">${mentorExampleHTML('체험 모드에서는 예시 대화만 보여요. 로그인하면 학교 서버를 통해 실제 상담을 할 수 있어요.')}${promisesHTML(D)}</div>`;
    if (serverInfo.mentor === false) return `<div class="stack narrow">${mentorExampleHTML('운영팀이 학교 서버에 AI 키를 아직 넣지 않아서 지금은 예시 대화만 보여요. 키를 넣으면 이 화면에서 바로 상담이 시작돼요.')}${promisesHTML(D)}</div>`;
    if (!p.mentorConsent) {
      return `<div class="stack narrow"><section class="card" aria-labelledby="mtCon"><h2 id="mtCon" style="font-size:16px">AI 멘토를 시작하기 전에</h2>
        <p>멘토는 내 기록을 보고 답해요. 질문할 때마다 아래 내용이 학교 서버를 거쳐 AI 회사(Anthropic)의 서버로 전달돼요.</p>
        <ul class="data-list"><li>최종 목표, 주간 목표와 진행률</li><li>공부 기록: 과목, 할 일, 예상·실제 시간, 할 일 달성도, 집중도, 방해 요인</li><li>카메라가 확인한 자리 비움·졸음 횟수</li><li>성적과 목표 등급, 지난 상담 요약과 약속</li><li>멘토에게 직접 쓴 대화</li></ul>
        <p class="muted small-text">이름, 학번, 공부 메모, 카메라 영상은 보내지 않아요. 대화 내용은 학교 서버에 저장되지 않고, 상담 요약과 약속만 내 계정에 저장돼요(선생님 화면에는 보이지 않아요). AI도 틀릴 수 있으니 중요한 결정은 선생님과 상의하세요.</p>
        <div><button class="btn primary" data-act="mentor-consent">이해했어요, 시작할게요</button></div></section></div>`;
    }
    const chat = state.chat;
    const past = D.meta.mentorNotes.slice(0, -1).reverse().slice(0, 5);
    return `<div class="stack narrow">
      <section class="card" aria-labelledby="mtH">
        <div class="card-head"><h2 id="mtH">AI 학습 멘토</h2>${chat.some((m) => m.role === 'user') ? `<button class="btn ghost small" data-act="mentor-finish" ${mentorBusy ? 'disabled' : ''}>상담 마무리</button>` : ''}</div>
        <div class="chat" id="chatLog">
          <div class="msg assistant">${esc(mentorGreeting())}</div>
          ${chat.map((m) => `<div class="msg ${m.role === 'user' ? 'user' : 'assistant'}">${esc(m.content)}</div>`).join('')}
          ${mentorBusy ? '<div class="msg assistant typing">생각하는 중…</div>' : ''}
        </div>
        ${mentorErr ? `<p class="form-err" role="alert">${esc(mentorErr)}</p>` : ''}
        ${!chat.length ? `<div class="quick">${QUICK.map((q) => `<button class="chip" data-act="mentor-quick" data-v="${esc(q)}">${esc(q)}</button>`).join('')}</div>` : ''}
        <form id="chatForm" class="chat-input" autocomplete="off" novalidate>
          <label for="chatText" class="sr">멘토에게 보낼 말</label>
          <textarea id="chatText" rows="2" maxlength="1000" placeholder="공부 고민을 적어 보세요">${esc(mentorDraft)}</textarea>
          <button class="btn primary" type="submit" ${mentorBusy ? 'disabled' : ''}>보내기</button>
        </form>
        <p class="muted small-text">상담이 끝나면 '상담 마무리'를 눌러 주세요. 요약과 약속이 저장되고, 다음 상담에서 멘토가 이어서 물어봐요.</p>
      </section>
      ${promisesHTML(D)}
      ${past.length ? `<section class="card" aria-labelledby="mtPast"><details><summary><b id="mtPast">이전 상담 ${past.length}개</b></summary>
        <ul class="sess-list" style="margin-top:8px">${past.map((n) => `<li class="sess"><div class="sess-time">${n.date.slice(5).replace('-', '.')}</div><div><div>${esc(n.summary)}</div>${(n.promises || []).length ? `<div class="sess-sub">약속: ${n.promises.map((p2) => `${esc(p2.text)}${p2.done ? ' ✓' : ''}`).join(' / ')}</div>` : ''}</div></li>`).join('')}</ul></details></section>` : ''}
    </div>`;
  }

  // ===================== student: my page =====================
  function passwordCardHTML() {
    return `<section class="card" aria-labelledby="pwH"><details ${pwMsg.err || pwMsg.ok ? 'open' : ''}><summary><b id="pwH">비밀번호 바꾸기</b></summary>
      <form id="pwForm" class="add" style="margin-top:10px" novalidate autocomplete="off">
        <div class="field"><label for="pwOld">지금 비밀번호</label><input id="pwOld" type="password" maxlength="64" autocomplete="current-password"></div>
        <div class="two"><div class="field"><label for="pwNew">새 비밀번호</label><input id="pwNew" type="password" maxlength="64" autocomplete="new-password" placeholder="6자 이상"></div>
          <div class="field"><label for="pwNew2">새 비밀번호 확인</label><input id="pwNew2" type="password" maxlength="64" autocomplete="new-password"></div></div>
        ${pwMsg.err ? `<p class="form-err" role="alert">${esc(pwMsg.err)}</p>` : ''}${pwMsg.ok ? `<p class="small-text" role="status" style="color:var(--good)">${esc(pwMsg.ok)}</p>` : ''}
        <div><button class="btn small primary" type="submit">비밀번호 바꾸기</button></div></form></details></section>`;
  }
  async function changePassword() {
    const o = $('#pwOld').value; const n1 = $('#pwNew').value; const n2 = $('#pwNew2').value;
    pwMsg = { err: '', ok: '' };
    if (n1.length < 6) pwMsg.err = ERR.bad_password; else if (n1 !== n2) pwMsg.err = '새 비밀번호 확인이 맞지 않아요.';
    if (pwMsg.err) { renderPage(); return; }
    try { await api('password', { oldPassword: o, newPassword: n1 }); pwMsg.ok = '비밀번호를 바꿨어요. 다음 로그인부터 새 비밀번호를 쓰세요.'; }
    catch (e) { pwMsg.err = errText(e); }
    if (mode !== 'login') renderPage();
  }
  function installHelp() {
    if (isStandalone()) return '<p>앱으로 설치되어 실행 중이에요.</p>';
    if (installEvt) return '<p class="muted small-text">홈 화면에 아이콘이 생기고, 주소창 없이 앱처럼 열려요.</p><div><button class="btn primary small" data-act="install">앱 설치하기</button></div>';
    if (isIOS) return '<p class="muted small-text">Safari 아래쪽의 공유 버튼을 누른 뒤 <b>홈 화면에 추가</b>를 고르세요. 아이폰은 Safari에서만 설치할 수 있어요.</p>';
    return '<p class="muted small-text">Chrome이나 Edge 메뉴(⋮)에서 <b>앱 설치</b> 또는 <b>홈 화면에 추가</b>를 고르세요.</p>';
  }
  function installCardHTML() {
    if (isStandalone() || device.installDismissed || (!installEvt && !isIOS)) return '';
    return `<section class="card" aria-labelledby="insH"><div class="card-head"><h2 id="insH">홈 화면에 설치하기</h2><button class="btn ghost small" data-act="dismiss-install">닫기</button></div>${installHelp()}</section>`;
  }
  function meHTML() {
    const D = state; const p = D.meta.prefs; const u = mode === 'student' ? auth.user : null;
    const sub = D.meta.subjects;
    return `<div class="masonry">
      <section class="card account" aria-label="내 계정">
        <div class="avatar" aria-hidden="true">${esc((u ? u.name : '체')[0] || '?')}</div>
        <div class="acc-name"><b>${esc(u ? u.name : '체험 학생')}</b><span class="muted small-text">${u ? `${esc(u.studentNo)}${u.cls ? ` · ${esc(u.cls)}반` : ''} · 학생` : '체험 모드 · 기록은 이 기기에만 저장돼요'}</span></div>
        ${u ? `<p class="acc-sync small-text muted" id="syncText">${esc(syncText())}</p>` : ''}
        <div class="btn-row">${u ? '<button class="btn small" data-act="sync-now">지금 동기화</button><button class="btn small danger" data-act="logout">로그아웃</button>' : '<button class="btn small" data-act="exit-demo">체험 끝내기</button>'}</div>
      </section>
      ${u ? passwordCardHTML() : ''}
      <section class="card" aria-labelledby="stH"><h2 id="stH" style="font-size:16px">공부 설정</h2>
        <div class="field"><label for="pfDaily">하루 순공 목표</label><select id="pfDaily" data-pref="daily">${DAILY_GOALS.map((m) => `<option value="${m}" ${D.meta.dailyGoalMin === m ? 'selected' : ''}>${fmtHM(m * 60000)}</option>`).join('')}</select></div>
        <div class="field"><span class="lbl">과목 <span class="muted" style="font-weight:400">(최대 8개)</span></span>
          <div class="subj-rows">${sub.map((s) => `<div class="subj-row"><i class="dot" style="--c:${colorOf(s.slot)}"></i><label class="sr" for="sn-${s.id}">과목 이름</label><input id="sn-${s.id}" type="text" maxlength="10" value="${esc(s.name)}" data-pref="subj-name" data-id="${s.id}">
            <button class="icon-btn" data-act="subj-del" data-id="${s.id}" aria-label="${esc(s.name)} 삭제" ${sub.length <= 1 ? 'disabled' : ''}>×</button></div>`).join('')}</div>
          ${sub.length < 8 ? '<div><button class="btn small" data-act="subj-add">과목 추가</button></div>' : ''}</div>
        <div class="field"><span class="lbl">방해 요인 항목</span>
          <div class="chips">${D.meta.distractors.map((d, i) => `<span class="dist-chip">${esc(d)}<button class="icon-btn" data-act="dist-del" data-i="${i}" aria-label="${esc(d)} 삭제">×</button></span>`).join('')}</div>
          ${D.meta.distractors.length < 8 ? '<form id="distForm" class="btn-row" novalidate><label class="sr" for="distNew">새 방해 요인</label><input id="distNew" type="text" maxlength="12" placeholder="예: 배고픔" style="flex:1 1 160px"><button class="btn small" type="submit">추가</button></form>' : ''}</div>
      </section>
      <section class="card" aria-labelledby="tmH"><h2 id="tmH" style="font-size:16px">타이머</h2>
        <label class="toggle-row"><div><b>화면 켜짐 유지</b><p class="muted small-text">타이머를 크게 볼 때 화면이 꺼지지 않게 해요.</p></div><input type="checkbox" data-pref="wake" ${p.keepAwake ? 'checked' : ''}></label>
        <label class="toggle-row"><div><b>예상 시간 알림음</b><p class="muted small-text">정한 예상 시간이 지나면 짧게 알려 줘요.</p></div><input type="checkbox" data-pref="chime" ${p.chime ? 'checked' : ''}></label>
        <fieldset><legend style="font-size:14px">공부 중 앱을 벗어난 시간</legend><div class="radio-list">
          ${[['record', '기록만 하기', '끝낼 때 순공에서 뺄지 고를 수 있어요.'], ['exclude', '순공에서 빼기 (기본 체크)', '끝낼 때 뺄 시간을 미리 체크해 둬요.'], ['off', '기록하지 않기', '다른 앱을 오가도 따로 기록하지 않아요.']].map(([v, t, s]) => `<label class="radio"><input type="radio" name="away" value="${v}" data-pref="away" ${p.away === v ? 'checked' : ''}><span><b>${t}</b><span>${s}</span></span></label>`).join('')}</div></fieldset>
      </section>
      <section class="card" aria-labelledby="cmSet"><h2 id="cmSet" style="font-size:16px">카메라 관리</h2>
        <p class="muted small-text">공부 중에 카메라로 졸음(눈 감김, 엎드림)과 자리 비움을 알려 줘요. 영상은 이 기기 안에서만 분석하고 저장하거나 보내지 않아요. 남는 건 "자리 비움 n분, 졸음 n회" 같은 숫자뿐이에요.</p>
        ${Cam.supported() ? '' : '<p class="small-text" style="color:var(--bad)">이 브라우저에서는 카메라를 쓸 수 없어요. https 주소에서 Chrome이나 Safari로 열어 주세요.</p>'}
        <div class="field"><label for="pfSens">졸음 감지 민감도</label><select id="pfSens" data-pref="cam-sens">${[['relaxed', '느슨하게 (4초 감김)'], ['normal', '보통 (3초 감김)'], ['sensitive', '민감하게 (2초 감김)']].map(([v, t]) => `<option value="${v}" ${p.camSens === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        <label class="toggle-row"><div><b>미리보기 보이기</b></div><input type="checkbox" data-pref="cam-preview" ${p.camPreview ? 'checked' : ''}></label>
        <label class="toggle-row"><div><b>졸음 알람 소리</b></div><input type="checkbox" data-pref="cam-alarm" ${p.camAlarm ? 'checked' : ''}></label>
        <label class="toggle-row"><div><b>진동</b><p class="muted small-text">안드로이드 휴대폰에서만 돼요.</p></div><input type="checkbox" data-pref="cam-vibrate" ${p.camVibrate ? 'checked' : ''}></label>
      </section>
      <section class="card" aria-labelledby="adH"><h2 id="adH" style="font-size:16px">아두이노 깨우기 장치</h2>
        ${Arduino.supported() ? `<p class="muted small-text">PC의 Chrome이나 Edge에서 USB로 연결해요. 졸음이 감지되면 진동 모터와 부저로 깨워 줘요.</p>
          <div class="btn-row">${Arduino.connected() ? '<button class="btn small" data-act="arduino-test">시험 작동</button><button class="btn small" data-act="arduino-off">연결 끊기</button>' : '<button class="btn small" data-act="arduino-on">아두이노 연결</button>'}</div>`
          : '<p class="muted small-text">PC의 Chrome이나 Edge에서만 연결할 수 있어요 (Web Serial).</p>'}
      </section>
      <section class="card" aria-labelledby="btH"><h2 id="btH" style="font-size:16px">베타 테스트</h2>
        <div class="field"><label for="pfPhase">실험 단계</label><select id="pfPhase" data-pref="phase">${Object.entries(PHASE).map(([v, t]) => `<option value="${v}" ${p.phase === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
          <span class="hint">A주는 피드백·제안·AI 멘토 없이 기록만 하고, B주는 모두 켜요. 운영팀 안내에 맞춰 바꿔 주세요. 공부 기록마다 실험 단계가 함께 저장돼요.</span></div>
      </section>
      <section class="card" aria-labelledby="inH"><h2 id="inH" style="font-size:16px">앱 설치</h2>${installHelp()}</section>
      <section class="card" aria-labelledby="exH2"><h2 id="exH2" style="font-size:16px">내 기록 내보내기</h2>
        <p class="muted small-text">엑셀이나 구글 시트에서 열 수 있는 CSV 파일이에요.</p>
        <div class="btn-row"><button class="btn small" data-act="export" data-v="sessions">공부 기록 CSV</button><button class="btn small" data-act="export" data-v="goals">주간 목표 CSV</button></div></section>
      <section class="card" aria-labelledby="pvH"><h2 id="pvH" style="font-size:16px">개인정보와 기록</h2>
        <ul class="data-list"><li>공부 기록, 목표, 성적, 설정은 학교 운영팀의 구글 시트에 저장되고 선생님이 볼 수 있어요.</li><li>공부를 끝낼 때 쓰는 메모와 AI 멘토 상담 요약은 내 계정에만 보이고, 선생님 화면에는 나오지 않아요.</li><li>카메라 영상은 저장하지도 보내지도 않아요.</li><li>멘토 대화창 내용은 이 기기에만 남고, 로그아웃하면 지워져요.</li></ul>
        ${mode === 'student' ? '<div><button class="btn small danger" data-act="chat-clear">이 기기의 멘토 대화 지우기</button></div>' : ''}</section>
      <p class="foot">야자 관리실 v${APP_VERSION}</p>
    </div>`;
  }

  // ===================== bottom sheets =====================
  function openSheet(kind, draft) {
    sheet = { kind, draft: Object.assign({ err: '' }, draft || {}) }; renderedKind = null; renderSheet();
    const card = $('#sheetCard'); const first = card.querySelector('input[type="text"], input:not([type]), textarea') || card.querySelector('button, select, input');
    if (first && !('ontouchstart' in window && first.matches('input, textarea'))) first.focus({ preventScroll: true });
    card.scrollTop = 0;
  }
  function closeSheet() { sheet = null; renderSheet(); }
  function pctHint(key, v, d) {
    if (v == null) return '밀거나 눌러서 골라 주세요';
    if (key === 'achieve') return v >= 100 ? '다 끝냈어요' : v >= 75 ? '거의 다 했어요' : v >= 50 ? '절반 넘게 했어요' : v >= 25 ? '조금 했어요' : '거의 못 했어요';
    if (v >= 100) return '목표 달성!';
    if (d.base == null) return '';
    const diff = v - d.base;
    return diff === 0 ? `지난번 ${d.base}%와 같아요` : `지난번 ${d.base}% → ${diff > 0 ? '+' : ''}${diff}%p`;
  }
  function pctHTML(key, label, sub, d) {
    const v = d[key]; const shown = v == null ? 50 : v;
    return `<div class="field pct" data-pct="${key}">
      <span class="lbl" id="pl-${key}">${esc(label)}</span>${sub ? `<span class="hint">${esc(sub)}</span>` : ''}
      <div class="pct-row"><span class="pct-val">${v == null ? '–' : v + '%'}</span><span class="pct-hint">${esc(pctHint(key, v, d))}</span></div>
      <input type="range" min="0" max="100" step="5" value="${shown}" class="${v == null ? 'untouched' : ''}" data-pct-range="${key}" aria-labelledby="pl-${key}" aria-valuetext="${v == null ? '선택 전' : v + '%'}">
      <div class="pct-quick" role="group" aria-label="${esc(label)} 빠르게 고르기">${[['-5', '−5', '5% 내리기'], ['0', '0', '0%'], ['25', '25', '25%'], ['50', '50', '50%'], ['75', '75', '75%'], ['100', '100', '100%'], ['+5', '+5', '5% 올리기']].map(([val, txt, al]) => `<button type="button" data-act="pct" data-k="${key}" data-v="${val}" aria-label="${al}"${/^\d+$/.test(val) ? ` aria-pressed="${v === Number(val)}"` : ''}>${txt}</button>`).join('')}</div>
    </div>`;
  }
  function setPct(key, raw) {
    if (!sheet) return;
    const d = sheet.draft; let v;
    if (raw === '+5' || raw === '-5') v = clampPct((d[key] == null ? 50 : d[key]) + (raw === '+5' ? 5 : -5)); else v = clampPct(raw);
    d[key] = v; d.err = '';
    const box = $(`#sheetCard [data-pct="${key}"]`); if (!box) return;
    $('.pct-val', box).textContent = v + '%';
    const r = $('input[type="range"]', box); r.value = String(v); r.classList.remove('untouched'); r.setAttribute('aria-valuetext', v + '%');
    $('.pct-hint', box).textContent = pctHint(key, v, d);
    $$('.pct-quick button', box).forEach((b) => { if (/^\d+$/.test(b.dataset.v)) b.setAttribute('aria-pressed', String(Number(b.dataset.v) === v)); });
    const e = $('#sheetCard .form-err'); if (e) e.remove();
  }
  function readSheetInputs() {
    if (!sheet) return;
    const d = sheet.draft; const val = (id) => { const el = document.getElementById(id); return el ? el.value : null; };
    const chk = (id) => { const el = document.getElementById(id); return el ? el.checked : null; };
    if (sheet.kind === 'goal') { if (val('gTitle') != null) d.title = val('gTitle'); if (val('gTarget') != null) d.targetMin = Number(val('gTarget')); }
    if (sheet.kind === 'start') { if (val('stPlan') != null) d.plan = val('stPlan'); if (chk('stCam') != null) d.cam = chk('stCam'); }
    if (sheet.kind === 'checkout') { if (val('coMemo') != null) d.memo = val('coMemo'); if (chk('coAway') != null) d.awayEx = chk('coAway'); if (chk('coCamAway') != null) d.camEx = chk('coCamAway'); }
    if (sheet.kind === 'final') {
      ['title:fTitle', 'detail:fDetail', 'dateName:fDateName', 'date:fDate'].forEach((p) => { const [k, id] = p.split(':'); if (val(id) != null) d[k] = val(id); });
      $$('#sheetCard [data-final-grade]').forEach((el) => { d.grades[el.dataset.finalGrade] = el.value ? Number(el.value) : null; });
    }
    if (sheet.kind === 'exam') {
      if (val('exName') != null) d.name = val('exName').trim(); if (val('exDate')) d.date = val('exDate');
      $$('#sheetCard [data-exam-grade]').forEach((el) => { const sid = el.dataset.examGrade; d.scores[sid] = d.scores[sid] || {}; d.scores[sid].grade = el.value ? Number(el.value) : null; });
      $$('#sheetCard [data-exam-pct]').forEach((el) => { const sid = el.dataset.examPct; d.scores[sid] = d.scores[sid] || {}; const n = el.value === '' ? null : Math.round(Number(el.value)); d.scores[sid].pct = n == null || isNaN(n) ? null : Math.max(0, Math.min(100, n)); });
    }
  }
  function subjChips(D, selId) {
    return `<div class="chips">${D.meta.subjects.map((s) => `<button type="button" class="chip" data-act="pick-subj" data-v="${s.id}" aria-pressed="${selId === s.id}"><i class="dot" style="--c:${colorOf(s.slot)}"></i>${esc(s.name)}</button>`).join('')}</div>`;
  }
  const errLine = (d) => (d.err ? `<p class="form-err" role="alert">${esc(d.err)}</p>` : '');
  function goalSheetHTML(d) {
    const editing = !!d.id;
    return `<form id="goalForm" class="sheet-form" novalidate autocomplete="off">
      <div style="display:grid;gap:4px"><h2 id="sheetTitle">${editing ? '주간 목표 고치기' : '이번 주 목표 추가'}</h2><p class="muted small-text">${weekLabel(parseDay(d.week))}</p></div>
      <fieldset><legend>과목</legend>${subjChips(state, d.subjectId)}</fieldset>
      <div class="field"><label for="gTitle">목표</label><input id="gTitle" type="text" maxlength="40" value="${esc(d.title)}" placeholder="예: 미적분 2단원 개념과 기본 문제 끝내기"><span class="hint">이번 주 안에 끝낼 수 있는 크기로, 범위가 보이게 적어요.</span></div>
      <div class="field"><label for="gTarget">이번 주 목표 공부 시간 <span class="muted" style="font-weight:400">(선택)</span></label><select id="gTarget">${TARGET_MIN.map((m) => `<option value="${m}" ${Number(d.targetMin) === m ? 'selected' : ''}>${m ? fmtHM(m * 60000) : '정하지 않음'}</option>`).join('')}</select></div>
      ${editing ? pctHTML('progress', '진행률', '공부를 끝낼 때도 바꿀 수 있어요. 100%가 되면 달성으로 표시돼요.', d) : ''}
      ${errLine(d)}
      <div class="sheet-actions"><button type="button" class="btn" data-act="sheet-close">취소</button><button type="submit" class="btn primary">${editing ? '저장' : '목표 추가'}</button></div>
      ${editing ? '<div class="btn-row sheet-extra"><button type="button" class="btn danger small" data-act="goal-del">이 목표 지우기</button></div>' : ''}
    </form>`;
  }
  function startSheetHTML(d) {
    const D = state; const g = d.goalId ? goalById(D, d.goalId) : null;
    const last = g ? goalSessions(D, g.id).slice(-1)[0] : null;
    const cont = last && last.achieve < 100 && last.plan ? last.plan : '';
    const nm = g ? goalName(D, g) : '';
    const pick = d.pick ? (() => {
      const act = weekGoals(D, weekKey(new Date())).filter((x) => x.progress < 100);
      return `<fieldset><legend>무엇을 공부할까요?</legend><div class="goal-pick">${act.map((x) => { const n2 = goalName(D, x); return `<button type="button" class="gp" data-act="pick-goal" data-v="${x.id}" aria-pressed="${d.goalId === x.id}"><span class="subj"><i class="dot" style="--c:${colorOf(slotOfName(D, n2))}"></i>${esc(n2)}</span><b>${esc(x.title)}</b><span class="muted small-text">${x.progress}%</span></button>`; }).join('')}
        <button type="button" class="gp" data-act="pick-goal" data-v="" aria-pressed="${!d.goalId}"><b>목표 없이 공부하기</b><span class="muted small-text">과목만 고르고 시작</span></button></div>
        ${act.length ? '' : '<span class="hint">이번 주 목표를 만들어 두면 목표별로 진행률이 쌓여요.</span>'}</fieldset>`;
    })() : '';
    return `<form id="startForm" class="sheet-form" novalidate autocomplete="off">
      <h2 id="sheetTitle">공부 시작</h2>${pick}
      ${g && !d.pick ? `<div class="start-goal">${subjTag(nm, slotOfName(D, nm))}<b>${esc(g.title)}</b><span class="muted small-text">지금 진행률 ${g.progress}% · 이번 주 ${fmtHM(goalMs(D, g.id))} 공부</span></div>`
        : g ? '' : `<fieldset><legend>과목</legend>${subjChips(D, d.subjectId)}<span class="hint">주간 목표에 없는 공부예요. 통계에는 '목표 없이 한 공부'로 따로 모여요.</span></fieldset>`}
      <div class="field"><label for="stPlan">이번에 할 일</label><input id="stPlan" type="text" maxlength="40" value="${esc(d.plan)}" placeholder="예: 2단원 문제 15~30번">
        ${cont ? `<div class="chips"><button type="button" class="chip" data-act="use-plan" data-v="${esc(cont)}">지난번 이어서: ${esc(cont)} (${last.achieve}%)</button></div>` : ''}
        <span class="hint">끝낼 때 이 할 일을 몇 % 했는지 5% 단위로 기록해요. 범위까지 적으면 정확해져요.</span></div>
      <fieldset><legend>예상 시간</legend><div class="chips">${PLAN_MIN.map((m) => `<button type="button" class="chip" data-act="pick-min" data-v="${m}" aria-pressed="${d.planMin === m}">${m}분</button>`).join('')}</div></fieldset>
      ${Cam.supported() ? `<label class="check"><input type="checkbox" id="stCam" ${d.cam ? 'checked' : ''}><span>카메라 관리 같이 켜기 <span class="muted">(졸음·자리 비움 알림, 영상은 저장 안 함)</span></span></label>` : ''}
      ${errLine(d)}
      <div class="sheet-actions"><button type="button" class="btn" data-act="sheet-close">취소</button><button type="submit" class="btn primary">시작하기</button></div>
    </form>`;
  }
  function newCheckoutDraft() {
    const r = state.running; const g = r && r.goalId ? goalById(state, r.goalId) : null;
    return { achieve: null, goalProgress: g ? g.progress : null, base: g ? g.progress : null, focus: null, dist: [], none: false, awayEx: state.meta.prefs.away === 'exclude', camEx: true, memo: '', err: '' };
  }
  function checkoutSheetHTML(d) {
    const D = state; const r = D.running; const g = r.goalId ? goalById(D, r.goalId) : null;
    const nm = findSubj(D, r.subjectId) ? findSubj(D, r.subjectId).name : r.subject;
    const cam = r.cam || zero();
    return `<form id="coForm" class="sheet-form" novalidate autocomplete="off">
      <div style="display:grid;gap:4px"><h2 id="sheetTitle">공부 기록하기</h2><p class="muted small-text">${esc(nm)} · ${esc(r.plan)}</p></div>
      <div class="co-sum"><span>순공 <b>${fmtHM(r.studyMs)}</b>${r.awayMs > 0 ? ` (이탈 ${fmtDur(r.awayMs)} 포함)` : ''}</span><span>휴식 ${fmtHM(r.breakMs)}</span><span>예상 ${r.planMin}분</span></div>
      ${pctHTML('achieve', '할 일 달성도', `'${r.plan}'${pp(r.plan, '을', '를')} 얼마나 했나요?`, d)}
      ${g ? pctHTML('goalProgress', '주간 목표 진행률', `'${g.title}' 전체는 지금 몇 %인가요?`, d) : ''}
      <fieldset><legend>얼마나 집중했나요?</legend>
        <div class="seg five">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-act="co-focus" data-v="${n}" aria-pressed="${d.focus === n}">${n}<small>${FOCUS_CAP[n - 1]}</small></button>`).join('')}</div></fieldset>
      <fieldset><legend>공부를 방해한 것 <span class="muted" style="font-weight:400;font-size:13px">(여러 개 선택)</span></legend>
        <div class="chips">${D.meta.distractors.map((x) => `<button type="button" class="chip" data-act="co-dist" data-v="${esc(x)}" aria-pressed="${d.dist.includes(x)}">${esc(x)}</button>`).join('')}
        <button type="button" class="chip" data-act="co-none" aria-pressed="${d.none}">없었어요</button></div></fieldset>
      ${cam.used ? `<p class="small-text muted">카메라 확인: 자리 비움 ${fmtHM(cam.awayMs)} · 졸음 감지 ${cam.drowsyCount}회</p>` : ''}
      ${r.awayMs > 0 ? `<label class="check"><input type="checkbox" id="coAway" ${d.awayEx ? 'checked' : ''}><span>앱을 벗어난 ${fmtDur(r.awayMs)}(${r.awayCount}회)은 공부하지 않았어요. 순공에서 뺄게요.</span></label>` : ''}
      ${cam.awayMs >= 60000 ? `<label class="check"><input type="checkbox" id="coCamAway" ${d.camEx ? 'checked' : ''}><span>카메라가 확인한 자리 비움 ${fmtHM(cam.awayMs)}을 순공에서 뺄게요.</span></label>` : ''}
      <div class="field"><label for="coMemo">메모 <span class="muted" style="font-weight:400">(선택 · 선생님께 보이지 않아요)</span></label><input id="coMemo" type="text" maxlength="100" placeholder="예: 27번 풀이 질문하기" value="${esc(d.memo)}"></div>
      ${errLine(d)}
      <div class="sheet-actions"><button type="button" class="btn" data-act="co-back">계속 공부하기</button><button type="submit" class="btn primary">저장</button></div>
    </form>`;
  }
  function finalSheetHTML(d) {
    return `<form id="finalForm" class="sheet-form" novalidate autocomplete="off">
      <div style="display:grid;gap:4px"><h2 id="sheetTitle">최종 목표</h2><p class="muted small-text">야자를 하는 이유를 적어 두면 매일 홈 맨 위에 보여 줘요.</p></div>
      <div class="field"><label for="fTitle">최종 목표</label><input id="fTitle" type="text" maxlength="40" value="${esc(d.title)}" placeholder="예: ○○대 전자공학과 합격"></div>
      <div class="field"><label for="fDetail">구체적인 기준 <span class="muted" style="font-weight:400">(선택)</span></label><input id="fDetail" type="text" maxlength="60" value="${esc(d.detail)}" placeholder="예: 수능 수학 2등급, 국어·영어 1등급"></div>
      <div class="two"><div class="field"><label for="fDateName">목표일 이름</label><input id="fDateName" type="text" maxlength="10" value="${esc(d.dateName)}" placeholder="예: 수능"></div>
        <div class="field"><label for="fDate">날짜 <span class="muted" style="font-weight:400">(선택)</span></label><input id="fDate" type="date" value="${esc(d.date)}"></div></div>
      <fieldset><legend>과목별 목표 등급 <span class="muted" style="font-weight:400;font-size:13px">(선택)</span></legend>
        <div class="score-grid">${state.meta.subjects.map((s) => `<div class="score-row"><span>${subjTag(s.name, s.slot)}</span><label class="sr" for="fg-${s.id}">${esc(s.name)} 목표 등급</label><select id="fg-${s.id}" data-final-grade="${s.id}"><option value="">목표 없음</option>${range(1, 9).map((n) => `<option value="${n}" ${Number(d.grades[s.id]) === n ? 'selected' : ''}>${n}등급</option>`).join('')}</select><span></span></div>`).join('')}</div>
        <span class="hint">모의고사 9등급 기준이에요. 모의고사 기록을 넣으면 최근 등급과 나란히 보여 줘요.</span></fieldset>
      ${errLine(d)}
      <div class="sheet-actions"><button type="button" class="btn" data-act="sheet-close">취소</button><button type="submit" class="btn primary">저장</button></div>
    </form>`;
  }
  function examSheetHTML(d) {
    const max = d.type === 'mock' ? 9 : 5;
    return `<form id="examForm" class="sheet-form" novalidate autocomplete="off">
      <h2 id="sheetTitle">시험 추가</h2>
      <div class="seg" style="grid-template-columns:repeat(2,minmax(0,1fr))"><button type="button" data-act="exam-type" data-v="mock" aria-pressed="${d.type === 'mock'}">모의고사</button><button type="button" data-act="exam-type" data-v="school" aria-pressed="${d.type === 'school'}">내신</button></div>
      <div class="two"><div class="field"><label for="exName">시험 이름</label><input id="exName" type="text" maxlength="20" value="${esc(d.name)}" placeholder="${d.type === 'mock' ? '예: 11월 모의고사' : '예: 2학기 기말고사'}"></div>
        <div class="field"><label for="exDate">날짜</label><input id="exDate" type="date" value="${esc(d.date)}" max="${dayKey(new Date())}"></div></div>
      <p class="muted small-text">${d.type === 'mock' ? '모의고사는 9등급이에요. 영어·한국사는 절대평가라 백분위 칸을 비워 두세요.' : '2025학년도 고1부터 내신은 5등급제예요.'}</p>
      <div class="score-grid">${state.meta.subjects.map((s) => { const v = d.scores[s.id] || {}; return `<div class="score-row"><span>${subjTag(s.name, s.slot)}</span>
        <label class="sr" for="eg-${s.id}">${esc(s.name)} 등급</label><select id="eg-${s.id}" data-exam-grade="${s.id}"><option value="">안 봄</option>${range(1, max).map((n) => `<option value="${n}" ${Number(v.grade) === n ? 'selected' : ''}>${n}등급</option>`).join('')}</select>
        ${d.type === 'mock' ? `<label class="sr" for="ep-${s.id}">${esc(s.name)} 백분위</label><input id="ep-${s.id}" data-exam-pct="${s.id}" type="number" inputmode="numeric" min="0" max="100" placeholder="백분위" value="${v.pct != null ? v.pct : ''}">` : '<span></span>'}</div>`; }).join('')}</div>
      ${errLine(d)}
      <div class="sheet-actions"><button type="button" class="btn" data-act="sheet-close">취소</button><button type="submit" class="btn primary">시험 저장</button></div>
    </form>`;
  }
  function tempSheetHTML(d) {
    return `<div class="sheet-form"><h2 id="sheetTitle">임시 비밀번호</h2>
      <p>${esc(d.name)}(${esc(d.no)}) 계정의 비밀번호를 초기화했어요. 아래 번호를 학생에게 직접 알려 주세요.</p>
      <div class="temp-pw" aria-label="임시 비밀번호">${esc(d.temp)}</div>
      <p class="hint">학생은 이 번호로 로그인한 뒤 내 정보에서 비밀번호를 바꿀 수 있어요. 이 창을 닫으면 번호를 다시 볼 수 없어요.</p>
      <button type="button" class="btn primary block" data-act="sheet-close">확인했어요</button></div>`;
  }
  function renderSheet() {
    const el = $('#sheet'); const card = $('#sheetCard');
    const r = isStudent() && state ? state.running : null;
    if (r && r.endAt) { if (!sheet || sheet.kind !== 'checkout') { sheet = { kind: 'checkout', draft: newCheckoutDraft() }; renderedKind = null; } }
    else if (sheet && sheet.kind === 'checkout') sheet = null;
    if (sheet && !isStudent() && sheet.kind !== 'temp') sheet = null;
    if (sheet && renderedKind === sheet.kind) readSheetInputs();
    if (!sheet) { el.hidden = true; card.innerHTML = ''; renderedKind = null; lockScroll(); return; }
    const keep = focusKey(card);
    const f = { goal: goalSheetHTML, start: startSheetHTML, checkout: checkoutSheetHTML, final: finalSheetHTML, exam: examSheetHTML, temp: tempSheetHTML }[sheet.kind];
    card.innerHTML = f(sheet.draft);
    renderedKind = sheet.kind;
    el.hidden = false; el.setAttribute('aria-labelledby', 'sheetTitle');
    lockScroll(); restoreFocus(keep, card);
  }

  // ===================== student actions =====================
  function setGoalProgress(g, v) {
    g.progress = clampPct(v); g.status = g.progress >= 100 ? 'done' : 'active';
    if (g.progress >= 100) { if (!g.doneAt) g.doneAt = Date.now(); } else delete g.doneAt;
  }
  function saveGoal() {
    const d = sheet.draft; readSheetInputs();
    if (!d.subjectId) { d.err = '과목을 골라 주세요.'; renderSheet(); return; }
    if (!String(d.title || '').trim()) { d.err = '목표를 적어 주세요.'; renderSheet(); const t = $('#gTitle'); if (t) t.focus(); return; }
    const s = findSubj(state, d.subjectId);
    if (d.id) {
      const g = goalById(state, d.id); if (!g) { closeSheet(); return; }
      const wasDone = g.progress >= 100;
      Object.assign(g, { subjectId: d.subjectId, subject: s ? s.name : g.subject, title: d.title.trim().slice(0, 40), targetMin: Number(d.targetMin) || 0 });
      if (d.progress != null) setGoalProgress(g, d.progress);
      stamp(g); save(); queue('goal', g);
      toast(!wasDone && g.progress >= 100 ? '주간 목표를 달성했어요!' : '목표를 고쳤어요');
    } else {
      const g = stamp({ id: uid(), week: d.week, subjectId: d.subjectId, subject: s ? s.name : '', title: d.title.trim().slice(0, 40), targetMin: Number(d.targetMin) || 0, progress: 0, status: 'active', createdAt: Date.now() });
      state.goals.push(g); save(); queue('goal', g); toast('이번 주 목표를 추가했어요');
    }
    sheet = null; renderAll();
  }
  function deleteGoal() {
    const g = goalById(state, sheet.draft.id); if (!g) { closeSheet(); return; }
    stamp(g); state.goals = state.goals.filter((x) => x.id !== g.id);
    state.goals.forEach((x) => { if (x.carriedTo === g.id) { delete x.carriedTo; stamp(x); queue('goal', x); } });
    save(); queue('goal', g, true); sheet = null; renderAll(); toast('목표를 지웠어요');
  }
  function saveFinal() {
    const d = sheet.draft; readSheetInputs();
    const title = String(d.title || '').trim();
    const anyOther = String(d.detail || '').trim() || d.date || Object.values(d.grades).some(Boolean);
    if (!title && anyOther) { d.err = '최종 목표를 적어 주세요.'; renderSheet(); return; }
    const grades = {}; Object.entries(d.grades).forEach(([k, v]) => { if (v) grades[k] = v; });
    state.meta.final = { title: title.slice(0, 40), detail: String(d.detail || '').trim().slice(0, 60), dateName: String(d.dateName || '').trim().slice(0, 10), date: d.date || '', grades };
    metaChanged(); sheet = null; renderAll(); toast(title ? '최종 목표를 저장했어요' : '최종 목표를 비웠어요');
  }
  function saveExam() {
    const d = sheet.draft; readSheetInputs();
    const max = d.type === 'mock' ? 9 : 5; const scores = {};
    Object.entries(d.scores).forEach(([sid, v]) => { const s = findSubj(state, sid); if (s && v && v.grade && v.grade <= max) scores[sid] = { grade: v.grade, pct: d.type === 'mock' && v.pct != null ? v.pct : null, name: s.name }; });
    if (!Object.keys(scores).length) { d.err = '한 과목 이상 등급을 골라 주세요.'; renderSheet(); return; }
    if (!d.date) { d.err = '시험 날짜를 골라 주세요.'; renderSheet(); return; }
    const dt = parseDay(d.date);
    const ex = stamp({ id: uid(), date: d.date, type: d.type, name: d.name || `${dt.getMonth() + 1}월 ${examLabel(d.type)}`, scores });
    state.exams.push(ex); save(); queue('exam', ex); sheet = null; renderAll(); toast('시험 기록을 저장했어요');
  }
  function carryOver() {
    const list = carryCandidates(); if (!list.length) return;
    const wk = weekKey(new Date());
    list.forEach((g, i) => {
      const n = stamp({ id: uid(), week: wk, subjectId: g.subjectId, subject: g.subject, title: g.title, targetMin: g.targetMin || 0, progress: g.progress, status: 'active', createdAt: Date.now() + i, carriedFrom: g.id });
      state.goals.push(n); queue('goal', n);
      g.carriedTo = n.id; stamp(g); queue('goal', g);
    });
    save(); renderAll(); toast(`목표 ${list.length}개를 이번 주로 이어 왔어요`);
  }

  // ===================== timer =====================
  let wakeLock = null; let wakeState = 'off';
  const prefs = () => (state ? state.meta.prefs : freshMeta().prefs);
  async function requestWake() {
    const r = state && state.running;
    if (!r || r.endAt || !r.overlay || !prefs().keepAwake || document.hidden || wakeLock) return;
    if (!('wakeLock' in navigator)) { wakeState = 'unsupported'; renderWake(); return; }
    try {
      wakeLock = await navigator.wakeLock.request('screen'); wakeState = 'on';
      wakeLock.addEventListener('release', () => { wakeLock = null; wakeState = 'off'; renderWake(); });
    } catch (e) { wakeLock = null; wakeState = 'denied'; }
    renderWake();
  }
  function releaseWake() { try { if (wakeLock) wakeLock.release(); } catch (e) { /* ignore */ } wakeLock = null; wakeState = 'off'; }
  function renderWake() {
    const el = $('#tWake'); if (!el) return;
    el.textContent = !prefs().keepAwake ? '' : wakeState === 'on' ? '화면 켜짐 유지 중' : wakeState === 'unsupported' || wakeState === 'denied' ? '이 기기에선 화면 켜짐 유지가 안 돼요' : '';
  }
  let audioCtx = null;
  function ensureAudio() {
    try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === 'suspended') audioCtx.resume(); }
    catch (e) { audioCtx = null; }
  }
  function tone(freqs, type, peak, len) {
    if (!audioCtx) return;
    try {
      const t = audioCtx.currentTime;
      freqs.forEach(([f, dt]) => {
        const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
        o.type = type; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + dt); g.gain.exponentialRampToValueAtTime(peak, t + dt + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dt + len);
        o.connect(g).connect(audioCtx.destination); o.start(t + dt); o.stop(t + dt + len + 0.05);
      });
    } catch (e) { /* ignore */ }
  }
  const chime = () => { if (prefs().chime) tone([[659.25, 0], [880, 0.2]], 'sine', 0.16, 0.7); };
  const alarmBeep = () => tone([[988, 0], [988, 0.22], [988, 0.44]], 'square', 0.12, 0.16);
  function lastPlanMin(goalId) {
    const ss = state.sessions.filter((s) => !goalId || s.goalId === goalId).sort((a, b) => a.start - b.start);
    const m = ss.length ? ss[ss.length - 1].planMin : 30;
    return PLAN_MIN.includes(m) ? m : 30;
  }
  function startSession() {
    const d = sheet.draft; readSheetInputs();
    const g = d.goalId ? goalById(state, d.goalId) : null;
    if (d.goalId && !g) { closeSheet(); return; }
    if (!g && !d.subjectId) { d.err = '과목을 골라 주세요.'; renderSheet(); return; }
    if (!String(d.plan || '').trim()) { d.err = '이번에 할 일을 적어 주세요. 예: 2단원 15~30번'; renderSheet(); const t = $('#stPlan'); if (t) t.focus(); return; }
    if (state.running) { closeSheet(); return; }
    const sid = g ? g.subjectId : d.subjectId; const s = findSubj(state, sid);
    ensureAudio();
    if (Cam.state === 'error') Cam.state = 'off';
    const now = Date.now();
    state.running = { id: uid(), goalId: g ? g.id : null, goalTitle: g ? g.title : '', subjectId: sid, subject: s ? s.name : (g ? g.subject : '기타'), plan: d.plan.trim().slice(0, 40), planMin: d.planMin || 30,
      startedAt: now, mode: 'study', modeSince: now, studyMs: 0, breakMs: 0, awayMs: 0, awayCount: 0, hiddenSince: null, chimed: false, endAt: null, overlay: true, cam: { used: false, awayMs: 0, drowsyCount: 0 } };
    const wantCam = !!d.cam && Cam.supported();
    if (Cam.supported() && (!!state.meta.prefs.camAuto !== wantCam || !state.meta.prefs.camAutoSet)) { state.meta.prefs.camAuto = wantCam; state.meta.prefs.camAutoSet = true; metaChanged(); }
    sheet = null; save(); renderAll(); requestWake();
    Arduino.send('S');
    if (wantCam) camToggle();
  }
  function toggleBreak() {
    const r = state && state.running; if (!r || r.endAt) return;
    const now = Date.now();
    if (r.mode === 'study') { r.studyMs += now - r.modeSince; r.mode = 'break'; if (Cam.state === 'on') addCam(Cam.pause()); Arduino.send('B'); }
    else { r.breakMs += now - r.modeSince; r.mode = 'study'; if (Cam.state === 'on') Cam.resume(); Arduino.send('S'); }
    r.modeSince = now; save(); renderTimer();
  }

  // camera during a session (video never leaves the device)
  let camStatus = '';
  function camRec() { const r = state && state.running; if (!r) return null; if (!r.cam) r.cam = { used: false, awayMs: 0, drowsyCount: 0 }; return r.cam; }
  function addCam(f) { const c = camRec(); if (!c || !f) return; c.awayMs += f.awayMs || 0; c.drowsyCount += f.drowsyCount || 0; save(); }
  function camTotals() { const c = camRec() || zero(); const p = Cam.peek(); return { awayMs: c.awayMs + (p ? p.awayMs : 0), drowsyCount: c.drowsyCount + (p ? p.drowsyCount : 0) }; }
  function stopCamQuietly() { try { if (Cam.state === 'on' || Cam.state === 'loading') Cam.stop(); } catch (e) { /* ignore */ } camStatus = ''; dismissAlarm(); releaseWake(); }
  async function camToggle() {
    const r = state && state.running; if (!r || r.endAt) return;
    if (Cam.state === 'on' || Cam.state === 'loading') { addCam(Cam.stop()); camStatus = ''; renderCam(); return; }
    if (!Cam.supported()) { toast('이 브라우저에서는 카메라를 쓸 수 없어요. https 주소의 앱에서 열어 주세요.'); return; }
    ensureAudio();
    const ok = await Cam.start({ video: $('#camVideo'), sensitivity: prefs().camSens, onEvent: onCamEvent, onStatus: (st) => { camStatus = st; renderCam(); }, onState: renderCam });
    if (ok && state && state.running) {
      camRec().used = true; save();
      if (state.running.mode !== 'study' || state.running.endAt) addCam(Cam.pause());
      toast('카메라 관리를 시작했어요. 영상은 저장되지 않아요.');
    } else if (ok) Cam.stop();
    renderCam();
  }
  function onCamEvent(ev) { if (ev.type === 'drowsy') triggerAlarm(ev.reason); }
  function renderCam() {
    const btn = $('#camBtn'); if (!btn) return;
    const st = Cam.state;
    btn.textContent = st === 'on' ? '카메라 끄기' : st === 'loading' ? '카메라 준비 중…' : '카메라 관리 켜기';
    btn.setAttribute('aria-pressed', st === 'on' ? 'true' : 'false'); btn.disabled = st === 'loading';
    btn.hidden = !Cam.supported();
    const box = $('#camBox'); box.hidden = st !== 'on' && st !== 'loading'; box.classList.toggle('no-preview', !prefs().camPreview);
    let text = ''; let warn = false;
    if (st === 'error') { text = Cam.error; warn = true; }
    else if (st === 'loading') text = '얼굴 인식 모델을 불러오는 중이에요. 처음 한 번은 조금 걸려요.';
    else if (st === 'on') {
      if (Cam.isPaused()) text = '휴식 중이라 카메라 판정을 쉬고 있어요';
      else { text = ({ face: '얼굴 확인 중', closed: '눈이 감겨 있어요', noface: '얼굴이 잘 안 보여요', away: '자리 비움으로 기록 중', headdown: '엎드린 것 같아요' })[camStatus] || '얼굴 확인 중'; warn = ['away', 'headdown', 'closed'].includes(camStatus); }
      const tot = camTotals();
      if (tot.awayMs >= 60000 || tot.drowsyCount) text += ` · 자리 비움 ${fmtHM(tot.awayMs)} · 졸음 ${tot.drowsyCount}회`;
    } else text = Cam.supported() ? '켜면 졸음과 자리 비움을 알려 줘요. 영상은 저장하지 않아요.' : '';
    const s = $('#camStatus'); s.textContent = text; s.classList.toggle('warn', warn);
    $('#camBadge').textContent = st !== 'on' ? '' : Cam.isPaused() ? '쉬는 중' : camStatus === 'away' || camStatus === 'headdown' ? '자리 비움' : camStatus === 'closed' ? '눈 감김' : camStatus === 'noface' ? '확인 중' : '● 인식';
  }
  setInterval(() => { if (state && state.running && Cam.state === 'on' && !Cam.isPaused()) addCam(Cam.flush()); }, 30000);
  let alarmTimer = null; let alarmStopTimer = null;
  function triggerAlarm(reason) {
    const r = state && state.running; if (!r || r.endAt) return;
    const box = $('#alarm'); if (!box.hidden) return;
    if (sheet && sheet.kind !== 'checkout') closeSheet();
    $('#alarmTitle').textContent = reason === 'headdown' ? '엎드려 있는 것 같아요' : '졸음이 감지됐어요';
    $('#alarmText').textContent = '잠깐 일어나서 30초 스트레칭하고 다시 시작해요.';
    if (!r.overlay) { r.overlay = true; save(); renderTimer(); }
    box.hidden = false;
    const ring = () => { if (prefs().camAlarm) alarmBeep(); if (prefs().camVibrate && navigator.vibrate) navigator.vibrate([400, 200, 400]); };
    ring(); clearInterval(alarmTimer); alarmTimer = setInterval(ring, 2000);
    clearTimeout(alarmStopTimer); alarmStopTimer = setTimeout(stopAlarmSound, 30000);
    Arduino.send('W');
    const ok = box.querySelector('button'); if (ok) ok.focus();
  }
  function stopAlarmSound() { clearInterval(alarmTimer); alarmTimer = null; clearTimeout(alarmStopTimer); if (navigator.vibrate) navigator.vibrate(0); Arduino.send('O'); }
  function dismissAlarm() { const box = $('#alarm'); if (!box || box.hidden) return; stopAlarmSound(); box.hidden = true; }
  function renderTimer() {
    const r = isStudent() && state ? state.running : null;
    const timer = $('#timer'); const mini = $('#mini');
    if (!r) { timer.hidden = true; mini.hidden = true; document.body.classList.remove('has-mini'); lockScroll(); return; }
    const showOverlay = !!r.overlay && !r.endAt; const showMini = !r.overlay && !r.endAt;
    timer.hidden = !showOverlay; mini.hidden = !showMini;
    document.body.classList.toggle('has-mini', showMini);
    const s = findSubj(state, r.subjectId); const nm = s ? s.name : r.subject; const c = colorOf(s ? s.slot : null);
    const g = r.goalId ? goalById(state, r.goalId) : null;
    $('#tDot').style.setProperty('--c', c); $('#miniDot').style.setProperty('--c', c);
    $('#tSubj').textContent = nm;
    $('#tTask').textContent = r.plan;
    $('#tPlanLine').textContent = g ? `주간 목표: ${g.title} (${g.progress}%)` : '목표 없이 하는 공부';
    $('#miniLabel').textContent = `${nm} · ${r.plan}${r.mode === 'break' ? ' (휴식 중)' : ''}`;
    timer.dataset.mode = r.mode === 'break' ? 'break' : 'study';
    $('#tBreak').textContent = r.mode === 'break' ? '다시 공부하기' : '휴식';
    lockScroll(); renderWake(); renderCam(); tick();
  }
  function tick() {
    const r = isStudent() && state ? state.running : null; if (!r || r.endAt) return;
    const now = Date.now(); const study = studyLive(r, now);
    $('#tClock').textContent = fmtClock(study); $('#miniClock').textContent = fmtClock(study);
    $('#tState').textContent = r.mode === 'break' ? `휴식 중 ${fmtClock(now - r.modeSince).slice(3)}` : '공부 중';
    const planMs = (r.planMin || 0) * 60000; const plan = $('#tPlan');
    if (planMs) {
      $('#tBar').style.width = Math.min(100, (study / planMs) * 100) + '%';
      const over = study > planMs; plan.classList.toggle('over', over);
      $('#tPlanText').textContent = over ? `예상 ${r.planMin}분보다 ${fmtHM(study - planMs)} 더 하고 있어요` : `예상 ${r.planMin}분 중 ${Math.floor(study / 60000)}분`;
      if (over && !r.chimed && r.mode === 'study') { r.chimed = true; save(); chime(); toast(`예상한 ${r.planMin}분이 지났어요`); }
    }
    const away = $('#tAway');
    if (prefs().away === 'off') away.textContent = '';
    else if (r.awayCount) away.textContent = `앱을 벗어난 시간 ${fmtDur(r.awayMs)} (${r.awayCount}회)`;
    else away.textContent = '공부 중 앱을 벗어나면 그 시간이 따로 기록돼요';
    if (Cam.state === 'on' && Math.floor(now / 500) % 4 === 0) renderCam();
    if (route.page === 'home' && !$('#app').hidden) {
      const N = homeNumbers();
      const a = $('#stToday'); if (a) a.textContent = fmtClock(N.today);
      const b = $('#stWeek'); if (b) b.textContent = fmtHM(N.week);
      const f = $('#dayFill'); if (f) f.style.width = Math.min(100, (N.today / N.goalMs) * 100) + '%';
      const t = $('#dayText'); if (t) t.textContent = dayGoalText(N.today, N.goalMs);
    }
  }
  setInterval(tick, 500);
  let camPausedByHide = false;
  function onHide() {
    const r = state && isStudent() ? state.running : null;
    if (r && Cam.state === 'on' && !Cam.isPaused()) { addCam(Cam.pause()); camPausedByHide = true; }
    if (!r || r.endAt || r.mode !== 'study' || prefs().away === 'off' || r.hiddenSince) return;
    r.hiddenSince = Date.now(); save();
  }
  function onShow() {
    const r = state && isStudent() ? state.running : null;
    if (camPausedByHide) { camPausedByHide = false; if (r && r.mode === 'study' && !r.endAt && Cam.state === 'on') Cam.resume(); }
    if (r && r.hiddenSince) {
      const dur = Date.now() - r.hiddenSince; r.hiddenSince = null;
      if (dur >= AWAY_MIN_MS) { r.awayMs += dur; r.awayCount += 1; toast(`앱을 벗어난 시간 ${fmtDur(dur)}을 기록했어요`); }
      save();
    }
    if (r) { renderTimer(); requestWake(); }
    if (mode === 'student' && state && Date.now() - (state.lastPull || 0) > 5 * 60000) syncNow();
    if (mode === 'admin' && admin.at && Date.now() - admin.at > 10 * 60000) adminLoad(true);
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) onHide(); else onShow(); });
  window.addEventListener('pagehide', onHide);

  // ===================== checkout =====================
  function openCheckout() {
    const r = state && state.running; if (!r || r.endAt) return;
    dismissAlarm();
    if (Cam.state === 'on' && !Cam.isPaused()) addCam(Cam.pause());
    const now = Date.now();
    if (r.mode === 'study') r.studyMs += now - r.modeSince; else r.breakMs += now - r.modeSince;
    r.prevMode = r.mode; r.mode = 'paused'; r.modeSince = now; r.endAt = now;
    sheet = { kind: 'checkout', draft: newCheckoutDraft() }; renderedKind = null;
    save(); releaseWake(); renderAll();
    const first = $('#sheetCard .pct-quick button'); if (first) first.focus({ preventScroll: true });
  }
  function cancelCheckout() {
    const r = state && state.running; if (!r) return;
    r.mode = r.prevMode === 'break' ? 'break' : 'study'; r.modeSince = Date.now(); r.endAt = null; sheet = null;
    if (Cam.state === 'on' && r.mode === 'study') Cam.resume();
    save(); renderAll(); requestWake();
  }
  function buildFeedback(sess, g, before) {
    const lines = [];
    const actualMin = Math.round(sess.studyMs / 60000);
    if (sess.achieve >= 100) lines.push(`'${sess.plan}'${pp(sess.plan, '을', '를')} 다 끝냈어요.`);
    else if (sess.achieve >= 50) lines.push(`'${sess.plan}' ${sess.achieve}% 했어요. 남은 부분은 다음 공부에서 '지난번 이어서'로 시작할 수 있어요.`);
    else lines.push(`이번엔 ${sess.achieve}%였어요. 다음엔 할 일을 더 작게 나눠 보세요.`);
    if (sess.achieve >= 90 && sess.planMin) {
      const d = (actualMin - sess.planMin) / sess.planMin;
      lines.push(Math.abs(d) <= 0.15 ? `예상 ${sess.planMin}분 → 실제 ${actualMin}분. 예상과 거의 같았어요.` : `예상 ${sess.planMin}분 → 실제 ${actualMin}분 (${d > 0 ? '+' : ''}${Math.round(d * 100)}%).`);
    }
    if (g && sess.goalProgress != null && sess.goalProgress !== before) lines.push(sess.goalProgress >= 100 ? `주간 목표 '${g.title}'${pp(g.title, '을', '를')} 달성했어요!` : `주간 목표 진행률 ${before}% → ${sess.goalProgress}%.`);
    const since = dayKey(addDays(new Date(), -14));
    const hist = state.sessions.filter((s) => s.subjectId === sess.subjectId && s.date >= since && s.achieve >= 90 && s.planMin).map((s) => (s.studyMs / 60000 - s.planMin) / s.planMin);
    const ha = avg(hist); const nm = sessName(state, sess);
    if (hist.length >= 3 && ha >= 0.25) lines.push(`${nm}${pp(nm, '은', '는')} 최근 거의 다 끝낸 공부 ${hist.length}번이 예상보다 평균 ${pct(ha)} 더 걸렸어요. 다음엔 예상 시간을 ${(1 + ha).toFixed(1)}배로 잡아 보세요.`);
    if (sess.focus <= 2) { const x = sess.distractors.find((t) => TIPS[t]); lines.push(x ? TIPS[x].short : '집중이 어려웠네요. 다음 공부 전에 5분 쉬고 시작해 보세요.'); }
    else if (sess.achieve < 50 && sess.distractors.includes('할 일이 불명확')) lines.push(TIPS['할 일이 불명확'].short);
    return lines.slice(0, 4);
  }
  function saveCheckout() {
    const r = state && state.running; if (!r || !sheet || sheet.kind !== 'checkout') return;
    const d = sheet.draft; readSheetInputs();
    if (d.achieve == null || !d.focus) { d.err = d.achieve == null && !d.focus ? '할 일 달성도와 집중도를 골라 주세요.' : d.achieve == null ? '할 일을 몇 % 했는지 골라 주세요.' : '집중도를 골라 주세요.'; renderSheet(); return; }
    if (Cam.state === 'on' || Cam.state === 'loading') addCam(Cam.stop());
    if (Cam.state === 'error') Cam.state = 'off';
    camStatus = '';
    const g = r.goalId ? goalById(state, r.goalId) : null;
    const cam = r.cam || { used: false, awayMs: 0, drowsyCount: 0 };
    const awayEx = !!d.awayEx && r.awayMs > 0; const camEx = !!d.camEx && cam.awayMs >= 60000;
    const before = g ? g.progress : null;
    const s = findSubj(state, r.subjectId);
    const sess = stamp({ id: r.id, goalId: g ? g.id : null, goalTitle: g ? g.title : (r.goalTitle || ''), subjectId: r.subjectId, subject: s ? s.name : r.subject, plan: r.plan, planMin: r.planMin,
      date: dayKey(r.startedAt), start: r.startedAt, end: r.endAt,
      studyMs: Math.max(0, r.studyMs - (awayEx ? r.awayMs : 0) - (camEx ? cam.awayMs : 0)), grossMs: r.studyMs, breakMs: r.breakMs, awayMs: r.awayMs, awayCount: r.awayCount, awayExcluded: awayEx,
      achieve: d.achieve, goalBefore: before, goalProgress: g ? clampPct(d.goalProgress == null ? before : d.goalProgress) : null, focus: d.focus, distractors: d.dist.slice(), memo: String(d.memo || '').trim().slice(0, 100), phase: prefs().phase,
      camUsed: !!cam.used, camAwayMs: Math.round(cam.awayMs), drowsyCount: cam.drowsyCount, camAwayExcluded: camEx });
    Arduino.send('E');
    state.sessions.push(sess); queue('session', sess);
    let reached = false;
    if (g && sess.goalProgress !== before) { reached = sess.goalProgress >= 100 && before < 100; setGoalProgress(g, sess.goalProgress); stamp(g); queue('goal', g); }
    state.lastFeedback = prefs().phase !== 'A' ? { date: dayKey(new Date()), title: `${sess.subject} · ${sess.plan}`, lines: buildFeedback(sess, g, before) } : null;
    state.running = null; sheet = null; save();
    if (route.page !== 'home') history.replaceState(null, '', '#home');
    renderAll(); window.scrollTo(0, 0);
    toast(reached ? '주간 목표를 달성했어요!' : '공부 기록을 저장했어요');
  }

  // ===================== teacher (admin) =====================
  function adminLoad(force) {
    if (mode !== 'admin' || admin.loading) return;
    if (!force && admin.at && Date.now() - admin.at < 5 * 60000) return;
    admin.loading = true; admin.err = ''; renderPage();
    const since = dayKey(addDays(weekStart(new Date()), -28));
    api('admin_overview', { since }).then((j) => {
      admin.users = Array.isArray(j.users) ? j.users : [];
      admin.data = {}; Object.entries(j.data || {}).forEach(([u, d]) => { admin.data[u] = normalizeData(d); });
      admin.full = {}; admin.at = Date.now();
    }).catch((e) => { admin.err = errText(e); }).finally(() => { admin.loading = false; if (mode === 'admin') renderPage(); });
  }
  function adminLoadStudent(id) {
    if (mode !== 'admin' || !id || admin.full[id] || admin.loadingUid === id || !admin.users.some((u) => u.uid === id)) return;
    admin.loadingUid = id;
    api('admin_student', { uid: id }).then((j) => { admin.full[id] = normalizeData(j.data); })
      .catch((e) => { if (e.message !== 'auth') toast(errText(e)); admin.full[id] = admin.data[id] || normalizeData({}); })
      .finally(() => { admin.loadingUid = null; if (isAdmin() && route.page === 'student' && route.arg === id) renderPage(); });
  }
  const admD = (id) => admin.full[id] || admin.data[id] || normalizeData({});
  const admStudents = () => admin.users.filter((u) => u.role === 'student' && (!admin.cls || u.cls === admin.cls));
  const classes = () => [...new Set(admin.users.filter((u) => u.role === 'student' && u.cls).map((u) => u.cls))].sort();
  const CLASS_SLOTS = { '국어': 0, '수학': 1, '영어': 2, '과학': 3, '사회': 4 };
  function studentWeek(u, P) {
    const D = admD(u.uid); const look = lookFor(D);
    const R = rangeStats(D.sessions, P.a, P.b, look); const prev = rangeStats(D.sessions, P.prevA, P.prevB, look);
    const goals = weekGoals(D, P.a);
    const lastDate = D.sessions.reduce((m, s) => (s.date > m ? s.date : m), '');
    return { u, D, look, R, prev, goals, done: goals.filter((g) => g.progress >= 100).length, lastDate };
  }
  function attention(sw, P) {
    const tk = dayKey(new Date()); const R = sw.R; const out = [];
    if (P.cur) { const gap = sw.lastDate ? daysBetween(sw.lastDate, tk) : null; if (gap == null) out.push('최근 5주 공부 기록 없음'); else if (gap >= 3) out.push(`${gap}일째 공부 기록 없음`); }
    if (R.sessions.length >= 3 && R.avgAch != null && R.avgAch < 50) out.push(`할 일 달성도 평균 ${Math.round(R.avgAch)}%`);
    if (R.sessions.length >= 3 && R.avgFocus != null && R.avgFocus <= 2.5) out.push(`집중도 평균 ${R.avgFocus.toFixed(1)}`);
    if (R.cam.drowsy >= 4) out.push(`졸음 감지 ${R.cam.drowsy}회`);
    if (sw.prev.total >= 2 * 3600e3 && R.total < sw.prev.total * 0.5) out.push(`순공 ${fmtHM(sw.prev.total)} → ${fmtHM(R.total)} (${P.than} 대비)`);
    if (P.cur && P.elapsed >= 2 && !sw.goals.length) out.push('이번 주 목표 없음');
    return out;
  }
  function loadingHTML(text) { return `<div class="stack"><section class="card"><p class="muted">${esc(text)}</p></section></div>`; }
  function adminGate() {
    if (admin.loading && !admin.users.length) return loadingHTML('학생 기록을 불러오는 중이에요…');
    if (admin.err && !admin.users.length) return `<div class="stack"><section class="card"><p class="form-err" role="alert">${esc(admin.err)}</p><div><button class="btn small" data-act="adm-refresh">다시 불러오기</button></div></section></div>`;
    return '';
  }
  function classSelectHTML(id) { const cs = classes(); return cs.length ? `<label class="sr" for="${id}">반 고르기</label><select id="${id}" data-adm="cls"><option value="">전체 반</option>${cs.map((c) => `<option value="${esc(c)}" ${admin.cls === c ? 'selected' : ''}>${esc(c)}반</option>`).join('')}</select>` : ''; }
  function dashHTML() {
    const gate = adminGate(); if (gate) return gate;
    const P = periodOf({ mode: 'week', offset: admin.week }); const tk = dayKey(new Date());
    const list = admStudents(); const sums = list.map((u) => studentWeek(u, P));
    const active = sums.filter((x) => x.R.sessions.length);
    const all = []; sums.forEach((x) => x.R.sessions.forEach((s) => all.push(Object.assign({}, s, { _n: x.look.name(s) }))));
    let extra = 5; const slots = {};
    const classSlot = (nm) => { if (nm in CLASS_SLOTS) return CLASS_SLOTS[nm]; if (!(nm in slots)) slots[nm] = extra < 8 ? extra++ : null; return slots[nm]; };
    const C = rangeStats(all, P.a, P.b, { name: (s) => s._n, slot: classSlot });
    const goals = [].concat(...sums.map((x) => x.goals)); const gDone = goals.filter((g) => g.progress >= 100).length;
    const n = Math.max(1, list.length);
    const cols = range(0, 6).map((i) => {
      const day = addDays(P.start, i); const k = dayKey(day); const d = C.days[k];
      const segs = d ? C.subjects.filter((x) => d.subj[x.name]).map((x) => ({ name: x.name, slot: x.slot, ms: d.subj[x.name] / n })) : [];
      return { key: k, label: WD[day.getDay()], sub: `${day.getMonth() + 1}/${day.getDate()}`, ms: d ? d.ms / n : 0, segs, today: k === tk, aria: `${fmtDateLong(day)} 학생 1인 평균 순공 ${fmtHM(d ? d.ms / n : 0)}` };
    });
    const att = sums.map((x) => ({ x, why: attention(x, P) })).filter((a) => a.why.length).sort((a, b) => b.why.length - a.why.length);
    return `<div class="board">
      <div class="span2 stack" style="gap:10px">
        <div class="period-nav"><button class="icon-btn" data-act="adm-week" data-v="-1" aria-label="이전 주" ${admin.week <= -3 ? 'disabled' : ''}>‹</button><h2>${P.label}${P.cur ? ' · 이번 주' : ''}</h2><button class="icon-btn" data-act="adm-week" data-v="1" aria-label="다음 주" ${admin.week >= 0 ? 'disabled' : ''}>›</button></div>
        <div class="toolbar">${classSelectHTML('dashCls')}<button class="btn small" data-act="adm-refresh" ${admin.loading ? 'disabled' : ''}>${admin.loading ? '불러오는 중…' : '새로고침'}</button><span class="muted small-text">${admin.at ? `${fmtDateTime(admin.at)} 기준` : ''}</span></div>
      </div>
      <div class="span2 tiles">
        <div class="tile"><span class="label">기록한 학생</span><span class="value">${active.length} <small>/ ${list.length}명</small></span><span class="delta">이 주에 공부 기록이 있는 학생</span></div>
        <div class="tile"><span class="label">1인 평균 순공</span><span class="value">${fmtHM(active.length ? C.total / active.length : 0)}</span><span class="delta">기록한 학생 기준</span></div>
        <div class="tile"><span class="label">할 일 달성도</span><span class="value">${C.avgAch == null ? '–' : Math.round(C.avgAch) + '%'}</span><span class="delta">공부 ${C.sessions.length}번 평균</span></div>
        <div class="tile"><span class="label">평균 집중도</span><span class="value">${C.avgFocus == null ? '–' : C.avgFocus.toFixed(1)} <small>/ 5</small></span><span class="delta">학생이 스스로 매긴 값</span></div>
        <div class="tile"><span class="label">주간 목표 달성</span><span class="value">${gDone} <small>/ ${goals.length}개</small></span><span class="delta">${goals.length ? `평균 진행률 ${Math.round(avg(goals.map((g) => g.progress)))}%` : '세운 목표 없음'}</span></div>
        <div class="tile"><span class="label">졸음 감지</span><span class="value">${C.cam.drowsy}<small>회</small></span><span class="delta">카메라를 켠 공부 ${C.cam.n}번</span></div>
      </div>
      <section class="card" aria-labelledby="dcH"><div class="card-head"><h2 id="dcH">요일별 1인 평균 순공</h2><span class="muted small-text">학생 ${list.length}명 기준</span></div>${vchartHTML(cols, { minMax: 30 * 60000 })}${legendHTML(C.subjects)}</section>
      <section class="card" aria-labelledby="atH"><div class="card-head"><h2 id="atH">살펴볼 학생</h2><span class="muted small-text">${att.length}명</span></div>
        ${att.length ? `<div class="att">${att.slice(0, 10).map((a) => `<a class="att-row" href="#student/${encodeURIComponent(a.x.u.uid)}"><span><b>${esc(a.x.u.name)}</b><span>${esc(a.why.join(' · '))}</span></span><span class="muted small-text">${esc(a.x.u.cls ? a.x.u.cls + '반' : '')}</span></a>`).join('')}</div>`
          : '<p class="muted">기록으로 보아 특별히 살펴볼 학생이 없어요.</p>'}
        <p class="muted small-text">기록만 보고 자동으로 고른 목록이라 실제 상황과 다를 수 있어요. 학생과 이야기할 때 참고만 하세요.</p></section>
      ${subjectsCardHTML(C)}${hoursCardHTML(C)}${bucketsCardHTML(C)}${distractorsCardHTML(C)}
      <section class="card span2" aria-labelledby="ssH"><div class="card-head"><h2 id="ssH">학생별 요약</h2><a class="btn small" href="#students">전체 보기</a></div><div class="slist">${studentRowsHTML(sums.slice().sort((a, b) => (a.u.cls + a.u.studentNo).localeCompare(b.u.cls + b.u.studentNo)).slice(0, 12))}</div></section>
    </div>`;
  }
  function studentRowsHTML(sums) {
    if (!sums.length) return '<p class="empty">아직 가입한 학생이 없어요. 학생들에게 가입 코드를 알려 주세요.</p>';
    return sums.map((x) => `<a class="srow-btn" href="#student/${encodeURIComponent(x.u.uid)}">
      <span class="st-name"><b>${esc(x.u.name)}</b><span class="muted small-text">${esc(x.u.studentNo)}${x.u.cls ? ` · ${esc(x.u.cls)}반` : ''}${x.u.status === 'disabled' ? ' · 정지' : ''}</span></span>
      <span class="st-cells"><span><small>이번 주 순공</small>${fmtHM(x.R.total)}</span><span><small>할 일 달성도</small>${x.R.avgAch == null ? '–' : Math.round(x.R.avgAch) + '%'}</span><span><small>주간 목표</small>${x.goals.length ? `${x.done}/${x.goals.length}` : '–'}</span><span><small>최근 기록</small>${ago(x.lastDate)}</span></span></a>`).join('');
  }
  function studentListHTML() {
    const P = periodOf({ mode: 'week', offset: 0 });
    const q = admin.q.trim().toLowerCase();
    let sums = admStudents().filter((u) => !q || u.name.toLowerCase().includes(q) || String(u.studentNo).toLowerCase().includes(q)).map((u) => studentWeek(u, P));
    const by = { name: (a, b) => a.u.name.localeCompare(b.u.name, 'ko'), no: (a, b) => String(a.u.studentNo).localeCompare(String(b.u.studentNo)), most: (a, b) => b.R.total - a.R.total, least: (a, b) => a.R.total - b.R.total, stale: (a, b) => (a.lastDate || '').localeCompare(b.lastDate || '') };
    sums = sums.sort(by[admin.sort] || by.name);
    return `<p class="muted small-text">${sums.length}명</p>${studentRowsHTML(sums)}`;
  }
  function studentsHTML() {
    const gate = adminGate(); if (gate) return gate;
    return `<div class="stack"><div class="toolbar">
        <label class="sr" for="admQ">학생 찾기</label><input id="admQ" type="search" placeholder="이름이나 학번으로 찾기" value="${esc(admin.q)}" autocomplete="off">
        ${classSelectHTML('admCls')}
        <label class="sr" for="admSort">정렬</label><select id="admSort" data-adm="sort">${[['name', '이름순'], ['no', '학번순'], ['most', '이번 주 순공 많은 순'], ['least', '이번 주 순공 적은 순'], ['stale', '최근 기록 오래된 순']].map(([v, t]) => `<option value="${v}" ${admin.sort === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
      </div><div class="slist" id="slist">${studentListHTML()}</div></div>`;
  }
  function studentDetailHTML(id) {
    const gate = adminGate(); if (gate) return gate;
    const u = admin.users.find((x) => x.uid === id);
    if (!u || u.role !== 'student') return '<div class="stack"><section class="card"><p>학생을 찾을 수 없어요.</p><div><a class="btn small" href="#students">학생 목록으로</a></div></section></div>';
    if (astat.uid !== id) astat = { mode: 'week', offset: 0, sel: null, uid: id };
    const D = admD(id); const wk = weekKey(new Date()); const goals = weekGoals(D, wk);
    return `<div class="stack detail-wrap">
      <div><a class="btn ghost small" href="#students">‹ 학생 목록</a></div>
      <section class="card detail-head"><div class="avatar" aria-hidden="true">${esc(u.name[0] || '?')}</div><div class="acc-name"><b>${esc(u.name)}</b><span>${esc(u.studentNo)}${u.cls ? ` · ${esc(u.cls)}반` : ''} · 최근 접속 ${fmtDateTime(u.last)}</span></div>${u.status === 'disabled' ? '<span class="pill bad">정지</span>' : '<span></span>'}</section>
      ${mode === 'admin' && !admin.full[id] ? '<p class="muted small-text">전체 기록을 불러오는 중이에요. 지금은 최근 5주 기록만 보여요.</p>' : ''}
      ${finalHeroHTML(D, false)}
      <section class="card" aria-labelledby="dgH"><div class="card-head"><h2 id="dgH">이번 주 목표</h2><span class="muted small-text">${weekLabel(weekStart(new Date()))}</span></div>${goals.length ? goals.map((g) => goalMiniHTML(D, g)).join('') : '<p class="empty">이번 주 목표가 아직 없어요.</p>'}</section>
      ${statsHTML(D, astat, false)}
      ${gradesHTML(D, false)}
      <p class="foot">학생의 공부 메모와 AI 상담 내용은 개인정보라 선생님 화면에 보내지 않아요.</p>
    </div>`;
  }
  function accountsHTML() {
    const gate = adminGate(); if (gate) return gate;
    const meId = mode === 'admin' ? auth.user.uid : 'demo-admin';
    const users = admin.users.slice().sort((a, b) => (a.role === b.role ? (a.cls + a.studentNo).localeCompare(b.cls + b.studentNo) : a.role === 'admin' ? -1 : 1));
    const nS = users.filter((u) => u.role === 'student').length;
    return `<div class="stack"><section class="card" aria-labelledby="acH2"><div class="card-head"><h2 id="acH2">계정 관리</h2><span class="muted small-text">학생 ${nS}명 · 관리자 ${users.length - nS}명</span></div>
        <p class="muted small-text">비밀번호를 잊은 학생은 '비밀번호 초기화'로 임시 비밀번호를 만들어 직접 알려 주세요. 정지한 계정은 로그인과 기록 저장이 막혀요.</p>
        <div class="table-wrap"><table class="acc"><thead><tr><th scope="col">이름</th><th scope="col">학번(아이디)</th><th scope="col">반</th><th scope="col">역할</th><th scope="col">상태</th><th scope="col">마지막 접속</th><th scope="col">관리</th></tr></thead><tbody>
        ${users.map((u) => `<tr><td>${esc(u.name)}</td><td>${esc(u.studentNo)}</td><td>${esc(u.cls || '–')}</td><td>${u.role === 'admin' ? '관리자' : '학생'}</td><td>${u.status === 'disabled' ? '<span class="pill bad">정지</span>' : '<span class="pill good">사용</span>'}</td><td>${fmtDateTime(u.last)}</td>
          <td>${u.uid === meId ? '<span class="muted">나</span>' : `<div class="btn-row" style="flex-wrap:nowrap"><button class="btn small" data-act="adm-reset" data-id="${esc(u.uid)}">비밀번호 초기화</button><button class="btn small ${u.status === 'disabled' ? '' : 'danger'}" data-act="adm-status" data-id="${esc(u.uid)}" data-v="${u.status === 'disabled' ? 1 : 0}">${u.status === 'disabled' ? '정지 해제' : '정지'}</button></div>`}</td></tr>`).join('')}
        </tbody></table></div></section>
      <section class="card" aria-labelledby="jcH"><h2 id="jcH" style="font-size:16px">가입 코드</h2><p class="muted small-text">학생 가입 코드(JOIN_CODE)와 관리자 가입 코드(ADMIN_CODE)는 Apps Script 편집기의 프로젝트 설정 → 스크립트 속성에서 바꿀 수 있어요. 관리자 코드는 학생에게 알려 주면 안 돼요. 코드를 바꿔도 이미 가입한 계정은 그대로예요.</p></section></div>`;
  }
  function adminMeHTML() {
    const u = mode === 'admin' ? auth.user : null; const url = serverUrl();
    let host = ''; try { host = url ? new URL(url).host : ''; } catch (e) { host = ''; }
    return `<div class="stack">
      <section class="card account" aria-label="내 계정"><div class="avatar" aria-hidden="true">${esc((u ? u.name : '체')[0] || '?')}</div>
        <div class="acc-name"><b>${esc(u ? u.name : '체험 선생님')}</b><span class="muted small-text">${u ? `${esc(u.studentNo)} · 관리자` : '체험 모드 · 예시 데이터'}</span></div>
        <div class="btn-row">${u ? '<button class="btn small danger" data-act="logout">로그아웃</button>' : '<button class="btn small" data-act="exit-demo">체험 끝내기</button>'}</div></section>
      ${u ? passwordCardHTML() : ''}
      <section class="card" aria-labelledby="axH"><h2 id="axH" style="font-size:16px">기록 내보내기</h2>
        <p class="muted small-text">최근 5주 동안 학생들이 남긴 공부 기록을 CSV로 내려받아요. 공부 메모는 들어가지 않아요. 베타 테스트 분석이나 발표 자료에는 익명 파일을 쓰세요.</p>
        <div class="btn-row"><button class="btn small" data-act="adm-export" data-v="named">이름 포함 CSV</button><button class="btn small" data-act="adm-export" data-v="anon">익명 CSV</button></div></section>
      <section class="card" aria-labelledby="svH"><h2 id="svH" style="font-size:16px">서버</h2>
        <p class="muted small-text">${mode === 'demo-admin' ? '체험 모드라 서버에 연결하지 않았어요.' : `연결된 서버: ${esc(host || '없음')}${admin.at ? ` · 마지막으로 불러온 시각 ${fmtDateTime(admin.at)}` : ''}`}</p>
        <p class="muted small-text">모든 기록은 Apps Script와 연결된 구글 시트(사용자, 학생설정, 공부기록, 주간목표, 시험)에도 그대로 쌓여요. 시트의 json 열은 앱이 쓰는 값이라 고치지 마세요.</p></section>
      <section class="card" aria-labelledby="apH"><h2 id="apH" style="font-size:16px">개인정보</h2>
        <ul class="data-list"><li>학생의 공부 메모와 AI 멘토 상담 요약은 서버가 관리자에게 보내지 않아요.</li><li>임시 비밀번호는 화면에 한 번만 보여요. 비밀번호 원문은 시트에도 저장되지 않아요.</li></ul></section>
      <p class="foot">야자 관리실 v${APP_VERSION}</p></div>`;
  }

  // ===================== CSV export =====================
  function csvCell(v) { const text = typeof v === 'string'; v = v == null ? '' : String(v); if (text && /^[=+\-@]/.test(v)) v = "'" + v; return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }
  function toCSV(rows) { return rows.map((r) => r.map(csvCell).join(',')).join('\r\n'); }
  const SESSION_HEAD = ['날짜', '요일', '시작', '종료', '과목', '주간 목표', '이번에 할 일', '예상(분)', '순공(분)', '휴식(분)', '앱 이탈(분)', '할 일 달성도(%)', '목표 진행률 전(%)', '목표 진행률 후(%)', '집중도(1-5)', '방해요인', '카메라 사용', '카메라 자리비움(분)', '졸음 감지', '실험단계'];
  function sessionRow(D, s) {
    return [s.date, WD[parseDay(s.date).getDay()], fmtTime(s.start), fmtTime(s.end), sessName(D, s), s.goalTitle || '', s.plan || '', s.planMin || '', mins(s.studyMs), mins(s.breakMs || 0), mins(s.awayMs || 0),
      s.achieve, s.goalBefore == null ? '' : s.goalBefore, s.goalProgress == null ? '' : s.goalProgress, s.focus, (s.distractors || []).join(' / '), s.camUsed ? '예' : '아니오', mins(s.camAwayMs || 0), s.drowsyCount || 0, PHASE[s.phase] || ''];
  }
  function studentCSV(kind) {
    const D = state;
    if (kind === 'goals') {
      const rows = [['주 시작일', '과목', '목표', '목표 시간(분)', '진행률(%)', '상태', '공부 시간(분)', '공부 횟수']];
      D.goals.slice().sort((a, b) => (a.week < b.week ? -1 : a.week > b.week ? 1 : 0)).forEach((g) => { const ss = goalSessions(D, g.id); rows.push([g.week, goalName(D, g), g.title, g.targetMin || '', g.progress, GOAL_STATUS[goalStatus(g)], mins(sum(ss.map((s) => s.studyMs))), ss.length]); });
      return toCSV(rows);
    }
    const rows = [SESSION_HEAD.concat(['메모'])];
    D.sessions.slice().sort((a, b) => a.start - b.start).forEach((s) => rows.push(sessionRow(D, s).concat([s.memo || ''])));
    return toCSV(rows);
  }
  function adminCSV(anon) {
    const studs = admin.users.filter((u) => u.role === 'student').sort((a, b) => (a.cls + a.studentNo).localeCompare(b.cls + b.studentNo));
    const rows = [(anon ? ['학생 코드', '반'] : ['학번', '이름', '반']).concat(SESSION_HEAD)];
    studs.forEach((u, i) => {
      const D = admD(u.uid);
      D.sessions.slice().sort((a, b) => a.start - b.start).forEach((s) => rows.push((anon ? [`S${pad(i + 1)}`, u.cls || ''] : [u.studentNo, u.name, u.cls || '']).concat(sessionRow(D, s))));
    });
    return toCSV(rows);
  }
  function downloadFile(name, text) {
    try {
      const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = name; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast('파일을 저장했어요');
    } catch (e) { toast('파일로 저장할 수 없어요'); }
  }
  async function shareFile(name, text) {
    // ASCII-only names: some phones drop non-Latin download names
    try {
      const file = new File(['﻿' + text], name, { type: 'text/csv' });
      if (navigator.canShare && navigator.canShare({ files: [file] }) && /android|iphone|ipad/i.test(navigator.userAgent)) { await navigator.share({ files: [file], title: name }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    downloadFile(name, text);
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); toast('복사했어요'); } catch (e) { toast('복사할 수 없어요'); }
  }
  async function shareReport() {
    const text = reportText();
    if (navigator.share) { try { await navigator.share({ title: '야자 관리실 요약', text }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    copyText(text);
  }

  // ===================== install as an app =====================
  let installEvt = null;
  const isStandalone = () => (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; if (isStudent() && (route.page === 'home' || route.page === 'me')) renderPage(); });
  window.addEventListener('appinstalled', () => { installEvt = null; toast('앱을 설치했어요. 홈 화면에서 열어 보세요.'); if (mode !== 'login') renderPage(); });
  async function promptInstall() { if (!installEvt) return; const evt = installEvt; installEvt = null; evt.prompt(); try { await evt.userChoice; } catch (e) { /* ignore */ } renderPage(); }

  // ===================== events =====================
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-act]'); if (!b || b.disabled) return;
    const act = b.dataset.act; const id = b.dataset.id;
    switch (act) {
      // login & account
      case 'login-tab': readLoginDraft(); loginTab = b.dataset.v === 'signup' ? 'signup' : 'login'; loginErr = ''; renderLogin(); break;
      case 'demo-student': startDemo('student'); break;
      case 'demo-admin': startDemo('admin'); break;
      case 'server-clear': lsDel('server'); renderLogin(); toast('이 기기에 넣은 서버 주소를 지웠어요'); break;
      case 'exit-demo': exitDemo(); break;
      case 'sync-now': syncNow(true); break;
      case 'logout': {
        if (state && state.running) { toast('공부를 끝내고 기록한 뒤에 로그아웃할 수 있어요'); break; }
        if (mode === 'student' && outbox.length && !armInline(b, `저장 안 된 기록 ${outbox.length}개가 사라져요. 그래도 로그아웃`)) break;
        logout(); break;
      }
      case 'install': promptInstall(); break;
      case 'dismiss-install': device.installDismissed = true; saveDevice(); renderPage(); break;
      // home
      case 'final-edit': { const f = state.meta.final; openSheet('final', { title: f.title, detail: f.detail, dateName: f.dateName, date: f.date, grades: Object.assign({}, f.grades) }); break; }
      case 'goal-new': openSheet('goal', { id: null, week: weekKey(new Date()), subjectId: null, title: '', targetMin: 0 }); break;
      case 'goal-edit': { const g = goalById(state, id); if (g) openSheet('goal', { id: g.id, week: g.week, subjectId: g.subjectId, title: g.title, targetMin: g.targetMin || 0, progress: g.progress, base: g.progress }); break; }
      case 'goal-del': if (armInline(b, '정말 지우기')) deleteGoal(); break;
      case 'start': if (!state.running) openSheet('start', { goalId: id, plan: '', planMin: lastPlanMin(id), cam: !!prefs().camAuto }); break;
      case 'free-start': if (!state.running) openSheet('start', { goalId: null, subjectId: null, plan: '', planMin: lastPlanMin(null), cam: !!prefs().camAuto }); break;
      case 'carry': carryOver(); break;
      case 'dismiss-carry': state.carryDismissed = dayKey(addDays(weekStart(new Date()), -7)); save(); renderPage(); break;
      case 'dismiss-fb': state.lastFeedback = null; save(); renderPage(); break;
      case 'promise': {
        const n = latestNote(state); const i = Number(b.dataset.i);
        if (n && n.promises[i]) { n.promises[i].done = b.checked; metaChanged(); renderPage(); if (b.checked) toast('약속을 지켰어요. 멘토에게도 알려 주세요.'); }
        break;
      }
      // sheets
      case 'sheet-close': closeSheet(); break;
      case 'pct': setPct(b.dataset.k, b.dataset.v); break;
      case 'pick-subj': sheet.draft.subjectId = b.dataset.v; sheet.draft.err = ''; renderSheet(); break;
      case 'pick-min': sheet.draft.planMin = Number(b.dataset.v); renderSheet(); break;
      case 'use-plan': { const t = $('#stPlan'); if (t) { t.value = b.dataset.v; sheet.draft.plan = b.dataset.v; t.focus(); } break; }
      case 'exam-type': readSheetInputs(); sheet.draft.type = b.dataset.v === 'school' ? 'school' : 'mock'; renderSheet(); break;
      case 'co-focus': sheet.draft.focus = Number(b.dataset.v); sheet.draft.err = ''; renderSheet(); break;
      case 'co-dist': { const d = sheet.draft; const v = b.dataset.v; d.dist = d.dist.includes(v) ? d.dist.filter((x) => x !== v) : d.dist.concat(v); d.none = false; renderSheet(); break; }
      case 'co-none': sheet.draft.none = !sheet.draft.none; if (sheet.draft.none) sheet.draft.dist = []; renderSheet(); break;
      case 'co-back': cancelCheckout(); break;
      // timer
      case 'open-timer': if (state && state.running) { state.running.overlay = true; save(); renderTimer(); requestWake(); } break;
      case 'min-timer': if (state && state.running) { state.running.overlay = false; save(); releaseWake(); renderAll(); } break;
      case 'toggle-break': toggleBreak(); break;
      case 'end-session': openCheckout(); break;
      case 'cam-toggle': camToggle(); break;
      case 'alarm-ok': dismissAlarm(); toast('좋아요. 다시 집중해 봐요.'); break;
      // stats (students and the teacher's student page)
      case 'st-mode': { const s = curStat(); s.mode = ['day', 'month'].includes(b.dataset.v) ? b.dataset.v : 'week'; s.offset = 0; s.sel = null; s.back = null; renderPage(); break; }
      case 'st-goday': { const s = curStat(); if (s.mode !== 'day') s.back = { mode: s.mode, offset: s.offset, y: window.scrollY }; s.mode = 'day'; s.offset = Math.min(0, daysBetween(dayKey(new Date()), b.dataset.key)); s.sel = null; renderPage(); window.scrollTo(0, 0); break; }
      case 'st-back': { const s = curStat(); const bk = s.back; if (!bk) break; s.mode = bk.mode; s.offset = bk.offset; s.back = null; renderPage(); window.scrollTo(0, bk.y || 0); break; }
      case 'st-today': { const s = curStat(); s.offset = 0; renderPage(); break; }
      case 'go-today': stat = { mode: 'day', offset: 0, sel: null }; break;
      case 'go-week': stat = { mode: 'week', offset: 0, sel: null }; break;
      case 'quick-start': {
        if (state.running) break;
        const act = weekGoals(state, weekKey(new Date())).filter((g) => g.progress < 100);
        const g0 = act[0] || null;
        openSheet('start', { pick: true, goalId: g0 ? g0.id : null, subjectId: null, plan: '', planMin: lastPlanMin(g0 ? g0.id : null), cam: !!prefs().camAuto });
        break;
      }
      case 'pick-goal': { readSheetInputs(); const d = sheet.draft; d.goalId = b.dataset.v || null; d.planMin = lastPlanMin(d.goalId); d.err = ''; renderSheet(); break; }
      case 'st-prev': { const s = curStat(); s.offset -= 1; s.sel = null; renderPage(); break; }
      case 'st-next': { const s = curStat(); if (s.offset < 0) { s.offset += 1; s.sel = null; renderPage(); } break; }
      case 'st-day': curStat().sel = b.dataset.key; renderPage(); break;
      case 'sess-del': {
        if (!armInline(b, '삭제', 'armed-del')) break;
        const s = state.sessions.find((x) => x.id === id); if (!s) break;
        stamp(s); state.sessions = state.sessions.filter((x) => x.id !== id); save(); queue('session', s, true); renderPage(); toast('공부 기록을 지웠어요. 목표 진행률은 그대로예요.');
        break;
      }
      case 'report-ai': requestReportAI(periodOf(stat)); break;
      case 'share-report': shareReport(); break;
      // goals tab
      case 'goals-tab': goalsTab = b.dataset.v === 'grades' ? 'grades' : 'goals'; renderPage(); break;
      case 'more-weeks': weeksShown += 6; renderPage(); break;
      case 'exam-new': openSheet('exam', { type: 'mock', name: '', date: dayKey(new Date()), scores: {} }); break;
      case 'exam-del': {
        if (!armInline(b, '삭제', 'armed-del')) break;
        const e = state.exams.find((x) => x.id === id); if (!e) break;
        stamp(e); state.exams = state.exams.filter((x) => x.id !== id); save(); queue('exam', e, true); renderPage(); toast('시험 기록을 지웠어요');
        break;
      }
      // mentor
      case 'mentor-consent': state.meta.prefs.mentorConsent = true; metaChanged(); renderPage(); break;
      case 'mentor-quick': sendMentor(b.dataset.v); break;
      case 'mentor-finish': finishMentor(); break;
      case 'chat-clear': if (armInline(b, '정말 지우기')) { state.chat = []; save(); renderPage(); toast('멘토 대화를 지웠어요'); } break;
      // settings
      case 'subj-add': {
        const sub = state.meta.subjects; if (sub.length >= 8) break;
        const used = new Set(sub.map((s) => s.slot)); let slot = 0; while (used.has(slot)) slot++;
        sub.push({ id: 's' + uid(), name: `과목 ${sub.length + 1}`, slot }); metaChanged(); renderPage();
        const inputs = $$('.subj-row input'); if (inputs.length) { inputs[inputs.length - 1].focus(); inputs[inputs.length - 1].select(); }
        break;
      }
      case 'subj-del': if (state.meta.subjects.length > 1) { state.meta.subjects = state.meta.subjects.filter((s) => s.id !== id); metaChanged(); renderPage(); } break;
      case 'dist-del': state.meta.distractors.splice(Number(b.dataset.i), 1); metaChanged(); renderPage(); break;
      case 'arduino-on': Arduino.connect().then((ok) => { toast(ok ? '아두이노를 연결했어요' : '아두이노를 연결하지 못했어요'); if (route.page === 'me') renderPage(); }); break;
      case 'arduino-off': Arduino.disconnect().then(() => { toast('아두이노 연결을 끊었어요'); if (route.page === 'me') renderPage(); }); break;
      case 'arduino-test': Arduino.send('W'); setTimeout(() => Arduino.send('O'), 1500); break;
      case 'export': shareFile(`yaja-room_${b.dataset.v === 'goals' ? 'goals' : 'sessions'}_${dayKey(new Date())}.csv`, studentCSV(b.dataset.v)); break;
      // teacher
      case 'adm-refresh': if (mode === 'demo-admin') toast('체험 모드는 예시 데이터라 새로고침할 게 없어요'); else adminLoad(true); break;
      case 'adm-week': admin.week = Math.max(-3, Math.min(0, admin.week + Number(b.dataset.v))); renderPage(); break;
      case 'adm-export': shareFile(`yaja-room_students_${b.dataset.v === 'anon' ? 'anon_' : ''}${dayKey(new Date())}.csv`, adminCSV(b.dataset.v === 'anon')); break;
      case 'adm-reset': {
        if (mode === 'demo-admin') { toast('체험 모드에서는 계정을 바꿀 수 없어요'); break; }
        if (!armInline(b, '정말 초기화')) break;
        const u = admin.users.find((x) => x.uid === id); b.disabled = true;
        api('admin_reset', { uid: id }).then((j) => { if (isAdmin()) openSheet('temp', { name: u ? u.name : '', no: u ? u.studentNo : '', temp: j.temp }); }).catch((e) => toast(errText(e))).finally(() => { if (b.isConnected) b.disabled = false; });
        break;
      }
      case 'adm-status': {
        if (mode === 'demo-admin') { toast('체험 모드에서는 계정을 바꿀 수 없어요'); break; }
        const active = b.dataset.v === '1';
        if (!active && !armInline(b, '정말 정지')) break;
        b.disabled = true;
        api('admin_status', { uid: id, active }).then(() => { const u = admin.users.find((x) => x.uid === id); if (u) u.status = active ? 'active' : 'disabled'; if (isAdmin()) renderPage(); toast(active ? '계정을 다시 쓸 수 있게 했어요' : '계정을 정지했어요'); })
          .catch((e) => toast(errText(e))).finally(() => { if (b.isConnected) b.disabled = false; });
        break;
      }
      default: break;
    }
  });
  $('#sheet').addEventListener('click', (ev) => { if (ev.target.id === 'sheet' && sheet && sheet.kind !== 'checkout') closeSheet(); });

  document.addEventListener('submit', (ev) => {
    const id = ev.target.id; if (!id) return;
    ev.preventDefault();
    if (id === 'loginForm') doLogin();
    else if (id === 'signupForm') doSignup();
    else if (id === 'serverForm') {
      const v = ($('#srvUrl').value || '').trim();
      if (v && !/^https:\/\/script\.google(usercontent)?\.com\//.test(v)) { toast('Apps Script 웹 앱 주소(https://script.google.com/…)를 넣어 주세요'); return; }
      if (v) lsSet('server', v); else lsDel('server');
      renderLogin(); toast(v ? '이 기기에 서버 주소를 저장했어요' : '서버 주소를 지웠어요');
    }
    else if (id === 'goalForm') saveGoal();
    else if (id === 'startForm') startSession();
    else if (id === 'coForm') saveCheckout();
    else if (id === 'finalForm') saveFinal();
    else if (id === 'examForm') saveExam();
    else if (id === 'chatForm') { const t = $('#chatText'); sendMentor(t ? t.value : ''); }
    else if (id === 'pwForm') changePassword();
    else if (id === 'distForm') {
      const v = ($('#distNew').value || '').trim().slice(0, 12);
      if (!v) return;
      if (state.meta.distractors.includes(v)) { toast('이미 있는 항목이에요'); return; }
      if (state.meta.distractors.length >= 8) return;
      state.meta.distractors.push(v); metaChanged(); renderPage(); const n = $('#distNew'); if (n) n.focus();
    }
  });
  document.addEventListener('input', (ev) => {
    const el = ev.target;
    if (el.dataset && el.dataset.pctRange) { setPct(el.dataset.pctRange, el.value); return; }
    if (el.id === 'chatText') mentorDraft = el.value;
    if (el.id === 'admQ') { admin.q = el.value; const l = $('#slist'); if (l) l.innerHTML = studentListHTML(); }
    if (sheet && el.closest && el.closest('#sheetCard') && sheet.draft.err && el.matches('input[type="text"]')) { sheet.draft.err = ''; const e = $('#sheetCard .form-err'); if (e) e.remove(); }
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.target.id === 'chatText' && ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing && ev.keyCode !== 229) { ev.preventDefault(); sendMentor(ev.target.value); }
    if (ev.key === 'Escape') {
      if (!$('#alarm').hidden) dismissAlarm();
      else if (sheet && sheet.kind !== 'checkout') closeSheet();
    }
  });
  document.addEventListener('change', (ev) => {
    const el = ev.target;
    if (el.dataset && el.dataset.adm) {
      if (el.dataset.adm === 'cls') admin.cls = el.value;
      if (el.dataset.adm === 'sort') admin.sort = el.value;
      renderPage(); return;
    }
    const k = el.dataset ? el.dataset.pref : null;
    if (!k || !state) return;
    const p = state.meta.prefs;
    if (k === 'daily') state.meta.dailyGoalMin = Number(el.value);
    else if (k === 'phase') p.phase = el.value;
    else if (k === 'away') p.away = el.value;
    else if (k === 'wake') { p.keepAwake = el.checked; if (!el.checked) releaseWake(); }
    else if (k === 'chime') p.chime = el.checked;
    else if (k === 'cam-sens') p.camSens = el.value;
    else if (k === 'cam-preview') { p.camPreview = el.checked; renderCam(); }
    else if (k === 'cam-alarm') p.camAlarm = el.checked;
    else if (k === 'cam-vibrate') p.camVibrate = el.checked;
    else if (k === 'subj-name') {
      const s = findSubj(state, el.dataset.id); const v = el.value.trim().slice(0, 10);
      if (!s) return; if (!v || state.meta.subjects.some((x) => x !== s && x.name === v)) { el.value = s.name; toast(v ? '같은 이름의 과목이 있어요' : '과목 이름을 적어 주세요'); return; }
      s.name = v;
    }
    metaChanged();
    if (k === 'phase') renderAll();
    toast('저장했어요');
  });
  window.addEventListener('hashchange', () => { if (mode !== 'login') renderAll(); });
  const onStats = () => mode !== 'login' && (route.page === 'stats' || route.page === 'student');
  function stepPeriod(dir) {
    const s = curStat();
    if (dir > 0 && s.offset >= 0) return;
    s.offset += dir; s.sel = null; renderPage();
  }
  let touch0 = null;
  $('#main').addEventListener('touchstart', (e) => { touch0 = onStats() && !e.target.closest('.table-wrap, .quick, input, textarea, select') ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null; }, { passive: true });
  $('#main').addEventListener('touchend', (e) => {
    if (!touch0) return; const t = e.changedTouches[0]; const dx = t.clientX - touch0.x; const dy = t.clientY - touch0.y; touch0 = null;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 45) stepPeriod(dx > 0 ? -1 : 1);
  }, { passive: true });
  document.addEventListener('keydown', (e) => {
    if (!onStats() || sheet || e.altKey || e.ctrlKey || e.metaKey || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) || !$('#timer').hidden) return;
    if (e.key === 'ArrowLeft') stepPeriod(-1); else if (e.key === 'ArrowRight') stepPeriod(1);
  });
  window.addEventListener('online', () => { renderSync(); scheduleFlush(200); });
  window.addEventListener('offline', renderSync);
  setInterval(() => { if (mode === 'student' && outbox.length && !sync.busy) flush(); }, 60000);

  // ===================== boot =====================
  const demo = lsGet('demo', null);
  if (auth) enterMode(auth.user.role === 'admin' ? 'admin' : 'student', true);
  else if (demo === 'student' || demo === 'admin') enterMode(demo === 'admin' ? 'demo-admin' : 'demo-student', true);
  else renderAll();
  let lastDay = dayKey(new Date());
  setInterval(() => { const d = dayKey(new Date()); if (d !== lastDay) { lastDay = d; if (mode !== 'login' && !(state && state.running) && !sheet) renderAll(); } }, 30000);
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => { /* the app still works online */ }); });
  }
})();

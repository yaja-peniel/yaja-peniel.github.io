(() => {
  'use strict';

  // ---------- constants ----------
  const KEY = 'yaja-room-v1';
  const VIEWS = ['today', 'log', 'report', 'mentor', 'prefs'];
  const Cam = window.YajaCam || { state: 'off', supported: () => false, peek: () => null, isPaused: () => false, flush: () => ({ awayMs: 0, drowsyCount: 0 }), pause: () => ({ awayMs: 0, drowsyCount: 0 }), resume: () => {}, stop: () => ({ awayMs: 0, drowsyCount: 0 }), start: async () => false };
  const Arduino = window.YajaArduino || { supported: () => false, connected: () => false, send: async () => {}, connect: async () => false, disconnect: async () => {} };
  const MINUTES = [10, 15, 20, 30, 40, 50, 60, 80, 90, 120];
  const GOALS = [60, 90, 120, 150, 180, 210, 240, 270, 300, 360, 420, 480];
  const AWAY_MIN_MS = 10000;
  const APP_VERSION = '1.1.0';
  const DEFAULT_SUBJECTS = ['국어', '수학', '영어', '과학', '사회'];
  const DEFAULT_DISTRACTORS = ['휴대폰', '졸음', '잡담·소음', '할 일이 불명확', '내용이 어려움', '기타'];
  const OUTCOME = { done: '다 끝냄', partial: '일부', notdone: '못 함' };
  const FOCUS_CAP = ['거의 못 함', '자주 끊김', '보통', '잘 됨', '아주 잘 됨'];
  const PHASE = { normal: '일반', A: 'A(기록만)', B: 'B(피드백)' };
  const TIPS = {
    '휴대폰': { title: '휴대폰과 거리 두기', body: () => '공부를 시작할 때 알림을 끄고, 휴대폰은 휴식 시간에만 보기로 정해 보세요.', short: '휴대폰 때문에 끊겼네요. 다음엔 시작할 때 알림부터 꺼 보세요.' },
    '졸음': { title: '졸린 시간대 앞에 휴식 넣기', body: (ws) => ws && ws.lowHour != null ? `${ws.lowHour}시대 공부 전에 5분 일어나 스트레칭을 하고 시작해 보세요.` : '졸음이 오면 5분 일어나 스트레칭을 하고 다시 시작해 보세요.', short: '졸음 때문에 힘들었네요. 다음 할 일 전에 5분 일어나 움직여 보세요.' },
    '잡담·소음': { title: '자리와 쉬는 시간 맞추기', body: () => '조용한 자리로 옮기거나, 친구들과 쉬는 시간을 맞춰 공부 시간에는 대화를 줄여 보세요.', short: '주변이 시끄러웠네요. 다음엔 조용한 자리를 먼저 잡아 보세요.' },
    '할 일이 불명확': { title: '전날 범위까지 정해 두기', body: () => '야자 전에 할 일을 범위까지 적어 두세요. 예: "수학 문제집" 대신 "수학 2단원 15~30번".', short: '할 일을 더 작게 쪼개 보세요. 예: "수학 문제집" 대신 "수학 2단원 15~30번".' },
    '내용이 어려움': { title: '질문 목록 만들기', body: () => '막힌 문제를 메모해 두었다가 다음 날 선생님께 질문해 보세요. 혼자 오래 붙잡는 시간을 줄일 수 있어요.', short: '막힌 부분을 메모해 두고 선생님께 질문해 보세요.' },
  };

  // ---------- small utils ----------
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const pad = (n) => String(n).padStart(2, '0');
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const avg = (a) => (a.length ? sum(a) / a.length : null);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  function dayKey(d) { d = new Date(d); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function parseDay(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); }
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function weekStart(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
  function fmtDateLong(d) { return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WD[d.getDay()]})`; }
  function fmtHM(ms) {
    const m = Math.max(0, Math.round(ms / 60000)); const h = Math.floor(m / 60); const r = m % 60;
    if (!h) return `${r}분`; return r ? `${h}시간 ${r}분` : `${h}시간`;
  }
  function fmtDur(ms) { return ms < 60000 ? `${Math.max(1, Math.round(ms / 1000))}초` : fmtHM(ms); }
  function fmtClock(ms) { const s = Math.max(0, Math.floor(ms / 1000)); return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`; }
  function fmtTime(ts) { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
  function fmtShortHM(ms) { const m = Math.round(ms / 60000); return `${Math.floor(m / 60)}:${pad(m % 60)}`; }
  function pct(x) { return `${Math.round(x * 100)}%`; }
  function batchim(word) { const c = word.charCodeAt(word.length - 1); if (c < 0xac00 || c > 0xd7a3) return null; return (c - 0xac00) % 28 !== 0; }
  function josa(word, a, b) { const t = batchim(word); return word + (t === null ? `${a}(${b})` : t ? a : b); }
  function iga(word) { const t = batchim(word); return t === null ? '이(가)' : t ? '이' : '가'; }
  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // ---------- state ----------
  let storageOK = true;
  function freshState() {
    return {
      v: 1, sample: false,
      profile: { nick: '', code: '', dailyGoalMin: 240, phase: 'normal', away: 'record', keepAwake: true, chime: true, submit: false, submitUrl: '', lastSent: null, installDismissed: false,
        deviceId: 'd' + uid(), mentorCode: '', mentorConsent: false, camSens: 'normal', camPreview: true, camAlarm: true, camVibrate: true, camAuto: false },
      subjects: DEFAULT_SUBJECTS.map((name, i) => ({ id: 's' + i + uid(), name, slot: i })),
      distractors: DEFAULT_DISTRACTORS.slice(),
      tasks: [], sessions: [], running: null, lastFeedback: null,
      exams: [], goals: {}, goalNote: '',
      mentor: { chat: [], notes: [] },
    };
  }
  function migrate(s) {
    const f = freshState();
    if (!s || typeof s !== 'object') return f;
    s.profile = Object.assign({}, f.profile, s.profile || {});
    if (!Array.isArray(s.subjects) || !s.subjects.length) s.subjects = f.subjects;
    if (!Array.isArray(s.distractors) || !s.distractors.length) s.distractors = f.distractors;
    if (!Array.isArray(s.tasks)) s.tasks = [];
    if (!Array.isArray(s.sessions)) s.sessions = [];
    if (s.running && typeof s.running !== 'object') s.running = null;
    if (!Array.isArray(s.exams)) s.exams = [];
    if (!s.goals || typeof s.goals !== 'object') s.goals = {};
    if (typeof s.goalNote !== 'string') s.goalNote = '';
    if (!s.mentor || typeof s.mentor !== 'object') s.mentor = { chat: [], notes: [] };
    if (!Array.isArray(s.mentor.chat)) s.mentor.chat = [];
    if (!Array.isArray(s.mentor.notes)) s.mentor.notes = [];
    if (!s.profile.deviceId) s.profile.deviceId = 'd' + uid();
    s.v = 1;
    return s;
  }
  function loadState() {
    try { const raw = localStorage.getItem(KEY); if (raw) return migrate(JSON.parse(raw)); }
    catch (e) { storageOK = false; }
    return null;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); storageOK = true; }
    catch (e) { storageOK = false; }
  }

  function makeSample() {
    const s = freshState(); s.sample = true;
    const rnd = mulberry32(20261110);
    const [kor, math, eng, sci, soc] = s.subjects;
    const titles = new Map([
      [math.id, ['수학 2단원 문제 15~30번', '미적분 기출 3회', '수학 오답 정리', '확통 개념 복습', '수학 4점 문제 5개']],
      [kor.id, ['문학 기출 2지문', '비문학 독해 3지문', '언어와 매체 문법']],
      [eng.id, ['영어 단어 Day 12', '수능특강 영어 7강', '영어 듣기 1회']],
      [sci.id, ['물리 역학 개념 정리', '화학 몰 계산 문제']],
      [soc.id, ['한국사 근현대 정리', '사회문화 기출 1회']],
    ]);
    const pickSubject = () => { const r = rnd(); return r < 0.34 ? math : r < 0.55 ? kor : r < 0.75 ? eng : r < 0.9 ? sci : soc; };
    const pickTitle = (sub) => { const a = titles.get(sub.id); return a[Math.floor(rnd() * a.length)]; };
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let lastDayTasks = [];
    for (let back = 20; back >= 1; back--) {
      const d = addDays(today, -back); const dow = d.getDay();
      if (dow === 0 || dow === 6) continue;
      const key = dayKey(d);
      const n = rnd() < 0.3 ? 2 : 3;
      let cursor = new Date(d); cursor.setHours(18, 35, 0, 0);
      const dayTasks = [];
      for (let i = 0; i < n; i++) {
        const sub = pickSubject();
        const planned = [30, 40, 50][Math.floor(rnd() * 3)];
        const factor = sub === math ? 1.45 + rnd() * 0.35 : 0.85 + rnd() * 0.35;
        const hour = cursor.getHours();
        const dist = [];
        if (rnd() < 0.38) dist.push('휴대폰');
        if (hour >= 21 && rnd() < 0.65) dist.push('졸음');
        if (rnd() < 0.12) dist.push('잡담·소음');
        if (sub === math && rnd() < 0.22) dist.push('내용이 어려움');
        let focus = hour >= 21 ? (rnd() < 0.55 ? 2 : 3) : (rnd() < 0.55 ? 4 : rnd() < 0.5 ? 5 : 3);
        if (dist.length >= 2) focus = Math.max(1, focus - 1);
        let outcome = rnd() < (hour >= 21 ? 0.55 : 0.8) ? 'done' : rnd() < 0.6 ? 'partial' : 'notdone';
        const grossMin = outcome === 'done' ? planned * factor : outcome === 'partial' ? planned * factor * 0.7 : planned * 0.5;
        const breakMin = rnd() < 0.4 ? 5 : 0;
        const awayMin = dist.includes('휴대폰') ? 2 + rnd() * 6 : rnd() < 0.2 ? 1 : 0;
        const task = { id: uid(), date: key, subjectId: sub.id, title: pickTitle(sub), plannedMin: planned, status: outcome };
        const start = cursor.getTime(); const gross = Math.round(grossMin * 60000);
        const end = start + gross + breakMin * 60000;
        s.tasks.push(task); dayTasks.push(task);
        s.sessions.push({ id: uid(), taskId: task.id, subjectId: sub.id, taskTitle: task.title, plannedMin: planned, date: key, start, end,
          studyMs: gross, grossMs: gross, breakMs: breakMin * 60000, awayMs: Math.round(awayMin * 60000), awayCount: awayMin ? 1 + Math.floor(rnd() * 2) : 0,
          awayExcluded: false, outcome, focus, distractors: dist, memo: '', phase: 'normal' });
        cursor = new Date(end + 10 * 60000);
      }
      lastDayTasks = dayTasks;
    }
    // make sure the last school day left something unfinished, so "가져오기" can be tried
    const lastTask = lastDayTasks[lastDayTasks.length - 1];
    if (lastTask && lastTask.status === 'done') {
      lastTask.status = 'partial';
      const ls = s.sessions.find((x) => x.taskId === lastTask.id);
      if (ls) { ls.outcome = 'partial'; ls.studyMs = ls.grossMs = Math.round(ls.grossMs * 0.6); }
    }
    const tk = dayKey(today);
    const t1 = { id: uid(), date: tk, subjectId: math.id, title: '수학 오답 정리', plannedMin: 40, status: 'todo' };
    const t2 = { id: uid(), date: tk, subjectId: eng.id, title: '영어 단어 Day 13', plannedMin: 20, status: 'todo' };
    const t3 = { id: uid(), date: tk, subjectId: kor.id, title: '비문학 독해 3지문', plannedMin: 40, status: 'todo' };
    s.tasks.push(t1, t2, t3);
    const now = new Date();
    if (now.getHours() >= 19 && now.getHours() < 24) {
      const start = new Date(today); start.setHours(18, 35, 0, 0);
      const gross = 46 * 60000;
      t1.status = 'done';
      s.sessions.push({ id: uid(), taskId: t1.id, subjectId: math.id, taskTitle: t1.title, plannedMin: 40, date: tk, start: start.getTime(), end: start.getTime() + gross,
        studyMs: gross, grossMs: gross, breakMs: 0, awayMs: 0, awayCount: 0, awayExcluded: false, outcome: 'done', focus: 4, distractors: [], memo: '', phase: 'normal' });
    }
    // camera numbers on a few late sessions, so the report shows what the camera adds
    s.sessions.filter((x) => new Date(x.start).getHours() >= 20).slice(-6).forEach((x, i) => {
      x.camUsed = true; x.camAwayMs = (i % 3) * 120000; x.drowsyCount = x.distractors.includes('졸음') ? 1 + (i % 2) : 0; x.camAwayExcluded = false;
    });
    // example grades and goals (mock exams: 9 grades; English is graded absolutely, so it has no percentile)
    const e1 = addDays(today, -21); const e2 = addDays(today, -4);
    s.exams.push(
      { id: uid(), date: dayKey(e1), type: 'mock', name: `${e1.getMonth() + 1}월 모의고사`, scores: { [kor.id]: { grade: 3, pct: 82 }, [math.id]: { grade: 4, pct: 71 }, [eng.id]: { grade: 2, pct: null }, [sci.id]: { grade: 3, pct: 80 } } },
      { id: uid(), date: dayKey(e2), type: 'mock', name: `${e2.getMonth() + 1}월 모의고사`, scores: { [kor.id]: { grade: 2, pct: 89 }, [math.id]: { grade: 4, pct: 74 }, [eng.id]: { grade: 2, pct: null }, [sci.id]: { grade: 3, pct: 78 } } }
    );
    s.goals = { [kor.id]: { grade: 2 }, [math.id]: { grade: 2 }, [eng.id]: { grade: 1 }, [sci.id]: { grade: 2 } };
    s.goalNote = '겨울방학 전에 수학 3등급 안으로 들어가기';
    s.mentor.notes.push({ id: uid(), date: dayKey(addDays(today, -2)), summary: '수학은 시간을 가장 많이 쓰는데 개념 부족 오답이 반복돼서, 개념서를 다시 읽는 대신 책을 덮고 백지에 정리해 보기로 했어요. 21시대 졸음이 잦아서 그 앞에 스트레칭을 넣기로 했어요.',
      promises: [{ text: '수학 단원 하나를 책 덮고 백지에 정리하기', done: true }, { text: '21시 전에 5분 일어나 스트레칭하기', done: false }] });
    return s;
  }

  let state = loadState();
  if (!state) { state = makeSample(); save(); }
  try { localStorage.setItem(KEY + '-probe', '1'); localStorage.removeItem(KEY + '-probe'); } catch (e) { storageOK = false; }

  // ---------- lookups ----------
  const subj = (id) => state.subjects.find((s) => s.id === id) || null;
  const subjName = (id) => (subj(id) ? subj(id).name : '삭제된 과목');
  const taskById = (id) => state.tasks.find((t) => t.id === id) || null;
  const taskActualMs = (id) => sum(state.sessions.filter((s) => s.taskId === id).map((s) => s.studyMs));
  function subjTag(id) { const s = subj(id); return `<span class="subj"><i class="dot" style="--c:var(--s${s ? s.slot + 1 : 1})"></i>${esc(s ? s.name : '삭제된 과목')}</span>`; }
  function studyLive(r, now) { return r.studyMs + (r.mode === 'study' ? now - r.modeSince : 0); }
  function breakLive(r, now) { return r.breakMs + (r.mode === 'break' ? now - r.modeSince : 0); }
  function todayStudyMs() {
    const k = dayKey(new Date());
    let t = sum(state.sessions.filter((s) => s.date === k).map((s) => s.studyMs));
    const r = state.running;
    if (r && dayKey(r.startedAt) === k) t += studyLive(r, r.endAt || Date.now());
    return t;
  }

  // ---------- view state ----------
  let view = 'today';
  let calMonth = (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); })();
  let calSel = dayKey(new Date());
  let weekOffset = 0;
  let co = null;
  let exportKind = 'sessions';
  let lastSubj = null;
  let lastMin = 30;
  let restoreDraft = '';
  let logMode = 'study';
  let examDraft = null;
  let mentorBusy = false; let mentorErr = ''; let mentorDraft = '';
  let reportAI = { key: null, text: '', busy: false, err: '' };
  const armed = {};

  // ---------- toast ----------
  let toastTimer = null;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }

  // ---------- render: shell ----------
  function render() {
    $('#hdrDate').textContent = fmtDateLong(new Date());
    const ph = state.profile.phase; const pill = $('#phasePill');
    pill.hidden = ph === 'normal'; pill.textContent = ph === 'A' ? '실험 A주 · 기록만' : '실험 B주 · 피드백';
    $('#sampleBar').hidden = !state.sample;
    $('#storeWarn').hidden = storageOK;
    VIEWS.forEach((v) => { $('#v-' + v).hidden = v !== view; });
    $$('.tab').forEach((a) => { if (a.dataset.view === view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    if (view === 'today') renderToday();
    else if (view === 'log') renderLog();
    else if (view === 'report') renderReport();
    else if (view === 'mentor') renderMentor();
    else renderPrefs();
    renderTimer();
    renderCheckout();
  }

  // ---------- render: today ----------
  function carryCandidates() {
    const tk = dayKey(new Date());
    const prevDates = [...new Set(state.tasks.filter((t) => t.date < tk).map((t) => t.date))].sort();
    const last = prevDates[prevDates.length - 1];
    if (!last) return [];
    const carried = new Set(state.tasks.filter((t) => t.date === tk && t.carriedFrom).map((t) => t.carriedFrom));
    return state.tasks.filter((t) => t.date === last && t.status !== 'done' && !carried.has(t.id));
  }
  function statusPill(st) {
    if (st === 'done') return '<span class="pill good">✓ 끝냄</span>';
    if (st === 'partial') return '<span class="pill lamp">일부</span>';
    if (st === 'notdone') return '<span class="pill mute">못 함</span>';
    return '';
  }
  function taskRow(t) {
    const r = state.running;
    const isRunning = r && r.taskId === t.id;
    const hasSess = state.sessions.some((x) => x.taskId === t.id);
    const act = Math.round(taskActualMs(t.id) / 60000);
    let btn = '';
    if (isRunning) btn = `<button class="btn small" data-act="open-timer">진행 중</button>`;
    else if (t.status !== 'done') btn = `<button class="btn small ${t.status === 'todo' ? 'primary' : ''}" data-act="start" data-id="${t.id}" ${r ? 'disabled' : ''}>${t.status === 'todo' ? '시작' : '이어서'}</button>`;
    const del = !hasSess && !isRunning ? `<button class="icon-btn" data-act="del-task" data-id="${t.id}" aria-label="${esc(t.title)} 삭제">×</button>` : '';
    return `<li class="task ${t.status}">
      <div><div class="task-title">${esc(t.title)}</div>
      <div class="task-meta">${subjTag(t.subjectId)}<span>예상 ${t.plannedMin}분${hasSess ? ` · 실제 ${act}분` : ''}</span>${statusPill(t.status)}</div></div>
      <div class="task-act">${btn}${del}</div></li>`;
  }
  function coachText(tasks) {
    if (state.running) return '공부 중이에요. 끝나면 "끝내고 점검하기"로 결과를 꼭 남겨 주세요.';
    if (!tasks.length) return '공부를 시작하기 전에 오늘 할 일을 적어 보세요. 계획이 있어야 끝난 뒤 점검할 수 있어요.';
    if (tasks.every((t) => t.status === 'done')) return '오늘 계획을 모두 끝냈어요. 더 할 일이 있으면 추가해 보세요.';
    if (tasks.every((t) => t.status === 'todo')) return '계획이 준비됐어요. 첫 할 일을 시작해 볼까요?';
    const next = tasks.find((t) => t.status === 'todo');
    return next ? `다음 할 일: ${next.title}` : '못 끝낸 할 일은 "이어서"로 다시 시작할 수 있어요.';
  }
  const latestNote = () => (state.mentor.notes.length ? state.mentor.notes[state.mentor.notes.length - 1] : null);
  function promisesHTML(onToday) {
    const n = latestNote();
    if (!n || !n.promises || !n.promises.length || state.profile.phase === 'A') return '';
    return `<section class="card" aria-labelledby="pr${onToday ? 'T' : 'M'}">
      <div class="card-head"><h2 id="pr${onToday ? 'T' : 'M'}">멘토와 한 약속</h2>${onToday ? '<a class="btn ghost small" href="#mentor">멘토 열기</a>' : `<span class="muted small-text">${fmtDateLong(parseDay(n.date))} 상담</span>`}</div>
      ${onToday ? '' : `<p>${esc(n.summary)}</p>`}
      <div>${n.promises.map((p, i) => `<label class="promise ${p.done ? 'done' : ''}"><input type="checkbox" data-act="promise" data-i="${i}" ${p.done ? 'checked' : ''}><span>${esc(p.text)}</span></label>`).join('')}</div>
      ${onToday ? `<p class="muted small-text">${fmtDateLong(parseDay(n.date))} 상담에서 정했어요. 실천하면 체크하세요.</p>` : ''}
    </section>`;
  }
  function feedbackHTML() {
    const f = state.lastFeedback;
    if (!f || f.date !== dayKey(new Date()) || state.profile.phase === 'A') return '';
    return `<section class="card fb" aria-labelledby="fbH">
      <div class="card-head"><h2 id="fbH">방금 점검 결과</h2><button class="btn ghost small" data-act="dismiss-fb">닫기</button></div>
      <p class="fb-task">${esc(f.task)}</p>
      <ul class="fb-list">${f.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></section>`;
  }
  function goalHTML() {
    const goal = state.profile.dailyGoalMin * 60000; const done = todayStudyMs();
    const p = Math.min(100, (done / goal) * 100);
    const text = done >= goal ? `목표 ${fmtHM(goal)} 달성` : `목표 ${fmtHM(goal)}까지 ${fmtHM(goal - done)} 남음`;
    return { p, text, met: done >= goal };
  }
  function renderToday() {
    const tk = dayKey(new Date());
    const tasks = state.tasks.filter((t) => t.date === tk);
    const sess = state.sessions.filter((s) => s.date === tk);
    const doneN = tasks.filter((t) => t.status === 'done').length;
    const fa = avg(sess.map((s) => s.focus));
    const g = goalHTML();
    const carry = carryCandidates();
    if (!lastSubj || !subj(lastSubj)) lastSubj = state.subjects[0].id;
    $('#v-today').innerHTML = `
      <div style="display:grid;gap:16px">
      <section class="hero" aria-label="오늘 순공 시간">
        <div class="eyebrow">오늘 순공 시간</div>
        <div class="hero-num" id="heroNum">${fmtHM(todayStudyMs())}</div>
        <div class="goal">
          <div class="goal-track ${g.met ? 'met' : ''}" id="goalTrack" role="progressbar" aria-label="하루 목표 진행" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(g.p)}"><span id="goalFill" style="width:${g.p}%"></span></div>
          <div class="goal-text" id="goalText">${g.text}</div>
        </div>
        <div class="hero-meta">할 일 ${doneN}/${tasks.length} 끝냄${fa != null ? ` · 평균 집중도 ${fa.toFixed(1)} / 5` : ''}</div>
      </section>
      <div class="coach"><span class="coach-tag">관리실</span><p>${esc(coachText(tasks))}</p></div>
      ${installCardHTML()}
      ${promisesHTML(true)}
      ${feedbackHTML()}
      <section class="card" aria-labelledby="planH">
        <div class="card-head"><h2 id="planH">오늘 계획</h2><span class="muted small-text">${tasks.length}개</span></div>
        <ul class="tasks">${tasks.length ? tasks.map(taskRow).join('') : '<li class="empty">아직 계획이 없어요. 아래에서 첫 할 일을 추가해 보세요.</li>'}</ul>
        ${carry.length ? `<div><button class="btn ghost small" data-act="carry">지난번 못 끝낸 할 일 ${carry.length}개 가져오기</button></div>` : ''}
        <form id="addForm" class="add" autocomplete="off" novalidate>
          <div class="add-row">
            <div class="field"><label for="addSubj" class="sr">과목</label>
              <select id="addSubj">${state.subjects.map((s) => `<option value="${s.id}" ${s.id === lastSubj ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
            <div class="field"><label for="addMin" class="sr">예상 시간</label>
              <select id="addMin">${MINUTES.map((m) => `<option value="${m}" ${m === lastMin ? 'selected' : ''}>예상 ${m}분</option>`).join('')}</select></div>
          </div>
          <div class="add-row title-row">
            <label for="addTitle" class="sr">할 일</label>
            <input id="addTitle" type="text" maxlength="40" placeholder="예: 수학 2단원 문제 15~30번">
            <button class="btn primary" type="submit">추가</button>
          </div>
          <p class="form-err" id="addErr" hidden></p>
        </form>
      </section>
      </div>`;
  }

  // ---------- timer ----------
  let wakeLock = null; let wakeState = 'off';
  async function requestWake() {
    const r = state.running;
    if (!r || r.endAt || !r.overlay || !state.profile.keepAwake || document.hidden) return;
    if (wakeLock) return;
    if (!('wakeLock' in navigator)) { wakeState = 'unsupported'; renderWake(); return; }
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeState = 'on';
      wakeLock.addEventListener('release', () => { wakeLock = null; wakeState = 'off'; renderWake(); });
    } catch (e) { wakeLock = null; wakeState = 'denied'; }
    renderWake();
  }
  function releaseWake() { try { if (wakeLock) wakeLock.release(); } catch (e) { /* ignore */ } wakeLock = null; wakeState = 'off'; }
  function renderWake() {
    const el = $('#tWake'); if (!el) return;
    if (!state.profile.keepAwake) el.textContent = '';
    else if (wakeState === 'on') el.textContent = '화면 켜짐 유지 중';
    else if (wakeState === 'unsupported' || wakeState === 'denied') el.textContent = '이 기기에선 화면 켜짐 유지가 안 돼요';
    else el.textContent = '';
  }

  let audioCtx = null;
  function ensureAudio() {
    try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === 'suspended') audioCtx.resume(); }
    catch (e) { audioCtx = null; }
  }
  function chime() {
    if (!audioCtx || !state.profile.chime) return;
    try {
      const t = audioCtx.currentTime;
      [[659.25, 0], [880, 0.2]].forEach(([f, dt]) => {
        const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + dt); g.gain.exponentialRampToValueAtTime(0.16, t + dt + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.7);
        o.connect(g).connect(audioCtx.destination); o.start(t + dt); o.stop(t + dt + 0.75);
      });
    } catch (e) { /* ignore */ }
  }

  function startTask(id) {
    if (state.running) return;
    const t = taskById(id); if (!t) return;
    if (state.sample) { toast('예시 할 일은 시작할 수 없어요. "예시 지우고 시작하기"를 눌러 주세요.'); return; }
    ensureAudio();
    if (Cam.state === 'error') Cam.state = 'off';
    const now = Date.now();
    const prior = taskActualMs(t.id);
    state.running = { taskId: t.id, subjectId: t.subjectId, startedAt: now, mode: 'study', modeSince: now, studyMs: 0, breakMs: 0,
      awayMs: 0, awayCount: 0, hiddenSince: null, chimed: prior >= t.plannedMin * 60000, endAt: null, overlay: true,
      cam: { used: false, awayMs: 0, drowsyCount: 0 } };
    save(); render(); requestWake();
    Arduino.send('S');
    if (state.profile.camAuto && Cam.supported()) camToggle();
  }
  function toggleBreak() {
    const r = state.running; if (!r || r.endAt) return;
    const now = Date.now();
    if (r.mode === 'study') { r.studyMs += now - r.modeSince; r.mode = 'break'; if (Cam.state === 'on') addCam(Cam.pause()); Arduino.send('B'); }
    else { r.breakMs += now - r.modeSince; r.mode = 'study'; if (Cam.state === 'on') Cam.resume(); Arduino.send('S'); }
    r.modeSince = now; save(); renderTimer();
  }

  // ---------- camera during a session (video never leaves the device) ----------
  let camStatus = '';
  function camRec() { const r = state.running; if (!r) return null; if (!r.cam) r.cam = { used: false, awayMs: 0, drowsyCount: 0 }; return r.cam; }
  function addCam(f) { const c = camRec(); if (!c || !f) return; c.awayMs += f.awayMs || 0; c.drowsyCount += f.drowsyCount || 0; save(); }
  function camTotals() { const c = camRec() || { awayMs: 0, drowsyCount: 0 }; const p = Cam.peek(); return { awayMs: c.awayMs + (p ? p.awayMs : 0), drowsyCount: c.drowsyCount + (p ? p.drowsyCount : 0) }; }
  async function camToggle() {
    const r = state.running; if (!r || r.endAt) return;
    if (Cam.state === 'on' || Cam.state === 'loading') { addCam(Cam.stop()); camStatus = ''; renderCam(); return; }
    if (!Cam.supported()) { toast('이 브라우저에서는 카메라를 쓸 수 없어요. https 주소의 앱에서 열어 주세요.'); return; }
    ensureAudio();
    const ok = await Cam.start({ video: $('#camVideo'), sensitivity: state.profile.camSens, onEvent: onCamEvent, onStatus: (st) => { camStatus = st; renderCam(); }, onState: renderCam });
    if (ok && state.running) {
      camRec().used = true; save();
      if (state.running.mode !== 'study' || state.running.endAt) addCam(Cam.pause());
      toast('카메라 관리를 시작했어요. 영상은 저장되지 않아요.');
    } else if (ok) { Cam.stop(); }
    renderCam();
  }
  function onCamEvent(ev) { if (ev.type === 'drowsy') triggerAlarm(ev.reason); }
  function renderCam() {
    const btn = $('#camBtn'); if (!btn) return;
    const st = Cam.state;
    btn.textContent = st === 'on' ? '카메라 끄기' : st === 'loading' ? '카메라 준비 중…' : '카메라 관리 켜기';
    btn.setAttribute('aria-pressed', st === 'on' ? 'true' : 'false'); btn.disabled = st === 'loading';
    const box = $('#camBox'); box.hidden = st !== 'on' && st !== 'loading'; box.classList.toggle('no-preview', !state.profile.camPreview);
    let text = ''; let warn = false;
    if (st === 'error') { text = Cam.error; warn = true; }
    else if (st === 'loading') text = '얼굴 인식 모델을 불러오는 중이에요. 처음 한 번은 조금 걸려요.';
    else if (st === 'on') {
      if (Cam.isPaused()) text = '휴식 중이라 카메라 판정을 쉬고 있어요';
      else {
        text = ({ face: '얼굴 확인 중', closed: '눈이 감겨 있어요', noface: '얼굴이 잘 안 보여요', away: '자리 비움으로 기록 중', headdown: '엎드린 것 같아요' })[camStatus] || '얼굴 확인 중';
        warn = ['away', 'headdown', 'closed'].includes(camStatus);
      }
      const tot = camTotals();
      if (tot.awayMs >= 60000 || tot.drowsyCount) text += ` · 자리 비움 ${fmtHM(tot.awayMs)} · 졸음 ${tot.drowsyCount}회`;
    } else text = '켜면 졸음과 자리 비움을 알려 줘요. 영상은 저장하지 않아요.';
    const s = $('#camStatus'); s.textContent = text; s.classList.toggle('warn', warn);
    $('#camBadge').textContent = st !== 'on' ? '' : Cam.isPaused() ? '쉬는 중' : camStatus === 'away' || camStatus === 'headdown' ? '자리 비움' : camStatus === 'closed' ? '눈 감김' : camStatus === 'noface' ? '확인 중' : '● 인식';
  }
  setInterval(() => { if (state.running && Cam.state === 'on' && !Cam.isPaused()) addCam(Cam.flush()); }, 30000);

  let alarmTimer = null; let alarmStopTimer = null;
  function alarmBeep() {
    if (!audioCtx) return;
    try {
      const t = audioCtx.currentTime;
      [0, 0.22, 0.44].forEach((dt) => {
        const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
        o.type = 'square'; o.frequency.value = 988;
        g.gain.setValueAtTime(0.0001, t + dt); g.gain.exponentialRampToValueAtTime(0.12, t + dt + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.16);
        o.connect(g).connect(audioCtx.destination); o.start(t + dt); o.stop(t + dt + 0.18);
      });
    } catch (e) { /* ignore */ }
  }
  function triggerAlarm(reason) {
    const r = state.running; if (!r || r.endAt) return;
    const box = $('#alarm'); if (!box.hidden) return;
    $('#alarmTitle').textContent = reason === 'headdown' ? '엎드려 있는 것 같아요' : '졸음이 감지됐어요';
    $('#alarmText').textContent = '잠깐 일어나서 30초 스트레칭하고 다시 시작해요.';
    if (!r.overlay) { r.overlay = true; save(); renderTimer(); }
    box.hidden = false;
    const ring = () => { if (state.profile.camAlarm) alarmBeep(); if (state.profile.camVibrate && navigator.vibrate) navigator.vibrate([400, 200, 400]); };
    ring(); clearInterval(alarmTimer); alarmTimer = setInterval(ring, 2000);
    clearTimeout(alarmStopTimer); alarmStopTimer = setTimeout(stopAlarmSound, 30000);
    Arduino.send('W');
    const ok = box.querySelector('button'); if (ok) ok.focus();
  }
  function stopAlarmSound() { clearInterval(alarmTimer); alarmTimer = null; clearTimeout(alarmStopTimer); if (navigator.vibrate) navigator.vibrate(0); Arduino.send('O'); }
  function dismissAlarm() { const box = $('#alarm'); if (box.hidden) return; stopAlarmSound(); box.hidden = true; }
  function renderTimer() {
    const r = state.running;
    const timer = $('#timer'); const mini = $('#mini');
    if (!r) { timer.hidden = true; mini.hidden = true; document.body.classList.remove('has-mini'); return; }
    const t = taskById(r.taskId);
    const showOverlay = r.overlay && !r.endAt;
    const showMini = !r.overlay && !r.endAt;
    timer.hidden = !showOverlay; mini.hidden = !showMini;
    document.body.classList.toggle('has-mini', showMini);
    document.body.style.overflow = showOverlay || r.endAt ? 'hidden' : '';
    const s = subj(r.subjectId); const c = `var(--s${s ? s.slot + 1 : 1})`;
    $('#tDot').style.setProperty('--c', c); $('#miniDot').style.setProperty('--c', c);
    $('#tSubj').textContent = subjName(r.subjectId);
    $('#tTask').textContent = t ? t.title : '';
    $('#miniLabel').textContent = `${subjName(r.subjectId)} · ${t ? t.title : ''}${r.mode === 'break' ? ' (휴식 중)' : ''}`;
    timer.dataset.mode = r.mode === 'break' ? 'break' : 'study';
    $('#tBreak').textContent = r.mode === 'break' ? '다시 공부하기' : '휴식';
    renderWake(); renderCam(); tick();
  }
  function tick() {
    const r = state.running; if (!r || r.endAt) return;
    const now = Date.now();
    const study = studyLive(r, now);
    const t = taskById(r.taskId);
    const prior = t ? taskActualMs(t.id) : 0;
    const plannedMs = t ? t.plannedMin * 60000 : 0;
    const total = prior + study;
    $('#tClock').textContent = fmtClock(study);
    $('#miniClock').textContent = fmtClock(study);
    if (r.mode === 'break') $('#tState').textContent = `휴식 중 ${fmtClock(now - r.modeSince).slice(3)}`;
    else $('#tState').textContent = prior ? `이 할 일 누적 ${fmtHM(total)}` : '공부 중';
    const plan = $('#tPlan');
    if (plannedMs) {
      $('#tBar').style.width = Math.min(100, (total / plannedMs) * 100) + '%';
      const over = total > plannedMs;
      plan.classList.toggle('over', over);
      $('#tPlanText').textContent = over ? `예상 ${t.plannedMin}분보다 ${fmtHM(total - plannedMs)} 더 하고 있어요` : `예상 ${t.plannedMin}분 중 ${Math.floor(total / 60000)}분`;
      if (over && !r.chimed && r.mode === 'study') { r.chimed = true; save(); chime(); toast(`예상한 ${t.plannedMin}분이 지났어요`); }
    }
    const away = $('#tAway');
    if (state.profile.away === 'off') away.textContent = '';
    else if (r.awayCount) away.textContent = `앱을 벗어난 시간 ${fmtDur(r.awayMs)} (${r.awayCount}회)`;
    else away.textContent = '공부 중 앱을 벗어나면 그 시간이 따로 기록돼요';
    if (Cam.state === 'on' && Math.floor(now / 500) % 4 === 0) renderCam();
    if (view === 'today') {
      const hn = $('#heroNum'); if (hn) hn.textContent = fmtHM(todayStudyMs());
      const g = goalHTML(); const gf = $('#goalFill'); const gt = $('#goalText');
      if (gf) gf.style.width = g.p + '%'; if (gt) gt.textContent = g.text;
    }
  }
  setInterval(tick, 500);

  let camPausedByHide = false;
  function onHide() {
    const r = state.running;
    if (r && Cam.state === 'on' && !Cam.isPaused()) { addCam(Cam.pause()); camPausedByHide = true; }
    if (!r || r.endAt || r.mode !== 'study' || state.profile.away === 'off' || r.hiddenSince) return;
    r.hiddenSince = Date.now(); save();
  }
  function onShow() {
    const r = state.running;
    if (camPausedByHide) { camPausedByHide = false; if (r && r.mode === 'study' && !r.endAt && Cam.state === 'on') Cam.resume(); }
    if (r && r.hiddenSince) {
      const dur = Date.now() - r.hiddenSince; r.hiddenSince = null;
      if (dur >= AWAY_MIN_MS) { r.awayMs += dur; r.awayCount += 1; toast(`앱을 벗어난 시간 ${fmtDur(dur)}을 기록했어요`); }
      save();
    }
    if (r) { renderTimer(); requestWake(); }
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) onHide(); else onShow(); });
  window.addEventListener('pagehide', onHide);

  // ---------- checkout ----------
  function newDraft() { return { outcome: null, focus: null, dist: [], none: false, awayEx: state.profile.away === 'exclude', camEx: true, memo: '', err: '' }; }
  function openCheckout() {
    const r = state.running; if (!r || r.endAt) return;
    dismissAlarm();
    if (Cam.state === 'on' && !Cam.isPaused()) addCam(Cam.pause());
    const now = Date.now();
    if (r.mode === 'study') r.studyMs += now - r.modeSince; else r.breakMs += now - r.modeSince;
    r.prevMode = r.mode; r.mode = 'paused'; r.modeSince = now; r.endAt = now;
    co = newDraft(); save(); releaseWake(); render();
    const first = $('#coCard button'); if (first) first.focus();
  }
  function cancelCheckout() {
    const r = state.running; if (!r) return;
    r.mode = r.prevMode === 'break' ? 'break' : 'study'; r.modeSince = Date.now(); r.endAt = null; co = null;
    $('#coCard').innerHTML = '';
    if (Cam.state === 'on' && r.mode === 'study') Cam.resume();
    save(); render(); requestWake();
  }
  function renderCheckout() {
    const r = state.running; const sh = $('#checkout');
    if (!r || !r.endAt) { sh.hidden = true; return; }
    if (!co) co = newDraft();
    const t = taskById(r.taskId);
    const prior = t ? taskActualMs(t.id) : 0;
    sh.hidden = false;
    $('#coCard').innerHTML = `
      <div style="display:grid;gap:4px"><h2 id="coTitle">점검</h2><p class="muted small-text">${esc(subjName(r.subjectId))} · ${esc(t ? t.title : '')}</p></div>
      <div class="co-sum"><span>순공 <b>${fmtHM(r.studyMs)}</b>${r.awayMs > 0 ? ` (이탈 ${fmtDur(r.awayMs)} 포함)` : ''}</span><span>휴식 ${fmtHM(r.breakMs)}</span>${t ? `<span>예상 ${t.plannedMin}분${prior ? ` (이전 기록 ${fmtHM(prior)})` : ''}</span>` : ''}</div>
      <fieldset><legend>할 일을 끝냈나요?</legend>
        <div class="seg">${['done', 'partial', 'notdone'].map((k) => `<button type="button" data-act="co-outcome" data-v="${k}" aria-pressed="${co.outcome === k}">${OUTCOME[k]}</button>`).join('')}</div></fieldset>
      <fieldset><legend>얼마나 집중했나요?</legend>
        <div class="seg five">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-act="co-focus" data-v="${n}" aria-pressed="${co.focus === n}">${n}<small>${FOCUS_CAP[n - 1]}</small></button>`).join('')}</div></fieldset>
      <fieldset><legend>공부를 방해한 것 <span class="muted" style="font-weight:400;font-size:13px">(여러 개 선택)</span></legend>
        <div class="chips">${state.distractors.map((d) => `<button type="button" class="chip" data-act="co-dist" data-v="${esc(d)}" aria-pressed="${co.dist.includes(d)}">${esc(d)}</button>`).join('')}
        <button type="button" class="chip" data-act="co-none" aria-pressed="${co.none}">없었어요</button></div></fieldset>
      ${r.cam && r.cam.used ? `<p class="small-text muted">카메라 확인: 자리 비움 ${fmtHM(r.cam.awayMs)} · 졸음 감지 ${r.cam.drowsyCount}회</p>` : ''}
      ${r.awayMs > 0 ? `<label class="check"><input type="checkbox" id="coAway" ${co.awayEx ? 'checked' : ''}><span>앱을 벗어난 ${fmtDur(r.awayMs)}(${r.awayCount}회)은 공부하지 않았어요. 순공에서 뺄게요.</span></label>` : ''}
      ${r.cam && r.cam.awayMs >= 60000 ? `<label class="check"><input type="checkbox" id="coCamAway" ${co.camEx ? 'checked' : ''}><span>카메라가 확인한 자리 비움 ${fmtHM(r.cam.awayMs)}을 순공에서 뺄게요.</span></label>` : ''}
      <div class="field"><label for="coMemo">메모 <span class="muted" style="font-weight:400">(선택)</span></label><input id="coMemo" type="text" maxlength="100" placeholder="예: 27번 풀이 질문하기" value="${esc(co.memo)}"></div>
      ${co.err ? `<p class="form-err" role="alert">${esc(co.err)}</p>` : ''}
      <div class="sheet-actions"><button class="btn" data-act="co-back">계속 공부하기</button><button class="btn primary" data-act="co-save">저장</button></div>`;
  }
  function overrunOf(task) {
    if (!task.plannedMin) return null;
    return (taskActualMs(task.id) / 60000 - task.plannedMin) / task.plannedMin;
  }
  function buildFeedback(task, sess) {
    const lines = [];
    const actualMin = Math.round(taskActualMs(task.id) / 60000);
    if (sess.outcome === 'done' && task.plannedMin) {
      const d = overrunOf(task);
      if (Math.abs(d) <= 0.15) lines.push(`예상 ${task.plannedMin}분 → 실제 ${actualMin}분. 예상과 거의 같았어요.`);
      else lines.push(`예상 ${task.plannedMin}분 → 실제 ${actualMin}분 (${d > 0 ? '+' : ''}${Math.round(d * 100)}%).`);
    }
    const since = dayKey(addDays(new Date(), -14));
    const hist = state.tasks.filter((t) => t.subjectId === task.subjectId && t.status === 'done' && t.date >= since && t.plannedMin).map(overrunOf).filter((x) => x != null);
    const ha = avg(hist);
    if (hist.length >= 3 && ha >= 0.25) {
      lines.push(`${josa(subjName(task.subjectId), '은', '는')} 최근 끝낸 할 일 ${hist.length}개가 예상보다 평균 ${pct(ha)} 더 걸렸어요. 다음엔 예상 시간을 ${(1 + ha).toFixed(1)}배로 잡아 보세요.`);
    }
    if (sess.focus <= 2) {
      const d = sess.distractors.find((x) => TIPS[x]);
      lines.push(d ? TIPS[d].short : '집중이 어려웠네요. 다음 할 일 전에 5분 쉬고 시작해 보세요.');
    }
    if (sess.outcome !== 'done' && sess.distractors.includes('할 일이 불명확') && !(sess.focus <= 2 && sess.distractors[0] === '할 일이 불명확')) lines.push(TIPS['할 일이 불명확'].short);
    if (!lines.length) lines.push(sess.outcome === 'done' ? '잘했어요. 다음 할 일로 넘어가요.' : '남은 부분은 "이어서"로 다시 시작할 수 있어요.');
    return lines;
  }
  function saveCheckout() {
    const r = state.running; if (!r || !co) return;
    const memoEl = $('#coMemo'); if (memoEl) co.memo = memoEl.value;
    const awayEl = $('#coAway'); if (awayEl) co.awayEx = awayEl.checked;
    const camEl = $('#coCamAway'); if (camEl) co.camEx = camEl.checked;
    if (!co.outcome || !co.focus) { co.err = !co.outcome && !co.focus ? '결과와 집중도를 골라 주세요.' : !co.outcome ? '할 일을 끝냈는지 골라 주세요.' : '집중도를 골라 주세요.'; renderCheckout(); return; }
    if (Cam.state === 'on' || Cam.state === 'loading') addCam(Cam.stop());
    if (Cam.state === 'error') Cam.state = 'off';
    camStatus = '';
    const t = taskById(r.taskId);
    const cam = r.cam || { used: false, awayMs: 0, drowsyCount: 0 };
    const awayEx = !!co.awayEx && r.awayMs > 0;
    const camEx = !!co.camEx && cam.awayMs >= 60000;
    const sess = { id: uid(), taskId: r.taskId, subjectId: r.subjectId, taskTitle: t ? t.title : '', plannedMin: t ? t.plannedMin : 0,
      date: dayKey(r.startedAt), start: r.startedAt, end: r.endAt,
      studyMs: Math.max(0, r.studyMs - (awayEx ? r.awayMs : 0) - (camEx ? cam.awayMs : 0)), grossMs: r.studyMs, breakMs: r.breakMs, awayMs: r.awayMs, awayCount: r.awayCount,
      awayExcluded: awayEx, outcome: co.outcome, focus: co.focus, distractors: co.dist.slice(), memo: (co.memo || '').trim().slice(0, 100), phase: state.profile.phase,
      camUsed: !!cam.used, camAwayMs: Math.round(cam.awayMs), drowsyCount: cam.drowsyCount, camAwayExcluded: camEx };
    Arduino.send('E');
    state.sessions.push(sess);
    if (t) t.status = co.outcome;
    state.lastFeedback = state.profile.phase !== 'A' && t ? { date: dayKey(new Date()), task: `${subjName(t.subjectId)} · ${t.title}`, lines: buildFeedback(t, sess) } : null;
    state.running = null; co = null;
    $('#coCard').innerHTML = '';
    document.body.style.overflow = '';
    save();
    enqueue([sessionItem(sess)].concat(t ? [taskItem(t)] : []));
    if (view !== 'today') { location.hash = 'today'; } else render();
    toast('점검을 저장했어요');
  }

  // ---------- render: log ----------
  function level(ms) { const m = ms / 60000; return m <= 0 ? 0 : m < 60 ? 1 : m < 120 ? 2 : m < 180 ? 3 : 4; }
  function renderLog() {
    $('#v-log').innerHTML = `<div style="display:grid;gap:16px">
      <div class="seg-tabs" role="group" aria-label="기록 보기">
        <button type="button" data-act="log-mode" data-v="study" aria-pressed="${logMode === 'study'}">공부 기록</button>
        <button type="button" data-act="log-mode" data-v="grades" aria-pressed="${logMode === 'grades'}">성적·목표</button>
      </div>
      ${logMode === 'grades' ? gradesHTML() : studyLogHTML()}</div>`;
  }
  function studyLogHTML() {
    const y = calMonth.getFullYear(); const mo = calMonth.getMonth();
    const lead = (new Date(y, mo, 1).getDay() + 6) % 7;
    const days = new Date(y, mo + 1, 0).getDate();
    const byDay = {};
    state.sessions.forEach((s) => { byDay[s.date] = (byDay[s.date] || 0) + s.studyMs; });
    const tk = dayKey(new Date());
    let cells = ['월', '화', '수', '목', '금', '토', '일'].map((w) => `<div class="cal-wd">${w}</div>`).join('');
    for (let i = 0; i < lead; i++) cells += '<div class="day pad" aria-hidden="true"></div>';
    let monthMs = 0; let studied = 0;
    for (let d = 1; d <= days; d++) {
      const k = dayKey(new Date(y, mo, d)); const ms = byDay[k] || 0;
      monthMs += ms; if (ms > 0) studied++;
      cells += `<button class="day ${k === tk ? 'today' : ''}" data-l="${level(ms)}" data-act="cal-day" data-key="${k}" aria-pressed="${k === calSel}" aria-label="${mo + 1}월 ${d}일 순공 ${fmtHM(ms)}"><span>${d}</span>${ms ? `<span class="d-min">${fmtShortHM(ms)}</span>` : ''}</button>`;
    }
    const selDate = parseDay(calSel);
    const sess = state.sessions.filter((s) => s.date === calSel).sort((a, b) => a.start - b.start);
    const unstarted = state.tasks.filter((t) => t.date === calSel && !state.sessions.some((s) => s.taskId === t.id));
    const selMs = sum(sess.map((s) => s.studyMs));
    return `
      <div style="display:grid;gap:16px">
      <section class="card" aria-labelledby="calH">
        <div class="month-nav">
          <button class="icon-btn" data-act="cal-prev" aria-label="이전 달">‹</button>
          <h2 id="calH">${y}년 ${mo + 1}월</h2>
          <button class="icon-btn" data-act="cal-next" aria-label="다음 달">›</button>
        </div>
        <p class="muted small-text">이번 달 순공 ${fmtHM(monthMs)} · 공부한 날 ${studied}일</p>
        <div class="cal">${cells}</div>
        <div class="legend"><span>순공</span><i style="background:var(--heat-0)"></i>0 <i style="background:var(--heat-1)"></i>1시간 미만 <i style="background:var(--heat-2)"></i>1~2시간 <i style="background:var(--heat-3)"></i>2~3시간 <i style="background:var(--heat-4)"></i>3시간 이상</div>
      </section>
      <section class="card" aria-labelledby="dayH">
        <div class="card-head"><h2 id="dayH">${fmtDateLong(selDate)}</h2><span class="muted small-text">순공 ${fmtHM(selMs)}</span></div>
        ${sess.length ? `<ul class="sess-list">${sess.map((s) => `<li class="sess">
            <div class="sess-time">${fmtTime(s.start)}–${fmtTime(s.end)}</div>
            <div><div>${subjTag(s.subjectId)} <b style="font-weight:600">${esc(s.taskTitle || (taskById(s.taskId) || {}).title || '')}</b></div>
            <div class="sess-sub">순공 ${fmtHM(s.studyMs)} · 집중 ${s.focus}/5 · ${OUTCOME[s.outcome] || ''}${s.distractors.length ? ' · ' + esc(s.distractors.join(', ')) : ''}${s.awayMs ? ` · 이탈 ${fmtDur(s.awayMs)}` : ''}</div>
            ${s.memo ? `<div class="sess-sub">메모: ${esc(s.memo)}</div>` : ''}</div></li>`).join('')}</ul>` : '<p class="empty">이날은 점검 기록이 없어요.</p>'}
        ${unstarted.length ? `<p class="small-text muted">시작하지 않은 할 일: ${unstarted.map((t) => esc(t.title)).join(', ')}</p>` : ''}
      </section>
      </div>`;
  }

  // ---------- report ----------
  function weekStats(start, days = 7) {
    const keys = []; for (let i = 0; i < days; i++) keys.push(dayKey(addDays(start, i)));
    const ks = new Set(keys);
    const tk = dayKey(new Date());
    const sessions = state.sessions.filter((s) => ks.has(s.date));
    // a plan counts once its day is over or it has been checked; today's untouched plans are still open
    const tasks = state.tasks.filter((t) => ks.has(t.date) && (t.date < tk || t.status !== 'todo'));
    const totalMs = sum(sessions.map((s) => s.studyMs));
    const grossMs = sum(sessions.map((s) => s.grossMs || s.studyMs));
    const awayMs = sum(sessions.map((s) => s.awayMs || 0));
    const bySubj = {}; sessions.forEach((s) => { bySubj[s.subjectId] = (bySubj[s.subjectId] || 0) + s.studyMs; });
    const subjects = Object.entries(bySubj).map(([id, ms]) => ({ id, ms })).sort((a, b) => b.ms - a.ms);
    const doneCount = tasks.filter((t) => t.status === 'done').length;
    const completion = tasks.length ? doneCount / tasks.length : null;
    const avgFocus = avg(sessions.map((s) => s.focus));
    const hours = {}; sessions.forEach((s) => { const h = new Date(s.start).getHours(); (hours[h] = hours[h] || []).push(s.focus); });
    const focusByHour = Object.entries(hours).map(([h, a]) => ({ hour: Number(h), avg: avg(a), n: a.length })).sort((a, b) => a.hour - b.hour);
    const dc = {}; sessions.forEach((s) => s.distractors.forEach((d) => { dc[d] = (dc[d] || 0) + 1; }));
    const distractors = Object.entries(dc).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
    const acc = {}; tasks.filter((t) => t.status === 'done' && t.plannedMin).forEach((t) => { const o = overrunOf(t); (acc[t.subjectId] = acc[t.subjectId] || []).push(o); });
    const accuracy = Object.entries(acc).map(([id, a]) => ({ id, name: subjName(id), avg: avg(a), n: a.length })).sort((a, b) => b.avg - a.avg);
    const studyDays = new Set(sessions.filter((s) => s.studyMs > 0).map((s) => s.date)).size;
    const low = focusByHour.filter((h) => h.n >= 2).sort((a, b) => a.avg - b.avg)[0];
    const camS = sessions.filter((s) => s.camUsed);
    const drowsyHours = {}; camS.forEach((s) => { if (s.drowsyCount) { const h = new Date(s.start).getHours(); drowsyHours[h] = (drowsyHours[h] || 0) + s.drowsyCount; } });
    const topDrowsy = Object.entries(drowsyHours).sort((a, b) => b[1] - a[1])[0];
    const cam = { sessions: camS.length, awayMs: sum(camS.map((s) => s.camAwayMs || 0)), drowsy: sum(camS.map((s) => s.drowsyCount || 0)), topHour: topDrowsy ? Number(topDrowsy[0]) : null,
      focusWith: avg(camS.filter((s) => s.drowsyCount).map((s) => s.focus)), focusWithout: avg(camS.filter((s) => !s.drowsyCount).map((s) => s.focus)) };
    return { start, keys, sessions, tasks, totalMs, grossMs, awayMs, subjects, doneCount, completion, avgFocus, focusByHour, distractors, accuracy, studyDays, cam, lowHour: low && avgFocus != null && low.avg < avgFocus ? low.hour : null };
  }
  function suggestions(ws) {
    if (ws.sessions.length < 3) return null;
    const out = [];
    const top = ws.distractors[0];
    if (top && top.count >= 2 && top.count / ws.sessions.length >= 0.25 && TIPS[top.name]) {
      out.push({ title: TIPS[top.name].title, body: TIPS[top.name].body(ws), basis: `'${top.name}'${iga(top.name)} 점검 ${ws.sessions.length}번 중 ${top.count}번 체크됐어요.` });
    }
    const worst = ws.accuracy.filter((x) => x.n >= 3 && x.avg >= 0.3)[0];
    if (worst) out.push({ title: `${worst.name} 예상 시간 늘리기`, body: `다음 주 ${worst.name} 할 일은 평소 예상의 ${(1 + worst.avg).toFixed(1)}배로 잡아 보세요. 계획이 현실적이어야 끝까지 지킬 수 있어요.`, basis: `끝낸 ${worst.name} 할 일 ${worst.n}개가 예상보다 평균 ${pct(worst.avg)} 더 걸렸어요.` });
    if (ws.tasks.length >= 5 && ws.completion < 0.5) out.push({ title: '하루 할 일 수 줄이기', body: '끝낼 수 있는 만큼만 계획해 보세요. 다 끝내는 경험이 쌓이면 계획을 지키는 습관이 생겨요.', basis: `계획한 ${ws.tasks.length}개 중 ${ws.doneCount}개를 끝냈어요 (${pct(ws.completion)}).` });
    const lowH = ws.focusByHour.filter((h) => h.n >= 3 && h.avg <= 3 && ws.avgFocus - h.avg >= 0.8).sort((a, b) => a.avg - b.avg)[0];
    if (lowH && !(top && top.name === '졸음' && out.length && out[0].title === TIPS['졸음'].title)) {
      out.push({ title: `${lowH.hour}시대 계획 바꾸기`, body: `집중이 떨어지는 ${lowH.hour}시대에는 짧게 쉬고 시작하거나, 문제 풀이처럼 손이 움직이는 공부를 배치해 보세요.`, basis: `${lowH.hour}시대 평균 집중도 ${lowH.avg.toFixed(1)}, 이번 주 전체 평균 ${ws.avgFocus.toFixed(1)} (${lowH.n}번 기록).` });
    }
    if (ws.cam.drowsy >= 3 && !out.some((x) => x.title === TIPS['졸음'].title)) {
      out.push({ title: '졸음 대책 세우기', body: `${ws.cam.topHour != null ? `${ws.cam.topHour}시대 공부 전에` : '졸음이 오기 쉬운 시간 전에'} 5분 일어나 움직이고, 그 시간에는 문제 풀이처럼 손을 쓰는 공부를 배치해 보세요. 잠이 계속 부족하다면 귀가 후 취침 시간도 함께 점검해 보세요.`, basis: `카메라가 이번 주 졸음을 ${ws.cam.drowsy}회 감지했어요${ws.cam.topHour != null ? ` (가장 많은 때 ${ws.cam.topHour}시대)` : ''}.` });
    }
    if (ws.grossMs > 0 && ws.awayMs / ws.grossMs >= 0.15) out.push({ title: '앱을 벗어나는 시간 줄이기', body: '공부 중에 다른 앱을 쓰는 시간이 길었어요. 확인할 일은 휴식 시간에 모아서 해 보세요.', basis: `공부 시간 중 ${pct(ws.awayMs / ws.grossMs)}를 앱 밖에서 보냈어요.` });
    return out.slice(0, 3);
  }
  function deltaHTML(cur, prev, kind, than) {
    if (prev == null || cur == null) return '<span class="delta">지난주 기록 없음</span>';
    const same = `<span class="delta">${than}와 같음</span>`;
    const d = cur - prev;
    const mk = (cls, txt) => `<span class="delta"><span class="${cls}">${d > 0 ? '▲' : '▼'} ${txt}</span> ${than}보다</span>`;
    if (kind === 'ms') { if (Math.abs(d) < 60000) return same; return mk(d > 0 ? 'up-good' : 'down-bad', fmtHM(Math.abs(d))); }
    if (kind === 'focus') { if (Math.abs(d) < 0.05) return same; return mk(d > 0 ? 'up-good' : 'down-bad', Math.abs(d).toFixed(1)); }
    if (kind === 'away') { const p = Math.round(d * 100); if (!p) return same; return mk(p > 0 ? 'up-bad' : 'down-good', `${Math.abs(p)}%p`); }
    return '';
  }
  function weekLabel(start) { const e = addDays(start, 6); return start.getMonth() === e.getMonth() ? `${start.getMonth() + 1}월 ${start.getDate()}일 – ${e.getDate()}일` : `${start.getMonth() + 1}월 ${start.getDate()}일 – ${e.getMonth() + 1}월 ${e.getDate()}일`; }
  function renderReport() {
    const el = $('#v-report');
    if (state.profile.phase === 'A') {
      const n = state.sessions.filter((s) => s.phase === 'A').length;
      el.innerHTML = `<section class="card locked" aria-labelledby="lockH"><h2 id="lockH">실험 A주: 기록만 하는 주예요</h2>
        <p>이번 주에는 보고서와 제안을 보여 주지 않아요. 평소처럼 계획하고, 타이머를 쓰고, 점검을 남겨 주세요.</p>
        <p class="muted small-text">A주 점검 기록 ${n}개 저장됨. 보고서는 설정에서 B주로 바꾸면 열려요.</p></section>`;
      return;
    }
    const start = addDays(weekStart(new Date()), weekOffset * 7);
    // the current week is still running, so compare it with the same days of last week
    const elapsed = weekOffset === 0 ? ((new Date().getDay() + 6) % 7) + 1 : 7;
    const than = elapsed < 7 ? '지난주 같은 기간' : '지난주';
    const ws = weekStats(start); const prev = weekStats(addDays(start, -7), elapsed);
    const hasPrev = prev.sessions.length > 0;
    const nav = `<div class="week-nav">
        <button class="icon-btn" data-act="wk-prev" aria-label="이전 주">‹</button>
        <h2>${weekLabel(start)}</h2>
        <button class="icon-btn" data-act="wk-next" aria-label="다음 주" ${weekOffset >= 0 ? 'disabled' : ''}>›</button></div>`;
    if (!ws.sessions.length) {
      el.innerHTML = `<div style="display:grid;gap:16px">${nav}<section class="card"><h2 style="font-size:16px">이 주에는 점검 기록이 없어요</h2>
        <p class="muted">할 일을 끝내고 점검을 남기면 이곳에 주간 보고서가 만들어져요.</p>
        ${hasPrev ? '<div><button class="btn small" data-act="wk-prev">지난주 보고서 보기</button></div>' : ''}</section></div>`;
      return;
    }
    const sg = suggestions(ws);
    const maxSubj = Math.max(...ws.subjects.map((x) => x.ms), 1);
    const maxDist = Math.max(...ws.distractors.map((x) => x.count), 1);
    const awayRatio = ws.grossMs ? ws.awayMs / ws.grossMs : 0;
    const prevAway = hasPrev && prev.grossMs ? prev.awayMs / prev.grossMs : null;
    const trendWeeks = [-3, -2, -1, 0].map((o) => { const st = addDays(start, o * 7); const w = o === 0 ? ws : weekStats(st); return { st, c: w.completion, n: w.tasks.length }; });
    el.innerHTML = `
      <div style="display:grid;gap:16px">
      ${nav}
      <div class="tiles">
        <div class="tile"><span class="label">순공 시간</span><span class="value">${fmtHM(ws.totalMs)}</span>${deltaHTML(ws.totalMs, hasPrev ? prev.totalMs : null, 'ms', than)}</div>
        <div class="tile"><span class="label">목표 달성률</span><span class="value">${ws.completion == null ? '–' : pct(ws.completion)}</span><span class="delta">${ws.tasks.length ? `계획 ${ws.tasks.length}개 중 ${ws.doneCount}개 끝냄` : '마감된 계획 없음'}</span></div>
        <div class="tile"><span class="label">평균 집중도</span><span class="value">${ws.avgFocus.toFixed(1)} <span style="font-size:14px;font-weight:500;color:var(--muted)">/ 5</span></span>${deltaHTML(ws.avgFocus, hasPrev ? prev.avgFocus : null, 'focus', than)}</div>
        <div class="tile"><span class="label">앱 이탈 비율</span><span class="value">${pct(awayRatio)}</span>${deltaHTML(awayRatio, prevAway, 'away', than)}</div>
      </div>
      <section class="card" aria-labelledby="sgH">
        <div class="card-head"><h2 id="sgH">다음 주 제안</h2></div>
        ${sg == null ? `<p class="muted">점검 기록이 3개 이상 쌓이면 제안이 나와요 (지금 ${ws.sessions.length}개).</p>`
          : sg.length ? `<div class="sugg">${sg.map((x) => `<div class="sugg-item"><h3>${esc(x.title)}</h3><p>${esc(x.body)}</p><p class="basis">근거: ${esc(x.basis)}</p></div>`).join('')}</div>`
          : '<p>이번 주 기록에서는 크게 걸리는 부분이 없어요. 지금 방식을 유지해 보세요.</p>'}
      </section>
      ${reportAIHTML(start)}
      <section class="card" aria-labelledby="subjH">
        <div class="card-head"><h2 id="subjH">과목별 순공 시간</h2><span class="muted small-text">공부한 날 ${ws.studyDays}일</span></div>
        <div class="bars">${ws.subjects.map((x) => { const s = subj(x.id); return `<div class="bar-row"><span class="name"><i class="dot" style="--c:var(--s${s ? s.slot + 1 : 1})"></i>${esc(subjName(x.id))}</span><div class="bar-track"><div class="bar-fill" style="width:${(x.ms / maxSubj) * 100}%;--c:var(--s${s ? s.slot + 1 : 1})"></div></div><span class="val">${fmtHM(x.ms)}</span></div>`; }).join('')}</div>
      </section>
      <section class="card" aria-labelledby="accH">
        <div class="card-head"><h2 id="accH">계획 정확도</h2><span class="muted small-text">끝낸 할 일 기준</span></div>
        ${ws.accuracy.length ? `<div>${ws.accuracy.map((x) => `<div class="acc-row"><span>${esc(x.name)} <span class="muted small-text">(${x.n}개)</span></span><span class="val">${Math.abs(x.avg) <= 0.1 ? '예상과 비슷' : x.avg > 0 ? `예상보다 ${pct(x.avg)} 더 걸림` : `예상보다 ${pct(-x.avg)} 빨리 끝남`}</span></div>`).join('')}</div>` : '<p class="muted">끝낸 할 일이 생기면 예상 시간과 실제 시간을 비교해 보여 드려요.</p>'}
      </section>
      <section class="card" aria-labelledby="hrH">
        <div class="card-head"><h2 id="hrH">시간대별 집중도</h2><span class="muted small-text">점검 시작 시각 기준</span></div>
        <div style="display:grid;gap:8px">
        ${ws.focusByHour.map((h) => `<div class="strip-row"><span>${h.hour}시대</span><div class="strip" title="${h.hour}시대 평균 ${h.avg.toFixed(1)} (${h.n}번)">${[0, 25, 50, 75, 100].map((p) => `<i class="tick" style="left:${p}%"></i>`).join('')}<i class="pt" style="left:${((h.avg - 1) / 4) * 100}%"></i></div><span class="val">${h.avg.toFixed(1)} (${h.n}번)</span></div>`).join('')}
        <div class="strip-scale"><span></span><div>${[1, 2, 3, 4, 5].map((n) => `<span style="left:${(n - 1) * 25}%">${n}</span>`).join('')}</div><span></span></div>
        </div>
      </section>
      <section class="card" aria-labelledby="dsH">
        <div class="card-head"><h2 id="dsH">공부를 방해한 것</h2><span class="muted small-text">점검 ${ws.sessions.length}번 중</span></div>
        ${ws.distractors.length ? `<div class="bars">${ws.distractors.map((d) => `<div class="bar-row"><span class="name">${esc(d.name)}</span><div class="bar-track"><div class="bar-fill" style="width:${(d.count / maxDist) * 100}%"></div></div><span class="val">${d.count}번</span></div>`).join('')}</div>` : '<p class="muted">이번 주에는 체크된 방해 요인이 없어요.</p>'}
      </section>
      ${ws.cam.sessions ? `<section class="card" aria-labelledby="camH">
        <div class="card-head"><h2 id="camH">카메라로 확인한 것</h2><span class="muted small-text">카메라를 켠 점검 ${ws.cam.sessions}번</span></div>
        <div>
          <div class="acc-row"><span>자리 비움</span><span class="val">${fmtHM(ws.cam.awayMs)}</span></div>
          <div class="acc-row"><span>졸음 감지</span><span class="val">${ws.cam.drowsy}회${ws.cam.topHour != null ? ` · 가장 많은 때 ${ws.cam.topHour}시대` : ''}</span></div>
          ${ws.cam.focusWith != null && ws.cam.focusWithout != null ? `<div class="acc-row"><span>스스로 매긴 집중도</span><span class="val">졸음 감지된 점검 ${ws.cam.focusWith.toFixed(1)} · 없던 점검 ${ws.cam.focusWithout.toFixed(1)}</span></div>` : ''}
        </div>
        <p class="muted small-text">카메라 판정은 눈 감김과 얼굴 위치로 추정한 값이라 틀릴 수 있어요. 스스로 매긴 집중도와 함께 보세요.</p>
      </section>` : ''}
      <section class="card" aria-labelledby="trH">
        <div class="card-head"><h2 id="trH">목표 달성률 추이</h2><span class="muted small-text">최근 4주</span></div>
        <div class="trend">${trendWeeks.map((w, i) => `<div class="trend-col ${i === 3 ? 'cur' : ''}"><span class="v">${w.c == null ? '–' : pct(w.c)}</span><div class="col" style="height:${w.c == null ? 0 : Math.max(2, w.c * 100)}px" title="${weekLabel(w.st)}: ${w.c == null ? '기록 없음' : pct(w.c) + ` (${w.n}개)`}"></div></div>`).join('')}</div>
        <div class="trend-lbl">${trendWeeks.map((w) => `<span>${w.st.getMonth() + 1}/${w.st.getDate()}주</span>`).join('')}</div>
      </section>
      <section class="card" aria-labelledby="shH">
        <div class="card-head"><h2 id="shH">보고서 공유</h2></div>
        <p class="muted small-text">선생님이나 함께 공부하는 친구에게 이번 주 기록을 보여 주고 싶을 때 보내세요.</p>
        <div><button class="btn" data-act="share-report">${navigator.share ? '보고서 보내기' : '보고서 텍스트 복사'}</button></div>
      </section>
      <p class="foot">제안은 이 앱이 정한 규칙으로 계산한 거예요. 효과가 검증된 처방은 아니니, 나에게 맞는지 다음 주 기록으로 확인해 보세요.</p>
      </div>`;
  }
  function reportText() {
    const start = addDays(weekStart(new Date()), weekOffset * 7);
    const ws = weekStats(start); const sg = suggestions(ws) || [];
    const who = state.profile.nick ? ` · ${state.profile.nick}` : '';
    const lines = [`[야자 관리실 주간 보고서] ${weekLabel(start)}${who}`,
      `순공 시간: ${fmtHM(ws.totalMs)} (공부한 날 ${ws.studyDays}일)`,
      `목표 달성률: ${ws.completion == null ? '-' : pct(ws.completion)} (${ws.tasks.length}개 중 ${ws.doneCount}개)`,
      `평균 집중도: ${ws.avgFocus == null ? '-' : ws.avgFocus.toFixed(1)} / 5`,
      `과목별: ${ws.subjects.map((x) => `${subjName(x.id)} ${fmtHM(x.ms)}`).join(', ') || '-'}`,
      `방해한 것: ${ws.distractors.map((d) => `${d.name} ${d.count}번`).join(', ') || '없음'}`];
    if (sg.length) { lines.push('다음 주 제안:'); sg.forEach((x, i) => lines.push(`${i + 1}. ${x.title} - ${x.body}`)); }
    return lines.join('\n');
  }

  // ---------- export ----------
  function csvCell(v) { const text = typeof v === 'string'; v = v == null ? '' : String(v); if (text && /^[=+\-@]/.test(v)) v = "'" + v; return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }
  function toCSV(rows) { return rows.map((r) => r.map(csvCell).join(',')).join('\r\n'); }
  const mins = (ms) => (ms / 60000).toFixed(1);
  function exportCSV(kind) {
    const code = state.profile.code || '';
    if (kind === 'tasks') {
      const rows = [['참여코드', '날짜', '요일', '과목', '할 일', '예상(분)', '실제 순공(분)', '상태', '점검 횟수']];
      state.tasks.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).forEach((t) => {
        const n = state.sessions.filter((s) => s.taskId === t.id).length;
        rows.push([code, t.date, WD[parseDay(t.date).getDay()], subjName(t.subjectId), t.title, t.plannedMin, mins(taskActualMs(t.id)), t.status === 'todo' ? '시작 안 함' : OUTCOME[t.status], n]);
      });
      return toCSV(rows);
    }
    const rows = [['참여코드', '실험단계', '날짜', '요일', '시작', '종료', '과목', '할 일', '예상(분)', '순공(분)', '휴식(분)', '앱 이탈(분)', '이탈 횟수', '이탈 시간 순공에서 뺌', '결과', '집중도(1-5)', '방해요인', '카메라 사용', '카메라 자리비움(분)', '졸음 감지 횟수', '카메라 자리비움 순공에서 뺌', '메모']];
    state.sessions.slice().sort((a, b) => a.start - b.start).forEach((s) => {
      rows.push([code, PHASE[s.phase] || s.phase, s.date, WD[parseDay(s.date).getDay()], fmtTime(s.start), fmtTime(s.end), subjName(s.subjectId), s.taskTitle, s.plannedMin,
        mins(s.studyMs), mins(s.breakMs || 0), mins(s.awayMs || 0), s.awayCount || 0, s.awayExcluded ? '예' : '아니오', OUTCOME[s.outcome], s.focus, s.distractors.join(' / '),
        s.camUsed ? '예' : '아니오', mins(s.camAwayMs || 0), s.drowsyCount || 0, s.camAwayExcluded ? '예' : '아니오', s.memo || '']);
    });
    return toCSV(rows);
  }
  async function copyText(text, fallbackEl) {
    try { await navigator.clipboard.writeText(text); toast('복사했어요'); }
    catch (e) {
      if (fallbackEl) { fallbackEl.focus(); fallbackEl.select(); toast('글자를 선택해 두었어요. 직접 복사해 주세요.'); }
      else toast('복사할 수 없어요. 내보내기 칸에서 직접 복사해 주세요.');
    }
  }
  // ---------- files & sharing ----------
  function exportFileName() {
    // ASCII-only name: some phones and browsers drop non-Latin download names
    const code = (state.profile.code || '').replace(/[^A-Za-z0-9_-]/g, '');
    return `yaja-room_${code ? code + '_' : ''}${exportKind === 'tasks' ? 'tasks' : 'sessions'}_${dayKey(new Date())}.csv`;
  }
  function downloadFile(name, text) {
    try {
      const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = name; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast('파일을 저장했어요');
    } catch (e) { toast('파일로 저장할 수 없어요. CSV 복사를 써 주세요.'); }
  }
  const canShareFiles = (() => {
    try { return !!(navigator.canShare && navigator.canShare({ files: [new File(['x'], 'x.csv', { type: 'text/csv' })] })); }
    catch (e) { return false; }
  })();
  async function shareCSV() {
    const name = exportFileName(); const text = exportCSV(exportKind);
    try {
      const file = new File(['﻿' + text], name, { type: 'text/csv' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    downloadFile(name, text);
  }
  async function shareReport() {
    const text = reportText();
    if (navigator.share) {
      try { await navigator.share({ title: '야자 관리실 주간 보고서', text }); return; }
      catch (e) { if (e && e.name === 'AbortError') return; }
    }
    copyText(text);
  }

  // ---------- install as an app ----------
  let installEvt = null;
  const isStandalone = () => (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; if (view === 'today' || view === 'prefs') render(); });
  window.addEventListener('appinstalled', () => { installEvt = null; toast('앱을 설치했어요. 홈 화면에서 열어 보세요.'); render(); });
  async function promptInstall() {
    if (!installEvt) return;
    const evt = installEvt; installEvt = null;
    evt.prompt();
    try { await evt.userChoice; } catch (e) { /* ignore */ }
    render();
  }
  function installHelp() {
    if (isStandalone()) return '<p>앱으로 설치되어 실행 중이에요.</p>';
    if (installEvt) return '<p class="muted small-text">홈 화면에 아이콘이 생기고, 주소창 없이 앱처럼 열려요. 한 번 연 뒤에는 인터넷이 없어도 열려요.</p><div><button class="btn primary small" data-act="install">앱 설치하기</button></div>';
    if (isIOS) return '<p class="muted small-text">Safari 아래쪽의 공유 버튼을 누른 뒤 <b>홈 화면에 추가</b>를 고르세요. 아이폰은 Safari에서만 설치할 수 있어요.</p>';
    return '<p class="muted small-text">Chrome이나 Edge 메뉴(⋮)에서 <b>앱 설치</b> 또는 <b>홈 화면에 추가</b>를 고르세요.</p>';
  }
  function installCardHTML() {
    if (isStandalone() || state.profile.installDismissed || (!installEvt && !isIOS)) return '';
    return `<section class="card install" aria-labelledby="insCardH"><div class="card-head"><h2 id="insCardH">홈 화면에 설치하기</h2><button class="btn ghost small" data-act="dismiss-install">닫기</button></div>${installHelp()}</section>`;
  }

  // ---------- beta test: send records to the team's Google Sheet ----------
  const OUTBOX_KEY = 'yaja-room-outbox';
  let outbox = [];
  try { outbox = JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]'); if (!Array.isArray(outbox)) outbox = []; } catch (e) { outbox = []; }
  let sending = false;
  const CFG = window.YAJA_CONFIG || {};
  const submitUrl = () => String(state.profile.submitUrl || CFG.serverUrl || CFG.submitUrl || '').trim();
  const submitOn = () => !!(state.profile.submit && submitUrl() && state.profile.code && !state.sample);
  function saveOutbox() { try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(outbox)); } catch (e) { /* ignore */ } }
  // only anonymous fields leave the device: no nickname, task title or memo
  function sessionItem(s) {
    return { kind: 'session', id: s.id, code: state.profile.code, phase: PHASE[s.phase] || s.phase, date: s.date, weekday: WD[parseDay(s.date).getDay()],
      start: fmtTime(s.start), end: fmtTime(s.end), subject: subjName(s.subjectId), plannedMin: s.plannedMin, studyMin: Number(mins(s.studyMs)),
      breakMin: Number(mins(s.breakMs || 0)), awayMin: Number(mins(s.awayMs || 0)), awayCount: s.awayCount || 0, awayExcluded: !!s.awayExcluded,
      outcome: OUTCOME[s.outcome], focus: s.focus, distractors: s.distractors.join(' / '),
      camUsed: !!s.camUsed, camAwayMin: Number(mins(s.camAwayMs || 0)), drowsyCount: s.drowsyCount || 0, camAwayExcluded: !!s.camAwayExcluded };
  }
  function taskItem(t, deleted) {
    return { kind: 'task', id: t.id, code: state.profile.code, phase: PHASE[state.profile.phase], date: t.date, weekday: WD[parseDay(t.date).getDay()], subject: subjName(t.subjectId),
      plannedMin: t.plannedMin, actualMin: Number(mins(taskActualMs(t.id))), status: deleted ? '삭제됨' : t.status === 'todo' ? '시작 안 함' : OUTCOME[t.status],
      sessions: state.sessions.filter((s) => s.taskId === t.id).length };
  }
  function enqueue(items) {
    if (!submitOn()) return;
    items.forEach((it) => { const i = outbox.findIndex((x) => x.kind === it.kind && x.id === it.id); if (i >= 0) outbox[i] = it; else outbox.push(it); });
    saveOutbox(); flushOutbox();
  }
  async function postItems(url, items) {
    const body = JSON.stringify({ app: 'yaja-room', version: APP_VERSION, items });
    try {
      const r = await fetch(url, { method: 'POST', body });
      return r.ok;
    } catch (e) {
      // the request may have been blocked only for reading the answer; send once more without reading it (the sheet ignores duplicates)
      try { await fetch(url, { method: 'POST', mode: 'no-cors', body }); return true; } catch (e2) { return false; }
    }
  }
  async function flushOutbox(manual) {
    if (sending) return;
    if (!submitOn() || !outbox.length) { if (manual) toast(outbox.length ? '보내기를 켜야 보낼 수 있어요' : '보낼 기록이 없어요'); return; }
    if (!navigator.onLine) { if (manual) toast('인터넷에 연결되면 자동으로 보내요'); return; }
    sending = true;
    const batch = outbox.slice(0, 200);
    const ok = await postItems(submitUrl(), batch);
    sending = false;
    if (ok) {
      const sent = new Set(batch.map((x) => x.kind + x.id));
      outbox = outbox.filter((x) => !sent.has(x.kind + x.id)); saveOutbox();
      state.profile.lastSent = Date.now(); save();
      if (manual) toast('운영팀 시트로 보냈어요');
    } else if (manual) toast('보내지 못했어요. 수집 주소나 인터넷 연결을 확인해 주세요.');
    renderSubmitStatus();
    if (ok && outbox.length) flushOutbox();
  }
  function submitStatusText() {
    const p = state.profile;
    if (!submitUrl()) return '운영팀이 수집 주소를 아직 연결하지 않았어요.';
    if (state.sample) return '예시 기록은 보내지 않아요. 예시를 지운 뒤 켤 수 있어요.';
    if (!p.code) return '위에서 참여 코드를 먼저 입력해 주세요.';
    if (!p.submit) return '켜면 할 일과 점검을 저장할 때마다 자동으로 보내요.';
    if (outbox.length) return `아직 못 보낸 기록 ${outbox.length}개. 인터넷에 연결되면 자동으로 보내요.`;
    return p.lastSent ? `모두 보냈어요 (마지막 전송 ${fmtDateLong(new Date(p.lastSent))} ${fmtTime(p.lastSent)})` : '아직 보낸 기록이 없어요. 점검을 저장하면 바로 보내요.';
  }
  function renderSubmitStatus() { const el = $('#submitStatus'); if (el) el.textContent = submitStatusText(); }

  // ---------- render: prefs ----------
  function armBtn(name, label, armedLabel) {
    return `<button class="btn danger ${armed[name] ? 'armed' : ''}" data-act="${name}">${armed[name] ? armedLabel : label}</button>`;
  }
  function renderPrefs() {
    const p = state.profile;
    const used = (id) => state.tasks.some((t) => t.subjectId === id) || state.sessions.some((s) => s.subjectId === id);
    const realData = !state.sample && (state.tasks.length || state.sessions.length);
    const exText = exportCSV(exportKind);
    $('#v-prefs').innerHTML = `
      <div style="display:grid;gap:16px">
      <section class="card" aria-labelledby="meH">
        <h2 id="meH" style="font-size:16px">내 정보</h2>
        <div class="two">
          <div class="field"><label for="pNick">닉네임</label><input id="pNick" type="text" maxlength="12" value="${esc(p.nick)}" placeholder="예: 별빛" data-pref="nick"></div>
          <div class="field"><label for="pCode">참여 코드</label><input id="pCode" type="text" maxlength="12" value="${esc(p.code)}" placeholder="예: T03" data-pref="code"></div>
        </div>
        <p class="hint muted small-text">참여 코드는 베타 테스트에서 실명 대신 쓰는 번호예요. 내보낸 기록에 함께 들어가요.</p>
        <div class="field"><label for="pGoal">하루 순공 목표</label>
          <select id="pGoal" data-pref="goal">${GOALS.map((g) => `<option value="${g}" ${g === p.dailyGoalMin ? 'selected' : ''}>${fmtHM(g * 60000)}</option>`).join('')}</select></div>
      </section>

      <section class="card" aria-labelledby="insH">
        <h2 id="insH" style="font-size:16px">앱으로 설치</h2>
        ${installHelp()}
      </section>

      <section class="card" aria-labelledby="phH">
        <h2 id="phH" style="font-size:16px">실험 단계</h2>
        <p class="muted small-text">베타 테스트에서 피드백이 있을 때와 없을 때를 비교하려고 만든 설정이에요. 선생님이나 운영팀이 알려 준 단계로 맞춰 주세요.</p>
        <div class="radio-list">
          ${[['normal', '일반', '보고서와 점검 피드백을 모두 보여 줘요.'], ['A', 'A주: 기록만', '계획·타이머·점검 기록만 하고, 보고서와 피드백은 숨겨요.'], ['B', 'B주: 피드백', '보고서와 점검 피드백을 보여 줘요. 기록에 B주로 표시돼요.']]
            .map(([v, t, d]) => `<label class="radio"><input type="radio" name="phase" value="${v}" ${p.phase === v ? 'checked' : ''} data-pref="phase"><span><b>${t}</b><span>${d}</span></span></label>`).join('')}
        </div>
      </section>

      <section class="card" aria-labelledby="sbmH">
        <h2 id="sbmH" style="font-size:16px">베타 테스트 기록 보내기</h2>
        <div class="toggle-row"><div><b>내 기록을 운영팀 구글 시트로 보내기</b><div class="muted small-text">보내는 것: 참여 코드, 실험 단계, 날짜·시각, 과목, 예상·실제 시간, 결과, 집중도, 방해 요인. 닉네임, 할 일 제목, 메모는 보내지 않아요.</div></div>
          <input type="checkbox" id="pSubmit" ${p.submit ? 'checked' : ''} ${!submitUrl() || state.sample || !p.code ? 'disabled' : ''} data-pref="submit" aria-label="베타 테스트 기록 보내기"></div>
        <p class="small-text" id="submitStatus">${esc(submitStatusText())}</p>
        ${p.submit && submitUrl() && !state.sample ? '<div><button class="btn small" data-act="send-now">지금 보내기</button></div>' : ''}
        <details><summary class="small-text muted">운영팀용: 수집 주소 직접 넣기</summary>
          <div class="field" style="margin-top:8px"><label for="pUrl" class="sr">수집 주소</label>
          <input id="pUrl" type="url" inputmode="url" value="${esc(p.submitUrl)}" placeholder="https://script.google.com/macros/s/…/exec" data-pref="submit-url">
          <span class="hint">비워 두면 config.js에 적힌 주소를 써요.</span></div>
        </details>
      </section>

      <section class="card" aria-labelledby="sbH">
        <div class="card-head"><h2 id="sbH">과목</h2><span class="muted small-text">${state.subjects.length}/8</span></div>
        <div class="subj-rows">${state.subjects.map((s) => `<div class="subj-row"><i class="dot" style="--c:var(--s${s.slot + 1})"></i>
          <label class="sr" for="sn-${s.id}">${esc(s.name)} 이름</label><input id="sn-${s.id}" type="text" maxlength="10" value="${esc(s.name)}" data-pref="subj-name" data-id="${s.id}">
          ${used(s.id) || state.subjects.length <= 1 ? '<span class="muted small-text" style="width:36px;text-align:center" title="기록이 있는 과목은 이름만 바꿀 수 있어요">–</span>' : `<button class="icon-btn" data-act="subj-del" data-id="${s.id}" aria-label="${esc(s.name)} 삭제">×</button>`}</div>`).join('')}</div>
        <p class="muted small-text">기록이 있는 과목은 이름만 바꿀 수 있어요.</p>
        ${state.subjects.length < 8 ? '<div><button class="btn small" data-act="subj-add">과목 추가</button></div>' : ''}
      </section>

      <section class="card" aria-labelledby="dtH">
        <h2 id="dtH" style="font-size:16px">점검할 때 고르는 방해 요인</h2>
        <p class="muted small-text">설문 결과에 맞춰 바꿔 쓰세요. 바꿔도 지난 기록은 그대로 남아요.</p>
        <div class="chips">${state.distractors.map((d, i) => `<span class="dist-chip">${esc(d)}${state.distractors.length > 1 ? `<button class="icon-btn" data-act="dist-del" data-i="${i}" aria-label="${esc(d)} 빼기">×</button>` : ''}</span>`).join('')}</div>
        ${state.distractors.length < 8 ? `<form id="distForm" class="add-row title-row" autocomplete="off" novalidate><label for="distNew" class="sr">새 방해 요인</label><input id="distNew" type="text" maxlength="12" placeholder="예: 배고픔"><button class="btn small" type="submit">추가</button></form>` : ''}
      </section>

      <section class="card" aria-labelledby="tmH">
        <h2 id="tmH" style="font-size:16px">타이머</h2>
        <div class="field"><label for="pAway">공부 중 앱을 벗어났을 때</label>
          <select id="pAway" data-pref="away">
            <option value="record" ${p.away === 'record' ? 'selected' : ''}>시간만 기록하기 (점검 때 뺄지 고르기)</option>
            <option value="exclude" ${p.away === 'exclude' ? 'selected' : ''}>순공에서 빼는 걸 기본으로</option>
            <option value="off" ${p.away === 'off' ? 'selected' : ''}>기록하지 않기</option>
          </select>
          <span class="hint">화면이 꺼지거나 다른 앱·탭으로 가면 '이탈'로 기록돼요. 인강처럼 다른 탭에서 공부할 때는 점검에서 빼지 않으면 돼요.</span></div>
        <div class="toggle-row"><div><b>공부 중 화면 켜두기</b><div class="muted small-text">타이머 화면이 열려 있을 때 화면이 꺼지지 않게 해요. 일부 기기에서는 안 될 수 있어요.</div></div><input type="checkbox" id="pWake" ${p.keepAwake ? 'checked' : ''} data-pref="wake" aria-label="공부 중 화면 켜두기"></div>
        <div class="toggle-row"><div><b>예상 시간 알림음</b><div class="muted small-text">예상한 시간이 지나면 짧은 소리로 알려 줘요.</div></div><input type="checkbox" id="pChime" ${p.chime ? 'checked' : ''} data-pref="chime" aria-label="예상 시간 알림음"></div>
      </section>

      <section class="card" aria-labelledby="cmH">
        <h2 id="cmH" style="font-size:16px">카메라 관리</h2>
        <p class="muted small-text">${Cam.supported() ? '타이머 화면에서 켜면 졸음과 자리 비움을 알려 줘요. 영상은 이 기기 안에서만 분석하고 저장하거나 보내지 않아요.' : '이 브라우저에서는 카메라를 쓸 수 없어요. https 주소로 연 앱에서 다시 확인해 주세요.'}</p>
        <div class="field"><label for="pCamSens">졸음 판정 민감도</label>
          <select id="pCamSens" data-pref="cam-sens">
            <option value="relaxed" ${p.camSens === 'relaxed' ? 'selected' : ''}>느슨하게 (눈을 4초 감으면)</option>
            <option value="normal" ${p.camSens === 'normal' ? 'selected' : ''}>보통 (눈을 3초 감으면)</option>
            <option value="sensitive" ${p.camSens === 'sensitive' ? 'selected' : ''}>민감하게 (눈을 2초 감으면)</option>
          </select>
          <span class="hint">고개를 숙이고 필기할 때는 3배 더 오래 지켜본 뒤 판정해요. 엎드려서 얼굴이 15초 넘게 안 보여도 깨워요.</span></div>
        <div class="toggle-row"><div><b>미리보기 화면 보이기</b><div class="muted small-text">끄면 작은 화면 없이 판정만 해요.</div></div><input type="checkbox" ${p.camPreview ? 'checked' : ''} data-pref="cam-preview" aria-label="미리보기 화면 보이기"></div>
        <div class="toggle-row"><div><b>졸음 알람 소리</b></div><input type="checkbox" ${p.camAlarm ? 'checked' : ''} data-pref="cam-alarm" aria-label="졸음 알람 소리"></div>
        <div class="toggle-row"><div><b>진동</b><div class="muted small-text">안드로이드 휴대폰에서만 돼요.</div></div><input type="checkbox" ${p.camVibrate ? 'checked' : ''} data-pref="cam-vibrate" aria-label="진동"></div>
        <div class="toggle-row"><div><b>타이머를 시작하면 카메라 자동으로 켜기</b></div><input type="checkbox" ${p.camAuto ? 'checked' : ''} data-pref="cam-auto" aria-label="타이머를 시작하면 카메라 자동으로 켜기"></div>
        <div class="field"><span class="lbl">아두이노 깨우기 장치</span>
          ${Arduino.supported() ? `<div class="btn-row">${Arduino.connected() ? '<button class="btn small" data-act="arduino-test">진동 시험</button><button class="btn small" data-act="arduino-off">연결 끊기</button>' : '<button class="btn small" data-act="arduino-on">아두이노 연결</button>'}</div>
            <span class="hint">${Arduino.connected() ? '연결됨. 졸음이 감지되면 진동 모터와 부저가 울려요.' : 'USB로 꽂고 연결을 누르세요. 회로와 코드는 저장소의 arduino 폴더에 있어요.'}</span>`
            : '<span class="hint">아두이노 연결은 PC의 Chrome이나 Edge에서만 돼요 (Web Serial).</span>'}
        </div>
      </section>

      <section class="card" aria-labelledby="mtSetH">
        <h2 id="mtSetH" style="font-size:16px">AI 멘토</h2>
        <div class="field"><label for="pMentorCode">멘토 이용 코드</label><input id="pMentorCode" type="text" maxlength="20" value="${esc(p.mentorCode)}" placeholder="운영팀이 알려 준 코드 (없으면 비워 두기)" data-pref="mentor-code"></div>
        <p class="muted small-text">${submitUrl() ? (p.mentorConsent ? '데이터 사용에 동의했어요.' : '아직 동의하지 않았어요. 멘토 탭에서 시작할 수 있어요.') : '운영팀 서버가 연결되면 쓸 수 있어요.'}</p>
        ${state.mentor.notes.length || state.mentor.chat.length ? `<div class="btn-row">${armBtn('mentor-clear', '상담 기록 지우기', '정말 지울까요? 한 번 더 누르세요')}</div>` : ''}
      </section>

      <section class="card" aria-labelledby="exH">
        <h2 id="exH" style="font-size:16px">기록 내보내기</h2>
        <p class="muted small-text">베타 테스트 결과를 모을 때 쓰세요. 복사해서 메신저나 엑셀에 붙여 넣으면 돼요.${state.sample ? ' <b>지금은 예시 기록이 들어 있어요.</b>' : ''}</p>
        <div class="field"><label for="exKind">내보낼 기록</label>
          <select id="exKind" data-pref="exkind"><option value="sessions" ${exportKind === 'sessions' ? 'selected' : ''}>점검 기록 (타이머 한 번 = 한 줄)</option><option value="tasks" ${exportKind === 'tasks' ? 'selected' : ''}>할 일 기록 (계획 한 개 = 한 줄)</option></select></div>
        <label for="exText" class="sr">내보내기 내용</label>
        <textarea id="exText" readonly>${esc(exText)}</textarea>
        <div class="btn-row"><button class="btn" data-act="copy-export">CSV 복사</button><button class="btn" data-act="save-export">CSV 파일 저장</button>${canShareFiles ? '<button class="btn" data-act="share-export">카톡 등으로 보내기</button>' : ''}</div>
      </section>

      <section class="card" aria-labelledby="bkH">
        <h2 id="bkH" style="font-size:16px">백업과 복원</h2>
        <p class="muted small-text">기록은 이 기기의 이 브라우저에만 저장돼요. 기기를 바꾸거나 브라우저 기록을 지우기 전에 백업 코드를 복사해 두세요.</p>
        <div class="btn-row"><button class="btn" data-act="copy-backup">백업 코드 복사</button></div>
        <div class="field"><label for="rsText">백업 코드 붙여 넣기</label><textarea id="rsText" placeholder="복사해 둔 백업 코드를 여기에 붙여 넣고 복원을 누르세요.">${esc(restoreDraft)}</textarea></div>
        <div class="btn-row">${armBtn('restore', '복원하기', '지금 기록을 바꿀까요? 한 번 더 누르세요')}</div>
        <p class="form-err" id="rsErr" hidden></p>
      </section>

      <section class="card" aria-labelledby="rsH">
        <h2 id="rsH" style="font-size:16px">초기화</h2>
        <div class="btn-row">
          ${realData ? '' : '<button class="btn" data-act="sample-again">예시 기록 다시 보기</button>'}
          ${armBtn('reset', '모든 기록 지우기', '정말 지울까요? 한 번 더 누르세요')}
        </div>
      </section>
      <p class="foot">야자 관리실 ${APP_VERSION}</p>
      </div>`;
  }

  // ---------- grades & goals ----------
  // mock exams use 9 grades (+ percentile, none for absolute-graded English/Korean history); 내신 uses 5 grades for students who entered in 2025 or later
  const examLabel = (t) => (t === 'mock' ? '모의고사' : '내신');
  const range = (a, b) => { const out = []; for (let i = a; i <= b; i++) out.push(i); return out; };
  function gradeAnalysis() {
    const exams = state.exams.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const rows = state.subjects.map((s) => {
      const withScore = exams.filter((e) => e.scores && e.scores[s.id] && e.scores[s.id].grade);
      const latestE = withScore[withScore.length - 1] || null;
      const same = latestE ? withScore.filter((e) => e.type === latestE.type) : [];
      const prevE = same.length >= 2 ? same[same.length - 2] : null;
      const pick = (e) => (e ? { examName: e.name, date: e.date, type: e.type, grade: e.scores[s.id].grade, pct: e.scores[s.id].pct == null ? null : e.scores[s.id].pct } : null);
      const latest = pick(latestE); const prev = pick(prevE);
      const between = latest && prev ? sum(state.sessions.filter((x) => x.subjectId === s.id && x.date > prev.date && x.date <= latest.date).map((x) => x.studyMs)) : null;
      const goal = state.goals[s.id] && state.goals[s.id].grade ? Number(state.goals[s.id].grade) : null;
      return { id: s.id, name: s.name, latest, prev, between, goal };
    }).filter((r) => r.latest || r.goal);
    return { rows };
  }
  function changeHTML(r) {
    if (!r.latest || !r.prev) return '<span class="muted">–</span>';
    const dg = r.prev.grade - r.latest.grade; // fewer grade points = better
    const dp = r.latest.pct != null && r.prev.pct != null ? r.latest.pct - r.prev.pct : null;
    const g = dg ? `<span class="${dg > 0 ? 'better' : 'worse'}">${dg > 0 ? '▲' : '▼'} ${Math.abs(dg)}등급</span>` : '등급 같음';
    const p = dp ? ` <span class="${dp > 0 ? 'better' : 'worse'}">(${dp > 0 ? '+' : ''}${dp})</span>` : '';
    return g + p;
  }
  function gapText(r) {
    if (!r.goal || !r.latest) return '';
    const gap = r.latest.grade - r.goal;
    return gap <= 0 ? ' <span class="better">달성</span>' : ` <span class="muted">(${gap}등급 남음)</span>`;
  }
  function examFormHTML() {
    const d = examDraft; const max = d.type === 'mock' ? 9 : 5;
    return `<form id="examForm" class="add" style="border-top:0;padding-top:0" autocomplete="off" novalidate>
      <div class="seg" style="grid-template-columns:repeat(2,minmax(0,1fr))">
        <button type="button" data-act="exam-type" data-v="mock" aria-pressed="${d.type === 'mock'}">모의고사</button>
        <button type="button" data-act="exam-type" data-v="school" aria-pressed="${d.type === 'school'}">내신</button></div>
      <div class="two">
        <div class="field"><label for="exName">시험 이름</label><input id="exName" type="text" maxlength="20" value="${esc(d.name)}" placeholder="${d.type === 'mock' ? '예: 11월 모의고사' : '예: 2학기 기말고사'}"></div>
        <div class="field"><label for="exDate">날짜</label><input id="exDate" type="date" value="${d.date}" max="${dayKey(new Date())}"></div>
      </div>
      <p class="muted small-text">${d.type === 'mock' ? '모의고사는 9등급이에요. 영어·한국사는 절대평가라 백분위 칸을 비워 두세요.' : '2025학년도 고1부터 내신은 5등급제예요.'}</p>
      <div class="score-grid">${state.subjects.map((s) => { const v = d.scores[s.id] || {}; return `<div class="score-row"><span>${subjTag(s.id)}</span>
        <label class="sr" for="eg-${s.id}">${esc(s.name)} 등급</label><select id="eg-${s.id}" data-exam-grade="${s.id}"><option value="">안 봄</option>${range(1, max).map((n) => `<option value="${n}" ${Number(v.grade) === n ? 'selected' : ''}>${n}등급</option>`).join('')}</select>
        ${d.type === 'mock' ? `<label class="sr" for="ep-${s.id}">${esc(s.name)} 백분위</label><input id="ep-${s.id}" data-exam-pct="${s.id}" type="number" inputmode="numeric" min="0" max="100" placeholder="백분위" value="${v.pct != null ? v.pct : ''}">` : '<span></span>'}</div>`; }).join('')}</div>
      <p class="form-err" id="exErr" hidden></p>
      <div class="btn-row"><button type="button" class="btn" data-act="exam-cancel">취소</button><button type="submit" class="btn primary">시험 저장</button></div>
    </form>`;
  }
  function readExamForm() {
    if (!examDraft || !$('#examForm')) return;
    examDraft.name = ($('#exName').value || '').trim(); examDraft.date = $('#exDate').value || examDraft.date;
    $$('[data-exam-grade]').forEach((el) => { const id = el.dataset.examGrade; examDraft.scores[id] = examDraft.scores[id] || {}; examDraft.scores[id].grade = el.value ? Number(el.value) : null; });
    $$('[data-exam-pct]').forEach((el) => { const id = el.dataset.examPct; examDraft.scores[id] = examDraft.scores[id] || {}; const n = el.value === '' ? null : Math.round(Number(el.value)); examDraft.scores[id].pct = n == null || isNaN(n) ? null : Math.max(0, Math.min(100, n)); });
  }
  function saveExam() {
    readExamForm(); const d = examDraft; const err = $('#exErr');
    const max = d.type === 'mock' ? 9 : 5;
    const scores = {};
    Object.entries(d.scores).forEach(([id, v]) => { if (v && v.grade && v.grade <= max) scores[id] = { grade: v.grade, pct: d.type === 'mock' && v.pct != null ? v.pct : null }; });
    if (!Object.keys(scores).length) { err.textContent = '한 과목 이상 등급을 골라 주세요.'; err.hidden = false; return; }
    if (!d.date) { err.textContent = '시험 날짜를 골라 주세요.'; err.hidden = false; return; }
    const dt = parseDay(d.date);
    state.exams.push({ id: uid(), date: d.date, type: d.type, name: d.name || `${dt.getMonth() + 1}월 ${examLabel(d.type)}`, scores });
    examDraft = null; save(); renderLog(); toast('시험 기록을 저장했어요');
  }
  function gradesHTML() {
    const g = gradeAnalysis();
    const exams = state.exams.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return `
      <section class="card" aria-labelledby="gaH">
        <div class="card-head"><h2 id="gaH">성적 분석</h2><span class="muted small-text">같은 종류 시험끼리 비교</span></div>
        ${g.rows.length ? `<div class="grade-list">${g.rows.map((r) => `<div class="grade-item">
            <div class="gi-head">${subjTag(r.id)}<span class="gi-now">${r.latest ? `${r.latest.grade}등급${r.latest.pct != null ? ` <span class="muted">(${r.latest.pct})</span>` : ''}` : '시험 기록 없음'}</span></div>
            <div class="gi-sub">${r.latest ? `${esc(r.latest.examName)} · ` : ''}직전 대비 ${changeHTML(r)} · 목표 ${r.goal ? `${r.goal}등급${gapText(r)}` : '없음'}${r.between != null ? ` · 그 사이 순공 ${fmtHM(r.between)}` : ''}</div>
          </div>`).join('')}</div>
          <p class="muted small-text">괄호 안 숫자는 백분위예요. '그 사이 순공'은 직전 시험 다음 날부터 최근 시험까지 이 앱에 기록된 순공 시간이에요. 시험이 몇 번뿐이라 성적 변화가 공부 시간 때문이라고 단정할 수는 없어요.</p>`
          : '<p class="muted">시험 기록이나 목표를 넣으면 과목별로 비교해 보여 드려요.</p>'}
      </section>
      <section class="card" aria-labelledby="goalH">
        <h2 id="goalH" style="font-size:16px">과목별 목표 등급</h2>
        <div class="score-grid">${state.subjects.map((s) => { const gv = state.goals[s.id] && state.goals[s.id].grade; return `<div class="score-row"><span>${subjTag(s.id)}</span>
          <label class="sr" for="goal-${s.id}">${esc(s.name)} 목표 등급</label><select id="goal-${s.id}" data-pref="goal-grade" data-id="${s.id}"><option value="">목표 없음</option>${range(1, 9).map((n) => `<option value="${n}" ${Number(gv) === n ? 'selected' : ''}>${n}등급</option>`).join('')}</select><span></span></div>`; }).join('')}</div>
        <div class="field"><label for="goalNote">목표 메모</label><input id="goalNote" type="text" maxlength="60" value="${esc(state.goalNote)}" placeholder="예: 겨울방학 전에 수학 3등급 안으로" data-pref="goal-note"></div>
      </section>
      <section class="card" aria-labelledby="exListH">
        <div class="card-head"><h2 id="exListH">시험 기록</h2>${examDraft ? '' : '<button class="btn small" data-act="exam-new">시험 추가</button>'}</div>
        ${examDraft ? examFormHTML() : ''}
        ${exams.length ? `<ul class="sess-list">${exams.map((e) => `<li class="sess exam"><div class="sess-time">${e.date.slice(2).replace(/-/g, '.')}</div>
          <div><div><b style="font-weight:600">${esc(e.name)}</b> <span class="muted small-text">${examLabel(e.type)}</span></div>
          <div class="sess-sub">${Object.entries(e.scores).filter(([, v]) => v && v.grade).map(([id, v]) => `${esc(subjName(id))} ${v.grade}등급${v.pct != null ? `(${v.pct})` : ''}`).join(' · ')}</div></div>
          <button class="icon-btn" data-act="exam-del" data-id="${e.id}" aria-label="${esc(e.name)} 삭제">×</button></li>`).join('')}</ul>`
          : examDraft ? '' : '<p class="empty">아직 시험 기록이 없어요.</p>'}
      </section>`;
  }

  // ---------- AI mentor ----------
  // The API key lives in the team's Google Apps Script, never in this app.
  const MENTOR_ERR = {
    no_server: '운영팀 서버가 아직 연결되지 않았어요.', network: '서버에 연결할 수 없어요. 인터넷 연결을 확인해 주세요.',
    no_key: '운영팀이 AI 키를 아직 설정하지 않았어요.', bad_code: '멘토 이용 코드가 맞지 않아요. 설정에서 확인해 주세요.',
    limit_device: '오늘 상담 횟수를 다 썼어요. 내일 다시 이야기해요.', limit_all: '오늘 전체 상담 횟수가 다 찼어요. 내일 다시 시도해 주세요.',
    busy: 'AI가 잠시 바빠요. 조금 뒤에 다시 보내 주세요.', bad_key: 'AI 키가 올바르지 않아요. 운영팀에 알려 주세요.',
  };
  const errText = (e) => MENTOR_ERR[e && e.message] || '답을 받지 못했어요. 잠시 뒤 다시 시도해 주세요.';
  const QUICK = ['이번 주 공부 어땠는지 봐 주세요', '과목별 시간 배분을 조언해 주세요', '성적 분석해 주세요', '수학 공부 방법이 고민이에요', '다음 주 계획을 같이 세워요'];
  async function callServer(payload) {
    const url = submitUrl(); if (!url) throw new Error('no_server');
    let r;
    const body = Object.assign({ app: 'yaja-room', version: APP_VERSION, device: state.profile.deviceId, code: state.profile.code || '', accessCode: state.profile.mentorCode || '' }, payload);
    try { r = await fetch(url, { method: 'POST', body: JSON.stringify(body) }); } catch (e) { throw new Error('network'); }
    if (!r.ok) throw new Error('http_' + r.status);
    let j = null; try { j = await r.json(); } catch (e) { j = null; }
    if (!j) throw new Error('bad_response');
    if (!j.ok) throw new Error(j.error || 'server_error');
    return j;
  }
  function weekLine(w, label) {
    if (!w.sessions.length) return `${label}: 기록 없음`;
    return `${label}: 순공 ${fmtHM(w.totalMs)}, 목표 달성률 ${w.completion == null ? '-' : pct(w.completion)}(계획 ${w.tasks.length}개 중 ${w.doneCount}개), 평균 집중도 ${w.avgFocus.toFixed(1)}/5, `
      + `방해 요인 ${w.distractors.slice(0, 3).map((d) => `${d.name} ${d.count}번`).join(', ') || '없음'}, 앱 이탈 비율 ${w.grossMs ? pct(w.awayMs / w.grossMs) : '0%'}`
      + (w.cam.sessions ? `, 카메라 확인 자리 비움 ${fmtHM(w.cam.awayMs)}·졸음 감지 ${w.cam.drowsy}회` : '');
  }
  function mentorContext() {
    const now = new Date(); const ws0 = weekStart(now);
    const since14 = dayKey(addDays(now, -13)); const since7 = dayKey(addDays(now, -6));
    const s14 = state.sessions.filter((s) => s.date >= since14);
    const bySubj = {}; s14.forEach((s) => { bySubj[s.subjectId] = (bySubj[s.subjectId] || 0) + s.studyMs; });
    const acc = {}; state.tasks.filter((t) => t.date >= since14 && t.status === 'done' && t.plannedMin).forEach((t) => { (acc[t.subjectId] = acc[t.subjectId] || []).push(overrunOf(t)); });
    const ws = weekStats(ws0);
    const recent = state.tasks.filter((t) => t.date >= since7).sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-25).map((t) => {
      const ss = state.sessions.filter((s) => s.taskId === t.id); const last = ss[ss.length - 1];
      return `- ${t.date.slice(5)} ${subjName(t.subjectId)} · ${t.title} · 예상 ${t.plannedMin}분 → 실제 ${Math.round(taskActualMs(t.id) / 60000)}분 · ${t.status === 'todo' ? '시작 안 함' : OUTCOME[t.status]}`
        + (last ? ` · 집중 ${last.focus}/5${last.distractors.length ? ` · 방해: ${last.distractors.join(', ')}` : ''}${last.drowsyCount ? ` · 졸음 감지 ${last.drowsyCount}회` : ''}` : '');
    });
    const g = gradeAnalysis();
    const n = latestNote();
    const out = [
      `오늘: ${fmtDateLong(now)} / 실험 단계: ${PHASE[state.profile.phase]} / 하루 순공 목표: ${fmtHM(state.profile.dailyGoalMin * 60000)}`,
      `과목: ${state.subjects.map((s) => s.name).join(', ')}`,
      `최근 14일: 공부한 날 ${new Set(s14.map((s) => s.date)).size}일, 과목별 순공 ${Object.entries(bySubj).sort((a, b) => b[1] - a[1]).map(([id, ms]) => `${subjName(id)} ${fmtHM(ms)}`).join(', ') || '없음'}`,
      `최근 14일 계획 정확도(끝낸 할 일의 실제 시간이 예상보다 몇 % 더 걸렸는지): ${Object.entries(acc).map(([id, a]) => `${subjName(id)} ${a.length}개 평균 ${avg(a) >= 0 ? '+' : ''}${Math.round(avg(a) * 100)}%`).join(', ') || '자료 없음'}`,
      weekLine(ws, '이번 주(진행 중)'),
      weekLine(weekStats(addDays(ws0, -7)), '지난주'),
      ws.focusByHour.length ? `이번 주 시간대별 평균 집중도: ${ws.focusByHour.map((h) => `${h.hour}시대 ${h.avg.toFixed(1)}(${h.n}번)`).join(', ')}` : '',
      recent.length ? `최근 7일 할 일:\n${recent.join('\n')}` : '최근 7일 할 일: 없음',
      state.goalNote ? `학생이 적은 목표: ${state.goalNote}` : '',
      g.rows.length ? `성적(시험 수가 적어 참고용, 괄호는 백분위):\n${g.rows.map((r) => `- ${r.name}: ${r.latest ? `최근 ${r.latest.examName} ${r.latest.grade}등급${r.latest.pct != null ? `(${r.latest.pct})` : ''}` : '시험 기록 없음'}${r.prev ? `, 직전 ${r.prev.examName} ${r.prev.grade}등급${r.prev.pct != null ? `(${r.prev.pct})` : ''}` : ''}${r.goal ? `, 목표 ${r.goal}등급` : ''}${r.between != null ? `, 두 시험 사이 이 과목 순공 ${fmtHM(r.between)}` : ''}`).join('\n')}` : '성적 기록: 없음',
      n ? `지난 상담(${n.date}) 요약: ${n.summary}\n지난 약속: ${n.promises.map((p) => `${p.text}(${p.done ? '실천함' : '아직'})`).join(' / ') || '없음'}` : '지난 상담: 없음',
    ];
    return out.filter(Boolean).join('\n').slice(0, 7000);
  }
  function weekContext(start) {
    const ws = weekStats(start); const sg = suggestions(ws) || [];
    return [`[코멘트할 주: ${weekLabel(start)}]`, weekLine(ws, '이 주'),
      `과목별 순공: ${ws.subjects.map((x) => `${subjName(x.id)} ${fmtHM(x.ms)}`).join(', ') || '없음'}`,
      `계획 정확도: ${ws.accuracy.map((x) => `${x.name} ${x.n}개 평균 ${x.avg >= 0 ? '+' : ''}${Math.round(x.avg * 100)}%`).join(', ') || '자료 없음'}`,
      ws.focusByHour.length ? `시간대별 집중도: ${ws.focusByHour.map((h) => `${h.hour}시대 ${h.avg.toFixed(1)}(${h.n}번)`).join(', ')}` : '',
      sg.length ? `앱 규칙이 낸 제안: ${sg.map((x) => x.title).join(' / ')}` : ''].filter(Boolean).join('\n');
  }
  function scrollChat() { const log = $('#chatLog'); if (log && log.lastElementChild) log.lastElementChild.scrollIntoView({ block: 'nearest' }); }
  async function sendMentor(text) {
    text = String(text || '').trim();
    if (!text || mentorBusy) return;
    state.mentor.chat.push({ role: 'user', content: text.slice(0, 1000) });
    mentorDraft = ''; mentorErr = ''; mentorBusy = true; save(); renderMentor(); scrollChat();
    try {
      const j = await callServer({ action: 'mentor', mode: 'chat', context: mentorContext(), messages: state.mentor.chat.slice(-16) });
      state.mentor.chat.push({ role: 'assistant', content: String(j.text || '').trim() || '(답이 비어 있어요. 다시 물어봐 주세요.)' });
    } catch (e) { mentorErr = errText(e); }
    mentorBusy = false; save();
    if (view === 'mentor') { renderMentor(); scrollChat(); }
  }
  async function finishMentor() {
    if (mentorBusy || !state.mentor.chat.some((m) => m.role === 'user')) return;
    mentorBusy = true; mentorErr = ''; renderMentor();
    try {
      const j = await callServer({ action: 'mentor', mode: 'summary', context: mentorContext(), messages: state.mentor.chat.slice(-16) });
      const promises = (Array.isArray(j.promises) ? j.promises : []).map((t) => String(t).trim().slice(0, 80)).filter(Boolean).slice(0, 3);
      state.mentor.notes.push({ id: uid(), date: dayKey(new Date()), summary: String(j.summary || '').trim().slice(0, 400) || '상담 요약을 받지 못했어요.', promises: promises.map((t) => ({ text: t, done: false })) });
      state.mentor.notes = state.mentor.notes.slice(-10);
      state.mentor.chat = [];
      toast(promises.length ? '상담을 정리했어요. 약속은 오늘 화면에서도 볼 수 있어요.' : '상담을 정리했어요');
    } catch (e) { mentorErr = errText(e); }
    mentorBusy = false; save(); render();
  }
  async function requestReportAI(start) {
    reportAI = { key: dayKey(start), text: '', busy: true, err: '' }; renderReport();
    try {
      const j = await callServer({ action: 'mentor', mode: 'report', context: `${weekContext(start)}\n\n[참고: 전체 기록]\n${mentorContext()}`, messages: [{ role: 'user', content: `${weekLabel(start)} 주간 보고서를 보고 코멘트해 주세요.` }] });
      reportAI.text = String(j.text || '').trim();
    } catch (e) { reportAI.err = errText(e); }
    reportAI.busy = false;
    if (view === 'report') renderReport();
  }
  function reportAIHTML(start) {
    if (!submitUrl() || state.profile.phase === 'A') return '';
    const mine = reportAI.key === dayKey(start);
    if (!state.profile.mentorConsent) return `<section class="card" aria-labelledby="aiH"><div class="card-head"><h2 id="aiH">AI 멘토 코멘트</h2></div><p class="muted">멘토 탭에서 데이터 사용에 동의하면 이 주의 기록에 대한 코멘트를 받을 수 있어요.</p><div><a class="btn small" href="#mentor">멘토 탭으로 가기</a></div></section>`;
    return `<section class="card" aria-labelledby="aiH"><div class="card-head"><h2 id="aiH">AI 멘토 코멘트</h2></div>
      ${mine && reportAI.text ? `<div class="ai-box">${esc(reportAI.text)}</div>` : ''}
      ${mine && reportAI.busy ? '<p class="muted">멘토가 보고서를 읽는 중이에요…</p>' : ''}
      ${mine && reportAI.err ? `<p class="form-err" role="alert">${esc(reportAI.err)}</p>` : ''}
      ${mine && reportAI.busy ? '' : `<div><button class="btn small" data-act="report-ai">${mine && reportAI.text ? '코멘트 다시 받기' : '이 주 코멘트 받기'}</button></div>`}
      <p class="muted small-text">AI도 틀릴 수 있어요. 위의 숫자와 함께 보세요.</p></section>`;
  }
  function mentorGreeting() {
    const n = latestNote(); const open = n && n.promises ? n.promises.filter((p) => !p.done) : [];
    if (open.length) return `다시 만나서 반가워요. 지난번에 "${open[0].text}" 하기로 했죠. 해 봤어요? 어땠는지 들려주면 그다음을 같이 정해 볼게요.`;
    return '안녕하세요, 야자 관리실 학습 멘토예요. 기록을 같이 보면서 공부 방법이나 계획을 고민해 볼게요. 요즘 공부하면서 가장 막히는 게 뭐예요?';
  }
  function renderMentor() {
    const el = $('#v-mentor');
    if (state.profile.phase === 'A') {
      el.innerHTML = '<section class="card"><h2 style="font-size:16px">실험 A주에는 멘토를 쉬어요</h2><p>A주는 피드백 없이 기록만 하는 주라서 AI 멘토도 쓰지 않아요. B주가 되면 열려요.</p></section>';
      return;
    }
    if (!submitUrl()) {
      el.innerHTML = `<div style="display:grid;gap:16px">
        <section class="card" aria-labelledby="mtIntro"><h2 id="mtIntro" style="font-size:16px">AI 학습 멘토</h2>
          <p>내 공부 기록, 성적과 목표, 지난 상담 내용을 보고 공부 방법과 과목별 시간 배분을 함께 고민해 주는 멘토예요. 상담이 끝나면 다음 야자에서 할 약속을 정리해 주고, 다음 상담에서 실천했는지 다시 물어봐요.</p>
          <p class="small-text"><b>아직 AI가 연결되지 않아서 지금은 예시 대화만 보여요.</b> 운영팀이 AI 키를 넣은 서버를 연결하면 이 화면에서 바로 실제 상담이 시작돼요. (연결 방법: 저장소 README 2번)</p></section>
        <section class="card" aria-labelledby="mtEx"><div class="card-head"><h2 id="mtEx">이런 식으로 상담해요</h2></div><span class="tag">예시 대화 · 실제 AI 답변이 아니에요</span>
          <div class="chat">
            <div class="msg user">수학을 제일 오래 하는데 성적이 잘 안 올라요.</div>
            <div class="msg assistant">기록을 보면 최근 2주 동안 수학을 가장 많이 했고, 끝낸 수학 할 일은 예상보다 평균 60% 정도 더 걸렸어요. 수학을 공부할 때 주로 어떻게 해요? 개념서를 다시 읽는 편인지, 문제를 푸는 편인지 궁금해요.</div>
            <div class="msg user">주로 개념서를 여러 번 읽어요.</div>
            <div class="msg assistant">다시 읽기는 공부한 느낌은 들지만 효과가 낮은 편이라는 연구가 있어요. 다음 야자에서는 단원 하나를 책을 덮고 백지에 정리한 뒤, 빠진 부분만 다시 확인해 볼까요? 해 보고 다음 상담 때 어땠는지 알려 주세요.</div>
          </div></section>
        ${promisesHTML(false)}</div>`;
      return;
    }
    if (!state.profile.mentorConsent) {
      el.innerHTML = `<section class="card" aria-labelledby="mtCon"><h2 id="mtCon" style="font-size:16px">AI 멘토를 시작하기 전에</h2>
        <p>멘토는 이 기기에 있는 공부 기록을 보고 답해요. 질문할 때마다 아래 내용이 운영팀 서버를 거쳐 AI 회사(Anthropic)의 서버로 전달돼요.</p>
        <ul class="data-list"><li>과목, 할 일 제목, 예상·실제 시간, 결과, 집중도, 방해 요인</li><li>시간대별 집중도, 카메라가 확인한 자리 비움·졸음 횟수</li><li>성적과 목표 등급, 지난 상담 요약과 약속</li><li>멘토에게 직접 쓴 대화</li></ul>
        <p class="muted small-text">이름, 닉네임, 점검 메모, 카메라 영상은 보내지 않아요. 대화 내용은 운영팀 시트에 저장되지 않아요. AI도 틀릴 수 있으니 중요한 결정은 선생님과 상의하세요.</p>
        <div><button class="btn primary" data-act="mentor-consent">이해했어요, 시작할게요</button></div></section>`;
      return;
    }
    const chat = state.mentor.chat;
    const past = state.mentor.notes.slice(0, -1).reverse().slice(0, 5);
    el.innerHTML = `<div style="display:grid;gap:16px">
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
      ${promisesHTML(false)}
      ${past.length ? `<section class="card" aria-labelledby="mtPast"><details><summary><b id="mtPast">이전 상담 ${past.length}개</b></summary>
        <ul class="sess-list" style="margin-top:8px">${past.map((n) => `<li class="sess"><div class="sess-time">${n.date.slice(5).replace('-', '.')}</div><div><div>${esc(n.summary)}</div>${n.promises.length ? `<div class="sess-sub">약속: ${n.promises.map((p) => `${esc(p.text)}${p.done ? ' ✓' : ''}`).join(' / ')}</div>` : ''}</div></li>`).join('')}</ul></details></section>` : ''}
    </div>`;
  }

  // ---------- actions ----------
  function clearSample() {
    state.tasks = []; state.sessions = []; state.running = null; state.lastFeedback = null; state.sample = false;
    state.exams = []; state.goals = {}; state.goalNote = ''; state.mentor = { chat: [], notes: [] };
    save();
  }
  function addTask() {
    const title = ($('#addTitle').value || '').trim();
    const sid = $('#addSubj').value; const m = Number($('#addMin').value) || 30;
    lastSubj = sid; lastMin = m;
    if (!title) { const e = $('#addErr'); e.textContent = '할 일을 적어 주세요. 범위까지 적으면 점검하기 쉬워요.'; e.hidden = false; $('#addTitle').focus(); return; }
    if (state.sample) { clearSample(); toast('예시 기록을 지우고 내 기록을 시작했어요'); }
    const nt = { id: uid(), date: dayKey(new Date()), subjectId: sid, title: title.slice(0, 40), plannedMin: m, status: 'todo' };
    state.tasks.push(nt);
    save(); enqueue([taskItem(nt)]); render();
    const inp = $('#addTitle'); if (inp) inp.focus();
  }
  function carryOver() {
    const tk = dayKey(new Date());
    const list = carryCandidates(); if (!list.length) return;
    if (state.sample) { toast('예시 기록에서는 가져올 수 없어요. "예시 지우고 시작하기"를 눌러 주세요.'); return; }
    const added = list.map((t) => {
      const rest = t.status === 'partial' ? Math.max(10, Math.round((t.plannedMin - taskActualMs(t.id) / 60000) / 5) * 5) : t.plannedMin;
      return { id: uid(), date: tk, subjectId: t.subjectId, title: t.title, plannedMin: rest, status: 'todo', carriedFrom: t.id };
    });
    state.tasks.push(...added);
    save(); enqueue(added.map((t) => taskItem(t))); render(); toast(`${list.length}개를 오늘 계획에 넣었어요`);
  }
  function arm(name) {
    if (armed[name]) return true;
    armed[name] = true; renderPrefs();
    setTimeout(() => { armed[name] = false; if (view === 'prefs') renderPrefs(); }, 5000);
    return false;
  }

  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-act]'); if (!b || b.disabled) return;
    const act = b.dataset.act; const id = b.dataset.id;
    switch (act) {
      case 'clear-sample': clearSample(); calSel = dayKey(new Date()); weekOffset = 0; render(); toast('예시를 지웠어요. 오늘 할 일부터 적어 보세요.'); if (view !== 'today') location.hash = 'today'; break;
      case 'start': startTask(id); break;
      case 'del-task': { const dt = taskById(id); state.tasks = state.tasks.filter((t) => t.id !== id); save(); if (dt) enqueue([taskItem(dt, true)]); render(); break; }
      case 'carry': carryOver(); break;
      case 'dismiss-fb': state.lastFeedback = null; save(); render(); break;
      case 'open-timer': if (state.running) { state.running.overlay = true; save(); renderTimer(); requestWake(); } break;
      case 'min-timer': if (state.running) { state.running.overlay = false; save(); releaseWake(); render(); } break;
      case 'toggle-break': toggleBreak(); break;
      case 'end-session': openCheckout(); break;
      case 'co-outcome': co.outcome = b.dataset.v; co.err = ''; renderCheckout(); break;
      case 'co-focus': co.focus = Number(b.dataset.v); co.err = ''; renderCheckout(); break;
      case 'co-dist': { const v = b.dataset.v; co.dist = co.dist.includes(v) ? co.dist.filter((x) => x !== v) : co.dist.concat(v); co.none = false; renderCheckout(); break; }
      case 'co-none': co.none = !co.none; if (co.none) co.dist = []; renderCheckout(); break;
      case 'co-back': cancelCheckout(); break;
      case 'co-save': saveCheckout(); break;
      case 'cal-prev': calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1); renderLog(); break;
      case 'cal-next': calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1); renderLog(); break;
      case 'cal-day': calSel = b.dataset.key; renderLog(); break;
      case 'wk-prev': weekOffset -= 1; renderReport(); break;
      case 'wk-next': if (weekOffset < 0) { weekOffset += 1; renderReport(); } break;
      case 'promise': {
        const n = latestNote(); const i = Number(b.dataset.i);
        if (n && n.promises[i]) { n.promises[i].done = b.checked; save(); render(); if (b.checked) toast('약속을 지켰어요. 멘토에게도 알려 주세요.'); }
        break;
      }
      case 'cam-toggle': camToggle(); break;
      case 'alarm-ok': dismissAlarm(); toast('좋아요. 다시 집중해 봐요.'); break;
      case 'log-mode': logMode = b.dataset.v === 'grades' ? 'grades' : 'study'; renderLog(); break;
      case 'exam-new': {
        const d = new Date();
        examDraft = { type: 'mock', name: '', date: dayKey(d), scores: {} };
        renderLog(); const n = $('#exName'); if (n) n.focus();
        break;
      }
      case 'exam-type': readExamForm(); examDraft.type = b.dataset.v === 'school' ? 'school' : 'mock'; renderLog(); break;
      case 'exam-cancel': examDraft = null; renderLog(); break;
      case 'exam-del': {
        if (!b.dataset.armed) {
          b.dataset.armed = '1'; b.textContent = '삭제'; b.classList.add('armed-del');
          setTimeout(() => { if (b.isConnected && b.dataset.armed) { delete b.dataset.armed; b.textContent = '×'; b.classList.remove('armed-del'); } }, 4000);
          break;
        }
        state.exams = state.exams.filter((e) => e.id !== id); save(); renderLog(); toast('시험 기록을 지웠어요');
        break;
      }
      case 'mentor-consent': state.profile.mentorConsent = true; save(); renderMentor(); break;
      case 'mentor-quick': sendMentor(b.dataset.v); break;
      case 'mentor-finish': finishMentor(); break;
      case 'mentor-clear': {
        if (!arm('mentor-clear')) break;
        armed['mentor-clear'] = false; state.mentor = { chat: [], notes: [] }; save(); renderPrefs(); toast('상담 기록을 지웠어요');
        break;
      }
      case 'report-ai': requestReportAI(addDays(weekStart(new Date()), weekOffset * 7)); break;
      case 'arduino-on': Arduino.connect().then((ok) => { toast(ok ? '아두이노를 연결했어요' : '아두이노를 연결하지 못했어요'); if (view === 'prefs') renderPrefs(); }); break;
      case 'arduino-off': Arduino.disconnect().then(() => { toast('아두이노 연결을 끊었어요'); if (view === 'prefs') renderPrefs(); }); break;
      case 'arduino-test': Arduino.send('W'); setTimeout(() => Arduino.send('O'), 1500); break;
      case 'share-report': shareReport(); break;
      case 'install': promptInstall(); break;
      case 'dismiss-install': state.profile.installDismissed = true; save(); render(); break;
      case 'send-now': flushOutbox(true); break;
      case 'subj-add': {
        if (state.subjects.length >= 8) break;
        const usedSlots = new Set(state.subjects.map((s) => s.slot));
        let slot = 0; while (usedSlots.has(slot)) slot++;
        state.subjects.push({ id: 's' + slot + uid(), name: `과목 ${state.subjects.length + 1}`, slot });
        save(); renderPrefs(); const inputs = $$('.subj-row input'); if (inputs.length) { inputs[inputs.length - 1].focus(); inputs[inputs.length - 1].select(); }
        break;
      }
      case 'subj-del': state.subjects = state.subjects.filter((s) => s.id !== id); save(); renderPrefs(); break;
      case 'dist-del': { const i = Number(b.dataset.i); state.distractors.splice(i, 1); save(); renderPrefs(); break; }
      case 'copy-export': copyText(exportCSV(exportKind), $('#exText')); break;
      case 'save-export': downloadFile(exportFileName(), exportCSV(exportKind)); break;
      case 'share-export': shareCSV(); break;
      case 'copy-backup': copyText(JSON.stringify(Object.assign({}, state, { running: null }))); break;
      case 'restore': {
        const raw = ($('#rsText').value || '').trim(); const err = $('#rsErr');
        let parsed = null;
        try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
        if (!parsed || !Array.isArray(parsed.tasks) || !Array.isArray(parsed.sessions) || !Array.isArray(parsed.subjects)) { err.textContent = '백업 코드가 올바르지 않아요. 복사한 내용을 처음부터 끝까지 붙여 넣었는지 확인해 주세요.'; err.hidden = false; break; }
        restoreDraft = raw;
        if (!arm('restore')) break;
        armed.restore = false; restoreDraft = '';
        state = migrate(parsed); state.running = null; save(); render(); toast('백업에서 기록을 되살렸어요');
        break;
      }
      case 'reset': {
        if (!arm('reset')) break;
        armed.reset = false;
        const keep = { profile: state.profile, subjects: state.subjects, distractors: state.distractors };
        state = Object.assign(freshState(), keep); save(); render(); toast('모든 기록을 지웠어요');
        break;
      }
      case 'sample-again': {
        const keep = { profile: state.profile };
        state = makeSample(); state.profile = Object.assign(state.profile, keep.profile); save(); location.hash = 'today'; render(); toast('예시 기록을 불러왔어요');
        break;
      }
      default: break;
    }
  });

  document.addEventListener('submit', (ev) => {
    if (ev.target.id === 'addForm') { ev.preventDefault(); addTask(); }
    if (ev.target.id === 'examForm') { ev.preventDefault(); saveExam(); }
    if (ev.target.id === 'chatForm') { ev.preventDefault(); const t = $('#chatText'); sendMentor(t ? t.value : ''); }
    if (ev.target.id === 'distForm') {
      ev.preventDefault();
      const v = ($('#distNew').value || '').trim().slice(0, 12);
      if (!v) return;
      if (state.distractors.includes(v)) { toast('이미 있는 항목이에요'); return; }
      if (state.distractors.length >= 8) return;
      state.distractors.push(v); save(); renderPrefs(); const n = $('#distNew'); if (n) n.focus();
    }
  });
  document.addEventListener('input', (ev) => {
    if (ev.target.id === 'addTitle') { const e = $('#addErr'); if (e) e.hidden = true; }
    if (ev.target.id === 'coMemo' && co) co.memo = ev.target.value;
    if (ev.target.id === 'rsText') restoreDraft = ev.target.value;
    if (ev.target.id === 'coAway' && co) co.awayEx = ev.target.checked;
    if (ev.target.id === 'coCamAway' && co) co.camEx = ev.target.checked;
    if (ev.target.id === 'chatText') mentorDraft = ev.target.value;
  });
  // Enter sends, Shift+Enter makes a new line (skipped while a Korean IME is still composing)
  document.addEventListener('keydown', (ev) => {
    if (ev.target.id === 'chatText' && ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing && ev.keyCode !== 229) {
      ev.preventDefault(); sendMentor(ev.target.value);
    }
    if (ev.key === 'Escape' && !$('#alarm').hidden) dismissAlarm();
  });
  document.addEventListener('change', (ev) => {
    const el = ev.target; const k = el.dataset ? el.dataset.pref : null;
    if (el.id === 'coAway' && co) { co.awayEx = el.checked; return; }
    if (el.id === 'coCamAway' && co) { co.camEx = el.checked; return; }
    if (el.id === 'addSubj') { lastSubj = el.value; return; }
    if (el.id === 'addMin') { lastMin = Number(el.value); return; }
    if (!k) return;
    const p = state.profile;
    if (k === 'nick') p.nick = el.value.trim().slice(0, 12);
    else if (k === 'code') p.code = el.value.trim().slice(0, 12);
    else if (k === 'goal') p.dailyGoalMin = Number(el.value);
    else if (k === 'phase') { p.phase = el.value; render(); }
    else if (k === 'away') p.away = el.value;
    else if (k === 'wake') { p.keepAwake = el.checked; if (!el.checked) releaseWake(); }
    else if (k === 'chime') p.chime = el.checked;
    else if (k === 'submit') {
      p.submit = el.checked; save();
      if (p.submit) {
        const n = state.tasks.length + state.sessions.length;
        enqueue(state.tasks.map((t) => taskItem(t)).concat(state.sessions.map(sessionItem)));
        toast(n ? `기록 보내기를 켰어요. 지금까지의 기록 ${n}개도 보내요.` : '기록 보내기를 켰어요');
      } else toast('기록 보내기를 껐어요');
      renderPrefs(); return;
    }
    else if (k === 'submit-url') { p.submitUrl = el.value.trim(); save(); renderPrefs(); toast('수집 주소를 저장했어요'); return; }
    else if (k === 'goal-grade') { const id = el.dataset.id; if (el.value) state.goals[id] = { grade: Number(el.value) }; else delete state.goals[id]; save(); renderLog(); toast('목표를 저장했어요'); return; }
    else if (k === 'goal-note') { state.goalNote = el.value.trim().slice(0, 60); }
    else if (k === 'mentor-code') p.mentorCode = el.value.trim().slice(0, 20);
    else if (k === 'cam-sens') p.camSens = el.value;
    else if (k === 'cam-preview') { p.camPreview = el.checked; renderCam(); }
    else if (k === 'cam-alarm') p.camAlarm = el.checked;
    else if (k === 'cam-vibrate') p.camVibrate = el.checked;
    else if (k === 'cam-auto') p.camAuto = el.checked;
    else if (k === 'subj-name') { const s = subj(el.dataset.id); const v = el.value.trim().slice(0, 10); if (s && v) s.name = v; else if (s) el.value = s.name; }
    else if (k === 'exkind') { exportKind = el.value; save(); renderPrefs(); return; }
    save();
    if (k === 'code') { const t = $('#exText'); if (t) t.value = exportCSV(exportKind); }
    if (k !== 'phase') toast('저장했어요');
  });

  // ---------- routing ----------
  function route() {
    const h = (location.hash || '').replace('#', '');
    const next = VIEWS.includes(h) ? h : 'today';
    const changed = next !== view; view = next;
    render();
    if (changed) window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);

  // ---------- boot ----------
  if (state.running && state.running.hiddenSince) onShow();
  route();
  if (state.running && !state.running.endAt) requestWake();
  // refresh "today" when the date rolls over while the page stays open
  let lastDay = dayKey(new Date());
  setInterval(() => { const d = dayKey(new Date()); if (d !== lastDay) { lastDay = d; if (!state.running) render(); } }, 30000);
  // offline support: works once the site is served over https (or localhost)
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => { /* app still works online */ }); });
  }
  // records waiting to be sent go out when the connection comes back
  window.addEventListener('online', () => flushOutbox());
  setInterval(() => flushOutbox(), 60000);
  flushOutbox();
})();

(() => {
  'use strict';

  // ---------- constants ----------
  const KEY = 'yaja-room-v1';
  const VIEWS = ['today', 'log', 'report', 'prefs'];
  const MINUTES = [10, 15, 20, 30, 40, 50, 60, 80, 90, 120];
  const GOALS = [60, 90, 120, 150, 180, 210, 240, 270, 300, 360, 420, 480];
  const AWAY_MIN_MS = 10000;
  const APP_VERSION = '1.0.0';
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
      profile: { nick: '', code: '', dailyGoalMin: 240, phase: 'normal', away: 'record', keepAwake: true, chime: true, submit: false, submitUrl: '', lastSent: null, installDismissed: false },
      subjects: DEFAULT_SUBJECTS.map((name, i) => ({ id: 's' + i + uid(), name, slot: i })),
      distractors: DEFAULT_DISTRACTORS.slice(),
      tasks: [], sessions: [], running: null, lastFeedback: null,
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
    const now = Date.now();
    const prior = taskActualMs(t.id);
    state.running = { taskId: t.id, subjectId: t.subjectId, startedAt: now, mode: 'study', modeSince: now, studyMs: 0, breakMs: 0,
      awayMs: 0, awayCount: 0, hiddenSince: null, chimed: prior >= t.plannedMin * 60000, endAt: null, overlay: true };
    save(); render(); requestWake();
  }
  function toggleBreak() {
    const r = state.running; if (!r || r.endAt) return;
    const now = Date.now();
    if (r.mode === 'study') { r.studyMs += now - r.modeSince; r.mode = 'break'; }
    else { r.breakMs += now - r.modeSince; r.mode = 'study'; }
    r.modeSince = now; save(); renderTimer();
  }
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
    renderWake(); tick();
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
    if (view === 'today') {
      const hn = $('#heroNum'); if (hn) hn.textContent = fmtHM(todayStudyMs());
      const g = goalHTML(); const gf = $('#goalFill'); const gt = $('#goalText');
      if (gf) gf.style.width = g.p + '%'; if (gt) gt.textContent = g.text;
    }
  }
  setInterval(tick, 500);

  function onHide() {
    const r = state.running;
    if (!r || r.endAt || r.mode !== 'study' || state.profile.away === 'off' || r.hiddenSince) return;
    r.hiddenSince = Date.now(); save();
  }
  function onShow() {
    const r = state.running;
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
  function newDraft() { return { outcome: null, focus: null, dist: [], none: false, awayEx: state.profile.away === 'exclude', memo: '', err: '' }; }
  function openCheckout() {
    const r = state.running; if (!r || r.endAt) return;
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
      ${r.awayMs > 0 ? `<label class="check"><input type="checkbox" id="coAway" ${co.awayEx ? 'checked' : ''}><span>앱을 벗어난 ${fmtDur(r.awayMs)}(${r.awayCount}회)은 공부하지 않았어요. 순공에서 뺄게요.</span></label>` : ''}
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
    if (!co.outcome || !co.focus) { co.err = !co.outcome && !co.focus ? '결과와 집중도를 골라 주세요.' : !co.outcome ? '할 일을 끝냈는지 골라 주세요.' : '집중도를 골라 주세요.'; renderCheckout(); return; }
    const t = taskById(r.taskId);
    const awayEx = !!co.awayEx && r.awayMs > 0;
    const sess = { id: uid(), taskId: r.taskId, subjectId: r.subjectId, taskTitle: t ? t.title : '', plannedMin: t ? t.plannedMin : 0,
      date: dayKey(r.startedAt), start: r.startedAt, end: r.endAt,
      studyMs: Math.max(0, r.studyMs - (awayEx ? r.awayMs : 0)), grossMs: r.studyMs, breakMs: r.breakMs, awayMs: r.awayMs, awayCount: r.awayCount,
      awayExcluded: awayEx, outcome: co.outcome, focus: co.focus, distractors: co.dist.slice(), memo: (co.memo || '').trim().slice(0, 100), phase: state.profile.phase };
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
    $('#v-log').innerHTML = `
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
    return { start, keys, sessions, tasks, totalMs, grossMs, awayMs, subjects, doneCount, completion, avgFocus, focusByHour, distractors, accuracy, studyDays, lowHour: low && avgFocus != null && low.avg < avgFocus ? low.hour : null };
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
    const rows = [['참여코드', '실험단계', '날짜', '요일', '시작', '종료', '과목', '할 일', '예상(분)', '순공(분)', '휴식(분)', '앱 이탈(분)', '이탈 횟수', '이탈 시간 순공에서 뺌', '결과', '집중도(1-5)', '방해요인', '메모']];
    state.sessions.slice().sort((a, b) => a.start - b.start).forEach((s) => {
      rows.push([code, PHASE[s.phase] || s.phase, s.date, WD[parseDay(s.date).getDay()], fmtTime(s.start), fmtTime(s.end), subjName(s.subjectId), s.taskTitle, s.plannedMin,
        mins(s.studyMs), mins(s.breakMs || 0), mins(s.awayMs || 0), s.awayCount || 0, s.awayExcluded ? '예' : '아니오', OUTCOME[s.outcome], s.focus, s.distractors.join(' / '), s.memo || '']);
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
  const submitUrl = () => String(state.profile.submitUrl || (window.YAJA_CONFIG && window.YAJA_CONFIG.submitUrl) || '').trim();
  const submitOn = () => !!(state.profile.submit && submitUrl() && state.profile.code && !state.sample);
  function saveOutbox() { try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(outbox)); } catch (e) { /* ignore */ } }
  // only anonymous fields leave the device: no nickname, task title or memo
  function sessionItem(s) {
    return { kind: 'session', id: s.id, code: state.profile.code, phase: PHASE[s.phase] || s.phase, date: s.date, weekday: WD[parseDay(s.date).getDay()],
      start: fmtTime(s.start), end: fmtTime(s.end), subject: subjName(s.subjectId), plannedMin: s.plannedMin, studyMin: Number(mins(s.studyMs)),
      breakMin: Number(mins(s.breakMs || 0)), awayMin: Number(mins(s.awayMs || 0)), awayCount: s.awayCount || 0, awayExcluded: !!s.awayExcluded,
      outcome: OUTCOME[s.outcome], focus: s.focus, distractors: s.distractors.join(' / ') };
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

  // ---------- actions ----------
  function clearSample() {
    state.tasks = []; state.sessions = []; state.running = null; state.lastFeedback = null; state.sample = false;
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
  });
  document.addEventListener('change', (ev) => {
    const el = ev.target; const k = el.dataset ? el.dataset.pref : null;
    if (el.id === 'coAway' && co) { co.awayEx = el.checked; return; }
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

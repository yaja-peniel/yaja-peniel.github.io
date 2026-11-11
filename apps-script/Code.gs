/**
 * 야자 관리실 – 운영팀 서버 v2 (Google Apps Script)
 *
 * 하는 일
 *  1) 로그인: 학생·관리자(선생님) 가입과 로그인. 비밀번호는 원문을 저장하지 않고 해시로만 저장합니다.
 *  2) 기록 저장: 학생 기록(공부 기록, 주간 목표, 시험, 설정)을 이 구글 시트에 저장하고, 다른 기기에서 로그인하면 불러옵니다.
 *  3) 관리자 조회: 관리자 계정은 모든 학생의 기록을 볼 수 있고, 비밀번호 초기화와 계정 정지를 할 수 있습니다.
 *  4) AI 멘토 중계: AI 키를 이 스크립트 안에만 두고 질문을 대신 전달합니다.
 *
 * 스크립트 속성 (Apps Script 편집기 → 프로젝트 설정 → 스크립트 속성)
 *  - JOIN_CODE            (필수) 학생 가입 코드. 학생들에게만 알려 주세요.
 *  - ADMIN_CODE           (필수) 선생님(관리자) 가입 코드. 학생들에게 알려 주면 안 됩니다.
 *  - ANTHROPIC_API_KEY    (AI 멘토를 쓸 때) Claude API 키
 *  - ANTHROPIC_WORKSPACE_ID (키를 만들 때 워크스페이스를 고르지 않았을 때만) wrkspc_로 시작하는 값
 *  - MENTOR_MODEL         (선택) 기본값 claude-haiku-5-5
 *  - MENTOR_DAILY_LIMIT   (선택) 학생 한 명이 하루에 보낼 수 있는 질문 수, 기본 30
 *  - MENTOR_GLOBAL_LIMIT  (선택) 전체 하루 질문 수, 기본 400
 *  - TOKEN_SECRET         (자동 생성) 로그인 토큰 서명용. 바꾸면 모두 다시 로그인해야 합니다.
 *
 * 시트(자동 생성): 사용자, 학생설정, 공부기록, 주간목표, 시험
 * 마지막 'json' 열은 앱이 기록을 그대로 복원하는 데 쓰므로 직접 고치지 마세요.
 */

const SHEETS = {
  users: { name: '사용자', headers: ['uid', '학번', '이름', '반', '역할', '상태', 'salt', '비밀번호 해시', '가입일', '마지막 접속'] },
  meta: { name: '학생설정', headers: ['uid', '학번', '이름', '갱신시각', 'json'] },
  session: {
    name: '공부기록',
    headers: ['기록ID', 'uid', '학번', '이름', '날짜', '요일', '시작', '종료', '과목', '주간 목표', '이번에 할 일', '예상(분)', '순공(분)', '휴식(분)',
      '앱 이탈(분)', '카메라 자리비움(분)', '졸음 감지', '할 일 달성도(%)', '목표 진행률(%)', '집중도', '방해요인', '실험단계', '삭제', '갱신시각', 'json'],
    view: ['date', 'weekday', 'start', 'end', 'subject', 'goal', 'plan', 'planMin', 'studyMin', 'breakMin', 'awayMin', 'camAwayMin', 'drowsy', 'achieve', 'goalProgress', 'focus', 'distractors', 'phase'],
  },
  goal: {
    name: '주간목표',
    headers: ['목표ID', 'uid', '학번', '이름', '주 시작일', '과목', '목표', '목표 시간(분)', '진행률(%)', '상태', '삭제', '갱신시각', 'json'],
    view: ['week', 'subject', 'title', 'targetMin', 'progress', 'status'],
  },
  exam: {
    name: '시험',
    headers: ['시험ID', 'uid', '학번', '이름', '날짜', '종류', '시험 이름', '등급(백분위)', '삭제', '갱신시각', 'json'],
    view: ['date', 'type', 'name', 'scores'],
  },
};
const RECORD_KINDS = ['goal', 'session', 'exam'];
const ROLE = { student: '학생', admin: '관리자' };
const STATUS = { active: '사용', disabled: '정지' };
const TOKEN_DAYS = 30;
const HASH_ROUNDS = 200;

// ---------- 입구 ----------
function doPost(e) {
  let body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { return json_({ ok: false, error: 'bad_request' }); }
  try {
    const a = String(body.action || '');
    if (a === 'signup') return json_(signup_(body));
    if (a === 'login') return json_(login_(body));
    if (a === 'ping') return json_({ ok: true });
    const me = auth_(body);
    if (!me) return json_({ ok: false, error: 'auth' });
    if (a === 'pull') return json_(pull_(me));
    if (a === 'push') return json_(push_(body, me));
    if (a === 'password') return json_(changePassword_(body, me));
    if (a === 'mentor') return json_(mentor_(body, me));
    if (a.indexOf('admin_') === 0) {
      if (me.role !== ROLE.admin) return json_({ ok: false, error: 'forbidden' });
      if (a === 'admin_overview') return json_(adminOverview_(body));
      if (a === 'admin_student') return json_(adminStudent_(body));
      if (a === 'admin_reset') return json_(adminReset_(body, me));
      if (a === 'admin_status') return json_(adminStatus_(body, me));
    }
    return json_({ ok: false, error: 'unknown_action' });
  } catch (err) {
    return json_({ ok: false, error: 'server_error', detail: String(err).slice(0, 300) });
  }
}

// 브라우저로 웹 앱 주소를 열었을 때 설정 상태를 보여 줍니다
function doGet() {
  const P = PropertiesService.getScriptProperties();
  return json_({
    ok: true, app: 'yaja-room', version: 2, message: '서버가 정상적으로 동작하고 있어요.',
    joinCode: !!P.getProperty('JOIN_CODE'), adminCode: !!P.getProperty('ADMIN_CODE'), mentor: P.getProperty('ANTHROPIC_API_KEY') ? 'ready' : 'no_key',
  });
}

// ---------- 계정 ----------
function signup_(b) {
  const P = PropertiesService.getScriptProperties();
  const join = P.getProperty('JOIN_CODE');
  const admin = P.getProperty('ADMIN_CODE');
  if (!join || !admin) return { ok: false, error: 'not_ready' };
  const code = String(b.joinCode || '').trim();
  const role = code === admin ? ROLE.admin : code === join ? ROLE.student : '';
  if (!role) return { ok: false, error: 'bad_join_code' };
  const no = cleanNo_(b.studentNo);
  const name = String(b.name || '').trim().slice(0, 20);
  const cls = String(b.cls || '').trim().slice(0, 10);
  const pw = String(b.password || '');
  if (!no) return { ok: false, error: 'bad_no' };
  if (!name) return { ok: false, error: 'bad_name' };
  if (pw.length < 6 || pw.length > 64) return { ok: false, error: 'bad_password' };
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (users_().some(function (u) { return u.no.toLowerCase() === no.toLowerCase(); })) return { ok: false, error: 'exists' };
    const uid = 'u' + Utilities.getUuid().replace(/-/g, '').slice(0, 12);
    const salt = Utilities.getUuid().replace(/-/g, '');
    const now = new Date();
    // 학번·반 앞의 ' 는 구글 시트가 숫자나 날짜로 바꾸지 않게 하는 표시입니다
    sheet_('users').appendRow([uid, "'" + no, name, "'" + cls, role, STATUS.active, salt, hash_(pw, salt), now, now]);
    const user = { uid: uid, no: no, name: name, cls: cls, role: role };
    return { ok: true, token: makeToken_(uid), user: publicUser_(user) };
  } finally {
    lock.releaseLock();
  }
}

function login_(b) {
  const no = cleanNo_(b.studentNo);
  const pw = String(b.password || '');
  if (!no || !pw) return { ok: false, error: 'bad_login' };
  const cache = CacheService.getScriptCache();
  const key = 'fail_' + no.toLowerCase();
  const fails = Number(cache.get(key) || 0);
  if (fails >= 5) return { ok: false, error: 'locked' };
  const u = users_().filter(function (x) { return x.no.toLowerCase() === no.toLowerCase(); })[0];
  if (!u || hash_(pw, u.salt) !== u.hash) {
    cache.put(key, String(fails + 1), 600);
    return { ok: false, error: 'bad_login' };
  }
  if (u.status === STATUS.disabled) return { ok: false, error: 'disabled' };
  cache.remove(key);
  sheet_('users').getRange(u.row, 10).setValue(new Date());
  return { ok: true, token: makeToken_(u.uid), user: publicUser_(u) };
}

function changePassword_(b, me) {
  if (hash_(String(b.oldPassword || ''), me.salt) !== me.hash) return { ok: false, error: 'wrong_password' };
  const pw = String(b.newPassword || '');
  if (pw.length < 6 || pw.length > 64) return { ok: false, error: 'bad_password' };
  setPassword_(me, pw);
  return { ok: true };
}

function setPassword_(u, pw) {
  const salt = Utilities.getUuid().replace(/-/g, '');
  sheet_('users').getRange(u.row, 7, 1, 2).setValues([[salt, hash_(pw, salt)]]);
}

function users_() {
  return rows_('users').map(function (r, i) {
    return { row: i + 2, uid: String(r[0]), no: String(r[1]), name: String(r[2]), cls: String(r[3]), role: String(r[4]), status: String(r[5]),
      salt: String(r[6]), hash: String(r[7]), joined: r[8], last: r[9] };
  });
}

function publicUser_(u) {
  return { uid: u.uid, studentNo: u.no, name: u.name, cls: u.cls, role: u.role === ROLE.admin ? 'admin' : 'student' };
}

function cleanNo_(v) {
  const s = String(v == null ? '' : v).trim();
  return /^[0-9A-Za-z_-]{2,20}$/.test(s) ? s : '';
}

// 비밀번호를 소금(salt)과 섞어 여러 번 해시합니다
function hash_(pw, salt) {
  let h = salt + ':' + pw;
  for (let i = 0; i < HASH_ROUNDS; i++) {
    h = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h + salt, Utilities.Charset.UTF_8));
  }
  return h;
}

// ---------- 로그인 토큰 (서명으로 위조를 막습니다) ----------
function secret_() {
  const P = PropertiesService.getScriptProperties();
  let s = P.getProperty('TOKEN_SECRET');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); P.setProperty('TOKEN_SECRET', s); }
  return s;
}
function sign_(text) { return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(text, secret_())); }
function makeToken_(uid) {
  const p = Utilities.base64EncodeWebSafe(JSON.stringify({ u: uid, e: Date.now() + TOKEN_DAYS * 864e5 }));
  return p + '.' + sign_(p);
}
function readToken_(t) {
  t = String(t || '');
  const i = t.indexOf('.');
  if (i < 1) return null;
  const p = t.slice(0, i);
  if (sign_(p) !== t.slice(i + 1)) return null;
  try {
    const o = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(p)).getDataAsString());
    return o && o.u && o.e > Date.now() ? o : null;
  } catch (err) { return null; }
}
function auth_(b) {
  const p = readToken_(b.token);
  if (!p) return null;
  const u = users_().filter(function (x) { return x.uid === p.u; })[0];
  if (!u || u.status === STATUS.disabled) return null;
  return u;
}

// ---------- 내 기록 불러오기 / 저장하기 ----------
function pull_(me) {
  const out = { ok: true, user: publicUser_(me), mentor: !!PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY'),
    meta: null, goals: [], sessions: [], exams: [], deleted: { goal: [], session: [], exam: [] }, serverTime: Date.now() };
  rows_('meta').forEach(function (r) { if (String(r[0]) === me.uid) out.meta = parse_(r[4]); });
  RECORD_KINDS.forEach(function (k) {
    const n = SHEETS[k].headers.length;
    rows_(k).forEach(function (r) {
      if (String(r[1]) !== me.uid) return;
      if (r[n - 3] === '삭제') { out.deleted[k].push(String(r[0])); return; }
      const d = parse_(r[n - 1]);
      if (d) out[k + 's'].push(d);
    });
  });
  return out;
}

function push_(b, me) {
  const items = Array.isArray(b.items) ? b.items.slice(0, 200) : [];
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    let saved = 0;
    const metas = items.filter(function (it) { return it && it.kind === 'meta'; });
    if (metas.length) saved += saveMeta_(me, metas[metas.length - 1]);
    RECORD_KINDS.forEach(function (k) {
      const list = items.filter(function (it) { return it && it.kind === k && it.id; });
      if (list.length) saved += saveRecords_(k, me, list);
    });
    return { ok: true, saved: saved };
  } finally {
    lock.releaseLock();
  }
}

function saveMeta_(me, it) {
  const json = JSON.stringify(it.data || {});
  if (json.length > 45000) return 0;
  const at = Number(it.updatedAt) || Date.now();
  const sh = sheet_('meta');
  const rows = rows_('meta');
  let idx = -1;
  rows.forEach(function (r, i) { if (String(r[0]) === me.uid) idx = i; });
  const row = [me.uid, "'" + me.no, me.name, at, json];
  if (idx >= 0) {
    if (Number(rows[idx][3]) >= at) return 0; // 서버에 더 새로운 설정이 있음
    sh.getRange(idx + 2, 1, 1, row.length).setValues([row]);
  } else {
    sh.appendRow(row);
  }
  return 1;
}

function saveRecords_(k, me, list) {
  const def = SHEETS[k];
  const n = def.headers.length;
  const sh = sheet_(k);
  const index = {};
  rows_(k).forEach(function (r, i) { index[String(r[0])] = { row: i + 2, uid: String(r[1]), at: Number(r[n - 2]) || 0 }; });
  const appends = [];
  let saved = 0;
  list.forEach(function (it) {
    const id = String(it.id).slice(0, 40);
    const at = Number(it.updatedAt) || Date.now();
    const ex = index[id];
    if (ex && ex.uid !== me.uid) return;      // 다른 학생의 기록은 바꿀 수 없음
    if (ex && ex.at >= at) return;            // 이미 같거나 더 새로운 기록이 있음
    if (!ex && it.deleted) return;            // 서버에 없던 기록의 삭제는 무시
    const json = it.deleted ? '' : JSON.stringify(it.data || {});
    if (json.length > 45000) return;
    const view = it.view || {};
    const row = ["'" + id, me.uid, "'" + me.no, me.name]
      .concat(def.view.map(function (f) { return cell_(view[f]); }))
      .concat([it.deleted ? '삭제' : '', at, json]);
    if (ex) { sh.getRange(ex.row, 1, 1, n).setValues([row]); ex.at = at; }
    else { appends.push(row); index[id] = { row: -1, uid: me.uid, at: at }; }
    saved++;
  });
  if (appends.length) sh.getRange(sh.getLastRow() + 1, 1, appends.length, n).setValues(appends);
  return saved;
}

// ---------- 관리자 ----------
function userList_() {
  return users_().map(function (x) {
    return { uid: x.uid, studentNo: x.no, name: x.name, cls: x.cls, role: x.role === ROLE.admin ? 'admin' : 'student',
      status: x.status === STATUS.disabled ? 'disabled' : 'active', joined: iso_(x.joined), last: iso_(x.last) };
  });
}

function collect_(uids, since) {
  const data = {};
  uids.forEach(function (u) { data[u] = { meta: null, goals: [], sessions: [], exams: [] }; });
  rows_('meta').forEach(function (r) {
    const d = data[String(r[0])];
    if (!d) return;
    const m = parse_(r[4]);
    if (m) { delete m.mentorNotes; d.meta = m; } // 멘토 상담 내용은 관리자에게 보내지 않음
  });
  RECORD_KINDS.forEach(function (k) {
    const n = SHEETS[k].headers.length;
    rows_(k).forEach(function (r) {
      const d = data[String(r[1])];
      if (!d || r[n - 3] === '삭제') return;
      const rec = parse_(r[n - 1]);
      if (!rec) return;
      if (since && k === 'session' && String(rec.date || '') < since) return;
      if (since && k === 'goal' && String(rec.week || '') < since) return;
      if (k === 'session') delete rec.memo; // 학생의 개인 메모는 보내지 않음
      d[k + 's'].push(rec);
    });
  });
  return data;
}

function adminOverview_(b) {
  const users = userList_();
  const ids = users.filter(function (u) { return u.role === 'student'; }).map(function (u) { return u.uid; });
  return { ok: true, users: users, data: collect_(ids, String(b.since || '')) };
}

function adminStudent_(b) {
  const uid = String(b.uid || '');
  const u = users_().filter(function (x) { return x.uid === uid; })[0];
  if (!u || u.role === ROLE.admin) return { ok: false, error: 'not_found' };
  return { ok: true, data: collect_([uid], '')[uid] };
}

function adminReset_(b, me) {
  const u = users_().filter(function (x) { return x.uid === String(b.uid || ''); })[0];
  if (!u) return { ok: false, error: 'not_found' };
  if (u.uid === me.uid) return { ok: false, error: 'self' };
  const temp = String(100000 + Math.floor(Math.random() * 900000));
  setPassword_(u, temp);
  CacheService.getScriptCache().remove('fail_' + u.no.toLowerCase());
  return { ok: true, temp: temp };
}

function adminStatus_(b, me) {
  const u = users_().filter(function (x) { return x.uid === String(b.uid || ''); })[0];
  if (!u) return { ok: false, error: 'not_found' };
  if (u.uid === me.uid) return { ok: false, error: 'self' };
  sheet_('users').getRange(u.row, 6).setValue(b.active ? STATUS.active : STATUS.disabled);
  return { ok: true };
}

// ---------- AI 멘토 ----------
const MENTOR_RULES = [
  '너는 고등학생의 야간자율학습을 돕는 "야자 관리실 AI 학습 멘토"다.',
  '',
  '[역할]',
  '- 공부 방법, 과목별 시간 배분, 주간 목표 세우기, 최종 목표를 향한 계획, 성적 변화 해석, 공부 습관 관리를 돕는 학습 코치다.',
  '- 학생을 평가하거나 혼내지 않고, 스스로 생각해서 다음 행동을 정하도록 돕는다.',
  '',
  '[데이터 사용]',
  '- 아래 [학생 기록]에 있는 숫자만 쓰고, 없는 수치를 지어내지 않는다. 이미 계산된 값은 그대로 인용한다.',
  '- "할 일 달성도"는 공부할 때마다 학생이 정한 "이번에 할 일"을 몇 % 했는지 스스로 기록한 값이고, "목표 진행률"은 주간 목표 전체의 진행 정도를 스스로 기록한 값이다.',
  '- 기록이 부족하면 부족하다고 말하고, 필요한 정보를 질문한다.',
  '- 학생의 말과 기록이 다르면 부드럽게 짚는다.',
  '- 성적은 시험 수가 적으므로 변화의 원인을 단정하지 않는다("~때문일 수 있어요"). 다른 학생과 비교하지 않는다.',
  '- 카메라 판정(졸음·자리 비움)은 추정값이라 틀릴 수 있다.',
  '',
  '[공부 방법 조언의 근거]',
  '- 스스로 떠올리기(연습 시험, 백지 복습)와 간격을 두고 복습하기는 효과가 높다고 평가된 방법이다.',
  '- 단순히 다시 읽기, 밑줄 긋기, 요약하기는 효과가 낮다고 평가된 방법이다. (Dunlosky 외, 2013)',
  '- 일반론이 아니라 학생의 기록(주간 목표 진행률, 할 일 달성도, 계획 정확도, 시간대별 집중도, 방해 요인)에 맞춰 구체적으로 제안한다.',
  '',
  '[상담 방식]',
  '- 진단 질문 → 기록과 대조 → 근거 있는 전략 제안 → 다음 야자에서 할 구체적 행동 1~2개 정하기 순서로 진행한다.',
  '- 지난 약속이 있으면 실천했는지 먼저 확인하고, 실천했으면 칭찬하고 효과를 묻는다.',
  '- 주간 목표가 너무 크거나 작아 보이면 크기를 조정하도록 돕는다.',
  '- 문제의 정답이나 풀이 전체를 대신 써 주지 않는다. 어디서 막혔는지 물어보고 힌트와 개념 방향만 준다.',
  '- 친근한 해요체로, 한 번에 5문장 안팎으로 짧게 답한다. 목록은 꼭 필요할 때만 짧게 쓴다.',
  '',
  '[안전]',
  '- 공부와 관계없는 심각한 고민(우울, 가정 문제, 괴롭힘 등)이 나오면 공감하되 직접 상담하지 말고 담임 선생님, Wee클래스, 청소년상담 1388과 이야기해 보도록 안내한다.',
  '- 자해나 자살 생각을 내비치면 걱정을 분명히 표현하고, 지금 바로 자살예방 상담전화 109나 청소년상담 1388, 가까운 어른에게 연락하도록 안내한다.',
  '- 연락처, 주소 같은 개인정보를 묻지 않는다.',
  '- 숙제 대필, 공부와 무관한 요청은 짧게 거절하고 학습 이야기로 돌린다.',
].join('\n');

const MODE_RULES = {
  chat: '',
  summary: '\n\n[지금 할 일]\n지금까지의 상담을 정리한다. 반드시 JSON 한 개만 출력한다. 형식: {"summary":"상담 요약 2~3문장","promises":["다음 야자에서 할 구체적 행동", "..."]}. promises는 학생과 합의한 행동만 1~3개, 각 40자 이내로 쓴다. 합의한 행동이 없으면 빈 배열로 둔다.',
  report: '\n\n[지금 할 일]\n[코멘트할 주]의 기록을 보고 4~6문장으로 코멘트한다. 잘한 점 1개, 개선할 점 1~2개(근거 숫자 포함), 다음 주에 시도할 행동 1개를 담는다. 원인을 단정하지 않는다.',
};
const MAX_TOKENS = { chat: 700, summary: 400, report: 600 };

function mentor_(b, me) {
  const P = PropertiesService.getScriptProperties();
  const key = P.getProperty('ANTHROPIC_API_KEY');
  if (!key) return { ok: false, error: 'no_key' };
  const limitErr = countUse_(P, me.uid);
  if (limitErr) return { ok: false, error: limitErr };

  const mode = Object.prototype.hasOwnProperty.call(MODE_RULES, b.mode) ? b.mode : 'chat';
  const messages = cleanMessages_(b.messages);
  if (!messages.length) return { ok: false, error: 'empty' };
  if (mode === 'summary') messages.push({ role: 'user', content: '상담을 마무리할게요. 요약과 약속을 JSON으로 정리해 주세요.' });
  const system = MENTOR_RULES + '\n\n[학생 기록]\n' + String(b.context || '(기록 없음)').slice(0, 10000) + MODE_RULES[mode];

  const headers = { Authorization: 'Bearer ' + key, 'anthropic-version': '2026-10-21' };
  const workspace = P.getProperty('ANTHROPIC_WORKSPACE_ID');
  if (workspace) headers['anthropic-workspace-id'] = workspace;
  const res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: headers,
    payload: JSON.stringify({ model: P.getProperty('MENTOR_MODEL') || 'claude-haiku-5-5', max_tokens: MAX_TOKENS[mode], system: system, messages: mergeTurns_(messages) }),
    muteHttpExceptions: true,
  });
  const status = res.getResponseCode();
  if (status === 401 || status === 403) return { ok: false, error: 'bad_key' };
  if (status === 429 || status === 529 || status >= 500) return { ok: false, error: 'busy' };
  if (status !== 200) return { ok: false, error: 'api_error' };
  const data = JSON.parse(res.getContentText());
  const text = (data.content || []).filter(function (c) { return c.type === 'text'; }).map(function (c) { return c.text; }).join('\n').trim();
  if (mode === 'summary') {
    const parsed = parseJsonIn_(text);
    return { ok: true, summary: parsed && parsed.summary ? String(parsed.summary) : text.slice(0, 300), promises: parsed && Array.isArray(parsed.promises) ? parsed.promises.slice(0, 3) : [] };
  }
  return { ok: true, text: text };
}

// 하루 사용량 제한 (학생별, 전체)
function countUse_(P, uid) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const day = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMdd');
    const perUser = Number(P.getProperty('MENTOR_DAILY_LIMIT') || 30);
    const perAll = Number(P.getProperty('MENTOR_GLOBAL_LIMIT') || 400);
    const kAll = 'use_' + day + '_all';
    const kUser = 'use_' + day + '_' + uid;
    if (!P.getProperty(kAll)) { // 날짜가 바뀌면 지난 카운터 정리
      Object.keys(P.getProperties()).forEach(function (k) { if (k.indexOf('use_') === 0 && k.indexOf('use_' + day) !== 0) P.deleteProperty(k); });
    }
    const nAll = Number(P.getProperty(kAll) || 0);
    const nUser = Number(P.getProperty(kUser) || 0);
    if (nAll >= perAll) return 'limit_all';
    if (nUser >= perUser) return 'limit_device';
    P.setProperty(kAll, String(nAll + 1));
    P.setProperty(kUser, String(nUser + 1));
    return '';
  } finally {
    lock.releaseLock();
  }
}

function cleanMessages_(list) {
  const out = (Array.isArray(list) ? list : []).slice(-16)
    .filter(function (m) { return m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim(); })
    .map(function (m) { return { role: m.role, content: m.content.slice(0, 2000) }; });
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

function mergeTurns_(list) {
  const out = [];
  list.forEach(function (m) {
    if (out.length && out[out.length - 1].role === m.role) out[out.length - 1].content += '\n\n' + m.content;
    else out.push({ role: m.role, content: m.content });
  });
  if (out.length && out[out.length - 1].role !== 'user') out.push({ role: 'user', content: '계속 이야기해 주세요.' });
  return out;
}

function parseJsonIn_(text) {
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(text.slice(a, b + 1)); } catch (err) { return null; }
}

// ---------- 공통 ----------
function sheet_(key) {
  const def = SHEETS[key];
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(def.name);
  if (!sh) sh = ss.insertSheet(def.name);
  if (sh.getLastRow() === 0) {
    sh.appendRow(def.headers);
    sh.setFrozenRows(1);
  }
  return sh;
}

function rows_(key) {
  const sh = sheet_(key);
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, SHEETS[key].headers.length).getValues();
}

function parse_(s) {
  if (!s) return null;
  try { return JSON.parse(String(s)); } catch (err) { return null; }
}

// 시트에서 수식으로 실행되지 않도록 =, +, -, @ 로 시작하는 글자 앞에 ' 를 붙이고 길이를 제한합니다
function cell_(v) {
  if (v == null) return '';
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  let s = String(v).slice(0, 200);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function iso_(d) {
  if (d instanceof Date) return d.toISOString();
  return d ? String(d) : '';
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

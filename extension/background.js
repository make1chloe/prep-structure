/** 🃏 클로이영어 — 클래스카드 확장 (뎌-3).
 *
 *  원장님 크롬에 **이미 로그인된** 클래스카드 세션(쿠키)으로 플래너를 읽어
 *  앱의 받는 길 하나 `POST /api/cc` 로 보낸다. 비밀번호는 어디에도 저장하지 않는다 —
 *  이 크롬의 쿠키를 그대로 쓸 뿐이다(옛 앱 확장과 같은 길 · 검증된 부분은 그대로 옮겼다).
 *
 *  ■ 이 파일이 하지 않는 것 — **판정을 하지 않는다.**
 *    긁은 이름(mem·speaking…)을 그대로 보내고, 우리 열쇠로 옮기는 것도 「목표 대 실제」도
 *    앱 lib/cc-plan.js 한 곳이 한다(원칙-1 · 확정-⑱). 3초훈련도 앱이 버린다(확정-⑩).
 *    여기서 옮기면 클래스카드 화면이 바뀔 때 고칠 곳이 둘이 된다.
 *
 *  ■ 도는 때 — 15분마다(크롬이 켜져 있는 동안) · 오늘과 내일치.
 *  ■ 조용히 멈춘 것이 제일 무섭다 — 마지막 성공·실패는 팝업과 **앱 양쪽**에 보인다
 *    (앱은 연동 줄의 last_ok_at·last_error 로 안다 — 대시보드가 「수신이 N일째 없습니다」로 띄운다).
 */
const CC = "https://www.classcard.net";
const MAX_ROWS = 600;          // 앱 lib/cc-plan.js 의 상한과 짝 — 넘겨 보내면 앱이 통째로 400 을 낸다
const MAX_STUDENTS = 200;      // 〃
const PERIOD_MIN = 15;

const DEFAULTS = { appUrl: "https://chloe-english.vercel.app", token: "", lastRun: null, lastError: null, lastResult: null, busy: false };
const cfg = () => chrome.storage.local.get(DEFAULTS);

/** 서울 날짜 — 크롬 시계를 쓰되 시간대는 서울로 못 박는다(앱과 같은 날을 봐야 한다) */
function seoulToday(offsetDays = 0) {
  return new Date(Date.now() + 9 * 3600000 + offsetDays * 86400000).toISOString().slice(0, 10);
}

/** 학생 명단 — 플래너 리포트 페이지의 select 를 정규식으로 읽는다(서비스워커에는 DOMParser 가 없다).
 *  로그인 아이디 괄호가 없는 option(정렬 따위)은 학생이 아니다 */
async function fetchRoster() {
  const res = await fetch(`${CC}/Pro/ReportAllPlanner`, { credentials: "include" });
  const html = await res.text();
  if (!res.ok) throw new Error(`클래스카드가 안 열립니다(HTTP ${res.status})`);
  if (html.includes("login") && !html.includes("ReportAllPlanner")) throw new Error("클래스카드 로그인이 풀렸습니다 — 크롬에서 다시 로그인해 주세요");
  const out = [], re = /<option[^>]*value="(\d+)"[^>]*>([^<]+)<\/option>/g;
  let m;
  while ((m = re.exec(html))) {
    const label = m[2].trim(), login = (label.match(/\(([^)]+)\)\s*$/) || [])[1] || "";
    if (!login) continue;
    out.push({ cc_user_idx: m[1], cc_login_id: login, name: label.replace(/\([^)]*\)\s*$/, "").replace(/^\d+/, "").trim() });
  }
  return out;
}

/** 그날 그 아이의 세트들 — 목표·실제를 **긁은 이름 그대로** 담는다(옮김은 앱이 한다).
 *  goal_yn 이 1 인 모드만 목표가 있다 — 목표가 없는 모드는 실제만 보낸다 */
async function fetchDay(userIdx, date) {
  const res = await fetch(`${CC}/Pro/getPlannerLearnStatus`, {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ user_idx: userIdx, date }),
  });
  if (!res.ok) throw new Error(`플래너를 못 읽음(HTTP ${res.status})`);
  const json = await res.json();
  const rows = [];
  for (const c of json?.class_list ?? []) {
    for (const s of c?.set_list ?? []) {
      const lc = s?.learn_config ?? {}, ls = s?.learn_summary ?? {};
      const goals = {}, got = {};
      // 「…_goal_score」 · 「…_score」 를 이름째 훑는다 — 클래스카드가 모드를 더해도 그대로 실려 온다(앱이 아는 것만 남긴다)
      for (const [k, v] of Object.entries(lc)) { const m = /^(.+)_goal_score$/.exec(k); if (m && String(lc[`${m[1]}_goal_yn`]) === "1") goals[m[1]] = v; }
      for (const [k, v] of Object.entries(ls)) { const m = /^(.+)_score$/.exec(k); if (m) got[m[1]] = v; }
      rows.push({ date, set_name: s?.name ?? "", set_type: Number(s?.set_type) || null,
                  complete: Boolean(s?.is_complete), learn_status: Number(s?.learn_status) || 0, cards: Number(s?.card_cnt) || 0, goals, got });
    }
  }
  return rows;
}

/** 앱에 한 짐 보내기 — 열쇠는 머리글에만 싣는다(주소·자취에 안 남는다) */
async function post(appUrl, token, students) {
  const res = await fetch(`${String(appUrl).replace(/\/+$/, "")}/api/cc`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ students }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error || `앱이 안 받았습니다(HTTP ${res.status})`);
  return json;
}

/** 줄 수·사람 수 상한에 맞춰 짐을 나눈다 — 한 아이의 줄이 상한을 넘으면 그 아이 안에서도 나눈다.
 *  (나누지 않고 보내면 앱이 「600줄까지 받습니다」로 **짐 전체**를 되돌린다) */
function chunk(students) {
  const out = []; let cur = [], rows = 0;
  const flush = () => { if (cur.length) { out.push(cur); cur = []; rows = 0; } };
  for (const s of students) {
    let i = 0;
    do {
      if (cur.length >= MAX_STUDENTS || rows >= MAX_ROWS) flush();
      const take = s.rows.slice(i, i + (MAX_ROWS - rows));
      cur.push({ ...s, rows: take }); rows += take.length; i += take.length;
    } while (i < s.rows.length);
  }
  flush();
  return out;
}

async function runOnce(say = () => {}) {
  const c = await cfg();
  if (!c.token) throw new Error("팝업에서 확장 열쇠를 먼저 넣어 주세요 — 앱 설정 🔌 연동 열쇠의 🃏 줄에 있습니다");
  say("명단 읽는 중…");
  const roster = await fetchRoster();
  if (!roster.length) throw new Error("학생 명단을 못 읽었습니다 — 클래스카드 화면이 바뀌었을 수 있습니다");
  const days = [seoulToday(), seoulToday(1)];   // 내일치는 전날 밤 「아직 안 한 아이」에 쓴다
  const students = [];
  let done = 0;
  for (const r of roster) {
    const rows = [];
    for (const d of days) {
      try { rows.push(...(await fetchDay(r.cc_user_idx, d))); }
      catch { /* 한 명이 막혀도 나머지는 보낸다 — 못 읽은 것은 그 아이의 줄이 없는 것으로 드러난다 */ }
    }
    students.push({ ...r, rows });
    say(`${++done}/${roster.length}명 읽는 중…`);
  }
  const packs = chunk(students);
  const sum = { got: 0, saved: 0, linked: 0, unlinked: [], dropped: [] };
  for (let i = 0; i < packs.length; i++) {
    say(`앱에 보내는 중… ${i + 1}/${packs.length}`);
    const r = await post(c.appUrl, c.token, packs[i]);
    sum.got += r.got ?? 0; sum.saved += r.saved ?? 0; sum.linked += r.linked ?? 0;
    for (const u of r.unlinked ?? []) if (!sum.unlinked.includes(u)) sum.unlinked.push(u);
    sum.dropped.push(...(r.dropped ?? []));
  }
  return { ...sum, students: students.length, at: new Date().toISOString() };
}

/** 팝업을 닫아도 결과가 남게 — 진행·결과·실패를 전부 저장소에 적는다(옛 확장에서 「실패: 알 수 없음」이 났던 자리) */
async function safeRun() {
  if ((await cfg()).busy) return;
  await chrome.storage.local.set({ busy: true, progress: "시작…", lastError: null });
  try {
    const r = await runOnce((t) => chrome.storage.local.set({ progress: t }));
    await chrome.storage.local.set({ lastRun: r.at, lastError: null, lastResult: r });
  } catch (e) {
    await chrome.storage.local.set({ lastRun: new Date().toISOString(), lastError: String(e?.message ?? e).slice(0, 300) });
  } finally {
    await chrome.storage.local.set({ busy: false, progress: null });
  }
}

/** (버2) 🏫 학교 홈페이지 — 지금 열려 있는 화면의 **글을 그대로** 앱에 보낸다.
 *  학교마다 생김새가 달라 **여기서 판정하지 않는다**: 날짜가 어느 것인지·무엇이 시험인지는 앱이 정한다(고칠 곳이 앱 한 곳).
 *  기계 날짜(data-date · datetime · time[datetime])가 있으면 그것도 같이 보낸다 — 달력 꼴이면 그것만이 날짜다. */
async function sendSite(schoolName) {
  const c = await cfg();
  if (!c.token) throw new Error("팝업에서 확장 열쇠를 먼저 넣어 주세요");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("보낼 화면이 없습니다 — 학교 학사일정 화면을 열고 눌러 주세요");
  const [got] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => {
    const out = [], seen = new Set();
    for (const el of document.querySelectorAll("td, li, tr, .day, [data-date], time")) {
      const text = (el.innerText ?? "").replace(/\s+/g, " ").trim();
      if (!text || text.length > 200) continue;
      const date = el.getAttribute?.("data-date") ?? el.getAttribute?.("datetime") ?? el.querySelector?.("[data-date],time[datetime]")?.getAttribute("data-date") ?? el.querySelector?.("time[datetime]")?.getAttribute("datetime") ?? null;
      const key = `${date ?? ""}|${text}`;
      if (seen.has(key)) continue; seen.add(key);
      out.push(date ? { text, date: String(date).slice(0, 10) } : { text });
      if (out.length >= 2000) break;
    }
    return { rows: out, url: location.href, title: document.title };
  } });
  const rows = got?.result?.rows ?? [];
  if (!rows.length) throw new Error("화면에서 글을 못 읽었습니다 — 학사일정이 보이는 화면에서 눌러 주세요");
  const res = await fetch(`${String(c.appUrl).replace(/\/+$/, "")}/api/site`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${c.token}` },
    body: JSON.stringify({ school: schoolName, url: got?.result?.url ?? "", rows }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error || `앱이 안 받았습니다(HTTP ${res.status})`);
  if (json?.ok === false) throw new Error(json.why || "앱이 못 읽었습니다");
  return json;
}
const arm = () => chrome.alarms.create("cc-sync", { periodInMinutes: PERIOD_MIN, delayInMinutes: 1 });
chrome.runtime.onInstalled.addListener(arm);
chrome.runtime.onStartup.addListener(arm);
chrome.alarms.onAlarm.addListener((a) => { if (a.name === "cc-sync") safeRun(); });
chrome.runtime.onMessage.addListener((msg, _s, reply) => {
  if (msg === "run-now") { safeRun().then(() => reply({ ok: true })); return true; }   // 결과는 저장소에서 읽는다
  if (msg?.kind === "site") {   // (버2) 학교 홈페이지 — 지금 화면을 보낸다(결과·실패도 저장소에)
    chrome.storage.local.set({ busy: true, progress: "홈페이지를 읽는 중…", lastError: null });
    sendSite(msg.school)
      .then((r) => chrome.storage.local.set({ busy: false, progress: null, lastRun: new Date().toISOString(), lastError: null, lastSite: r }))
      .catch((e) => chrome.storage.local.set({ busy: false, progress: null, lastRun: new Date().toISOString(), lastError: String(e?.message ?? e).slice(0, 300) }))
      .finally(() => reply({ ok: true }));
    return true;
  }
  return false;
});

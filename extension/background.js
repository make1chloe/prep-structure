/**
 * 클로이영어 — 클래스카드 연동 (docs/클래스카드-연동-설계.md).
 *
 * 원장님 크롬에 이미 로그인된 클래스카드 세션으로 플래너를 읽어 앱의
 * 수신 주소(/api/classcard)로 보낸다. **비밀번호는 어디에도 저장하지
 * 않는다** — 이 크롬의 쿠키를 그대로 쓸 뿐이다.
 *
 * 도는 때: 15분마다 (chrome.alarms — 크롬이 켜져 있는 동안).
 *   매번   — 학생 명단 + 오늘 마감 세트 완료 여부
 *   하루 1 — 학생별 마감일 달력 (이번 달 + 다음 달, 감시②용)
 *
 * 조용히 멈춘 것이 제일 무섭다 — 마지막 성공/실패는 팝업과 앱 양쪽에
 * 보인다 (앱은 fetched_at 으로 안다).
 */

const CC = "https://www.classcard.net";

async function cfg() {
  return chrome.storage.local.get({
    appUrl: "https://chloe-english.vercel.app",
    key: "",
    lastRun: null,
    lastError: null,
    lastPlannerDay: null,
  });
}

/** 서울 날짜 — 크롬 시계 기준이지만 시간대는 서울로 못 박는다 */
function seoulToday(offsetDays = 0) {
  const d = new Date(Date.now() + 9 * 3600000 + offsetDays * 86400000);
  return d.toISOString().slice(0, 10);
}

/** 학생 명단 — 플래너 리포트 페이지의 select 를 정규식으로 읽는다
 *  (서비스워커에는 DOMParser 가 없다) */
async function fetchRoster() {
  const html = await (await fetch(`${CC}/Pro/ReportAllPlanner`, { credentials: "include" })).text();
  if (html.includes("login") && !html.includes("ReportAllPlanner")) {
    throw new Error("클래스카드 로그인이 풀렸어요 — 크롬에서 다시 로그인해주세요.");
  }
  const roster = [];
  const re = /<option[^>]*value="(\d+)"[^>]*>([^<]+)<\/option>/g;
  let m;
  while ((m = re.exec(html))) {
    const label = m[2].trim();
    const login = (label.match(/\(([^)]+)\)\s*$/) || [])[1] || "";
    // 학생 select 가 아닌 option(정렬 등)은 로그인 아이디 괄호가 없다
    if (!login) continue;
    roster.push({
      user_idx: m[1],
      login_id: login,
      user_name: label.replace(/\([^)]*\)\s*$/, "").replace(/^\d+/, "").trim(),
    });
  }
  return roster;
}

/** 그날 마감 세트 완료 여부 */
async function fetchDay(userIdx, date) {
  const res = await fetch(`${CC}/Pro/getPlannerLearnStatus`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ user_idx: userIdx, date }),
  }).then((r) => r.json());
  const sets = [];
  const MODES = ["mem", "recall", "spell", "speaking", "match"];
  (res.class_list || []).forEach((c) => {
    (c.set_list || []).forEach((s) => {
      // 필수 모드(goal_yn=1)의 목표와 결과 — 「매칭 3000점 미달」 을
      // 앱이 셈할 수 있게. 판정·문구는 앱 lib 한 곳이 한다
      const lc = s.learn_config || {};
      const ls = s.learn_summary || {};
      const goals = {}, got = {};
      MODES.forEach((m) => {
        if (String(lc[`${m}_goal_yn`]) === "1") {
          goals[m] = Number(lc[`${m}_goal_score`]) || 0;
          got[m] = Number(ls[`${m}_score`]) || 0;
        }
      });
      sets.push({
        name: s.name || "",
        type: String(s.set_type || ""),   // 1 단어 · 2 문장 (판정은 앱 lib 한 곳)
        complete: !!s.is_complete,
        status: Number(s.learn_status) || 0,
        cards: Number(s.card_cnt) || 0,
        goals,
        got,
      });
    });
  });
  return sets;
}

/** 마감일 달력 — 페이지 HTML 에서 td.day.planner 만 읽는다 */
async function fetchPlannerMonth(userIdx, ym) {
  const [y, mo] = ym.split("-");
  const html = await (
    await fetch(`${CC}/Pro/ReportAllPlanner/0/${userIdx}/${y}/${Number(mo)}`, { credentials: "include" })
  ).text();
  const days = [];
  const re = /<td class="day planner"[^>]*>[\s\S]*?>(\d{1,2})<[\s\S]*?<\/td>/g;
  let m;
  while ((m = re.exec(html))) {
    days.push(`${ym}-${String(m[1]).padStart(2, "0")}`);
  }
  return days;
}

async function runOnce() {
  const c = await cfg();
  if (!c.key) throw new Error("팝업에서 앱 열쇠(CLASSCARD_KEY)를 먼저 넣어주세요.");

  const today = seoulToday();
  const roster = await fetchRoster();
  if (roster.length === 0) throw new Error("학생 명단을 못 읽었어요 — 클카 화면이 바뀌었을 수 있어요.");

  // 오늘 + 내일 마감 세트 — 내일치는 전날 밤 「아직 안 한 애」 목록에 쓴다.
  // 학생마다 하나씩 차례로 (클카에 부담 안 주게)
  const tomorrow = seoulToday(1);
  const days = [];
  for (const r of roster) {
    for (const d of [today, tomorrow]) {
      try {
        days.push({ user_idx: r.user_idx, date: d, sets: await fetchDay(r.user_idx, d) });
      } catch { /* 한 명 실패로 전체를 멈추지 않는다 */ }
    }
  }

  // 마감일 달력 — 하루 한 번이면 충분하다 (이번 달 + 다음 달)
  let planner = [];
  if (c.lastPlannerDay !== today) {
    const months = [today.slice(0, 7), seoulToday(32).slice(0, 7)];
    for (const r of roster) {
      for (const ym of months) {
        try {
          planner.push({ user_idx: r.user_idx, month: ym, days: await fetchPlannerMonth(r.user_idx, ym) });
        } catch { /* 위와 같다 */ }
      }
    }
  }

  const res = await fetch(`${c.appUrl}/api/classcard`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-cc-key": c.key },
    body: JSON.stringify({ roster, days, planner }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error || `앱이 안 받았어요 (HTTP ${res.status})`);

  await chrome.storage.local.set({
    lastRun: new Date().toISOString(),
    lastError: null,
    ...(planner.length ? { lastPlannerDay: today } : {}),
  });
  return json;
}

async function safeRun() {
  try {
    await runOnce();
  } catch (e) {
    await chrome.storage.local.set({ lastError: String(e?.message || e), lastRun: new Date().toISOString() });
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("cc-sync", { periodInMinutes: 15, delayInMinutes: 1 });
});
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create("cc-sync", { periodInMinutes: 15, delayInMinutes: 1 });
});
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "cc-sync") safeRun();
});
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg === "run-now") {
    runOnce()
      .then((r) => sendResponse({ ok: true, ...r }))
      .catch(async (e) => {
        await chrome.storage.local.set({ lastError: String(e?.message || e) });
        sendResponse({ ok: false, error: String(e?.message || e) });
      });
    return true;   // 비동기 응답
  }
});

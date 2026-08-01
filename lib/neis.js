// 나이스(NEIS) 학사일정
//
// 학교가 여는 자료를 그대로 받아온다. 이 파일에는 **망을 타지 않는 것만** 둔다
// (주소 만들기 · 답 읽기 · 일정으로 바꾸기). 그래야 인터넷 없이도 확인할 수 있다.
//
// 나이스 답은 두 가지 모양으로 온다.
//   잘 됐을 때  { SchoolSchedule: [ {head:[...]}, {row:[...]} ] }
//   안 됐을 때  { RESULT: { CODE: "INFO-200", MESSAGE: "해당하는 데이터가 없습니다." } }
// 둘을 같은 자리에서 갈라야 "왜 안 되는지" 를 그대로 보여줄 수 있다.

export const NEIS = "https://open.neis.go.kr/hub";

/** 나이스가 쓰는 날짜 모양 — 2026-03-02 → 20260302 */
export function ymd(d) {
  return (d || "").toString().replaceAll("-", "");
}
/** 되돌리기 — 20260302 → 2026-03-02 */
export function toDate(s) {
  const v = (s || "").toString().trim();
  if (!/^\d{8}$/.test(v)) return null;
  return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
}

/**
 * 학년도 한 해 — **3월 1일부터 다음 해 2월 말일까지.**
 *
 * 달력 1~12월로 받으면 3월에 시작하는 학사일정이 두 해에 걸쳐 잘린다.
 * 1·2월에 받으면 그 해가 아니라 **지난 3월에 시작한 학년도**를 받아야 한다.
 */
export function schoolYear(today) {
  const y = Number((today || "").slice(0, 4));
  const m = Number((today || "").slice(5, 7));
  const start = m >= 3 ? y : y - 1;      // 1·2월이면 아직 지난 학년도다
  const endY = start + 1;
  // 2월 말일 — 윤년이면 29일
  const last = new Date(Date.UTC(endY, 2, 0)).getUTCDate();
  return {
    year: start,
    from: `${start}-03-01`,
    to: `${endY}-02-${String(last).padStart(2, "0")}`,
  };
}

export function schoolUrl(key, name) {
  const p = new URLSearchParams({ Type: "json", pIndex: "1", pSize: "50", SCHUL_NM: name });
  if (key) p.set("KEY", key);
  return `${NEIS}/schoolInfo?${p}`;
}

export function scheduleUrl(key, school, from, to, page = 1) {
  const p = new URLSearchParams({
    Type: "json",
    pIndex: String(page),
    pSize: "1000",
    ATPT_OFCDC_SC_CODE: school.atpt_code,
    SD_SCHUL_CODE: school.schul_code,
    AA_FROM_YMD: ymd(from),
    AA_TO_YMD: ymd(to),
  });
  if (key) p.set("KEY", key);
  return `${NEIS}/SchoolSchedule?${p}`;
}

/**
 * 나이스 답에서 줄과 결과 코드를 꺼낸다.
 *
 * "데이터가 없습니다" 는 **잘못이 아니다** — 그 기간에 일정이 없을 뿐이다.
 * 그걸 오류로 보여주면 원장님이 키를 다시 넣게 된다.
 */
export function readNeis(json, block) {
  if (!json) return { rows: [], code: null, message: "답이 비어 있어요." };

  // 잘못됐을 때는 RESULT 가 맨 위에 온다
  if (json.RESULT) {
    const { CODE, MESSAGE } = json.RESULT;
    return { rows: [], code: CODE || null, message: MESSAGE || "", empty: CODE === "INFO-200" };
  }

  const box = json[block];
  if (!Array.isArray(box)) {
    return { rows: [], code: null, message: "모르는 모양의 답이 왔어요." };
  }
  const head = box.find((x) => x && x.head)?.head || [];
  const result = head.find((x) => x && x.RESULT)?.RESULT || {};
  const total = head.find((x) => x && "list_total_count" in x)?.list_total_count ?? null;
  const rows = box.find((x) => x && x.row)?.row || [];
  return { rows, total, code: result.CODE || null, message: result.MESSAGE || "" };
}

/** 사람이 읽을 수 있는 말로 — 코드만 보여주면 무엇을 고쳐야 할지 모른다 */
export function whyFailed(code, message) {
  const M = {
    "INFO-200": "그 기간에는 학사일정이 없어요.",
    "ERROR-290": "나이스 인증키가 맞지 않아요. 설정에서 다시 넣어주세요.",
    "ERROR-300": "필요한 값이 빠졌어요 (학교 코드나 기간).",
    "ERROR-333": "날짜 모양이 맞지 않아요.",
    "ERROR-336": "한 번에 너무 많이 달라고 했어요.",
    "ERROR-337": "오늘 쓸 수 있는 횟수를 다 썼어요. 내일 다시 해주세요.",
    "ERROR-500": "나이스 쪽에서 문제가 생겼어요. 잠시 뒤에 다시 해주세요.",
    "ERROR-600": "나이스가 지금 바빠요. 잠시 뒤에 다시 해주세요.",
    "INFO-300": "인증키가 없거나 승인되지 않았어요.",
  };
  return M[code] || message || "나이스가 답하지 못했어요.";
}

/** 학교 찾기 결과 한 줄 */
export function toSchool(r = {}) {
  return {
    name: r.SCHUL_NM || "",
    atpt_code: r.ATPT_OFCDC_SC_CODE || "",
    atpt_name: r.ATPT_OFCDC_SC_NM || "",
    schul_code: r.SD_SCHUL_CODE || "",
    kind: r.SCHUL_KND_SC_NM || "",
    address: r.ORG_RDNMA || "",
  };
}

// 시험은 다른 일정과 무게가 다르다 — 이 기간엔 정규수업이 흔들린다
const EXAM = /(고사|시험|평가)/;
// 학교를 안 가는 날. 그날은 아이들이 낮에 비어 있다
const OFF = /(방학|휴업|재량|공휴|개교기념)/;

/** 이 일정이 무엇인가 — 색과 순서를 정하는 데 쓴다 */
export function kindOf(eventName = "", sbtr = "") {
  const n = eventName || "";
  if (EXAM.test(n)) return "exam";
  if (/휴업/.test(sbtr) || OFF.test(n)) return "off";
  return "event";
}

/**
 * 나이스 일정 한 줄 → 우리 일정 한 줄.
 *
 * 학교 이름을 제목 앞에 붙인다. 학교가 여럿이라 "기말고사" 만 있으면
 * 어느 학교 것인지 알 수 없다.
 */
export function toTask(row = {}, school = {}) {
  const date = toDate(row.AA_YMD);
  const event = (row.EVENT_NM || "").trim();
  if (!date || !event) return null;

  const kind = kindOf(event, row.SBTR_DD_SC_NM || "");
  return {
    title: `${school.name || ""} ${event}`.trim(),
    due_on: date,
    kind: "schedule",
    category: "학사일정",
    note: (row.EVENT_CNTNT || "").trim() || null,
    source: "neis",
    // 같은 학교·같은 날·같은 이름이면 같은 것으로 본다 (다시 받아도 안 늘어난다)
    source_id: `${school.schul_code}:${row.AA_YMD}:${event}`,
    neisKind: kind,
  };
}

/**
 * 같은 것을 하나로 합친다.
 *
 * 학교는 **같은 날 같은 행사를 여러 줄로** 준다 — 학년마다 한 줄씩 주기도 하고
 * (1학년 체육대회 · 2학년 체육대회), 주간/야간 과정이 따로 오기도 한다.
 * 우리 일정에는 "그날 체육대회" 한 줄이면 되고, 학년까지 나눠 적으면 일정이
 * 세 배로 불어난다.
 *
 * 합치지 않고 그대로 보내면 이렇게 난다 (실제로 이걸로 막혔다):
 *   ON CONFLICT DO UPDATE command cannot affect row a second time
 * 한 번에 보내는 묶음 안에 같은 열쇠가 두 번 들어 있으면 Postgres 가 거절한다.
 */
export function mergeSame(tasks = []) {
  const byKey = new Map();
  tasks.forEach((t) => {
    if (!t?.source_id) return;
    const had = byKey.get(t.source_id);
    if (!had) { byKey.set(t.source_id, t); return; }
    // 설명이 한쪽에만 있으면 살린다 (내용이 사라지면 안 된다)
    if (!had.note && t.note) had.note = t.note;
  });
  return [...byKey.values()];
}

/**
 * **여러 날 이어지는 일정을 한 줄로 묶는다.**
 *
 * 나이스는 방학을 이렇게 준다 — 8/1 여름방학, 8/2 여름방학, 8/3 여름방학 …
 * **하루에 한 줄씩.** 그대로 넣으면 여름방학 하나가 일정 목록에서 30줄이 되고,
 * 학교가 아홉 곳이면 그것만으로 수백 줄이다. 원장님이 "중복이 많다" 고
 * 느끼신 게 바로 이것이다. 틀린 자료는 아니지만, 사람이 볼 모양은 아니다.
 *
 * 같은 학교 · 같은 이름이 **하루도 안 끊기고** 이어지면 한 줄로 잇는다.
 *   8/1 ~ 8/16 여름방학   ← 한 줄
 * 중간에 끊기면 다른 것으로 본다 (1학기 기말고사와 2학기 기말고사처럼).
 *
 * 달력에서는 다시 날마다 펼쳐 보여준다 (lib/calendar 의 expandRanges).
 * **저장은 한 줄로, 보기는 날마다.**
 */
export function mergeRuns(tasks = []) {
  const sorted = [...tasks].sort(
    (a, b) => a.title.localeCompare(b.title, "ko") || a.due_on.localeCompare(b.due_on)
  );
  const out = [];
  sorted.forEach((t) => {
    const last = out[out.length - 1];
    if (last && last.title === t.title && nextDay(last.end_on || last.due_on) === t.due_on) {
      last.end_on = t.due_on;
      if (!last.note && t.note) last.note = t.note;
      return;
    }
    out.push({ ...t, end_on: null });
  });
  // 하루짜리는 end_on 을 비워둔다 (있으면 화면이 "8/1 ~ 8/1" 로 적는다)
  return out
    .map((t) => (t.end_on && t.end_on !== t.due_on ? t : { ...t, end_on: null }))
    .sort((a, b) => a.due_on.localeCompare(b.due_on) || a.title.localeCompare(b.title, "ko"));
}

/**
 * 받아온 것 중 **시험 기간**만 묶어낸다.
 *
 * 학교는 "1학기 기말고사" 를 사흘이면 사흘 줄로 준다. 우리 시험 일정은
 * 기간(부터~까지) 하나다. 그래서 이름이 같고 날짜가 이어지면 하나로 잇는다.
 *
 * 자동으로 넣지는 않는다 — 영어 시험일을 원장님이 채워야 하고, 학원 수업과
 * 맞물리는 판단이 필요하기 때문이다. 여기서는 **후보만** 만든다.
 */
export function examPeriods(tasks = [], school = {}) {
  const exams = tasks
    .filter((t) => t.neisKind === "exam")
    .sort((a, b) => a.due_on.localeCompare(b.due_on));

  const out = [];
  exams.forEach((t) => {
    const name = t.title.replace(school.name || "", "").trim();
    const last = out[out.length - 1];
    // 이름이 같고 날짜가 하루 뒤면 같은 시험의 다음 날이다
    if (last && last.name === name && nextDay(last.to_date) === t.due_on) {
      last.to_date = t.due_on;
      return;
    }
    out.push({ school: school.name, name, from_date: t.due_on, to_date: t.due_on });
  });
  return out;
}

function nextDay(d) {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + 1);
  return x.toISOString().slice(0, 10);
}

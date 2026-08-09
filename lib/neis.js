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
/**
 * **시험처럼 보이지만 내신 시험 기간이 아닌 것** (원장님, 2026-08-09 —
 * 「해송고 시험이 2학기에 3번이야. 2번이어야 해」).
 *
 * 위 EXAM 은 「평가」 만 들어가도 시험으로 봤다. 그래서 학교가 학사일정에
 * 적어낸 이런 것들이 전부 **시험 회차로 만들어졌다** —
 *
 *   수행평가 · 학업성취도평가 · 진단평가 · 기초학력평가
 *
 * 2학기에 중간·기말 둘뿐인데 셋이 된 까닭이다. 회차가 하나 더 생기면
 * 그 기간 수업이 흔들린 것으로 잡히고, 결석 예정이 뜨고, 시험범위를
 * 안 넣었다고 배지가 뜨고, 성적이 안 들어왔다고 또 뜬다. **한 줄이
 * 네 군데로 번진다.**
 *
 * 좁게 「중간·기말·지필」 만 볼 수도 있었다. 그러면 옥련여고의 「2차시험」
 * 처럼 학교마다 다르게 적어내는 것을 놓친다 (2026-08-08 에 겪었다).
 * 그래서 **넓게 보되 아닌 것을 덜어내는** 쪽으로 둔다.
 *
 * 덜어낸 것도 일정에는 그대로 남는다 — 시험 회차가 안 될 뿐이다.
 * 수행평가는 아이에게 중요한 일정이라 달력에서 사라지면 안 된다.
 */
const NOT_EXAM = /(수행|학업성취|성취도|진단|기초학력|졸업|자격|경시|인증|검정)/;
// 학교를 안 가는 날. 그날은 아이들이 낮에 비어 있다
const OFF = /(방학|휴업|재량|공휴|개교기념)/;

/**
 * **학교가 정하지 않는 시험** — 수능 · 모의고사 · 전국연합학력평가.
 *
 * 이건 교육청과 평가원이 정하는 날이라 **전국이 같은 날**이다. 그런데
 * 나이스는 학교별 자료라, 고등학교를 아홉 곳 등록하면 같은 날 같은 시험이
 * 아홉 줄로 들어온다. 학교 이름만 다르고 내용은 같은 아홉 줄이다.
 *
 * 그래서 이것들은 **학교에 매달지 않고 한 줄로** 넣는다.
 *
 * 내신(중간·기말·수행)은 학교마다 다르므로 여기 걸리면 안 된다.
 * 그래서 '고사·시험·평가' 같은 넓은 말이 아니라, 이 셋만 집어서 본다.
 */
const NATIONWIDE = /(수능|대학수학능력|모의평가|모의고사|학력평가|전국연합)/;

/**
 * **공휴일** — 이것도 학교가 정하지 않는다.
 *
 * 다만 수능·모의고사와 다른 점이 하나 있다. **대체공휴일은 안 쉬는 학교가 가끔
 * 있다.** 그래서 한 줄로 합치되, 어느 학교가 적어냈는지를 설명에 남긴다.
 * 전부가 아니면 "9곳 중 3곳" 이 보인다.
 */
const HOLIDAY = /(공휴일|대체휴일|개천절|한글날|광복절|현충일|삼일절|성탄|어린이날|설날|추석|부처님오신날|신정|새해)/;

export function isNationwide(eventName = "") {
  return NATIONWIDE.test(eventName || "") || HOLIDAY.test(eventName || "");
}

/**
 * **전국 공통 일정의 이름을 하나로 맞춘다.**
 *
 * 같은 날 같은 시험인데 학교마다 다르게 적어낸다.
 *   전국연합학력평가 · 3월 전국연합학력평가 · 전국연합학력평가(1,2학년)
 *   고1·2 전국연합학력평가 실시 · 전국연합 학력평가
 * 열쇠(source_id)에 이 이름이 들어가므로, 이름이 다르면 **다른 줄로 들어간다.**
 * 그래서 학교를 떼어놓고도 같은 날에 같은 시험이 여러 줄 남아 있었다.
 *
 * 그래서 **무슨 시험인지만** 남기고 나머지 꾸밈말을 턴다.
 * 대상 학년은 학교마다 다르게 적는 것이라 이름에서 뺀다 — 어차피 전국 공통이다.
 */
export function commonName(eventName = "") {
  const raw = (eventName || "").trim();
  if (!raw) return raw;
  // 괄호 안 · 학년 표시 · 「실시」 같은 꼬리말을 턴다
  let s = raw
    .replace(/[（(][^)）]*[)）]/g, " ")
    .replace(/(고|중)?\s*[1-3]\s*[·,~\-]\s*[1-3]\s*(학년)?/g, " ")
    .replace(/(고|중)\s*[1-3]\s*(학년)?/g, " ")
    .replace(/[1-9]?[0-9]\s*월/g, " ")
    .replace(/\s*(실시|시행|예정)\s*$/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  /**
   * 아는 것은 **정해진 이름**으로 바꾼다. 여기 걸리면 표기가 어떻든 한 줄이다.
   *
   * **셋은 같은 것이다** (원장님, 2026-08-07 — 「전국연합학력평가 =
   * 모의평가 = 모의고사」).
   *
   * 교육청이 내는 것을 「전국연합학력평가」, 평가원이 내는 6·9월 것을
   * 「모의평가」 라고 학교가 나눠 적을 뿐, 원장님과 학부모에게는 다 **모의고사**다.
   * 따로 두면 같은 성격의 일정이 달력에 두 이름으로 앉아서, 「이건 또 뭐지」
   * 를 매번 생각하시게 된다. 수능만 따로 둔다 — 그건 정말 다른 날이다.
   */
  if (/대학수학능력|수능/.test(s)) return "대학수학능력시험";
  if (/전국연합|학력평가|모의평가|모의고사|모평/.test(s)) return "모의고사";
  return s || raw;
}

/** 학교마다 다를 수 있는 것인가 (대체공휴일처럼) — 그러면 어느 학교인지 적어둔다 */
export function mayDiffer(eventName = "") {
  return HOLIDAY.test(eventName || "");
}

/**
 * **토요일은 원래 학교를 안 간다.**
 *
 * 주5일제 전에는 격주로 토요일에 등교했고, 안 가는 토요일을 '토요휴업일' 이라
 * 불렀다. 지금은 토요일에 아무도 안 가는데, 학교는 학사일정에 이걸 **토요일마다
 * 한 줄씩** 그대로 등록한다. 한 해에 오십 줄, 학교가 아홉 곳이면 사백 줄이다.
 *
 * 알려주는 것이 없는 줄이므로 받아오지 않는다.
 */
const SKIP = /(토요휴업일|토요휴무|휴업토요일)/;

export function isNoise(eventName = "") {
  return SKIP.test(eventName || "");
}

/**
 * **시험 이름을 하나로 맞춘다.**
 *
 * 같은 시험을 학교마다 다르게 적는다.
 *   1회고사 · 1차고사 · 제1차 지필평가 · 중간고사 · 1학기 중간고사 …
 * 그대로 두면 "우리 애 학교는 언제가 중간이더라" 를 매번 다시 읽어야 하고,
 * 시험 기간도 학교마다 다른 이름으로 쌓인다.
 *
 * 규칙
 *   · 몇 학기인지 — 이름에 있으면 그것을, 없으면 **날짜로** 정한다
 *     (3~7월이면 1학기, 8~2월이면 2학기)
 *   · 몇 번째인지 — 1회/1차 → 중간, 2회/2차 → 기말
 *     학교에 따라 한 해를 1~4회로 세기도 한다 (3회 = 2학기 중간, 4회 = 2학기 기말)
 *   · 이름에 이미 '중간'·'기말' 이 있으면 그 말을 믿는다. 학기만 채워준다
 *
 * 시험 이름이 아니면 **손대지 않는다.** 애매하면 그대로 두는 쪽이 낫다 —
 * 잘못 바꾸면 원장님이 학교 알림장과 대조할 수가 없다.
 */
/**
 * **「2차시험」 도 시험 이름이다** (원장님, 2026-08-08 — 옥련여고가
 * 「2차시험」 으로 적어내서 「26년 2학기」 까지만 나오고 기말인지
 * 중간인지가 안 붙었다).
 *
 * 「고사 · 지필 · 평가」 만 보고 있었다. 「시험」 을 넣어야 「1차시험」
 * 「제2차 시험」 이 걸린다. 다만 「모의고사」 같은 것은 위에서 이미
 * 빠져나가므로 여기까지 안 온다.
 */
const EXAM_WORD = /(고사|지필|평가|시험)/;

export function examName(eventName = "", date = "") {
  const raw = (eventName || "").trim();
  if (!raw) return raw;
  // 수능·모의고사는 내신이 아니다. 여기서 손대지 않는다
  if (NATIONWIDE.test(raw)) return raw;
  if (!EXAM_WORD.test(raw)) return raw;
  // 수행평가는 기간 시험이 아니다 — 건드리면 안 된다
  if (/수행/.test(raw)) return raw;

  // 몇 학기인가
  const semIn = raw.match(/([12])\s*학기/);
  const month = Number((date || "").slice(5, 7));
  const sem = semIn ? Number(semIn[1]) : month >= 3 && month <= 7 ? 1 : month ? 2 : null;
  if (!sem) return raw;

  // 중간·기말이라고 이미 적어두었으면 그 말을 믿는다
  if (/중간/.test(raw)) return `${sem}학기 중간고사`;
  if (/기말/.test(raw)) return `${sem}학기 기말고사`;

  // 1회고사 · 1차고사 · 제1차 지필평가
  const n = raw.match(/제?\s*([1-4])\s*[회차]/);
  if (!n) return raw;
  const num = Number(n[1]);
  // 한 해를 1~4로 세는 학교 (3회 = 2학기 중간, 4회 = 2학기 기말)
  if (num >= 3) return `2학기 ${num === 3 ? "중간" : "기말"}고사`;
  // 학기마다 1~2로 세는 학교
  return `${sem}학기 ${num === 1 ? "중간" : "기말"}고사`;
}

/**
 * **몇 학년 일정인가** (원장님, 2026-08-08 — 「체육대회 학년별로 하는
 * 경우도 있어서 그냥 1-3학년 일정이면 전체라고 표시하는 게 어떤가」).
 *
 * 나이스는 학년을 **줄마다 Y/N 로** 준다 (ONE_GRADE_EVENT_YN …).
 * 그동안 이걸 안 읽어서, 「고1 체육대회」 와 「고2 체육대회」 가 한 줄로
 * 합쳐지면서 학년이 통째로 사라졌다. 모의고사도 마찬가지라
 * 「전국연합학력평가」 한 줄만 남고 고1인지 고2인지를 알 수가 없었다.
 *
 * @returns [1,2,3] 처럼 — 아무 표시도 없으면 빈 배열(= 모르겠다)
 */
const GRADE_FIELD = [
  "ONE_GRADE_EVENT_YN", "TW_GRADE_EVENT_YN", "THREE_GRADE_EVENT_YN",
  "FR_GRADE_EVENT_YN", "FIV_GRADE_EVENT_YN", "SIX_GRADE_EVENT_YN",
];

export function gradesOf(row = {}) {
  const out = [];
  GRADE_FIELD.forEach((f, i) => {
    if (String(row[f] || "").trim().toUpperCase() === "Y") out.push(i + 1);
  });
  return out;
}

/** 중학교인가 고등학교인가 — 이름 끝으로 가른다 (학년 수가 다르다) */
export function levelOf(name = "") {
  const n = (name || "").trim();
  if (/고(등학교)?$/.test(n)) return "고";
  if (/중(학교)?$/.test(n)) return "중";
  if (/초(등학교)?$/.test(n)) return "초";
  return "";
}

/** 그 학교에 있는 학년 수 (초등은 6, 중·고는 3) */
export function gradeCount(level = "") {
  return level === "초" ? 6 : 3;
}

/**
 * 학년을 화면에 적을 말로.
 *
 * **다 있으면 아무 말도 안 붙인다** — 그게 「전체」 다 (원장님).
 * 학년을 일일이 적으면 한 줄에 읽을 것만 늘고, 어차피 전교 행사다.
 *
 *   [1,2,3] 고    →  ""        (전체)
 *   [1,2]   고    →  "고1·2"
 *   [3]     중    →  "중3"
 *   []            →  ""        (학교가 표시를 안 했다 — 전체로 본다)
 */
export function gradeLabel(grades = [], level = "") {
  const g = [...new Set(grades)].filter((x) => x >= 1).sort((a, b) => a - b);
  if (g.length === 0) return "";
  if (g.length >= gradeCount(level)) return "";        // 다 있으면 전체
  return `${level}${g.join("·")}`;
}

/** 이 일정이 무엇인가 — 색과 순서를 정하는 데 쓴다 */
export function kindOf(eventName = "", sbtr = "") {
  const n = eventName || "";
  if (EXAM.test(n) && !NOT_EXAM.test(n)) return "exam";
  if (/휴업/.test(sbtr) || OFF.test(n)) return "off";
  return "event";
}

/**
 * 나이스 일정 한 줄 → 우리 일정 한 줄.
 *
 * 학교 이름을 제목 앞에 붙인다. 학교가 여럿이라 "기말고사" 만 있으면
 * 어느 학교 것인지 알 수 없다.
 */
/**
 * **여러 학교가 같은 날 쉬면 한 줄에 모은다** (원장님, 2026-08-09 —
 * 「여러 학교가 쉬면 한 줄씩 아니고 일정 하나에 여러 학교 이름 나열해줘」).
 *
 * 재량휴업일은 학교가 저마다 정하지만, 인천은 대체로 같은 날에 몰린다.
 * 학교마다 한 줄이면 같은 날 아홉 줄이고, 그날 수업이 어떻게 되는지는
 * 아홉 줄을 다 읽어야 알 수 있다. 한 줄에 학교를 늘어놓으면 한눈에 보인다.
 *
 * **방학은 안 모은다.** 학교마다 시작·끝이 하루이틀씩 다른데 한 줄로 묶으면
 * 어느 학교가 언제 쉬는지가 통째로 사라진다. 하루짜리만 모은다.
 */
const SHARED_OFF = /(재량휴업|개교기념|단축수업)/;

export function toTask(row = {}, school = {}) {
  const date = toDate(row.AA_YMD);
  /**
   * **이름이 비어 있는 휴업일도 받는다** (원장님, 2026-08-09 — 「학사일정에
   * 재량휴업일 넣어줘. 시험은 아니지만 중요한 일정이라서」).
   *
   * 나이스는 재량휴업일을 행사 이름 없이 「수업공제일명 = 휴업일」 로만 주는
   * 학교가 있다. 이름이 없다고 버리고 있었는데, 그날은 **아이가 하루 종일
   * 비는 날**이라 학원 쪽에서는 제일 중요한 날 중 하나다.
   *
   * 토·일은 원래 안 가는 날이라 그대로 버린다 — 안 그러면 한 해에 백 줄이
   * 늘어난다. **평일에 이름 없이 휴업일이면 그것이 재량휴업일이다.**
   */
  let raw = (row.EVENT_NM || "").trim();
  if (!raw && date && /휴업/.test(row.SBTR_DD_SC_NM || "")) {
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (dow !== 0 && dow !== 6) raw = "재량휴업일";
  }
  if (!date || !raw) return null;

  // 알려주는 것이 없는 줄은 아예 안 가져온다 (토요휴업일 등)
  if (isNoise(raw)) return null;

  // 학교마다 다르게 적는 시험 이름을 하나로 맞춘다 (1회고사 = 1차고사 = 중간고사)
  const event = examName(raw, date);
  const kind = kindOf(event, row.SBTR_DD_SC_NM || "");

  // 수능·모의고사·공휴일은 학교가 정하지 않는다. 학교를 떼고 한 줄로 넣는다 —
  // 열쇠에 학교코드가 없으므로 학교가 아홉 곳이어도 한 줄로 합쳐진다.
  // (중학교도 수능일에 일정이 있다. 학교 급을 가리지 않고 같이 합쳐진다)
  const grades = gradesOf(row);
  const level = levelOf(school.name || "");

  if (isNationwide(event)) {
    // 학교마다 다르게 적어낸 이름을 하나로 맞춘다 — 안 그러면 같은 날 같은
    // 시험이 이름 수만큼 남는다 (열쇠에 이름이 들어가기 때문이다)
    const one = commonName(event);

    /**
     * **모의고사는 학년마다 다른 시험이다** (원장님, 2026-08-08 —
     * 「26년 3월 고1 모의고사 … 그냥 *년 *월 고* 모의고사 이걸로
     * 구별되지 않아?」).
     *
     * 고1과 고2는 같은 날 보지만 **시험지가 다르다.** 그런데 지금까지는
     * 이름에서 학년을 털어내고 한 줄로 합쳐서, 「전국연합학력평가」 하나만
     * 남았다. 그러면 성적을 어느 회차에 붙일지도, 내신 범위에 어느 시험을
     * 담을지도 정할 수가 없다.
     *
     * 그래서 **학년마다 한 줄**로 편다. 이름은 원장님이 고르신 그대로 —
     * 「2026년 3월 고1 모의고사」. 연도 · 월 · 학년이면 유일하다.
     */
    if (one === "모의고사" && grades.length > 0 && level && level !== "초") {
      return grades.map((g) => {
        const title = mockName(date, level, g);
        return {
          title,
          due_on: date,
          kind: "schedule",
          category: "학사일정",
          note: (row.EVENT_CNTNT || "").trim() || null,
          source: "neis",
          // 학년이 열쇠에 들어가야 고1·고2가 따로 남는다
          source_id: `common:${row.AA_YMD}:모의고사:${level}${g}`,
          neisKind: kind,
          nationwide: true,
          mock: true,
          grades: [g],
          level,
          schoolName: school.name || "",
        };
      });
    }

    return {
      // **「[전국]」 을 안 붙인다** (원장님, 2026-08-07). 학교 이름이 붙은
      // 것이 그 학교 일정이고, 안 붙은 것이 전국이다 — 굳이 적으면 한 줄에
      // 읽을 것만 하나 더 는다
      title: one,
      due_on: date,
      kind: "schedule",
      category: "학사일정",
      note: (row.EVENT_CNTNT || "").trim() || null,
      source: "neis",
      source_id: `common:${row.AA_YMD}:${one}`,
      neisKind: kind,
      nationwide: true,
      // 대체공휴일처럼 학교마다 다를 수 있는 것은 어느 학교가 적어냈는지 남긴다
      mayDiffer: mayDiffer(event),
      schoolName: school.name || "",
      grades,
      level,
    };
  }

  // 여러 학교가 같은 날 쉬는 것 — 학교를 떼고 한 줄로 모은다 (위 SHARED_OFF)
  if (kind === "off" && SHARED_OFF.test(event)) {
    return {
      title: event,
      due_on: date,
      kind: "schedule",
      category: "학사일정",
      note: (row.EVENT_CNTNT || "").trim() || null,
      source: "neis",
      // 학교코드를 안 넣는다 — 그래야 아홉 학교가 한 줄로 모인다
      source_id: `common:${row.AA_YMD}:${event}`,
      neisKind: kind,
      shared: true,
      schoolName: school.name || "",
      grades,
      level,
    };
  }

  return {
    // 학년은 아직 안 붙인다 — 같은 행사의 학년별 줄을 합친 **뒤에** 붙는다
    // (합치기 전에 붙이면 「고1 체육대회」 「고2 체육대회」 가 서로 다른
    //  것으로 남아서, 원장님이 바라신 「전체」 가 안 나온다)
    title: `${school.name || ""} ${event}`.trim(),
    due_on: date,
    kind: "schedule",
    category: "학사일정",
    note: (row.EVENT_CNTNT || "").trim() || null,
    source: "neis",
    // 같은 학교·같은 날·같은 이름이면 같은 것으로 본다 (다시 받아도 안 늘어난다)
    source_id: `${school.schul_code}:${row.AA_YMD}:${event}`,
    neisKind: kind,
    grades,
    level,
  };
}

/**
 * 모의고사 이름 — **연도 · 월 · 학년**이면 유일하다 (원장님이 고르신 모양).
 *
 *   2026년 3월 고1 모의고사
 *
 * 3·6·9·11월에 네 번 보는 것이 원칙이지만, 고3은 10·12월에 더 보기도 하고
 * 이름도 조금 다르다. 그래서 **학사일정 날짜를 그대로** 쓴다 — 우리가 달을
 * 정해두면 그런 해에 어긋난다.
 */
export function mockName(date = "", level = "고", grade = 1) {
  const y = date.slice(0, 4);
  const m = Number(date.slice(5, 7));
  return `${y}년 ${m}월 ${level}${grade} 모의고사`;
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
    if (!had) { byKey.set(t.source_id, { ...t, grades: [...(t.grades || [])] }); return; }
    // 설명이 한쪽에만 있으면 살린다 (내용이 사라지면 안 된다)
    if (!had.note && t.note) had.note = t.note;
    /**
     * **학년은 모은다** (2026-08-08). 「고1 체육대회」 와 「고2 체육대회」 가
     * 여기서 한 줄이 되는데, 예전에는 학년이 그냥 사라졌다. 모아두면 뒤에서
     * 「고1·2」 인지 「전체」 인지 정할 수 있다.
     */
    (t.grades || []).forEach((g) => { if (!had.grades.includes(g)) had.grades.push(g); });
  });
  return [...byKey.values()];
}

/**
 * **학년을 제목에 붙인다** — 합친 뒤에.
 *
 * 원장님 (2026-08-08) — 「체육대회 학년별로 하는 경우도 있어서 그냥
 * 1-3학년 일정이면 전체라고 표시하는 게 어떤가 싶네」
 *
 *   1·2·3학년 다  →  「해송고 체육대회」        (아무 말도 안 붙인다 = 전체)
 *   1·2학년만     →  「해송고 체육대회 (고1·2)」
 *
 * 모의고사는 이미 이름에 학년이 들어 있으므로 건드리지 않는다.
 *
 * ── **이어붙이기 뒤에** 해야 한다 (2026-08-09 에 고쳤다) ────
 *
 * 전에는 이어붙이기 **앞에** 했다. 제목으로 이어붙이니 먼저 붙여야 한다고
 * 생각했는데, 그게 정반대였다 —
 *
 *   연수여고 기말  12/10 (고1·2·3)  → 「기말고사」
 *                 12/11 (고1·2·3)  → 「기말고사」
 *                 12/12 (고3만)    → 「기말고사 (고3)」   ← 제목이 달라진다
 *
 * 제목이 달라지니 이어붙지 못하고 **날마다 한 줄**이 됐다. 중간고사는 사흘
 * 내내 학년이 같아서 한 줄로 잘 나왔고, 그래서 「중간은 되는데 기말만
 * 안 된다」 로 보였다 (원장님, 2026-08-09).
 *
 * 이제 이어붙인 뒤에 붙인다. 이어붙이면서 학년을 모으므로 위 예는
 * 「기말고사」 한 줄(12/10~12, 고1·2·3 = 전체)이 된다.
 */
export function labelGrades(tasks = []) {
  return tasks.map((t) => {
    if (t.mock) return t;
    const tag = gradeLabel(t.grades || [], t.level || "");
    return tag ? { ...t, title: `${t.title} (${tag})` } : t;
  });
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
    if (last && last.title === t.title && bridged(last.end_on || last.due_on, t.due_on)) {
      last.end_on = t.due_on;
      if (!last.note && t.note) last.note = t.note;
      /**
       * **학년도 모은다.** 시험 사흘 중 마지막 날만 고3이 보는 일이 있다.
       * 안 모으면 그 줄의 학년이 첫날 것만 남아, 뒤에 붙는 「(고1·2)」 가
       * 틀린 말이 된다.
       */
      (t.grades || []).forEach((g) => {
        if (!last.grades) last.grades = [];
        if (!last.grades.includes(g)) last.grades.push(g);
      });
      return;
    }
    out.push({ ...t, end_on: null, grades: [...(t.grades || [])] });
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
    // 수능·모의고사는 **내신이 아니다.** 시험 기간(내신 대비)에 넣으면
    // 학교마다 없는 시험 기간이 생기고, 그 기간 수업이 흔들린 것으로 잡힌다.
    .filter((t) => t.neisKind === "exam" && !t.nationwide)
    .sort((a, b) => a.due_on.localeCompare(b.due_on));

  const out = [];
  exams.forEach((t) => {
    const name = t.title.replace(school.name || "", "").trim();
    // 이어붙이기(mergeRuns)를 거친 뒤라 사흘짜리 시험은 이미 한 줄이다.
    // due_on 만 보면 첫날만 잡혀서 "5/1~5/1" 이 된다 — 끝날까지 같이 본다.
    const end = t.end_on && t.end_on > t.due_on ? t.end_on : t.due_on;
    const last = out[out.length - 1];
    // 이름이 같고 날짜가 하루 뒤면 같은 시험의 다음 날이다
    if (last && last.name === name && nextDay(last.to_date) === t.due_on) {
      last.to_date = end;
      return;
    }
    /**
     * **한 학년만 보는 시험이면 학년을 적어둔다.**
     *
     * 고3 기말이 1·2학년과 다른 주에 따로 있는 학교가 있다. 그러면 회차가
     * 둘인 것이 **맞는데**, 학년을 안 적으면 둘 다 「2학기 기말」 이라
     * 원장님이 보시기에 시험이 하나 더 있는 것처럼 보인다 (2026-08-09 —
     * 「해송고가 여전히 3개인데 혹시 학년이 다른 거 아니야?」).
     *
     * 여럿이면 비워둔다 — 칸이 하나라 「고1·2」 를 넣으면 어느 아이와도
     * 안 맞아서, 그 시험이 아무에게도 안 걸린다 (lib/who 의 sameGrade).
     * 비워두면 그 학교 전체가 본다는 뜻이 되어 안전하다.
     */
    const gs = [...new Set(t.grades || [])].filter((g) => g >= 1);
    const one = gs.length === 1 && gs.length < gradeCount(t.level || "");
    out.push({
      school: school.name, name, from_date: t.due_on, to_date: end,
      grade: one ? `${t.level || ""}${gs[0]}` : null,
    });
  });
  return out;
}

/**
 * **모의고사도 시험 회차로 남긴다** (원장님, 2026-08-08 —
 * 「모의고사는 대비는 안 하지만 시험이니 점수는 있고, 그게 내신의
 *  시험범위가 되어서 연동이 필요한 상황이야」).
 *
 * 지금까지 모의고사는 **회차가 아예 안 만들어졌다.** 위 examPeriods 가
 * `!t.nationwide` 로 걸러냈기 때문이다. 그건 「내신 시험 기간」 자리에
 * 넣지 않으려던 것이었는데, 그 바람에 —
 *
 *   · 모의고사 성적을 어느 회차에 붙일지 정할 수가 없고
 *   · 내신 시험범위에 「3월 고1 모의고사 18~24번」 을 담을 수가 없었다
 *
 * 회차는 만들되 **기간을 하루로** 둔다(from = to = 그날). 그러면 「시험
 * 기간에 수업이 흔들린다」 는 계산에는 안 걸리고, 성적과 범위만 붙는다.
 * 학교는 「전국」 이다 — 전국이 같은 날 같은 시험지를 본다.
 *
 * @param tasks toTask · mergeSame 을 거친 줄들 (모의고사는 학년마다 한 줄)
 */
export function mockPeriods(tasks = []) {
  const seen = new Set();
  const out = [];
  tasks
    .filter((t) => t.mock && t.due_on)
    .sort((a, b) => a.due_on.localeCompare(b.due_on))
    .forEach((t) => {
      if (seen.has(t.title)) return;      // 학교가 아홉 곳이어도 회차는 하나다
      seen.add(t.title);
      out.push({
        school: "전국",
        grade: `${t.level}${(t.grades || [])[0] || ""}`,
        name: t.title,
        from_date: t.due_on,
        to_date: t.due_on,
        english_on: t.due_on,
      });
    });
  return out;
}

function nextDay(d) {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + 1);
  return x.toISOString().slice(0, 10);
}

/**
 * **주말을 건너뛰어도 이어진 것으로 본다** (원장님, 2026-08-07 —
 * 「신정초랑 해송고 둘 다 방학 하루하루가 다 일정으로 되어 있었는데,
 *  받아오기 하고 나니까 해송고만 남았어」).
 *
 * 여기가 원인이었다. 학교마다 방학을 등록하는 방식이 다르다 —
 *
 *   신정초  8/1, 8/2, 8/3 … **토·일도 넣는다** → 하루도 안 끊겨서 한 줄로 합쳐졌다
 *   해송고  8/1(금), 8/4(월), 8/5 … **평일만 넣는다** → 주말마다 끊겨서
 *           「이어진 것이 아니다」 로 보고 주 단위로 쪼개졌다
 *
 * 방학이 주말에 끝났다가 월요일에 다시 시작할 리가 없다. 사이에 낀 날이
 * **토·일뿐이면** 이어진 것으로 본다.
 *
 * 공휴일까지 넣으면 더 이어붙겠지만, 그건 「달력에 빨간 날이면 뭐든 잇는다」
 * 가 되어서 정말 끊긴 일정까지 붙여버린다. 주말까지만 본다.
 */
function bridged(from, to) {
  let d = nextDay(from);
  // 사흘 넘게 비어 있으면 다른 일정이다 (주말은 최대 이틀이다)
  for (let i = 0; i < 3; i++) {
    if (d === to) return true;
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (dow !== 0 && dow !== 6) return false;      // 평일이 비어 있으면 끊긴 것
    d = nextDay(d);
  }
  return false;
}

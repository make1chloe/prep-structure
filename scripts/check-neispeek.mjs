/**
 * **「나이스 원본」 표가 진짜로 그려지나** (원장님, 2026-08-09 — 「나이스 일정
 * 페이지를 만들어서 순수하게 나이스에 입력된 일정을 전수 볼 수 있게 해줘」).
 *
 * ── 왜 이 검사가 따로 필요한가 ──────────────────────────
 *
 * 나이스는 이 컨테이너에서 막혀 있어서, 브라우저로 눌러봐도 **표가 그려지는
 * 자리까지 못 간다.** 그런데 빌드가 통과해도 화면은 터질 수 있다는 것을
 * 이번에 겪었다 (ExamRow 를 엉뚱한 함수 안에 넣어 화면이 통째로 터졌는데
 * `next build` 는 통과했다).
 *
 * 그래서 화면 조각을 **가짜 줄로 직접 그려본다.** 앱 코드는 그대로 두고,
 * 서버 액션을 부르는 자리만 검사 쪽에서 바꿔 끼운다 —
 * **앱에 테스트용 뒷문을 만들지 않는다.**
 *
 * 쓰는 법:  node scripts/check-neispeek.mjs
 */
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transform, loadBindings } from "next/dist/build/swc/index.js";
// Next 16 부터 SWC 바인딩이 지연 로딩이라 먼저 불러와야 한다 —
// 안 부르면 transform 이 "bindings not loaded yet" 으로 죽는다.
await loadBindings();

let fail = 0;
const ok = (cond, what) => {
  if (!cond) { console.log(`  ✗ ${what}`); fail = 1; }
};

/**
 * 앱 조각을 그대로 읽어 **repo 안에** 옮겨 심는다 (밖에 두면 node 가 react 를
 * 못 푼다). 서버 액션을 부르는 자리만 검사 쪽에서 바꿔 끼운다.
 */
async function load(rel, name) {
  const src = readFileSync(rel, "utf8")
    .replace(/import \{ peekNeis \} from "[^"]+";/, "const peekNeis = async () => ({ rows: [] });")
    /**
     * `@/...` 는 node 가 못 푼다 — 파일 주소로 바꿔준다.
     * **jsx 로 된 것은 먼저 옮겨 심어야 한다** (components/MonthNav 처럼).
     * 그렇지 않은 것은 lib 의 .js 라 그대로 부를 수 있다.
     */
    .replace(/from "@\/([^"]+)"/g, (_m, x) => {
      const jsx = JSX_DEPS[x];
      return `from "${pathToFileURL(resolve(jsx || (x.endsWith(".js") ? x : `${x}.js`))).href}"`;
    })
    .replace(/from "\.\/PeekCalendar"/,
      `from "${pathToFileURL(resolve("app/neis/.PeekCalendar.check.mjs")).href}"`)
    .replace(/^"use client";\s*/m, "");
  const out = await transform(src, {
    filename: rel,
    jsc: { parser: { syntax: "ecmascript", jsx: true }, target: "es2020",
           transform: { react: { runtime: "automatic" } } },
    module: { type: "es6" },
  });
  writeFileSync(name, out.code);
  return name;
}

/** 화면 조각이 다시 부르는 화면 조각들 — 먼저 옮겨 심는다 */
const JSX_DEPS = { "components/MonthNav": "components/.MonthNav.check.mjs" };

const files = [];
files.push(await load("components/MonthNav.jsx", "components/.MonthNav.check.mjs"));
files.push(await load("app/neis/PeekCalendar.jsx", "app/neis/.PeekCalendar.check.mjs"));
files.push(await load("app/neis/NeisPeek.jsx", ".neispeek.check.mjs"));
const clean = () => files.forEach((f) => rmSync(f, { force: true }));
const mod = await import(pathToFileURL(resolve(".neispeek.check.mjs")).href).catch((e) => {
  clean(); throw e;
});
const cal = await import(pathToFileURL(resolve("app/neis/.PeekCalendar.check.mjs")).href);
clean();
const { default: NeisPeek, PeekTable } = mod;
const PeekCalendar = cal.default;

/** 나이스가 줄 법한 답 — 갈래마다 한 줄씩, 어긋난 줄도 섞어서 */
const rows = [
  { school: "해송고", date: "2026-10-14", raw: "1회고사", event: "2학기 중간고사",
    sbtr: null, grades: [1, 2, 3], how: "시험", inApp: true, hasExam: true },
  { school: "박문중", date: "2026-10-13", raw: "2학기 중간", event: "2학기 중간고사",
    sbtr: null, grades: [], how: "시험", inApp: false, hasExam: false },
  { school: "연수여고", date: "2026-11-19", raw: "대수능시험 휴업일", event: null,
    sbtr: "휴업일", grades: [], how: "전국", inApp: null, hasExam: null },
  { school: "신정중", date: "2026-10-17", raw: "토요휴업일", event: null,
    sbtr: "휴업일", grades: [], how: "버림", inApp: null, hasExam: null },
  { school: "은송중", date: "2026-09-21", raw: "재량휴업일", event: null,
    sbtr: null, grades: [], how: "쉼", inApp: true, hasExam: null },
];

console.log("== 표가 그려지나 ==");
let html = "";
try {
  html = renderToStaticMarkup(
    createElement(NeisPeek, { from: "2026-03-01", to: "2027-02-28", schools: [] })
  );
} catch (e) {
  console.log(`  ✗ 첫 화면에서 터집니다 — ${e.message}`);
  process.exit(1);
}
ok(html.includes("나이스에 물어보기"), "물어보는 단추가 있다");
ok(!html.includes("undefined"), "빈 값이 화면에 새어 나오지 않는다");

/**
 * **결과가 온 뒤를 진짜로 그려본다.** 표를 따로 떼어 두었기 때문에, 나이스가
 * 막힌 곳에서도 가짜 줄로 그릴 수 있다.
 */
console.log("\n== 결과가 왔을 때 (표를 진짜로 그려본다) ==");
let tbl = "";
try {
  tbl = renderToStaticMarkup(createElement(PeekTable, { rows }));
} catch (e) {
  console.log(`  ✗ 표에서 터집니다 — ${e.message}`);
  process.exit(1);
}
// 나이스에 적힌 이름이 **그대로** 나온다 (편 이름은 옆에)
ok(tbl.includes("1회고사"), "나이스에 적힌 이름 그대로");
ok(tbl.includes("2학기 중간고사"), "우리가 편 이름도 옆에");
ok(tbl.includes("토요휴업일") && tbl.includes("버림"), "버리는 줄도 숨기지 않는다");
ok(tbl.includes("(휴업일)"), "수업공제일명도 보여준다");
ok(tbl.includes("1·2·3"), "학년 칸");
// **어긋난 줄** — 이 화면의 존재 이유
ok(tbl.includes("안 들어옴") || tbl.includes("회차 없음"), "앱에 안 들어온 줄을 짚는다");
ok(!tbl.includes("undefined"), "빈 값이 새어 나오지 않는다");
// 학교 이름은 줄여서 (인천해송고등학교 → 해송고)
ok(tbl.includes("해송고"), "학교 이름은 줄여서");
// 빈 목록도 안 터진다
ok(renderToStaticMarkup(createElement(PeekTable, {})).includes("나이스에 적힌 이름"),
   "줄이 하나도 없어도 안 터진다");

console.log("\n== 달력을 진짜로 그려본다 ==");
/**
 * 원장님 (2026-08-09) — 「맨 위에 달력 형식을 좀 추가해 주고, 연속된 일정은
 * 합쳐서 보여 주고, 학교를 다중 선택 가능하게 해 줘」
 *
 * 표는 「무엇이 있나」 를 세는 데 좋지만 **언제가 비어 있나**는 안 보인다.
 * 달력은 빈 칸이 곧 정보다.
 */
let calHtml = "";
try {
  calHtml = renderToStaticMarkup(createElement(PeekCalendar, {
    // 여러 날짜리 하나를 섞는다 — 날마다 펼쳐져야 한다
    items: [...rows, { school: "해송고", date: "2026-08-01", endDate: "2026-08-16",
                       raw: "여름방학", event: null, sbtr: null, grades: [], how: "쉼",
                       inApp: true, hasExam: null }],
    today: "2026-08-09",
  }));
} catch (e) {
  console.log(`  ✗ 달력에서 터집니다 — ${e.message}`);
  process.exit(1);
}
/**
 * **한 번에 한 달만** (원장님, 2026-08-09 — 「달력을 오늘이 포함된 월부터
 * 한 칸만 보여주고 양옆으로 버튼 눌러 넘겨서 보는 방식으로 바꿔줘」).
 * 오늘이 8월이므로 8월만 보이고 9·10·11월은 넘겨야 나온다.
 */
ok(calHtml.includes("2026년 8월"), "오늘이 든 달부터 연다");
["9월", "10월", "11월"].forEach((m) =>
  ok(!new RegExp(`>${m}<`).test(calHtml), `${m}은 넘겨야 나온다 (쌓아두지 않는다)`));
ok(calHtml.includes("◂") && calHtml.includes("▸"), "양옆으로 넘기는 단추가 있다");
// 있는 것보다 앞으로는 못 간다 (8월이 첫 달이면 ◂ 가 꺼져 있다)
ok(/◂[\s\S]{0,40}<\/button>/.test(calHtml), "넘김 단추가 그려진다");
// **요일 머리는 월요일부터** — 예전에 하루씩 밀린 사고가 있었다
ok(calHtml.indexOf(">월<") < calHtml.indexOf(">일<"), "요일이 월요일부터 늘어선다");
// 여러 날짜리는 날마다 펼쳐진다 (8/1~8/16 이면 8월 칸이 열여섯 개 칠해진다)
ok((calHtml.match(/border-radius:99px/g) || []).length > 10, "여러 날짜리가 날마다 펼쳐진다");
ok(!calHtml.includes("undefined"), "빈 값이 새어 나오지 않는다");
// 줄이 하나도 없으면 아예 안 그린다 (빈 달력은 볼 것이 없다)
ok(renderToStaticMarkup(createElement(PeekCalendar, { items: [] })) === "",
   "줄이 없으면 달력을 안 그린다");

const withRows = readFileSync("app/neis/NeisPeek.jsx", "utf8");
// **학교 다중 선택** — 하나씩 고르는 칸이면 아홉 곳 견주려고 아홉 번 눌러야 한다
ok(/const \[picked, setPicked\] = useState\(\[\]\)/.test(withRows), "학교를 여럿 고를 수 있다");
ok(/picked\.filter\(\(x\) => x !== s\.id\) : \[\.\.\.picked, s\.id\]/.test(withRows),
   "눌러서 켜고 끈다");
ok(/setPicked\(\[\]\)/.test(withRows), "「전체」 로 되돌릴 수 있다");
// **이어진 날 합치기** — 켜고 끌 수 있어야 한다 (원본을 보는 자리다)
ok(/const \[merge, setMerge\] = useState\(true\)/.test(withRows), "기본은 합쳐서 본다");
ok(/이어진 날 합치기/.test(withRows), "끄고 하루씩 볼 수도 있다");
ok(/merge \? \(res\?\.runs \|\| \[\]\) : \(res\?\.rows \|\| \[\]\)/.test(withRows),
   "합친 것과 안 합친 것을 둘 다 받아두고 고른다");
ok(/<PeekCalendar items=\{rows\}/.test(withRows), "달력이 맨 위에 있다");

const act2 = readFileSync("app/schedule/neisActions.js", "utf8");
// 잇는 규칙은 **받아오기와 똑같은 것**을 쓴다 — 두 벌이면 진단이 거짓말을 한다
ok(/mergeRuns\(\s*out\.map/.test(act2), "잇는 규칙은 lib/neis 의 mergeRuns 한 벌");
ok(/want\.length === 0 \|\| want\.includes\(s\.id\)/.test(act2), "여러 학교를 한 번에 물어본다");
// 갈래마다 다른 색을 준다 — 눈으로 훑을 때 시험만 골라 보게
ok(/HOW_CLS = \{/.test(withRows), "갈래마다 색이 다르다");
["시험", "전국", "쉼", "행사", "버림"].forEach((k) =>
  ok(new RegExp(`${k}:`).test(withRows) || withRows.includes(`"${k}"`), `「${k}」 갈래를 그린다`)
);
// **어긋난 줄을 눈에 띄게** — 이 화면의 존재 이유다
ok(/안 들어옴/.test(withRows), "나이스엔 있는데 앱엔 없는 줄을 표시한다");
ok(/회차 없음/.test(withRows), "시험인데 회차가 없는 줄을 표시한다");
ok(/앱에 안 들어온 것만/.test(withRows), "어긋난 줄만 골라 볼 수 있다");
// 나이스가 준 이름을 **그대로** 보여준다 (편 이름은 옆에)
ok(/\{r\.raw\}/.test(withRows), "나이스에 적힌 이름을 그대로 보여준다");
ok(/r\.event &&/.test(withRows), "편 이름은 다를 때만 옆에 붙인다");
// 0줄인 학교의 까닭도 그대로
ok(/res\.notes\?\.length/.test(withRows), "나이스가 뭐라고 했는지도 적어준다");

// 가짜 줄이 표 만드는 규칙에 안 걸리는지 (거르기 · 자르기)
console.log("\n== 거르기 ==");
const gaps = rows.filter((r) => r.inApp === false || r.hasExam === false);
ok(gaps.length === 1 && gaps[0].school === "박문중", "어긋난 줄 세기");
const exams = rows.filter((r) => r.how === "시험");
ok(exams.length === 2, "시험만 세기");


console.log("\n== 학교 홈페이지와 다를 때, 왜 다른지 짚어주나 ==");
/**
 * 원장님 (2026-08-10) — 「여기 박문중학교 일정이 있는데 이거랑 나이스 원본에
 * 들어가 있는 게 달라. 왜 일까?」
 *
 * 다를 수 있는 까닭은 셋이고, 화면은 셋 다 똑같이 「다르다」 로 보인다 —
 *
 *   1. **다른 학교에 물어봤다.** 같은 이름의 학교가 여럿이라, 학교 코드를
 *      잘못 넣어두면 일정이 통째로 다른데 아무 표시도 안 난다
 *   2. **뒷부분이 조용히 빠졌다.** 나이스가 300건이라 해놓고 250줄만 왔는데
 *      화면에는 그냥 일정이 없는 것처럼 보인다
 *   3. **나이스와 학교 홈페이지가 원래 다르다.** 서로 다른 시스템이라 학교가
 *      한쪽만 고쳐두는 일이 흔하다 — 이건 앱이 고칠 것이 아니다
 *
 * 1·2 는 앱이 짚어줄 수 있다. 짚어주지 않으면 3 인지 아닌지도 알 수 없다.
 */
{
  const act = readFileSync("app/schedule/neisActions.js", "utf8");
  // 1) 어느 학교에 물어봤는지 — 코드와 주소를 그대로
  ok(/const asked = \[\];/.test(act), "물어본 학교를 남긴다");
  ok(/address: school\.address \|\| ""/.test(act), "주소까지 — 그 학교가 맞는지 견주시게");
  ok(/code: school\.schul_code/.test(act), "학교 코드도");
  // 2) 나이스가 몇 건이라고 했는지 — 받은 줄 수와 다르면 잘린 것이다
  ok(/said: res\.total \?\? null/.test(act), "나이스가 말한 건수를 적어둔다");
  ok(/return \{ rows: all, error: null, empty: all\.length === 0, total \};/.test(act),
     "받아오기가 그 건수를 돌려준다");
  const peek2 = readFileSync("app/neis/NeisPeek.jsx", "utf8");
  ok(/나이스는 \{a\.said\}건이라는데 \{a\.got\}건 받음/.test(peek2), "다르면 눈에 띄게 적는다");
  ok(/물어본 학교/.test(peek2), "물어본 학교를 화면에 보여준다");
  // 3) 원래 다를 수 있다는 것도 말해준다 — 앱 탓만 하다 시간을 버리지 않게
  ok(/서로 다른 시스템/.test(peek2), "나이스와 학교 홈페이지가 다른 시스템임을 알려준다");
  // 나란히 놓고 대조할 수 있게 내려받기
  ok(/async function download\(\)/.test(peek2), "내려받아서 나란히 볼 수 있다");
  /**
   * **앱을 안 거치고 나이스를 바로 여는 주소** (원장님, 2026-08-10 —
   * 「나이스에 등록된 학사일정 어디서 볼 수 있어? 주소 알려줘」).
   * 우리가 부르는 것과 **같은 주소**여야 대조가 뜻이 있다 (scheduleUrl 한 곳).
   * **인증키는 빼고** 준다 — 화면에 뿌리면 키가 남의 눈에 들어간다.
   */
  ok(/link: scheduleUrl\(null, school, from, to\)/.test(act),
     "나이스 주소를 scheduleUrl 한 곳에서 만든다 (키는 빼고)");
  ok(/나이스에서 바로 보기/.test(peek2), "학교마다 바로 여는 링크가 있다");
  ok(/target="_blank"/.test(peek2), "새 창으로 연다 (보던 자리를 안 잃게)");
  ok(/const body = rows\.map/.test(peek2), "지금 걸러 보는 그대로 내려간다");
}

if (fail) { console.log("\n❌ 나이스 원본 화면에 어긋난 것이 있습니다."); process.exit(1); }
console.log("\n✅ 나이스 원본 화면 통과");

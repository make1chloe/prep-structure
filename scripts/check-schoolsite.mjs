/**
 * **학교 홈페이지에서 학사일정 읽기** (원장님, 2026-08-10 — 「나이스 말고 학교
 * 홈페이지에 등록된 내용으로 기록할 수 없을까? 학교 홈페이지랑 다르다
 * 나이스가」 · 「학교 홈페이지를 넣어놓고 확인해서 긁어오게 할 수는 없어?」).
 *
 * 학교는 일정을 **두 군데에 따로** 적는다. 같은 사람이 같은 날 채우지 않아서,
 * 시험 날짜가 홈페이지엔 있는데 나이스엔 없는 일이 실제로 생겼다 (박문중).
 *
 * 남의 홈페이지는 이 컨테이너에서 못 부른다 (망 정책). 그래서 **읽는 부분만**
 * 따로 떼어 두고, 학교 홈페이지가 낼 법한 모양들로 여기서 검사한다.
 *
 * 쓰는 법:  node scripts/check-schoolsite.mjs
 */
import { readFileSync } from "node:fs";
import { toText, readDate, readSchedule, tabLinks, splitUrls } from "../lib/schoolSite.js";
import { classifyExam } from "../lib/examKind.js";

let fail = 0;
const eq = (got, want, what) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log(`  ✗ ${what}\n     나온 것: ${a}\n     바란 것: ${b}`); fail = 1; }
};
const ok = (cond, what) => { if (!cond) { console.log(`  ✗ ${what}`); fail = 1; } };

console.log("== 태그를 걷어내고 글만 남기나 ==");
eq(toText("<td>2026-10-13</td><td><a href='#'>2학기 중간고사</a></td>"),
   "2026-10-13\n2학기 중간고사", "표 한 줄");
// 화면에 안 나오는 글은 통째로 버린다 — 안 그러면 날짜처럼 생긴 것이 섞여 든다
ok(!toText("<script>var d='2026-01-01 안보이는줄';</script><td>2026-10-13</td><td>중간</td>")
   .includes("안보이는줄"), "script 안의 글은 안 읽는다");
eq(toText("<p>가&nbsp;나</p>"), "가 나", "&nbsp; 를 푼다");

console.log("\n== 날짜 모양을 다 알아보나 ==");
/**
 * 학교마다 적는 모양이 다르다. 하나라도 못 읽으면 그 학교는 통째로 안 들어온다.
 */
[
  ["2026-10-13", "2026-10-13"],
  ["2026.10.13", "2026-10-13"],
  ["2026/10/13", "2026-10-13"],
  ["2026년 10월 13일", "2026-10-13"],
  ["2026-1-5", "2026-01-05"],
].forEach(([s, want]) => eq(readDate(s), want, `「${s}」`));
// **해가 안 적힌 것이 흔하다** (달력 화면이라 그 해가 당연해서)
eq(readDate("10.13", 2026), "2026-10-13", "해 없이 「10.13」 — 학년도로 채운다");
eq(readDate("9.21(월)", 2026), "2026-09-21", "요일이 붙어 있어도");
// **학년도는 3월에 시작한다** — 1·2월은 다음 해다
eq(readDate("1.5", 2026), "2027-01-05", "1월은 다음 해");
eq(readDate("2.28", 2026), "2027-02-28", "2월도 다음 해");
// 지어내지 않는다
eq(readDate("10.13", null), null, "학년도를 안 주면 해 없는 날짜는 안 읽는다");
eq(readDate("13.45", 2026), null, "달·일이 말이 안 되면 안 읽는다");
eq(readDate("그냥 글"), null, "날짜가 아니면 null");

console.log("\n== 표에서 「날짜 + 이름」 을 뽑나 ==");
{
  // icems 같은 표 모양 — 날짜 칸과 이름 칸이 줄이 갈린다
  const html = `<table><tbody>
    <tr><td>2026-10-13</td><td><a href="#">2학기 중간고사</a></td></tr>
    <tr><td>2026.12.08 ~ 2026.12.10</td><td>2학기 기말고사</td></tr>
    <tr><td>9.21(월)</td><td>재량휴업일</td></tr>
    <tr><td>2026-11-19</td><td>1. 대학수학능력시험</td></tr>
  </tbody></table>`;
  const { rows, unread } = readSchedule(toText(html), 2026);
  eq(rows.map((r) => `${r.date}${r.endDate ? `~${r.endDate}` : ""} ${r.title}`), [
    "2026-10-13 2학기 중간고사",
    "2026-12-08~2026-12-10 2학기 기말고사",
    "2026-09-21 재량휴업일",
    "2026-11-19 대학수학능력시험",
  ], "표에서 그대로 뽑는다");
  eq(unread, [], "못 읽은 줄 없음");
}
{
  // 한 줄에 날짜와 이름이 같이 있는 모양
  const one = readSchedule("2026-10-13 2학기 중간고사\n10.13 ~ 10.16 2학기 중간고사", 2026);
  eq(one.rows[0].title, "2학기 중간고사", "한 줄 모양");
  eq(one.rows[1].endDate, "2026-10-16", "기간도 읽는다");
}
{
  /**
   * **「2학기」 의 2 를 목록 번호로 보면 안 된다** (2026-08-10 에 겪었다).
   * 「학기 중간고사」 가 되어 갈래도 · 이름도 틀어졌다.
   */
  const r = readSchedule("2026-10-13\n2학기 중간고사", 2026).rows[0];
  eq(r.title, "2학기 중간고사", "맨 앞 숫자를 함부로 떼지 않는다");
  // 진짜 목록 번호(「1.」 「1)」)는 뗀다
  eq(readSchedule("2026-10-13\n1. 개교기념일", 2026).rows[0].title, "개교기념일", "번호는 뗀다");
  eq(readSchedule("2026-10-13\n2) 체육대회", 2026).rows[0].title, "체육대회", "괄호 번호도");
}
{
  // **못 읽은 줄은 버리지 않는다** — 「없다」 와 「못 읽었다」 는 다르다
  const { rows, unread } = readSchedule("2026-10-13\n2026-10-14\n중간고사", 2026);
  eq(unread, ["2026-10-13"], "이름을 못 찾은 줄은 그대로 돌려준다");
  eq(rows.length, 1, "읽은 것만 줄로");
}

console.log("\n== 「2학기」 를 눌러야 나오는 학교 ==");
/**
 * 원장님, 2026-08-11 — 「페이지에서 2학기를 눌러야 할 수도 있는데」.
 * 한 화면만 읽으면 **한 학기치만** 들어온다. 2학기 시험이 통째로 빠진다.
 */
{
  // 주소를 여러 개 적어둘 수 있다 (1학기 화면 · 2학기 화면)
  eq(splitUrls("https://a.kr/s?x=1\nhttps://a.kr/s?x=2"),
     ["https://a.kr/s?x=1", "https://a.kr/s?x=2"], "줄바꿈으로 나눈다");
  eq(splitUrls("https://a.kr/s , https://b.kr/s"),
     ["https://a.kr/s", "https://b.kr/s"], "쉼표·빈칸도");
  eq(splitUrls("https://a.kr/s\nhttps://a.kr/s"), ["https://a.kr/s"], "같은 주소는 한 번만");
  eq(splitUrls("학사일정 https://a.kr/s 입니다"), ["https://a.kr/s"], "글에 섞여 있어도");
  eq(splitUrls("bakmun.icems.kr"), [], "http 로 시작 안 하면 안 받는다");
  eq(splitUrls(""), [], "빈 것");
}
{
  const base = "https://bakmun.icems.kr/schdList.do?section=2&m=0204";
  const html = `
    <ul class="tab">
      <li><a href="/schdList.do?section=2&amp;m=0204&amp;sem=1">1학기</a></li>
      <li><a href="/schdList.do?section=2&amp;m=0204&amp;sem=2">2학기</a></li>
      <li><a href="#none">인쇄</a></li>
      <li><a href="https://naver.com/x">2학기 딴집</a></li>
    </ul>
    <a href="/schdList.do?section=2&amp;m=0204">지금 화면</a>`;
  const { go, blocked } = tabLinks(html, base);
  eq(go.map((x) => `${x.label} ${x.url}`), [
    "1학기 https://bakmun.icems.kr/schdList.do?section=2&m=0204&sem=1",
    "2학기 https://bakmun.icems.kr/schdList.do?section=2&m=0204&sem=2",
  ], "학기 단추만 따라간다 (&amp; 를 풀고, 남의 집은 빼고)");
  eq(blocked, [], "따라갈 수 있으면 알릴 것이 없다");
}
{
  // **자바스크립트 단추는 못 따라간다 — 버리지 말고 알려준다**
  const { go, blocked } = tabLinks(
    `<a href="javascript:goSem(2)">2학기</a><a onclick="x()">1학기</a>`,
    "https://a.kr/s"
  );
  eq(go, [], "따라갈 주소가 없다");
  eq(blocked, ["2학기", "1학기"], "못 따라간 단추 이름을 돌려준다");
}
{
  // 학기 단추가 있으면 월 단추는 안 따라간다 (같은 것을 열두 번 부른다)
  const html = `<a href="/s?sem=2">2학기</a>` +
    Array.from({ length: 12 }, (_v, i) => `<a href="/s?m=${i + 1}">${i + 1}월</a>`).join("");
  eq(tabLinks(html, "https://a.kr/s").go.map((x) => x.label), ["2학기"], "학기 쪽만");
  // 학기 단추가 없으면 월 단추는 따라간다
  const only = tabLinks(`<a href="/s?m=10">10월</a><a href="/s?m=11">11월</a>`, "https://a.kr/s");
  eq(only.go.map((x) => x.label), ["10월", "11월"], "월 단추밖에 없으면 그것을");
  // 단추가 아닌 것은 안 따라간다
  eq(tabLinks(`<a href="/s?x=1">2학기 중간고사 안내문 내려받기(hwp)</a>`, "https://a.kr/s").go,
     [], "긴 글은 단추가 아니다");
  eq(tabLinks(`<a href="/s?x=1">공지사항</a>`, "https://a.kr/s").go, [], "학기·월이 없으면 안 따라간다");
}

console.log("\n== 갈래는 앱과 같은 규칙으로 보나 ==");
/**
 * 홈페이지에서 읽은 이름도 **나이스와 같은 자로** 재야 한다 — 두 벌이면
 * 홈페이지에서 온 것만 다른 갈래로 들어가서 재촉이 어긋난다.
 */
eq(classifyExam("2학기 중간고사"), "school", "내신");
eq(classifyExam("전국연합학력평가"), "mock", "모의고사");
eq(classifyExam("재량휴업일"), "", "쉬는 날은 시험이 아니다");

console.log("\n== 넣을 때 지키는 것 ==");
{
  const act = readFileSync("app/schedule/neisActions.js", "utf8");
  ok(/export async function peekSchoolSite/.test(act), "읽어보는 자리가 있다");
  ok(/export async function addFromSite/.test(act), "고른 것만 넣는 자리가 있다");
  ok(/export async function saveHomepage/.test(act), "주소를 적어둘 수 있다");
  /**
   * **source 가 "neis" 면 안 된다.** 다음 받아오기의 정리(staleAfterImport)가
   * 나이스가 만든 줄을 치우는데, 나이스에 없는 일정이라 이번 목록에 안 나온다 —
   * 넣자마자 다음 받아오기에서 지워진다.
   */
  ok(/source: "homepage"/.test(act), "홈페이지에서 온 줄은 나이스 것으로 안 둔다");
  // 이미 그 날을 덮는 회차가 있으면 새로 안 만든다 (두 벌이 된다)
  ok(/skipped\.push\(/.test(act), "이미 있는 회차 자리는 건너뛰고 알려준다");
  // 브라우저를 안 띄운다 — 서버가 그대로 받아 읽는다
  ok(!/playwright|puppeteer|chromium/i.test(act), "크롬을 안 띄운다 (서버가 그대로 받는다)");
  // 아무것도 저장하지 않는 자리 (읽어보기)
  const peek = act.slice(act.indexOf("export async function peekSchoolSite"),
                         act.indexOf("export async function addFromSite"));
  ok(!/\.(insert|update|upsert|delete)\(/.test(peek), "읽어보기는 아무것도 저장하지 않는다");
  /**
   * **「2학기」 를 눌러야 나오는 학교** (원장님, 2026-08-11). 적어두신 주소를
   * 여러 개 읽고, 학기 단추는 한 걸음 따라간다. 끝없이 도는 것을 막는 것과,
   * 무엇을 읽었는지 내보이는 것이 함께 있어야 한다.
   */
  ok(/splitUrls\(school\.homepage\)/.test(peek), "주소를 여러 개 읽는다");
  ok(/tabLinks\(html, job\.url\)/.test(peek), "학기 단추를 따라간다");
  ok(/job\.hop === 0/.test(peek), "단추 따라가기는 한 걸음만 (끝없이 안 돈다)");
  ok(/read\.length < MAX_PAGES/.test(peek), "읽는 화면 수에 끝이 있다");
  ok(/done\.has\(job\.url\)/.test(peek), "같은 주소를 두 번 안 부른다");
  ok(/blocked/.test(peek), "못 따라간 단추를 돌려준다");
  ok(/read\.every\(\(r\) => r\.error\)/.test(peek),
     "다 못 불렀으면 「일정이 없다」 가 아니라 못 불렀다고 말한다");

  const box = readFileSync("app/schedule/HomepageBox.jsx", "utf8");
  ok(/res\.read\?\.length > 0/.test(box), "무엇을 읽었는지 보여준다");
  ok(/res\.blocked\?\.length > 0/.test(box), "못 따라간 단추를 알려준다");
  ok(/<textarea/.test(box), "주소를 여러 줄 넣을 수 있다");

  // **자동으로 안 넣는다** — 잘못 읽은 것을 조용히 회차로 만들면 더 나쁘다
  ok(/고른 \$\{pick\.size\}개를 시험 회차로 넣기/.test(box), "고르신 것만 넣는다");
  // 처음부터 골라두는 것은 「나이스에 없는 내신 시험」 뿐 — 나머지까지 켜두면 다 꺼야 한다
  ok(/x\.kind === "school" && x\.inNeis === false && !x\.hasExam/.test(box),
     "나이스에 없는 내신 시험만 미리 골라둔다");
  ok(/res\.unread\?\.length > 0/.test(box), "못 읽은 줄을 숨기지 않는다");
  ok(/나이스에 없는 내신 시험/.test(box), "나이스에 없는 것을 세어 보여준다");
}

if (fail) { console.log("\n❌ 학교 홈페이지 읽기에 어긋난 것이 있습니다."); process.exit(1); }
console.log("\n✅ 학교 홈페이지 읽기 통과");

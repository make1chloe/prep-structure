/**
 * 화면에 적을 말만 남는가 (2026-08-07).
 *
 * 원장님
 *   「모든 페이지에 학생 학부모 포함 노션이관 언급하지마 정보과잉이야」
 *   「전국은 왜 표시하는거야? 안 표시하면 전국이겠지」
 *
 * 이런 것은 한 군데에서 떼야 한다. 화면마다 따로 지우면 어느 화면 하나에는
 * 반드시 남고, 그게 하필 어머니 화면이다.
 */
import { cleanNote, cleanTitle } from "../lib/note.js";

let bad = 0;
function eq(got, want, what) {
  if (got !== want) {
    console.log(`  ❌ ${what}\n     받은 것: ${JSON.stringify(got)}\n     바란 것: ${JSON.stringify(want)}`);
    bad = 1;
  }
}

console.log("== 「노션 이관」 은 화면에 안 뜬다 ==");
eq(cleanNote("노션 이관"), "", "그 말만 있으면 통째로 사라진다");
eq(cleanNote("노션이관"), "", "띄어쓰기가 없어도");
eq(cleanNote(null), "", "빈 것");
eq(cleanNote("  노션 이관  "), "", "앞뒤 공백");

console.log("== 정작 알아야 할 말은 남는다 ==");
eq(
  cleanNote("노션 이관 (결석일이 생성일 기준이라 다를 수 있음)"),
  "결석일이 생성일 기준이라 다를 수 있음",
  "괄호 안이 진짜 알려주는 것이다"
);
eq(cleanNote("보강 없음으로 처리됨"), "보강 없음으로 처리됨", "상관없는 메모는 그대로");
eq(cleanNote("어머니 요청"), "어머니 요청", "그대로");

console.log("== 「[전국]」 을 뗀다 ==");
eq(cleanTitle("[전국] 수능"), "수능", "붙어 있던 옛 줄");
eq(cleanTitle("[전국] 모의고사"), "모의고사", "모의고사");
eq(cleanTitle("해송고 기말고사"), "해송고 기말고사", "학교 이름은 그대로 — 이게 있어야 그 학교 것이다");
eq(cleanTitle("[전국]수능"), "수능", "띄어쓰기 없이");
eq(cleanTitle(""), "", "빈 것");

/**
 * **떼는 것은 앞머리 하나뿐이다.** 제목 안에 대괄호가 들어간 일정
 * (「[1학년] 체험학습」) 까지 벗기면 학년이 사라진다.
 */
console.log("== 다른 대괄호는 안 건드린다 ==");
eq(cleanTitle("[1학년] 체험학습"), "[1학년] 체험학습", "학년 표시는 남는다");

if (bad) { console.log("\n❌ 위 항목을 고쳐주세요"); process.exit(1); }
console.log("\n✅ 화면 문구 정리 통과");

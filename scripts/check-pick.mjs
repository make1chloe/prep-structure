/**
 * **표에 있는 것은 골라 넣는다** (원장님, 2026-08-09 — 「db가 있어서 선택하면
 * 되는 것을 텍스트로 적게 되어 있는 거 없는지 전 페이지 전수검사해. 지금
 * 신규 입력 시 학교 학년이 그래」).
 *
 * ── 왜 검사까지 두는가 ──────────────────────────────────
 *
 * 손으로 적으면 같은 학교가 갈라진다 —
 *   신정중 · 신정중학교 · 인천신정중 · 인천신정중학교
 *
 * 갈라지는 순간 그 학교의 시험 일정도, 시험범위도, 등급컷도, 성적도 서로
 * 다른 학교 것이 된다. **오류는 안 난다.** 아이 하나가 조용히 빠질 뿐이다.
 * 그리고 화면을 하나 새로 만들 때마다 다시 손으로 적게 될 수 있어서,
 * 「여기는 골라 넣는 자리」 라고 못을 박아둔다.
 *
 * 쓰는 법:  node scripts/check-pick.mjs
 */
import { readFileSync } from "node:fs";
import { GRADES, normalizeGrade, gradeChoices } from "../lib/grades.js";
import { SOURCES, sourceText } from "../lib/applySlots.js";

let bad = 0;
const read = (f) => readFileSync(f, "utf8");
const say = (m) => { console.log(`  ✗ ${m}`); bad = 1; };
const ok = (m) => console.log(`  ${m}`);
const eq = (got, want, what) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    say(`${what}\n     나온 것: ${JSON.stringify(got)}  바란 것: ${JSON.stringify(want)}`);
  } else ok(what);
};

console.log("== 학교·학년을 손으로 적는 자리가 남아 있나 ==");
/**
 * 학교와 학년을 받는 화면들. 새 화면을 만들 때 여기 한 줄 늘려두면,
 * 손으로 적게 만들어 놓았을 때 바로 걸린다.
 */
const FORMS = [
  ["app/students/AddStudentForm.jsx", "신규 학생"],
  ["app/consult/AddInquiryForm.jsx", "신규 상담"],
  ["app/consult/ConsultBoard.jsx", "상담 수정"],
  ["app/apply/ApplyForm.jsx", "상담 신청 설문지"],
  ["app/prep/PrepBoard.jsx", "내신 대비 회차"],
  ["app/scores/ScoreBoard.jsx", "성적 입력"],
];
for (const [f, label] of FORMS) {
  const src = read(f);
  const hasSchool = /SchoolField/.test(src) || /list="schools"/.test(src);
  if (!hasSchool) say(`${label} — 학교를 골라 넣지 않습니다 (${f})`);
  // 손으로 적는 칸이 그대로 남아 있지 않은지
  if (/<input[^>]*name="school"/.test(src)) say(`${label} — 학교를 손으로 적는 칸이 남아 있습니다`);
  if (/<input[^>]*name="grade"/.test(src)) say(`${label} — 학년을 손으로 적는 칸이 남아 있습니다`);
}
if (!bad) ok(`${FORMS.length}개 화면 모두 골라 넣습니다`);

// 학사일정은 처음부터 골라 넣게 되어 있었다 — 그대로인지만 확인
eq(/list="schools"/.test(read("app/schedule/ScheduleBoard.jsx")), true,
   "학사일정도 그대로 골라 넣습니다");

console.log("\n== 학년 값이 한 벌인가 ==");
eq(GRADES.length, 12, "초1~6 · 중1~3 · 고1~3 열둘");
eq([normalizeGrade("중 2"), normalizeGrade("중학교 2학년"), normalizeGrade("고1")],
   ["중2", "중2", "고1"], "손으로 적힌 것을 「중2」 꼴로 편다");
/**
 * **못 알아보면 그대로 돌려준다.** 「졸업」 같은 것을 빈칸으로 만들면
 * 적어두신 것이 사라진다 — 모르는 것은 잃지 않는 쪽이 늘 낫다.
 */
eq(normalizeGrade("졸업"), "졸업", "모르는 값은 지우지 않는다");
eq(gradeChoices("졸업")[0], "졸업", "지금 값이 목록에 없으면 목록에 넣어준다");
eq(gradeChoices("중2").length, 12, "목록에 있는 값은 늘리지 않는다");

console.log("\n== 유입경로가 두 벌이 아닌가 ==");
/**
 * 원장님 (2026-08-09) — 「설문지에서 기타를 선택한 경우 추가로 작성한
 * 내용이 안 들어오는 거 같아」
 *
 * 설문지는 「기타 (친구 어머니가 알려주심)」 처럼 **괄호까지 붙여** 저장한다.
 * 그런데 상담 화면에는 목록이 따로 있었고(블로그·소개·전단·검색·방문·기타),
 * 그 값이 목록에 없으니 수정창에서 **빈 칸**으로 보였다. 그대로 저장하면
 * 원래 글이 지워졌다. **저장은 잘 되고 있었다 — 보여주는 쪽이 잃고 있었다.**
 */
eq(sourceText("기타", "친구 어머니가 알려주심"), "기타 (친구 어머니가 알려주심)",
   "고른 것과 적어주신 것을 한 줄로 합친다");
eq(SOURCES.filter((s) => s.why).map((s) => s.key), ["재원생 소개", "기타"],
   "뒤에 적는 칸이 열리는 것은 둘");

for (const [f, label] of [
  ["app/consult/ConsultBoard.jsx", "상담 수정"],
  ["app/consult/AddInquiryForm.jsx", "신규 상담"],
]) {
  const src = read(f);
  if (!/from "@\/lib\/applySlots"/.test(src)) say(`${label} — 설문지와 다른 목록을 씁니다 (${f})`);
  else ok(`${label} — 설문지와 같은 목록을 씁니다`);
  // 목록에 없는 값을 지우지 않는 칸을 쓰는가
  if (!/PickField/.test(src)) say(`${label} — 목록에 없는 값이 지워질 수 있습니다`);
}

console.log("\n== 목록에 없는 값을 지키나 ==");
/**
 * 이 한 가지가 이번 버그의 전부다. 고르는 칸에 목록 밖의 값이 들어오면,
 * 칸은 「아무것도 안 고른 것」 으로 보이고 저장하면 그 값이 사라진다.
 */
const pf = read("components/PickField.jsx");
eq(/!options\.includes\(cur\)/.test(pf), true, "지금 값이 목록에 없으면 목록에 넣는다");
eq(/gradeChoices/.test(pf), true, "학년도 같은 규칙을 쓴다");
// 학교는 **막으면 안 된다** — 표에 없는 학교로 전학 온 아이가 늘 있다
eq(/<datalist/.test(pf), true, "학교는 고르되 적을 수도 있다 (표에 없는 학교가 늘 있다)");

console.log("\n== 로그인 없는 설문지도 골라 넣나 ==");
/**
 * schools 표는 선생님만 읽는다(0076). 그런데 갈라짐이 시작되는 첫 자리가
 * 바로 **학부모가 여는 설문지**다. 거기서 못 고르면 나머지를 다 고쳐도
 * 소용이 없다. 그래서 0114 로 이름만 내주는 좁은 문을 냈다.
 */
const sql = read("supabase/migrations/0114_school_names.sql");
eq(/security definer/i.test(sql), true, "좁은 문으로 이름만 내준다");
eq(/grant execute on function public\.school_names\(\) to anon/.test(sql), true,
   "로그인 없는 화면도 부를 수 있다");
eq(/grant .*(select|all).* on public\.schools to anon/i.test(sql), false,
   "표 자체는 그대로 잠겨 있다");
eq(/anon: true/.test(read("app/apply/page.jsx")), true, "설문지는 좁은 문으로 읽는다");
// 목록을 못 읽어도 접수는 되어야 한다 — 학교 목록 때문에 막히면 손해가 크다
eq(/catch\(\(\) => \[\]\)/.test(read("app/apply/page.jsx")), true,
   "목록을 못 읽어도 접수는 그대로 됩니다");

console.log("\n== 화면에 숫자가 새어 나오지 않나 ==");
/**
 * **`{... && <div/>}` 의 왼쪽에 숫자를 두면 그 숫자가 그려진다.**
 *
 * 상담 목록 맨 아래에 「0」 이 하나 떠 있었다 (0114 를 확인하다 화면에서
 * 봤다). 조건 맨 끝이 `r.want_slots?.length` 였는데, 희망 시간표를 하나도
 * 안 고른 줄에서는 그 값이 0 이라 「거짓」 이 아니라 **0** 이 되어 그대로
 * 찍힌 것이다. 오류도 안 나고 검사도 안 걸린다 — 화면에만 보인다.
 */
import { readdirSync, statSync } from "node:fs";
const jsx = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const full = `${dir}/${f}`;
    if (statSync(full).isDirectory()) walk(full);
    else if (f.endsWith(".jsx")) jsx.push(full);
  }
})("app");
const leaks = [];
for (const f of jsx) {
  const src = read(f);
  for (const m of src.matchAll(/(\?\.)?(length|size)\s*\)?\s*&&\s*[(<]/g)) {
    const before = src.slice(Math.max(0, m.index - 40), m.index);
    if (/[<>=!]=?\s*[^=]*$/.test(before.split("||").pop())) continue;  // 견주는 것은 참·거짓이다
    leaks.push(`${f}:${src.slice(0, m.index).split("\n").length}`);
  }
}
eq(leaks, [], "숫자를 참·거짓 대신 쓰는 자리 (0 이 화면에 찍힙니다)");

if (bad) { console.log("\n❌ 위 항목을 고쳐주세요"); process.exit(1); }
console.log("\n✅ 골라 넣기 통과");

/** 달력·아이 화면 (어75) — 원장님 2026-09-18 「달력에서 학생은 수업일지가 아니라 수업일정만 볼 수 있게해.
 *  숙제는 볼필요 없어. 내가 정한 마감이 뭔지 모르겠는데 필요없는거같아」 · 「하원을 누르면 등원학습이 접히고,
 *  등원을 누르면 숙제가 접히게 해줘」 · 「교재제목 밑에 회독수와 다른교재 말고 모든 정보지워줘」.
 *  가르는 곳은 lib/cal-plan 한 곳(두 벌로 안 만든다) — 여기서는 **진짜 불러 보고** 잰다. */
import { readFileSync } from "node:fs";
import { LEGEND, legendFor, dayMarks, dayDetail } from "../lib/cal-plan.js";
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " · " + why : ""}`); } };
const T = (p) => readFileSync(p, "utf8");

const today = "2026-09-18", date = "2026-09-17";
const ctx = {
  days: [{ date, kind: "class" }], absences: [], lates: [], arrival: [], quizzes: [], exams: [], holidays: [],
  dues: [{ due_on: date, stage: "sent", material: { title: "zz 학습지" } }],
  sheet: { date, attend: "present", closed_at: "2026-09-17T12:00:00Z", comment: "잘했어요", home_count: 2, home_names: ["단어", "본문"] }, today,
};
console.log("■ 아이 달력은 수업 일정만 · 학부모 달력은 그대로");
{ const kidM = dayMarks(date, { ...ctx, who: "student" }).map(([k]) => k);
  const parM = dayMarks(date, { ...ctx, who: "parent" }).map(([k]) => k);
  ok("표시 — 아이에겐 숙제 📘 · 마감 🚩 가 없다 · 학부모에겐 있다", !kidM.includes("i-hw") && !kidM.includes("i-due") && parM.includes("i-hw") && parM.includes("i-due"), `아이 ${kidM.join()} · 학부모 ${parM.join()}`);
  ok("출석 표시는 둘 다 그대로(수업 일정은 아이도 본다)", kidM.includes("i-ok") && parM.includes("i-ok"), kidM.join()); }
{ const kid = dayDetail(date, { ...ctx, who: "student" }).rows.map((r) => r.b).join(" | ");
  const par = dayDetail(date, { ...ctx, who: "parent" }).rows.map((r) => r.b).join(" | ");
  ok("줄 — 아이에겐 수업일지·숙제·마감 줄이 없다", !/수업일지|숙제 |내가 정한 마감/.test(kid), kid);
  ok("줄 — 학부모에겐 그대로 있다", /수업일지/.test(par) && /숙제 2개/.test(par) && /내가 정한 마감/.test(par), par);
  ok("아이도 그날 수업이 있었다는 것은 본다(수업 일정)", /수업한 날/.test(kid), kid); }
ok("범례 — 아이 일곱 · 학부모 아홉(빠진 둘이 📘 🚩)", legendFor("student").length === LEGEND.length - 2 && legendFor("parent").length === LEGEND.length,
  `${legendFor("student").length} / ${legendFor("parent").length}`);
ok("보는 사람은 한 벌이 받아 나른다(lib/cal.js 가 role 을 who 로 넘긴다)", /who: role/.test(T("lib/cal.js")) && /who: role, student: st/.test(T("lib/cal.js")));
ok("범례를 그리는 화면도 보는 사람대로(두 벌로 안 그린다)", /legendFor\(d\.who\)/.test(T("app/_shell/calview.js")));

console.log("■ 아이 07 · 저절로 접기 · 숙제 타이머 · 이름");
{ const me = T("app/me/page.js");
  ok("등원을 찍으면 「숙제」가 · 하원을 찍으면 「등원학습」이 접힌다", /d\.arrival\?\.left \? \["todo"\]/.test(me) && /d\.arrival\?\.arrived \? \["due"\]/.test(me));
  ok("사람마다 접어 둔 것에 **얹기만** 한다(덮지 않는다 · 누르면 그 자리에서 펴진다)", /fdd\.has\(id\) \|\| auto\.has\(id\)/.test(me));
  ok("카드 이름 — 등원학습 · 숙제(옛 이름 0)", /title="등원학습"/.test(me) && /title="숙제"/.test(me) && !/오늘 할 것|오늘 낼 숙제/.test(me));
  ok("숙제에도 타이머 — 한 줄이 내는 손은 DoRow 한 벌(학원·집에서·낼 숙제 세 자리 · (어77)) · 학원 줄은 「■ 끝」이 곧 완료 · 검사 끝난 줄은 결과만", (me.match(/<DoRow/g) ?? []).length === 3 && /hands="timer"/.test(me) && /it\.status !== "none" \? <span/.test(me)); }
console.log("■ 아이 08 · 교재 제목 밑은 회독수와 다른 교재만 · 여기까지 · 골라서 한 번에");
{ const bd = T("app/me/book/board.js");
  ok("머리 알약은 회독 하나뿐(진행 방식·다 한 단원·예상 끝날 날 0)", /data-g="head-tags"><span className="tag type">\{head\.round\}<\/span><\/div>/.test(bd) && !/head\.basis|head\.finished|head\.end/.test(bd));
  ok("「다른 교재」는 층이 다르다 — 정보 알약이 아니라 누르는 단추 · 지금 교재는 뺀다", /다른 교재<\/span>/.test(bd) && /className="btn sm" href=\{`\/me\/book\?b=\$\{x\.book_id\}`\}/.test(bd) && /x\.book_id !== b\.book\.id/.test(bd));
  ok("못 찍을 때만 띠가 남는다(대전제-0 · 찍을 수 있으면 군더더기를 안 낸다)", /\{!band\.open && <div className="lf"/.test(bd));
  ok("「여기까지 다했어요」 — 그 줄까지 **아직인 것만**(쌤이 찍은 줄은 안 덮는다)", /data-act="upto"/.test(bd) && /x\.can && x\.status !== "done"/.test(bd));
  ok("고르기는 앱 한 벌(대전제-20) — 새로 안 짓는다", /usePick|PickBox|PickGroup|PickBar/.test(bd) && (bd.match(/usePick\(/g) ?? []).length === 1);
  ok("골라서 한 번에도 **이미 있는 손**을 쓴다(markChapter 에 줄 목록만 넘긴다 · 원칙-1)", /markChapter\(pk\.ids, round, "done"\)/.test(bd) && /markChapter\(pk\.ids, round, "none"\)/.test(bd) && !/markUpTo|markPicked/.test(bd)); }
console.log("■ 접기 화살표 · 자료 안내");
{ const css = T("app/globals.css"), rule = /button\.btn\.fold\{([^}]*)\}/.exec(css)?.[1] ?? "";
  // (어75) 화살표는 **글자만** 키운다 — 높이를 키우면 check-sizes 의 「단추 작은 높이는 하나(28)」가 깨진다.
  // 선택자에 button 을 붙이는 까닭: 뒤에 오는 .btn.sm{font-size:var(--fs-2)} 보다 세야 글자가 실제로 커진다(9/17 걷기가 12px 로 잡았다).
  ok("접기 화살표가 크고 진하다 · 글자 --fs-7 · --faint 아님 · 목업 CSS 에서 왔다", /font-size:var\(--fs-7\)/.test(rule) && /color:var\(--ink\)/.test(rule), rule || "button.btn.fold 규칙이 없다");
  ok("화살표 단추는 높이를 제 손으로 안 정한다(다른 작은 단추와 같은 28 · check-sizes)", rule !== "" && !/(^|;)\s*(min-|max-)?height:/.test(rule), rule); }
ok("아이 자료 카드에 「원장님만 봐요」 0", !/원장님만 봐요/.test(T("app/me/cards.js")));

console.log(`\n■ 달력·아이 화면 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);

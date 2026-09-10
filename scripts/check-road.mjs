/** 로드맵 판단 검사(검사-58) — lib/road-plan.js 순수 셈: 세 칸(끝냄 · 하는 중 · 아직 — 진도가 조금이라도 있는 대단원은 하는 중 · 없으면 커서) · 소단원 줄(쌤/내가/검사 · 확인 기다리는 중 · 찍을 수 있나 = RLS 0052 ② 와 같은 판단) ·
 *  머리 꼬리표(회독 · 소단원씩 · 끝낸 대단원 · 이대로면 — 앞으로의 수업일에서) · 내 교재 상태 글(진행중 · 숙제멈춤(수업만) · 교재멈춤 — M/D에 풀림 · 기한 지나면 진행중) · ❗ 줄 · 열림 띠 · 원장 쪽(N일째 · 아이별 셈 · ❗ 처분 후보) */
import { roadOf, headTags, bookTags, flagLines, editBand, canMark, rowMarkable, endText, pendingText, daysOpenText, staffFlagLine, EDIT_MODE, FLAG_KIND } from "../lib/road-plan.js";
import { readFileSync } from "node:fs";
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " — " + why : ""}`); } };
const J = (x) => JSON.stringify(x);
const T = "2026-10-09";
const u = (id, ch, short) => ({ id, chapter: ch, short, activity: "본책", is_workbook: false, sort: Number(id.replace(/\D/g, "")) });
const units = [u("u1", "CH1", "1-1"), u("u2", "CH1", "1-2"), u("u3", "CH2", "2-1"), u("u4", "CH2", "2-2"), u("u5", "CH3", "3-1"), u("u6", "CH3", "3-2"), u("u7", "CH4", "4-1")];
const prog = [{ unit_id: "u1", status: "done", last_by: "staff", confirmed: true }, { unit_id: "u2", status: "skip", last_by: "staff", confirmed: true },
  { unit_id: "u3", status: "done", last_by: "check", confirmed: true }, { unit_id: "u4", status: "doing", last_by: "student", confirmed: false },
  { unit_id: "u5", status: "done", last_by: "student", confirmed: false }];
const b = { today: T, units, progress: prog, edit: { can_edit: true, academy_open: true, opened_on: "2026-09-28" }, sb: { round: 3, per_session: 1 }, book: { order_basis: "sub" }, remaining: 4, days: ["2026-10-12", "2026-10-14", "2026-10-19", "2026-11-04", "2026-11-06"], student: { progress_edit: "follow" } };
console.log("■ 세 칸 · 소단원 줄");
const r = roadOf(b);
ok("끝냄 1(CH1 = done + skip) · 하는 중 2(CH2 커서 · CH3 아이가 찍음) · 아직 1(CH4) · 끝낸 대단원 1/4 · 확인 기다리는 중 2", r.done.map((c) => c.chapter).join() === "CH1" && r.doing.map((c) => c.chapter).join() === "CH2,CH3" && r.todo.map((c) => c.chapter).join() === "CH4" && r.finished === 1 && r.total === 4 && r.now === "CH2" && r.pending === 2, J([r.done.map((c) => c.chapter), r.doing.map((c) => c.chapter), r.todo.map((c) => c.chapter)]));
const ch2 = r.doing[0];
ok("CH2 줄 — 2-1 검사가 찍음(못 덮는다) · 2-2 내가 찍음 · 확인 기다리는 중 · 찍을 수 있다 · CH3 은 노란 테두리감(pending 1 · now 아님)", ch2.now === true && ch2.subs[0].by === "검사" && ch2.subs[0].can === false && ch2.subs[1].by === "내가" && ch2.subs[1].own === true && ch2.subs[1].pending === true && ch2.subs[1].can === true && r.doing[1].pending === 1 && r.doing[1].now === false, J(ch2.subs));
ok("찍을 수 있나 — 닫혀 있으면 ✕ · 없는 줄 ○ · 내가 찍은 줄 ○ · 원장이 찍은 「아직」 줄 ○ · 원장이 찍은 끝냄 ✕(RLS 0052 ②)", canMark({ can_edit: false }, null) === false && canMark({ can_edit: true }, null) === true && canMark({ can_edit: true }, { last_by: "student", status: "done" }) === true && canMark({ can_edit: true }, { last_by: "staff", status: "none" }) === true && canMark({ can_edit: true }, { last_by: "memo", status: "done" }) === false && canMark({ can_edit: true }, { last_by: "staff", status: "done" }) === false);
const empty = roadOf({ ...b, progress: [] });
ok("진도가 하나도 없으면 — 하는 중은 커서 대단원(CH1) 하나 · 아직 3 · 끝냄 0", empty.doing.map((c) => c.chapter).join() === "CH1" && empty.todo.length === 3 && empty.done.length === 0);
console.log("■ 머리 꼬리표 · 교재 상태 · ❗ · 띠");
const h = headTags(b, r);
ok("「3회독」 · 「소단원씩」 · 「끝낸 대단원 1/4」 · 남은 4 ÷ 1덩어리 = 4번째 수업일 11/4 → 「이대로면 11월 초」", h.round === "3회독" && h.basis === "소단원씩" && h.finished === "끝낸 대단원 1/4" && h.end === "이대로면 11월 초" && h.sessions === 4 && h.endDate === "2026-11-04", J(h));
ok("남은 것 0 이면 「다 끝냈어요」 · 수업일이 모자라면 「앞으로 수업일이 없어요」 · 대단원 기준이면 「대단원씩」 · 초/중순/말", headTags({ ...b, remaining: 0 }, r).end === "다 끝냈어요" && headTags({ ...b, days: [] }, r).end === "이대로면 — 앞으로 수업일이 없어요" && headTags({ ...b, book: { order_basis: "chapter" } }, r).basis === "대단원씩" && endText("2026-12-15") === "12월 중순" && endText("2026-12-25") === "12월 말");
const bt = bookTags([{ book_id: "b1", name: "중등3800제3", stop_mode: "running" }, { book_id: "b2", name: "수능딥독1", stop_mode: "hw_off" }, { book_id: "b3", name: "능률보카", stop_mode: "book_off", stop_until: "2026-10-17" }, { book_id: "b4", name: "지난 멈춤", stop_mode: "book_off", stop_until: "2026-10-01" }, { book_id: "b5", name: "아직 안 멈춤", stop_mode: "book_off", stop_from: "2026-10-20" }], T);
ok("교재 글 — 「중등3800제3 · 진행중」 · 「수능딥독1 · 숙제멈춤 (수업만)」 · 「능률보카 · 교재멈춤 — 10/17에 풀림」 · 기한 지난 멈춤·아직 안 온 멈춤은 진행중(stopOn 한 곳)", bt[0].text === "중등3800제3 · 진행중" && bt[1].text === "수능딥독1 · 숙제멈춤 (수업만)" && bt[2].text === "능률보카 · 교재멈춤 — 10/17에 풀림" && bt[3].state === "running" && bt[4].state === "running", J(bt.map((x) => x.text)));
const fl = flagLines([{ id: "f1", chapter: "CH4", short: "PSS 4-2", kind: "not_done", said: null, raised_at: "2026-09-01T09:00:00+09:00", seen_at: null }, { id: "f2", chapter: "CH3", short: "3-1", kind: "other", said: "두 번 나왔어요", raised_at: "2026-08-30T09:00:00+09:00", seen_at: "2026-09-02T00:00:00Z", outcome: "kept" }, { id: "f3", chapter: "CH1", short: "1-1", kind: "already_done", raised_at: "2026-08-30T09:00:00+09:00", seen_at: "2026-09-02T00:00:00Z", outcome: "changed" }]);
ok("❗ 줄 — 「CH4 › PSS 4-2」 「이거 아직 안 했어요」 · 9/1에 달았어요 · 기다리는 중 / 그 밖에는 적은 말 · 그대로 두기로 했어요 / 바꿨어요", fl[0].title === "CH4 › PSS 4-2" && fl[0].said === "이거 아직 안 했어요" && fl[0].when === "9/1에 달았어요" && fl[0].waiting === true && fl[0].state === "기다리는 중" && fl[1].said === "두 번 나왔어요" && fl[1].state === "그대로 두기로 했어요" && fl[2].state === "바꿨어요", J(fl));
ok("띠 — 열림 · 닫힘(학원) · 닫힘(이 아이만) · 갈래 셋 · 모드 셋", editBand({ can_edit: true }).open === true && editBand({ can_edit: false }, { progress_edit: "follow" }).small.includes("원장님이 열면") && editBand({ can_edit: false }, { progress_edit: "off" }).small.includes("내 것만") && FLAG_KIND.length === 3 && EDIT_MODE.length === 3);
console.log("■ (허) 조각 · 칸에서 바로 찍기 — 남긴 것 21");
{
  const units = [{ ...u("u1", "CH1 문장의 기초", "PSS 1-1"), q_count: 62 }, { ...u("u2", "CH1 문장의 기초", "PSS 1-2"), page_start: 10, page_end: 15 }, u("u3", "CH2 시제", "PSS 2-1"), u("u4", "CH2 시제", "PSS 2-2")];
  const b = { units, progress: [{ unit_id: "u3", status: "done", last_by: "staff", confirmed: true }], edit: { can_edit: true },
              parts: [{ unit_id: "u1", q_from: 1, q_to: 20 }, { unit_id: "u2", page_from: 10, page_to: 12 }] };
  const r = roadOf(b), byId = Object.fromEntries(r.chapters.flatMap((c) => c.subs.map((x) => [x.id, x])));
  ok("조각 글이 소단원 줄에 붙는다 — 문항이면 「낸 것 1-20 · 남은 것 21-62」 · 쪽이면 「낸 것 p.10-12 · 남은 것 p.13-15」 · 조각이 없으면 빈 글(02b 와 같은 셈 — progress-plan coverage·partsText 한 벌)",
    byId.u1.parts === "낸 것 1-20 · 남은 것 21-62" && byId.u2.parts === "낸 것 p.10-12 · 남은 것 p.13-15" && byId.u3.parts === "" && byId.u4.parts === "", `${byId.u1.parts} / ${byId.u2.parts}`);
  const ch1 = r.chapters.find((c) => c.chapter === "CH1 문장의 기초"), ch2 = r.chapters.find((c) => c.chapter === "CH2 시제");
  ok("칸마다 「한 번에 찍을 소단원」(markable) — 쌤이 찍은 줄(u3)은 빠지고 나머지만 · 닫혀 있으면 하나도 없다", ch1.markable.join() === "u1,u2" && ch2.markable.join() === "u4" && roadOf({ ...b, edit: { can_edit: false } }).chapters.every((c) => c.markable.length === 0), `${ch1.markable} / ${ch2.markable}`);
  ok("줄 하나 판단(rowMarkable)은 한 벌 — canMark 는 열림 + rowMarkable(손 lib/road.js 통째 찍기가 같은 것을 쓴다 · RLS 0052 ②)",
    rowMarkable(null) === true && rowMarkable({ last_by: "student", status: "done" }) === true && rowMarkable({ last_by: "staff", status: "none" }) === true && rowMarkable({ last_by: "staff", status: "done" }) === false
    && canMark({ can_edit: true }, null) === true && canMark({ can_edit: false }, null) === false);
}
{
  const strip = (x) => x.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");   // 주석은 먼저 지운다(폰-5) — 주석에 적힌 글이 검사를 속이지 않게
  const src = (f) => strip(readFileSync(f, "utf8"));
  const road = src("lib/road.js"), me = src("app/me/book/board.js"), ops = src("app/ops/students/actions.js"), opsB = src("app/ops/students/board.js");
  ok("통째로 찍기는 읽기 한 번 · 쓰기 한 번(줄마다 부르지 않는다 — 속도 대원칙 1) · 쌤이 찍은 줄은 막지 않고 건너뛴다(몇 줄인지 돌려준다)",
    /studentMarkMany/.test(road) && /\.upsert\(/.test(road) && /rowMarkable/.test(road) && /skipped: ids\.length - mine\.length/.test(road) && !/for \(const id of mine\)/.test(road));
  ok("08 칸에 진짜 단추가 있다(「소단원 보기」를 펴지 않아도) · 소단원 줄엔 조각 글", /data-g="chapter-tri"/.test(me) && /markChapter\(c\.markable/.test(me) && /data-g="sub-parts"/.test(me));
  ok("14 의 진도 체크는 **같은 손**(lib/progress.js)과 **같은 판단**(road-plan staffFlagLine · EDIT_MODE) — 두 벌로 안 그린다(원칙-1)",
    /from "@\/lib\/progress"/.test(ops) && /confirmAllMarks|confirmMark/.test(ops) && /staffFlagLine/.test(opsB) && /EDIT_MODE/.test(opsB) && !/from\(["']progress["']\)/.test(opsB));
}
console.log("■ 원장 쪽");
ok("「강민서 6 · 윤도현 4」(0 은 뺀다) · 9/28 켬 → 10/9 는 「12일째」 · 안 켰으면 빈 글", pendingText([{ name: "강민서", pending: 6 }, { name: "구도은", pending: 0 }, { name: "윤도현", pending: 4 }]) === "강민서 6 · 윤도현 4" && daysOpenText("2026-09-28", T) === "12일째" && daysOpenText(null, T) === "");
const sf = staffFlagLine({ id: "f1", student: "강민서", book: "중등3800제3", chapter: "CH4 수동태", short: "PSS 4-2", kind: "not_done", raised_at: "2026-09-01T09:00:00+09:00", status: "done" });
ok("❗ 처분 줄 — 「강민서 · 중등3800제3 › CH4 수동태 › PSS 4-2」 · 「이거 아직 안 했어요」 · 9/1 달았음 · 지금 끝냄 ✅으로 되어 있음 → 「아직 안 함으로」(none) · 이미 했어요 → 「끝냄으로」(done) · 그 밖에 → 단추 없음", sf.title === "강민서 · 중등3800제3 › CH4 수동태 › PSS 4-2" && sf.small === "「이거 아직 안 했어요」 · 9/1 달았음 · 지금 끝냄 ✅으로 되어 있음" && sf.action.status === "none" && sf.action.label === "아직 안 함으로" && staffFlagLine({ kind: "already_done", status: "none", raised_at: "2026-09-01T00:00:00Z" }).action.status === "done" && staffFlagLine({ kind: "other", said: "x", status: "none", raised_at: "2026-09-01T00:00:00Z" }).action === null, sf.small);
console.log(`\ncheck-road ${bad ? "✗" : "✓"} ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);

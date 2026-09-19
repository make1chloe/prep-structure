/** 업무 · 내신 자료 판단 한 벌(순수, DB 없음 · 목업 04 · 05 · 확정-㉛·㉟·㊱·㊵ · 속도-1 예외 · 9/5 ⑨⑩㉖).
 *  종류가 바깥 축(0014): 자료 만들기 · 인쇄 · 배부 · 단원평가 출제 · 재시험지 · 성적 받기 · 반복 · 메모. 한 벌(todo_board)에서 카드 목록을 한 번 만들고, ⊞표 · ▦보드는 같은 목록을 다르게 그린다(재조회 0).
 *  자료 안에서만 순서가 있다(만들기→인쇄→배부→풀이→채점). 세는 것(N장 · N명 · D-N · 못 따라갑니다)은 여기서 센다 — 화면·검사가 같이 쓴다 */
import { daysBetween, md } from "./dash-plan.js";
import { plusDays } from "./day-plan.js";
import { examHead, examOn } from "./exam-plan.js";
/** 앱이 **스스로 카드를 내는** 분류 열 벌 — DB 표 v2.todo_kind(0179)의 씨앗이자, 그 표가 아직 없는 DB 에서의 바탕.
 *  (어80) 원장님 2026-09-18 「업무 칸반보드에 분류자체를 추가/수정/삭제가 되게해줘」 → 분류는 이제 **표에 산다.**
 *  여기 열 벌은 앱이 카드를 내는 자리(sync_material_todos · run_repeats …)라 못 지운다 — 이름·색·차례는 화면에서 고치신다.
 *  ⚠️ 0179 의 씨앗과 **한 글자도 달라지면 안 된다**(check-kind 가 견준다 · 두 벌은 반드시 어긋난다 · 원칙-1) */
export const KINDS = Object.freeze([
  ["make", "📄 자료 만들기", "nb-orange"], ["print", "🖨 인쇄", "nb-blue"], ["hand", "📤 배부", "nb-yellow"], ["solve", "✍️ 풀이", ""], ["grade", "✅ 채점", "nb-green"],   // 풀이·채점은 업무가 아니라 자료 배정에서 세어 나온다((가)-⑧)
  ["unit_test", "✍️ 단원평가 출제", ""], ["retest", "🔁 재시험지", "nb-red"], ["score", "📥 성적 받기", "nb-green"],
  ["repeat", "⏰ 반복", ""], ["note", "📋 메모", ""]]);
/** 어디에 보이나 — 업무 05 · 일정 12 · 둘 다. 옛 앱 학사일정이 업무 「메모」 칸을 채운 것이 이 칸이 없어서였다 */
export const SHOW_ON = Object.freeze([["todo", "업무"], ["schedule", "일정"], ["both", "둘 다"]]);   // 그림은 안 쓴다 — 탭 이름의 그림은 이미 lib/menu 한 곳에서 온다(대전제-25)
export const showOnName = (v) => SHOW_ON.find(([x]) => x === v)?.[1] ?? v;
/** (어96) 이 칸의 카드가 끝나면 아이에게 어떻게 알릴까 — 원장님 2026-09-19 「알림만주거나 어플목록에 띄우거나 둘다 하거나 선택가능하게해야함」.
 *  ⚠️ 「어플 목록」은 아이 07 의 📚 받을 교재·학습지 카드다 — 목록이 꺼져 있으면 준 자료가 아이 화면에 아예 안 뜬다. */
export const NOTIFY_WAYS = Object.freeze([["none", "안 함"], ["push", "알림만"], ["list", "어플 목록만"], ["both", "둘 다"]]);
export const notifyWayName = (v) => NOTIFY_WAYS.find(([x]) => x === v)?.[1] ?? v;
export const isNotifyWay = (v) => NOTIFY_WAYS.some(([x]) => x === v);
/** 분류 목록 한 벌 — DB 표 줄(todo_kind)이 오면 그것, 안 오면(표가 아직 없는 DB) 씨앗으로(대전제-27).
 *  화면·검사가 같은 꼴을 본다: { kind · name · cls · ord · app · showOn · state } */
export function kindList(rows = null) {
  const src = rows?.length
    ? rows.map((r) => ({ kind: r.kind, name: r.name ?? r.kind, cls: r.cls ?? "", ord: Number(r.ord ?? 500), app: Boolean(r.app), showOn: r.show_in ?? r.showOn ?? "todo", state: r.state ?? "active",
        notifyWay: r.notify_way ?? r.notifyWay ?? "none", confirmGot: Boolean(r.confirm_got ?? r.confirmGot) }))   /* (어96) 0185 전 DB 면 칸이 없다 → 꺼진 채(대전제-27) */
    : KINDS.map(([kind, name, cls], i) => ({ kind, name, cls, ord: (i + 1) * 10, app: true, showOn: "todo", state: "active", notifyWay: "none", confirmGot: false }));
  return src.sort((a, b) => a.ord - b.ord || a.kind.localeCompare(b.kind));
}
export const kindName = (k, kinds = null) => kinds?.find((x) => x.kind === k)?.name ?? KINDS.find(([x]) => x === k)?.[1] ?? k;
export const kindCls = (k, kinds = null) => kinds?.find((x) => x.kind === k)?.cls ?? KINDS.find(([x]) => x === k)?.[2] ?? "";
export const STEPS = Object.freeze([["make", "만들기"], ["print", "인쇄"], ["hand", "배부"], ["solve", "풀이"], ["score", "채점"]]);
export const stepName = (s) => STEPS.find(([k]) => k === s)?.[1] ?? s;
export const SOURCE_EMO = Object.freeze({ "이그잼": "📄", "클래스카드": "🃏", "직접": "🖊️" });
export const sourceEmo = (s) => SOURCE_EMO[s] ?? "🖊️";
const QKIND = { word: "단어", sentence: "문장" };
/** 「10월 4일」 */
export const monthDay = (d) => (d ? `${Number(String(d).slice(5, 7))}월 ${Number(String(d).slice(8, 10))}일` : "");
/** D-N · D-day · D+N (지난 것은 D+) — dash-plan 의 dday 는 지난 것을 null 로 두므로 여기 따로 */
export function ddayText(today, on) { if (!on || !today) return ""; const n = daysBetween(today, on); return n === 0 ? "D-day" : n > 0 ? `D-${n}` : `D+${-n}`; }
/** 「오늘까지」 · 「하루 지남」 · 「3일 지남」 · 아직이면 "" */
export function overdueText(due, today) { if (!due || !today) return ""; const n = daysBetween(today, due); return n === 0 ? "오늘까지" : n < 0 ? `${-n === 1 ? "하루" : `${-n}일`} 지남` : ""; }
export const isOpen = (c) => c.state === "todo" || c.state === "doing";
export const isOverdue = (c, today) => isOpen(c) && Boolean(c.due) && String(c.due) < String(today);
/** 📅 줄 — 「마감 10월 4일 · D-5 · 하루 지남」(D-N 은 시험까지, 지남은 마감 기준). 마감이 없으면 「마감 없음」 */
export function dueLine(c, today) {
  if (c.dueText) return c.dueText;
  if (!c.due) return "마감 없음";
  const on = c.exam ? examOn(c.exam) : null;
  return [`마감 ${monthDay(c.due)}`, on && on !== c.due ? ddayText(today, on) : null, overdueText(c.due, today) || null].filter(Boolean).join(" · ");
}
/** 자료의 단계 체크 — 만들기(만듦·♻️) · 인쇄 · 배부(다 줬나) · 풀이(다 제출했나 — 아이가 앱에서) · 채점(다 채점했나 — 원장이 아이마다 · 0145). 종류에 없는 단계는 안 센다 */
export function stepChecks(m) {
  const steps = (m.steps ?? []).filter((s) => STEPS.some(([k]) => k === s));
  const gives = Number(m.gives ?? 0), handed = Number(m.handed ?? 0), submitted = Number(m.submitted ?? m.solved ?? 0), scored = Number(m.scored ?? 0);   // 제출 = 아이가 앱에서(0145) · 채점 = 원장이 아이마다
  const done = { make: Boolean(m.reuse_of) || ["made", "printed", "done"].includes(m.state), print: ["printed", "done"].includes(m.state), hand: m.state === "done" || (gives > 0 && handed >= gives), solve: gives > 0 && submitted >= gives, score: gives > 0 && scored >= gives };
  return steps.map((s) => ({ step: s, name: stepName(s), done: Boolean(done[s]), text: s === "hand" && gives ? `${handed}/${gives}` : s === "solve" && gives ? `제출 ${submitted}/${gives}` : s === "score" && gives ? `채점 ${scored}/${gives}` : null }));
}
/** 자료 하나 안의 흐름(목업 05 📦) — 끝낸 것 · 지금 · 아직 */
export function flowOf(m) {
  const checks = stepChecks(m); let seenNow = false;
  return checks.map((c) => { const state = c.done ? "done" : seenNow ? "todo" : "now"; if (!c.done) seenNow = true; return { ...c, state }; });
}
/** (어96) 배부 크로스체크 — 준 아이 가운데 몇이 받아 갔나 · 아직 누구인가(원장님 2026-09-19 「자기가 챙겨서 받아갔다는 체크」).
 *  「받아 갔다」는 **둘 중 하나**면 된다 — 아이가 찍은 것(got · 0117 트리거가 서버에서)이거나 원장 확인 도장(checked).
 *  폰이 없거나 안 찍는 아이가 있어도 카드를 닫으실 수 있다(막다른 길을 안 만든다).
 *  잠김은 **나눠 줄 것이 없는데 덜 받아 갔을 때**만 — 아직 안 준 아이가 있으면 「✓ 끝냄」이 곧 나눠 주는 손이다. */
export function giveCross(m) {
  const all = m?.students ?? [], rows = all.filter((s) => s.handed);
  const left = rows.filter((s) => !s.got && !s.checked);
  return { n: rows.length, ok: rows.length - left.length, left, checked: rows.filter((s) => s.checked), locked: all.length > 0 && rows.length === all.length && left.length > 0 };
}
/** 장수 — 항목 한 장 × 아이 수(항목이 없으면 아이 수) */
export const pagesOf = (m) => Math.max(0, Number(m.items ?? 0) || 1) * Math.max(0, Number(m.gives ?? 0));
/** (어95) 업무에 이은 아이 — **여럿**이다(0184 v2.todo_student · 원장님 2026-09-19 「b」). 읽는 자리는 여기 하나(원칙-1).
 *  ⚠️ 0184 를 아직 안 붙이신 DB 의 판은 한 명을 옛 칸(student_id · student …)으로 준다 — 둘 다 읽어 **한 꼴**로 만든다(대전제-27). */
export const who = (t) => t.students ?? (t.student_id ? [{ id: t.student_id, name: t.student ?? "", school_id: t.student_school_id ?? null, school: t.student_school ?? null }] : []);
/** (어95) 「누구에게」 고르개(WhoPick)가 먹는 꼴로 — 판의 아이 명단은 뱀꼴(school_id), 고르개는 낙타꼴(schoolId)이라 옮기는 자리를 한 곳에 둔다 */
export const whoPicks = (b) => (b?.students ?? []).map((s) => ({ id: s.id, name: s.name, schoolId: s.school_id ?? null, school: s.school ?? null, classIds: s.class_ids ?? [] }));
/** 한 벌(todo_board) → 카드 목록. 표·보드가 같은 목록을 그린다(원장님 9/3 「같은 줄」). 성적 받기는 회차에서 세어 나온다(낸 아이 < 보는 아이) */
export function cardsOf(b) {
  const today = b.today, scoreDays = parseInt(b.rules?.["todo.score_days"] ?? "3", 10) || 0;
  const out = [];
  for (const t of b.todos ?? []) {
    const m = t.material ?? null, sts = who(t);
    out.push({ id: `t:${t.id}`, todoId: t.id, kind: t.kind, title: t.title, note: t.note, due: t.due_on, dueTime: t.due_time, startOn: t.start_on ?? null, files: t.files ?? [],   /* (어78) 시작일 · 붙은 파일(퀵 메모) */ state: t.state, doneAt: t.done_at, why: t.why, createdAt: t.created_at,
      school: t.exam?.school ?? sts[0]?.school ?? null, schoolId: t.exam?.school_id ?? sts[0]?.school_id ?? null, level: t.exam?.level ?? null, grade: t.exam?.grade ?? null,
      n: m ? Number(m.gives ?? 0) : sts.length || null, students: sts, student: sts.map((x) => x.name).join(" · ") || null, studentIds: sts.map((x) => x.id), exam: t.exam, material: m, rule: t.rule ?? null,
      checks: m ? stepChecks(m) : null, reuse: Boolean(m?.reuse_of), pages: m ? pagesOf(m) : 0, prep: Boolean(t.exam) });
  }
  // ✍️ 풀이 · ✅ 채점 · 업무가 아니라 자료의 배정(material_give)에서 세어 나온다((가)-⑧ · 원장님 「학생어플에서 제출」 · 목업 05 「배부·풀이·채점은 아이마다 따로 갑니다」). 판의 materials(준 자료만 · 업무가 없어도) · 제출한 아이가 있어야 채점 카드 · 다 제출/다 채점하면 ✓ 끝냄 그룹으로
  for (const m of b.materials ?? []) {
    if (!m || m.state === "dropped") continue;
    const steps = m.steps ?? [], gives = Number(m.gives ?? 0), handed = Number(m.handed ?? 0), submitted = Number(m.submitted ?? 0), scored = Number(m.scored ?? 0), students = m.students ?? [];
    const title = `${m.type ?? "자료"}${m.title && m.title !== m.type ? ` · ${m.title}` : ""}`;
    const base = { material: m, exam: m.exam ?? null, school: m.exam?.school ?? null, schoolId: m.exam?.school_id ?? null, level: m.exam?.level ?? null, grade: m.exam?.grade ?? null, createdAt: m.created_at, checks: stepChecks(m), n: gives, prep: Boolean(m.exam), reuse: false, pages: 0, due: null };
    if (steps.includes("solve") && handed > 0) out.push({ ...base, id: `v:${m.id}`, kind: "solve", title, state: gives > 0 && submitted >= gives ? "done" : "todo", submitted, waiting: students.filter((s) => s.handed && !s.submitted_at).map((s) => s.name) });
    if (steps.includes("score") && submitted > 0) out.push({ ...base, id: `g:${m.id}`, kind: "grade", title, state: gives > 0 && scored >= gives ? "done" : "todo", scored, toGrade: students.filter((s) => s.submitted_at && !s.scored_at), graded: students.filter((s) => s.scored_at) });
  }
  // (버) 저절로 선 단원평가 · 루틴 11 의 「단원평가 본다」(대단원마다 · 소단원 N개마다)가 켜진 교재에서 그 올린 기록이 끝나면(todo_board unit_test_due · 0149) 카드가 선다. 「출제 완료」가 올린 기록을 새겨 made 로(같은 올린 기록은 다시 안 선다)
  for (const u of b.unit_test_due ?? []) out.push({ id: `ud:${u.book_id}:${u.round}:${u.chapter ?? ""}:${u.seq ?? ""}:${u.student_id}`, kind: "unit_test", title: `${u.student} · ${(u.topics ?? []).join("·") || "분류 없음"}`, due: u.next_class ?? null, dueText: u.next_class ? `다음 수업 · ${monthDay(u.next_class)}` : "다음 수업이 아직 없어요", state: "todo", why: `📚 ${u.book} · ${u.covers ?? ""} · ${u.mode === "per_chapter" ? "대단원 끝" : `소단원 ${u.n}개`} · 저절로(루틴 11 단원평가)`, school: u.school ?? null, schoolId: u.school_id ?? null, student: u.student, studentId: u.student_id, n: 1, extra: (u.topics ?? []).length ? "25문항" : "분류 없음 · 15 에서 단원에 문법 분류를", prep: false,
    dueUnitTest: { studentId: u.student_id, bookId: u.book_id, round: u.round, chapter: u.chapter ?? null, seq: u.seq ?? null, covers: u.covers ?? null, topicId: u.topic_id ?? null, qCount: 25 } });
  for (const u of b.unit_tests ?? []) out.push({ id: `u:${u.id}`, unitTestId: u.id, kind: "unit_test", title: `${u.student} · ${u.topic ?? "분류 없음"}`, due: u.next_class ?? null, dueText: u.next_class ? `다음 수업 · ${monthDay(u.next_class)}` : "다음 수업이 아직 없어요", state: "todo", why: "단원평가 숙제가 나가서 저절로", school: u.school ?? null, schoolId: u.school_id ?? null, student: u.student, studentId: u.student_id, n: 1, extra: `${u.q_count}문항`, prep: false });
  for (const q of b.retests ?? []) out.push({ id: `q:${q.id}`, quizId: q.id, paperAt: q.paper_at ?? null, sheetId: q.sheet_id ?? null, retryOf: q.retry_of ?? null, closed: Boolean(q.closed), kind: "retest", title: `${q.student} · ${QKIND[q.kind] ?? q.kind}${q.pct != null ? ` ${q.pct}%` : ""}`, due: q.assigned_on ?? null, dueText: q.assigned_on === today ? "오늘 · 그날 남아서 봅니다" : q.assigned_on ? `${monthDay(q.assigned_on)} 낸 것 · 남아서 봅니다` : "", state: q.paper_at ? "doing" : "todo", why: "못 넘긴 시험에서 저절로", school: q.school ?? null, schoolId: q.school_id ?? null, student: q.student, studentId: q.student_id, n: 1, book: [q.book, q.unit ?? q.free_note].filter(Boolean).join(" · "), style: q.style ?? null, prep: false });
  for (const e of b.scores ?? []) { const left = Number(e.takers ?? 0) - Number(e.scored ?? 0); if (!e.takers || left <= 0) continue; const on = examOn(e); out.push({ id: `s:${e.id}`, examId: e.id, kind: "score", title: `${examHead(e)} · ${left}명`, due: on ? plusDays(on, scoreDays) : null, state: "todo", why: "아이가 넣습니다(16) · 안 낸 아이만 셉니다", school: e.school ?? null, schoolId: e.school_id ?? null, level: e.level, grade: e.grade, exam: e, n: left, prep: true }); }
  return out;
}
/** 카드의 ☑ 단계 → 같은 자료의 그 단계 업무(id) · 체크하면 카드가 저절로 다음 칸으로 간다((가)-③ · 목업 05 「끌어 옮기지 않습니다 · 폰에서 어렵고 손이 더 갑니다」). 켜 둔 단계가 아니면 null */
export const stepTodoOf = (cards = [], materialId, step) => cards.find((c) => c.todoId && c.material?.id === materialId && c.kind === step)?.todoId ?? null;
/** 자료 거르개((가)-④ · 04 「단계 👉」가 그 자료만 걸러 연다) · 자료 id 목록(비면 전부). 그 자료의 단계 업무만 남는다 */
export const filterMaterials = (cards = [], ids = []) => (ids?.length ? cards.filter((c) => ids.includes(c.material?.id)) : cards);
/** 거르는 중 알약 글 — 「zz_분석지」 · 「이그잼 자료 2개」 · 모르는 id 면 「자료 N개」 */
export function onlyText(cards = [], ids = []) {
  const ms = [...new Map(cards.filter((c) => c.material && ids.includes(c.material.id)).map((c) => [c.material.id, c.material])).values()];
  return ms.length === 1 ? (ms[0].title || ms[0].type || "자료") : ms.length > 1 ? `${ms[0].source ?? ""} 자료 ${ms.length}개`.trim() : `자료 ${ids.length}개`;
}
/** 학교 거르개 — all · 학교 id · none(내신 아닌 것 = 회차가 없는 카드) */
export function filterSchool(cards, sel = "all") { return sel === "all" ? cards : sel === "none" ? cards.filter((c) => !c.exam) : cards.filter((c) => c.schoolId === sel); }
/** 차례 — 마감 순(없는 것은 뒤) · 만든 순 */
export function sortCards(cards, by = "due") { const made = (c) => String(c.createdAt ?? "9999"); return [...cards].sort((a, b) => by === "due" ? (a.due ?? "9999") < (b.due ?? "9999") ? -1 : (a.due ?? "9999") > (b.due ?? "9999") ? 1 : made(a).localeCompare(made(b)) : made(a).localeCompare(made(b))); }   // 마감·만든 때가 없는 것(회차에서 세어 나온 카드)은 뒤
/** 칸 — 분류마다(묶기는 분류로 고정, 9/5 ⑩). 인쇄 칸은 장수를 센다.
 *  (어80) 칸 목록이 표에서 온다 · where 는 「어디의 판인가」(업무 05 는 "todo" · 일정 12 는 "schedule").
 *  칸이 서는 규칙 셋 — ① 여기 보일 살아 있는 분류는 카드가 0이어도 선다(새로 만드신 칸이 빈 채로 보여야 그리로 옮긴다)
 *  ② 내린 분류라도 여기 카드가 남아 있으면 남는다 ③ 표에 아예 없는 분류의 카드도 제 칸을 얻는다 — **카드가 조용히 사라지지 않는다**(대전제-0) */
export function columnsOf(cards, today, kinds = null, where = "todo") {
  const open = cards.filter(isOpen), all = kindList(kinds);
  const here = (k) => k.showOn === where || k.showOn === "both";
  const shown = all.filter((k) => here(k) && (k.state === "active" || open.some((c) => c.kind === k.kind)));
  const unknown = [...new Set(open.map((c) => c.kind))].filter((k) => !all.some((x) => x.kind === k))
    .map((kind) => ({ kind, name: kind, cls: "", ord: 9999, app: false, showOn: where, state: "active" }));
  return [...shown, ...unknown].map((k) => { const list = open.filter((c) => c.kind === k.kind); return { ...k, cards: list, count: k.kind === "print" ? `${list.reduce((n, c) => n + c.pages, 0)}장` : String(list.length), hot: list.filter((c) => isOverdue(c, today)).length }; });
}
/** 숨긴 그룹 — ✓ 끝냄 · ♻️ 이미 있는 것(만들기가 끝난 채로 선 것) · 삭제한 것 */
export function hiddenOf(cards) { return { done: cards.filter((c) => c.state === "done"), reuse: cards.filter((c) => c.kind === "make" && c.reuse), dropped: cards.filter((c) => c.state === "dropped") }; }
/** 알약 · 업무 N(하는 것) · 마감 지남 N · 이미 있음 N */
export function counts(cards, today) { const open = cards.filter(isOpen); return { open: open.length, overdue: open.filter((c) => isOverdue(c, today)).length, reuse: cards.filter((c) => c.kind === "make" && c.reuse).length, done: cards.filter((c) => c.state === "done").length }; }
/** 🔥 못 따라갑니다 · 회차마다 남은 자료(만들기·인쇄·배부가 하나라도 남은 자료 수)가 남은 날 × N 보다 많으면. 영어 시험일이 없으면 못 센다 */
export function behindOf(cards, today, perDay = 1) {
  const by = new Map();
  for (const c of cards.filter(isOpen)) { if (!c.exam || !c.material || !["make", "print", "hand"].includes(c.kind)) continue; const on = examOn(c.exam); if (!on) continue; if (!by.has(c.exam.id)) by.set(c.exam.id, { exam: c.exam, ids: new Set(), daysLeft: daysBetween(today, on) }); by.get(c.exam.id).ids.add(c.material.id); }
  return [...by.values()].map((x) => ({ exam: x.exam, remaining: x.ids.size, daysLeft: x.daysLeft })).filter((x) => x.remaining > Math.max(0, x.daysLeft) * Math.max(0, perDay)).map((x) => ({ ...x, title: `${examHead(x.exam)} · 못 따라갑니다`, text: `자료 ${x.remaining}개가 남았습니다`, small: x.daysLeft < 0 ? `영어 시험일이 ${-x.daysLeft}일 지났습니다` : `영어 시험일까지 ${x.daysLeft}일 · 하루 ${perDay}개면 ${x.daysLeft * perDay}개` }));
}
/** 🖨 한 번에 뽑기 — 인쇄 칸의 자료와 장수 */
export function printAllOf(cards) { const list = cards.filter((c) => isOpen(c) && c.kind === "print" && c.material); return { list, pages: list.reduce((n, c) => n + c.pages, 0), ids: list.map((c) => c.material.id) }; }
/** 🏫 학교 알약 글 「신정중 2」 — 학교 + 학년(회차) */
export const schoolTag = (c) => (c.school ? `${c.school.replace(/(여자고등학교|여자중학교|중학교|고등학교|초등학교)$/, (m) => ({ 여자고등학교: "여고", 여자중학교: "여중", 중학교: "중", 고등학교: "고", 초등학교: "초" })[m])}${c.grade != null && c.grade !== "" ? ` ${c.grade}` : ""}` : "");
/** 반복 규칙 · 글 「매달 25일 · 3일 전부터」 · 「매주 월 · 3일 전부터」 */
const WD = ["일", "월", "화", "수", "목", "금", "토"];
export const REPEAT_EVENTS = Object.freeze([["new_student", "신규 학생"], ["book_ending", "교재 끝나감"]]);   // 사건 유형(4단계-5 · 옛 앱 todoRoutine KINDS 중 둘 · 「단원평가 막힘」은 무엇이 막힘인지 정하지 않아 뺐다)
export function repeatText(th = {}) { const lead = Number(th.lead ?? 0); const tail = lead > 0 ? ` · ${lead}일 전부터` : ""; if (th.event === "new_student") return `신규 학생 · 들어온 지 ${th.days ?? 7}일${tail}`; if (th.event === "book_ending") return `교재 끝나감 · 남은 소단원 ${th.left ?? 5}개 이하`; if (th.day != null) return `매달 ${th.day}일${tail}`; if (th.weekday != null) return `매주 ${WD[Number(th.weekday)] ?? "?"}${tail}`; return "언제인지 없음"; }
/** 반복 규칙 읽기 · every: month(day 1~31) · week(weekday 0~6) · new_student(days 들어온 지 N일) · book_ending(left 남은 소단원 N개 이하) · lead(기본 규칙 줄 · 교재 끝나감엔 없다) */
export function parseRepeat({ every, day, weekday, lead, days, left }) {
  const th = {};
  if (every === "month") { const d = Number(day); if (!Number.isInteger(d) || d < 1 || d > 31) throw new Error("며칠인지 1~31 로 적으세요(31이면 짧은 달은 말일)"); th.day = d; }
  else if (every === "week") { const w = Number(weekday); if (!Number.isInteger(w) || w < 0 || w > 6) throw new Error("요일을 고르세요"); th.weekday = w; }
  else if (every === "new_student") { const n = Number(days === "" || days == null ? 7 : days); if (!Number.isInteger(n) || n < 0 || n > 60) throw new Error("들어온 지 며칠은 0~60"); th.event = "new_student"; th.days = n; }
  else if (every === "book_ending") { const n = Number(left === "" || left == null ? 5 : left); if (!Number.isInteger(n) || n < 0 || n > 30) throw new Error("남은 소단원은 0~30"); th.event = "book_ending"; th.left = n; return th; }
  else throw new Error("매달 · 매주 · 신규 학생 · 교재 끝나감 중에서 고르세요");
  if (lead !== "" && lead != null) { const l = Number(lead); if (!Number.isInteger(l) || l < 0 || l > 60) throw new Error("며칠 전부터는 0~60"); th.lead = l; }
  return th;
}
/** 04 자료 나무 · 출처(자료) › 유형(자료 한 장) › 항목. 알약 「자료 N · 유형 N · 항목 N」 */
export function treeOf(materials = []) {
  const live = materials.filter((m) => m.state !== "dropped");
  const by = new Map();
  for (const m of live) { const k = m.source ?? "직접"; if (!by.has(k)) by.set(k, { source: k, emo: sourceEmo(k), materials: [], students: new Set() }); const g = by.get(k); g.materials.push(m); for (const x of m.gives ?? []) g.students.add(x.student_id); }
  const groups = [...by.values()].map((g) => ({ ...g, students: g.students.size }));
  return { groups, counts: { sources: groups.length, materials: live.length, items: live.reduce((n, m) => n + (m.items?.length ?? 0), 0), dropped: materials.length - live.length } };
}
/** 유형 한 줄의 꼬리표 · 「4가지」 · 「아직 안 만듦」 · 「♻️ 지난번 것」 · 「인쇄함」 · 「배부 끝」 */
export function materialTags(m) {
  const tags = [`${m.items?.length ?? 0}가지`];
  if (m.state === "todo" && !m.reuse_of) tags.push("아직 안 만듦"); if (m.reuse_of) tags.push("♻️ 지난번 것"); if (m.state === "printed") tags.push("인쇄함"); if (m.state === "done") tags.push("배부 끝"); if (m.state === "dropped") tags.push("뺌");
  return tags;
}
/** 자료 한 줄의 「다음 · 언제」 — 04 가 「아직 안 만듦」만 말하고 **언제 아이에게 가는지**는 안 말하던 것(2026-09-12 내신대비 한 판 · 대전제-0).
 *  단계는 flowOf 한 벌 · 날짜는 여기서 생긴 업무(todo.material_id)에서 가져온다 · 새 셈을 만들지 않는다(원칙-1) */
export function nextStep(m, todos = [], today = null) {
  const now = flowOf(m).find((c) => c.state === "now");
  if (!now) return null;
  const t = (todos ?? []).find((x) => x.material_id === m.id && x.kind === now.step && x.state !== "done" && x.state !== "dropped");
  const due = t?.due_on ?? null, late = due && today ? overdueText(due, today) : "";
  return { step: now.step, name: now.name, due, late: Boolean(late), text: `다음 · ${now.name}${due ? ` ${md(due)}${today ? ` · ${late || ddayText(today, due)}` : ""}` : " · 마감 없음"}` };
}
/** 04 학생별 표 — 학교 진도 · 오늘 낼 것(만들거나 인쇄한 것 중 아직 안 준 것) · 남은 것(안 끝낸 배정). 진도를 모르면 「진도를 알아야 냅니다」 */
/** 한 아이의 자료 줄 — 04 학생별 표(studentRows)와 01 내신 자료 자리(prepOf)가 **같은 셈**을 쓴다((어21) · 원칙-1).
 *  give 는 이 아이의 material_give(없으면 null · 04 는 gives 배열에서 골라 준다). 「오늘 낼 것」= 배정됐고 아직 안 줬고 만들었거나 인쇄한 것 */
export const MATERIAL_STATE = Object.freeze({ todo: "아직 안 만듦", made: "만듦", printed: "인쇄됨", done: "배부 끝", dropped: "뺌" });
export function giveStatus(m, give) {
  if (!give) return { text: "안 줌", can: "give" };
  if (!give.handed_at) return m.state === "todo" ? { text: "배정됨 · 아직 안 만듦", can: null } : { text: "배정됨 · 줄 것", can: "hand", today: true };
  if (give.scored_at) return { text: "채점 ✓", can: null };
  if (give.submitted_at) return { text: "제출함", can: "score" };
  if (give.stage === "done") return { text: "다 함", can: null };
  if (give.stage === "doing") return { text: "풀이 중", can: null };
  return { text: give.got_at ? "받음" : `배부 ${monthDay(String(give.handed_at).slice(0, 10))}`, can: null };
}
export function giveRows(studentId, materials = []) {
  return materials.filter((m) => m.state !== "dropped").map((m) => {
    const give = m.give !== undefined ? m.give : ((m.gives ?? []).find((g) => g.student_id === studentId) ?? null);
    return { material: m, give, ...giveStatus(m, give) };
  });
}
export function studentRows(takers = [], materials = []) {
  return takers.map((t) => {
    const rows = giveRows(t.id, materials).filter((r) => r.give);
    const today = rows.filter((r) => r.today).map((r) => `${r.material.type} · ${r.material.title}`);
    const left = rows.filter((r) => r.give.stage !== "done").length;
    return { id: t.id, name: t.name, school: t.school ?? "", grade: t.grade, prog: t.school_prog ?? "", known: Boolean(String(t.school_prog ?? "").trim()), today, left, assigned: rows.length };
  });
}
/** (어21) 01 의 「내신 자료」 업무 · today_prep 한 아이 몫(시험마다 멈춘 교재 · 자료 · 이 아이 give)을 그린 줄로. 멈췄나는 routine-plan stopOn 한 벌 · 01 의 「교재 보류」 머리와 같은 판단 */
export function prepOf(exams = [], today, stopOn) {
  return (exams ?? []).map((e) => {
    const stopped = (e.books ?? []).filter((b) => (stopOn ? stopOn(b, today) : b.stop_mode) === "book_off");
    const rows = giveRows(null, (e.materials ?? []).map((m) => ({ ...m, give: m.give ?? null })));
    const notGiven = rows.filter((r) => r.can === "give").length, toHand = rows.filter((r) => r.can === "hand").length;
    return { exam: e, stopped, rows, notGiven, toHand, dday: ddayText(today, e.english_on ?? e.term_from), scopes: Number(e.scopes ?? 0) };
  }).filter((x) => x.stopped.length > 0);
}
/** 업무 목록의 꼬리표 — 자료 k · 줄 것 n · 안 줌 m (없는 것은 안 적는다) */
export function prepBadge(list = []) {
  const k = list.reduce((a, x) => a + x.rows.length, 0), n = list.reduce((a, x) => a + x.toHand, 0), m = list.reduce((a, x) => a + x.notGiven, 0);
  return [`자료 ${k}`, n ? `줄 것 ${n}` : null, m ? `안 줌 ${m}` : null].filter(Boolean).join(" · ");
}
/** ♻️ 지난번 것 한 줄 — 「변형문제 · 2409 학평」 · 「2026-04 만듦 · 5명이 썼음 · 범위 겹침 3」 · 체크된 채로 / 이미 가져옴 */
export function reuseRows(reuse = []) {
  return reuse.map((r) => ({ id: r.id, emo: sourceEmo(r.source), title: `${r.type} · ${r.title}`, small: `${String(r.made_on ?? "").slice(0, 7)} 만듦 · ${r.used}명이 썼음 · ${r.exam?.school ?? "전국"} ${r.exam?.name ?? ""} · 범위 겹침 ${r.overlap}`, already: Boolean(r.already), items: r.items, tag: r.already ? "이미 가져왔습니다" : "✓ 만들기 체크된 채로 업무에 섭니다" }));
}
/** 새 자료 읽기 — 종류 · 제목(비면 종류 이름) · 항목(쉼표·줄) · 아이(비면 보는 아이 전부) */
export function parseMaterial({ typeId, title, items, studentIds, takers = [], types = [] }) {
  const ty = types.find((t) => t.id === typeId); if (!ty) throw new Error("자료 종류를 고르세요");
  const t = String(title ?? "").trim() || ty.name;
  const list = String(items ?? "").split(/[,\n·]/).map((s) => s.trim()).filter(Boolean);
  const ids = (studentIds?.length ? studentIds : takers.map((x) => x.id)).filter((id) => takers.some((x) => x.id === id));
  return { typeId, title: t, items: [...new Set(list)], studentIds: [...new Set(ids)] };
}
/** 「여기서 생긴 업무」 한 줄 · 「📄 만들기 · 분석지 · 공영2 2과 · 10월 13일 · D-3」 */
export const todoLine = (t, today) => ({ id: t.id, text: `${kindName(t.kind)} · ${t.title}`, small: t.due_on ? `${monthDay(t.due_on)}${t.state === "done" ? " · 완료" : ` · ${overdueText(t.due_on, today) || ddayText(today, t.due_on)}`}` : t.state === "done" ? "완료" : "마감 없음", done: t.state === "done", why: t.why ?? "" });
export { md };
/** 처음-8 학교 교과서 — 회차의 학교·학년·연도(영어 시험일의 해, 없으면 오늘의 해)로 찾는다. 없으면 「아직 안 적었습니다」 */
export const examYear = (exam, today) => Number(String(exam?.english_on ?? exam?.term_from ?? today ?? "").slice(0, 4)) || null;
export function schoolBooksOf(list = [], exam, today) {
  const y = examYear(exam, today); if (!exam?.school_id || !exam?.grade || !y) return { rows: [], text: "", year: y, applicable: false };
  const rows = (list ?? []).filter((r) => r.school_id === exam.school_id && Number(r.grade) === Number(exam.grade) && Number(r.year) === y).map((r) => ({ id: r.id, bookId: r.book_id, name: r.books?.name ?? "(교재)" }));
  return { rows, year: y, applicable: true, text: rows.length ? `학교 교과서 ${y}: ${rows.map((r) => r.name).join(" · ")}` : `학교 교과서를 아직 안 적었습니다(${y} · ${exam.grade}학년)` };
}

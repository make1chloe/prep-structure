/** 대시보드(목업 17) 한 벌 — 층: 로그인 확인 → 오늘 → 반·아이(∥ 예정) → 나머지 한 파도 → 그리기 = 5단, 조회 19(로그인 1 · 오늘 1 · 반·아이 4 · 파도 13) ≤ 20(속도-상한 대시보드 — 첫 판이 21 이라 닫힌 판 수는 dash_ops 에, 루틴 두 표는 routine_areas 하나로 접었다). 판단은 lib/dash-plan.js(순수). 화면(app/page.js)은 가져다 그린다 */
import { db } from "./supabase.js";
import { rosterPeople } from "./day.js";
import { booksOf } from "./routine.js";
import { warnStates } from "./warn.js";
import { undecided } from "./perm.js";
import { seoulHour } from "./day-plan.js";
import { bookGaps, gapText, areaCount, gapSummary, examLines, ccText, queueText } from "./dash-plan.js";
const rows = (r, what) => { if (r?.error) throw new Error(`${what}을 못 읽음: ${r.error.message}`); return r?.data ?? []; };
export async function dashboard(sb, date, { principal = false } = {}) {
  const p = await rosterPeople(sb, date);   // 오늘 도는 반과 아이(결석 예정·보강 포함) — 한 파도
  const ids = p.studentIds;
  const [books, routines, todo, late, warns, unitTodo, retests, opsR, makeupTodo, exams, requests, inquiries, access] = await Promise.all([   // 13 + 위 4 + 오늘 1 + 로그인 1 = 19 ≤ 20
    booksOf(sb, ids, date),
    db(sb).rpc("routine_areas", { p_students: ids }),
    ids.length ? db(sb).rpc("todo_counts", { p_students: ids, p_on: date }) : { data: [] },
    db(sb).from("late_stay").select("id,until_at,sent_at,day_sheet!inner(date,student_id,students(name))").eq("day_sheet.date", date),
    warnStates(sb, ids, date),
    db(sb).from("unit_test").select("id,q_count,assigned_on,students(name),grammar_topics(name)").eq("state", "todo").order("assigned_on"),
    db(sb).from("quiz").select("id,kind,total,students(name)").eq("state", "planned").not("retry_of", "is", null),
    db(sb).rpc("dash_ops", { p_on: date }),
    db(sb).from("makeup").select("id,of_date,students(name)").eq("state", "todo").order("of_date"),
    db(sb).from("exams").select("id,name,scope,state,school_id,english_on,term_from,schools(name)").eq("state", "active").eq("scope", "school").or(`english_on.gte.${date},term_from.gte.${date}`),
    db(sb).from("request").select("id,kind,body,at,students(name)").eq("state", "open").order("at", { ascending: false }).limit(5),
    db(sb).from("inquiry").select("id,name,created_at").eq("stage", "new").order("created_at", { ascending: false }).limit(5),
    principal ? db(sb).from("role_access").select("role,key,allowed") : { data: null },
  ]);
  const students = p.classes.flatMap((c) => c.students);
  const nameOf = (id) => students.find((s) => s.id === id)?.name ?? "";
  const classOf = (id) => p.classes.find((c) => c.students.some((s) => s.id === id));
  const gaps = bookGaps({ books, routines: rows(routines, "루틴 있는 영역"), todo: rows(todo, "안 한 소단원 수"), date });
  const ops = (Array.isArray(opsR?.data) ? opsR.data[0] : opsR?.data) ?? null;
  if (opsR?.error) throw new Error(`안 돌고 있는 것을 못 읽음: ${opsR.error.message}`);
  return {
    date, people: p,
    gaps: gaps.map((g) => { const c = classOf(g.student_id), st = students.find((s) => s.id === g.student_id); return { ...g, name: nameOf(g.student_id), at: c?.start ?? "", absent: Boolean(st?.plan?.absent), text: gapText(g), areaBooks: areaCount(g, books) }; }),
    summary: gapSummary(gaps, ids),
    late: rows(late, "늦귀가").filter((l) => l.until_at).map((l) => ({ id: l.id, name: l.day_sheet?.students?.name ?? "", sent: Boolean(l.sent_at), until: String(l.until_at).slice(0, 5) })),
    reflect: warns.filter((w) => w.due || w.today_disposal).map((w) => ({ student_id: w.student_id, name: nameOf(w.student_id), count: w.count, disposal: w.today_disposal })),
    sheets: { total: p.students, closed: ops?.closed_today ?? 0 },
    unitTodo: rows(unitTodo, "단원평가").map((u) => ({ id: u.id, name: u.students?.name ?? "", topic: u.grammar_topics?.name ?? "", n: u.q_count, on: u.assigned_on })),
    retests: rows(retests, "재시험").map((q) => ({ id: q.id, name: q.students?.name ?? "", kind: q.kind, total: q.total })),
    ops: { queue: queueText(ops, date, seoulHour()), cc: ccText(ops?.cc_last_at, date) },
    makeupTodo: rows(makeupTodo, "보강").map((m) => ({ id: m.id, name: m.students?.name ?? "", of_date: m.of_date })),
    exams: examLines({ exams: rows(exams, "시험"), schools: students.map((s) => (s.schools ? { id: s.school_id, name: s.schools.name } : null)), today: date }),
    requests: rows(requests, "남기실 말").map((r) => ({ id: r.id, name: r.students?.name ?? "", kind: r.kind, body: r.body ?? "", at: r.at })),
    inquiries: rows(inquiries, "신규 문의").map((i) => ({ id: i.id, name: i.name ?? "", at: i.created_at })),
    undecided: access?.data ? undecided(access.data) : null,
  };
}

/** 달력(목업 09b) 한 벌 — 층: 로그인 확인 → 오늘 → 학생 줄(아이는 제 것 · 학부모는 고른 아이) → 한 파도 11 조회 → 그리기(4단). 자격대로 RLS(아이는 제 판 · 학부모는 마감한 판만). 앞날은 다음 달까지 · 지난 것은 재원 기간만(확정-⑯). 판단은 lib/cal-plan.js(순수) */
import { db } from "./supabase.js";
import { monthRange, dayMarks, dayDetail, isExamDay, nextYm, monthLabel, ymOf } from "./cal-plan.js";
import { rows } from "./sqlError.js";
import { accessQuery } from "./access.js";
export async function calendar(sb, st, ym, date, today, role = "student") {
  const id = st.id, { from, to, grid } = monthRange(ym);
  const [days, abs, lates, arrival, sheets, quizzes, exams, holidays, access, dues, member] = await Promise.all([
    db(sb).rpc("student_days", { p_student: id, p_from: from, p_to: to }),
    db(sb).from("makeup").select("id,of_date,on_date,at_time,state,reason,notified_at").eq("student_id", id).gte("of_date", from).lte("of_date", to),
    db(sb).from("late_plan").select("id,date,minutes,reason,cancelled_at").eq("student_id", id).is("cancelled_at", null).gte("date", from).lte("date", to),
    db(sb).from("arrival").select("date,step,at").eq("student_id", id).gte("date", from).lte("date", to),
    db(sb).from("day_sheet").select("id,date,attend,closed_at,comment,day_item(id,slot,off,range_note,learn_items(name)),late_stay(until_at,reason)").eq("student_id", id).gte("date", from).lte("date", to).order("date"),
    db(sb).from("quiz").select("id,kind,total,wrong,taken_on,passed,pct").eq("student_id", id).gte("taken_on", from).lte("taken_on", to),
    st.school_id ? db(sb).from("exams").select("id,name,english_on,term_from,school_id,schools(name)").eq("state", "active").eq("scope", "school").eq("school_id", st.school_id) : { data: [] },
    db(sb).from("holiday").select("date,class_id,reason").gte("date", from).lte("date", to),
    accessQuery(sb, role),   // 카드를 켰나 — 읽는 자리는 lib/access.js 한 곳(원칙-1)
    db(sb).from("material_give").select("material_id,due_on,stage,material(title)").eq("student_id", id).gte("due_on", from).lte("due_on", to),   // 🚩 내가 정한 마감
    db(sb).from("class_member").select("from_date").eq("student_id", id).order("from_date").limit(1),   // 재원 시작 — 지난 것은 재원 기간만(확정-⑯)
  ]);
  const shaped = rows(sheets, "판").map((s) => { const home = (s.day_item ?? []).filter((i) => i.slot === "home" && !i.off); return { ...s, home_count: home.length, home_names: home.map((i) => i.learn_items?.name ?? i.range_note ?? "").filter(Boolean), late: (s.late_stay ?? [])[0] ?? null }; });
  const ctx = { days: rows(days, "수업일"), absences: rows(abs, "결석"), lates: rows(lates, "지각 예정"), arrival: rows(arrival, "등원"), quizzes: rows(quizzes, "시험"), exams: rows(exams, "학교 시험"), holidays: rows(holidays, "휴강"), dues: rows(dues, "내가 정한 마감"), today };
  const sheetOf = (d) => shaped.find((s) => s.date === d) ?? null;
  const minYm = ymOf(rows(member, "재원")[0]?.from_date ?? today), maxYm = nextYm(ymOf(today), 1);
  return {
    student: st, ym, label: monthLabel(ym), prev: nextYm(ym, -1), next: nextYm(ym, 1), canPrev: ym > minYm, canNext: ym < maxYm, date, access: rows(access, "권한"),
    cells: grid.map((g) => ({ ...g, marks: dayMarks(g.date, { ...ctx, sheet: sheetOf(g.date) }), exam: isExamDay(g.date, ctx.exams), today: g.date === today, sel: g.date === date, fut: g.date > today })),
    detail: dayDetail(date, { ...ctx, sheet: sheetOf(date) }),
  };
}

/** 달력(목업 09b) 한 벌 — 층: 로그인 확인 → 오늘 → 제 학생 줄 → 한 파도 10 조회 → 그리기(4단). 아이 자격 RLS 로 제 것만(학부모는 09 에서 같은 함수를 부모 자격으로). 판단은 lib/cal-plan.js(순수) */
import { db } from "./supabase.js";
import { myStudent } from "./arrival.js";
import { monthRange, dayMarks, dayDetail, isExamDay, nextYm, monthLabel } from "./cal-plan.js";
const rows = (r, what) => { if (r?.error) throw new Error(`${what}을 못 읽음: ${r.error.message}`); return r?.data ?? []; };
export async function calendar(sb, user, ym, date, today) {
  const st = await myStudent(sb, user.id);
  const id = st.id, { from, to, grid } = monthRange(ym);
  const [days, abs, lates, arrival, sheets, quizzes, exams, holidays, access, dues] = await Promise.all([
    db(sb).rpc("student_days", { p_student: id, p_from: from, p_to: to }),
    db(sb).from("makeup").select("id,of_date,on_date,at_time,state,reason,notified_at").eq("student_id", id).gte("of_date", from).lte("of_date", to),
    db(sb).from("late_plan").select("id,date,minutes,reason,cancelled_at").eq("student_id", id).is("cancelled_at", null).gte("date", from).lte("date", to),
    db(sb).from("arrival").select("date,step,at").eq("student_id", id).gte("date", from).lte("date", to),
    db(sb).from("day_sheet").select("id,date,attend,closed_at,comment,day_item(id,slot,off,range_note,learn_items(name)),late_stay(until_at,reason)").eq("student_id", id).gte("date", from).lte("date", to).order("date"),
    db(sb).from("quiz").select("id,kind,total,wrong,taken_on,passed,pct").eq("student_id", id).gte("taken_on", from).lte("taken_on", to),
    st.school_id ? db(sb).from("exams").select("id,name,english_on,term_from,school_id,schools(name)").eq("state", "active").eq("scope", "school").eq("school_id", st.school_id) : { data: [] },
    db(sb).from("holiday").select("date,class_id,reason").gte("date", from).lte("date", to),
    db(sb).from("role_access").select("role,key,allowed").eq("role", "student"),   // 카드를 켰나(me.today) — 화면이 표를 직접 안 읽게 여기서
    db(sb).from("material_give").select("material_id,due_on,stage,material(title)").eq("student_id", id).gte("due_on", from).lte("due_on", to),   // 🚩 내가 정한 마감
  ]);
  const shaped = rows(sheets, "판").map((s) => { const home = (s.day_item ?? []).filter((i) => i.slot === "home" && !i.off); return { ...s, home_count: home.length, home_names: home.map((i) => i.learn_items?.name ?? i.range_note ?? "").filter(Boolean), late: (s.late_stay ?? [])[0] ?? null }; });
  const ctx = { days: rows(days, "수업일"), absences: rows(abs, "결석"), lates: rows(lates, "지각 예정"), arrival: rows(arrival, "등원"), quizzes: rows(quizzes, "시험"), exams: rows(exams, "학교 시험"), holidays: rows(holidays, "휴강"), dues: rows(dues, "내가 정한 마감"), today };
  const sheetOf = (d) => shaped.find((s) => s.date === d) ?? null;
  return {
    student: st, ym, label: monthLabel(ym), prev: nextYm(ym, -1), next: nextYm(ym, 1), date, access: rows(access, "권한"),
    cells: grid.map((g) => ({ ...g, marks: dayMarks(g.date, { ...ctx, sheet: sheetOf(g.date) }), exam: isExamDay(g.date, ctx.exams), today: g.date === today, sel: g.date === date, fut: g.date > today })),
    detail: dayDetail(date, { ...ctx, sheet: sheetOf(date) }),
  };
}

/** 학부모 화면 09 한 벌 — 층: 로그인 확인 → 오늘 → 내 아이들(형제) → 고른 아이의 한 파도 → 그리기(4단). 전부 학부모 자격 RLS(마감한 판만 — 사고 #7 · 0084). 판단은 lib/parent-plan.js(순수) */
import { db } from "./supabase.js";
import { SHEET_SEL, shape } from "./day.js";
import { quizzesOf, splitQuizzes } from "./quiz.js";
import { futureLines } from "./arrival-plan.js";
import { sheetTags, todayLate, sentLines, todayArrival, nextQuizLines } from "./parent-plan.js";
import { SCORE_SEL, scoreLines } from "./me.js";   // 📈 성적 한 줄은 아이 화면과 같은 한 벌(원칙-1)
const rows = (r, what) => { if (r?.error) throw new Error(`${what}을 못 읽음: ${r.error.message}`); return r?.data ?? []; };
/** 내 아이들 — 접근 규칙(own_student_read)이 학부모의 아이만 준다 */
export async function myChildren(sb) {
  const { data, error } = await db(sb).from("students").select("id,name,grade,school_id,schools(name,level)").eq("state", "active").order("name");
  if (error) throw new Error(`내 아이를 못 읽음: ${error.message}`);
  return data ?? [];
}
export async function parentDay(sb, user, student, date) {
  const id = student.id;
  const [fam, arrival, lastR, todayR, abs, late, memos, asks, access, days, scoresR] = await Promise.all([
    db(sb).rpc("late_for_family"),
    db(sb).from("arrival").select("id,step,at").eq("student_id", id).eq("date", date),
    db(sb).from("day_sheet").select(SHEET_SEL).eq("student_id", id).not("closed_at", "is", null).lte("date", date).order("date", { ascending: false }).limit(1),   // 마감한 최근 판(학부모는 마감한 것만 보인다)
    db(sb).from("day_sheet").select("id,date,attend,closed_at").eq("student_id", id).eq("date", date).limit(1),   // 오늘 판 — 마감 전엔 RLS 가 안 준다(그것이 맞다)
    db(sb).from("makeup").select("id,of_date,on_date,at_time,state,reason").eq("student_id", id).gte("of_date", date).neq("state", "cancelled").order("of_date"),
    db(sb).from("late_plan").select("id,date,minutes,cancelled_at").eq("student_id", id).gte("date", date).is("cancelled_at", null).order("date"),
    db(sb).rpc("last_area_memos", { p_student: id }),
    db(sb).from("request").select("id,kind,body,at,answer,answered_at,state").eq("by_profile", user.id).eq("student_id", id).order("at", { ascending: false }).limit(5),
    db(sb).from("role_access").select("role,key,allowed").eq("role", "parent"),
    db(sb).rpc("student_days", { p_student: id, p_from: date, p_to: date }),
    db(sb).from("score").select(SCORE_SEL).eq("student_id", id).eq("confirmed", true).order("taken_on", { ascending: false }).limit(12),   // 📈 성적 — 원장님이 확인하고 공개한 것만(RLS 가 show_to 를 본다)
  ]);
  const famRows = rows(fam, "늦귀가 안내").filter((x) => x.student_id === id);
  const last = shape(rows(lastR, "최근 판")[0] ?? null);
  const quizzes = last ? await quizzesOf(sb, [id], last.date) : [];   // 그날 본 시험 + 다음 시간 시험 — 최근 판이 있을 때만(층 하나 더, 있을 때만)
  const split = splitQuizzes(quizzes, last?.date ?? date);
  return {
    student, date, todayClass: rows(days, "오늘").some((d) => d.kind === "class" || d.kind === "makeup"),
    late: todayLate(famRows, date), sent: sentLines(famRows, date),
    arrival: todayArrival(rows(arrival, "등원"), rows(todayR, "오늘 판")[0] ?? null),
    last, tags: last ? sheetTags(last, quizzes) : [],
    nextQuizzes: nextQuizLines(split.next),
    future: futureLines({ absences: rows(abs, "결석 예정"), lates: rows(late, "지각 예정"), today: date }),
    memos: rows(memos, "선생님 한 마디"), asks: rows(asks, "남기실 말"), access: rows(access, "권한"),
    scores: scoreLines(rows(scoresR, "성적")),
  };
}

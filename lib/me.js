/** 아이 화면 07(「나」) 한 벌 — 층: 로그인 확인 → 오늘 → 제 학생 줄 → 나머지 한 파도 → 그리기(4단, 조회 18). 전부 아이 자격(RLS 가 제 것만 준다 — 0084 sheet_visible_to: 제 판은 날이 오면 마감 전에도).
 *  판단은 lib/arrival-plan.js(순수) · 판 모양은 lib/day.js shape 한 벌 */
import { db } from "./supabase.js";
import { rosterPeople, SHEET_SEL, shape } from "./day.js";
import { booksOf } from "./routine.js";
import { quizzesOf, splitQuizzes } from "./quiz.js";
import { myStudent } from "./arrival.js";
import { arrivalState, classChoice, futureLines, classSteps } from "./arrival-plan.js";
import { groupGives } from "./material-plan.js";
import { takes } from "./exam-plan.js";
import { scoreLine, examsForEntry } from "./score-plan.js";
import { plusDays } from "./day-plan.js";
import { mineBoard } from "./files.js";
import { myRows as videoRows } from "./video-plan.js";
import { ruleMap } from "./rule.js";
const SCORE_SEL = "id,exam_id,raw,full_score,grade,confirmed,show_to,by_who,taken_on,updated_at,score_wrong(q_no),exams(id,name,scope,school_id,grade,term_from,term_to,english_on,cuts,hidden,schools(name,level),exam_question(q_no,kind))";
export { SCORE_SEL };
/** 성적 줄 → 카드 한 줄(회차의 학교급·이름을 붙여) */
export const scoreLines = (list = []) => list.filter((s) => s.exams).map((s) => scoreLine(s, { ...s.exams, level: s.exams?.schools?.level ?? null, school: s.exams?.schools?.name ?? null }));
const rows = (r, what) => { if (r?.error) throw new Error(`${what}을 못 읽음: ${r.error.message}`); return r?.data ?? []; };
export async function meDay(sb, user, date) {
  const st = await myStudent(sb, user.id);
  const id = st.id;
  const lo = plusDays(date, -60);
  const [people, arrival, sheetR, lastR, quizzes, abs, late, books, todo, memos, days, access, gives, asks, scoresR, examsR, rules, mine] = await Promise.all([
    rosterPeople(sb, date),   // 오늘 내 반(RLS 로 제 것만) ∥ 예정
    db(sb).from("arrival").select("id,step,at").eq("student_id", id).eq("date", date).order("step"),
    db(sb).from("day_sheet").select(SHEET_SEL).eq("student_id", id).eq("date", date).order("created_at").limit(1),
    db(sb).from("day_sheet").select("id,date,closed_at,day_item(*,units(id,book_id,chapter,label,short,page_start,page_end),learn_items(name))").eq("student_id", id).lt("date", date).order("date", { ascending: false }).limit(1),
    quizzesOf(sb, [id], date),
    db(sb).from("makeup").select("id,of_date,on_date,at_time,state").eq("student_id", id).gte("of_date", date).neq("state", "cancelled").order("of_date"),
    db(sb).from("late_plan").select("id,date,minutes,cancelled_at").eq("student_id", id).gte("date", date).is("cancelled_at", null).order("date"),
    booksOf(sb, [id], date),
    db(sb).rpc("todo_counts", { p_students: [id], p_on: date }),
    db(sb).rpc("last_area_memos", { p_student: id }),
    db(sb).rpc("student_days", { p_student: id, p_from: date, p_to: date }),
    db(sb).from("role_access").select("role,key,allowed").eq("role", "student"),
    db(sb).from("material_give").select("material_id,stage,due_on,handed_at,got_at,material(id,title,state,material_type(name,sort),exams(name))").eq("student_id", id).not("handed_at", "is", null),   // 📚 받을 교재·학습지 — 원장이 나눠 준 것만
    db(sb).from("request").select("id,kind,body,at,answer,answered_at,state").eq("by_profile", user.id).order("at", { ascending: false }).limit(5),   // 💬 내가 남긴 말
    db(sb).from("score").select(SCORE_SEL).eq("student_id", id).order("taken_on", { ascending: false }).limit(12),   // 📈 내 성적 — 공개한 것 + 내가 넣은 것(RLS)
    db(sb).from("exams").select("id,scope,school_id,grade,name,term_from,term_to,english_on,state,hidden,schools(name,level),exam_skip(student_id,skipped)").eq("state", "active").eq("hidden", false).or(`english_on.gte.${lo},term_from.gte.${lo}`).or(`english_on.lte.${date},term_from.lte.${date}`),   // 📈 넣을 회차 — 지난 60일 안에 본 것
    ruleMap(sb, ["file.", "video."]),
    mineBoard(sb, id, lo),   // 📎 내 숙제에 붙은 파일(지난 60일 — 1달 창은 규칙 file.child_days 로 자른다) · 📎 내가 보낸 것(원장님 답) · 🎬 배정 · 지나간 구간 — 한 판(mine_board)
  ]);
  const sheet = shape(rows(sheetR, "오늘 판")[0] ?? null);
  const last = rows(lastR, "지난 판")[0] ?? null;
  const left = new Map(rows(todo, "남은 소단원").map((t) => [t.book_id, t.n]));
  const today = rows(days, "오늘");
  return {
    student: st, date,
    classes: people.classes, choice: classChoice(people.classes), off: today.length > 0 && today.every((d) => d.kind === "off"),
    arrival: arrivalState(rows(arrival, "등원")),
    sheet,
    classSteps: sheet ? classSteps(sheet.class) : [],
    due: sheet ? sheet.check : (last?.day_item ?? []).filter((i) => i.slot === "home" && !i.off).sort((a, b) => a.sort - b.sort),   // 오늘 낼 숙제 — 판이 섰으면 검사 줄, 아직이면 지난 판의 숙제 줄(아침에 집에서 본다)
    dueFrom: sheet ? "check" : last?.date ?? null,
    quizzes: splitQuizzes(quizzes, date),
    future: futureLines({ absences: rows(abs, "결석 예정"), lates: rows(late, "지각 예정"), today: date }),
    books: books.map((b) => ({ ...b, left: left.get(b.book_id) ?? null })),
    memos: rows(memos, "선생님 한 마디"),
    access: rows(access, "권한"),
    gives: groupGives(rows(gives, "받을 학습지")),
    asks: rows(asks, "남긴 말"),
    scores: scoreLines(rows(scoresR, "성적")),
    links: mine.links, rules, uploads: mine.sent,
    videos: videoRows(mine.assigns, mine.progress, Number(rules["video.done_pct"] ?? 95), date),
    entry: examsForEntry(rows(examsR, "회차").filter((e) => takes({ ...st, level: st.schools?.level }, e)), rows(scoresR, "성적"), date).map((e) => ({ id: e.id, name: e.name, school: e.schools?.name ?? "전국", on: e.english_on ?? e.term_from })),
  };
}

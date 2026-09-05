/** 판(v2.day_sheet) 한 벌 — 오늘의 반·학생 읽기, 판 세우기, 마감. 화면은 가져다 쓴다.
 *  층(속도-상한 오늘 4단): ① 오늘 도는 반과 그 아이들(한 조회) → ② 판(항목·늦귀가 붙여서, 한 조회). 판이 있으면 여기서 끝 — 4단 = 로그인 확인 · 오늘 · ① · ②.
 *  판이 없는 아이가 있을 때만(하루 한 번) ③ 세우기 ∥ 지난 숙제 ∥ 검사한 것 → ④ 검사 줄 넣기. 다시 읽지 않고 손에 든 것으로 그린다(요청 메모 때문에 같은 조회를 두 번 하면 첫 답이 온다).
 *  검사 줄이 없는 새 판은 그 자리에서 루틴을 깔고(lib/routine.js) 그 판만 id 로 다시 읽는다 — 조회가 다르니 요청 메모에 안 걸린다.
 *  마감(closed_at)이 곧 학부모에게 보이는 문이다(0016). 마감된 판은 assertOpen 이 막는다(검사-⑤). */
import { db } from "./supabase.js";
import { layRoutine, booksOf } from "./routine.js";
export const ATTEND = Object.freeze([["present", "왔음"], ["late", "지각"], ["absent", "결석"], ["early", "조퇴"], ["online", "온라인"]]);   // 0101 CHECK 와 같은 다섯 (+off 휴강은 사람이 안 고른다)
export const SLOT = Object.freeze({ check: "검사", class: "학원", home: "숙제", next: "예습" });
export async function today(sb) { const { data, error } = await db(sb).rpc("today"); if (error) throw new Error(`오늘을 못 읽음: ${error.message}`); return data; }
/** 서울 날짜 글자 → 요일(0=일). 서버 시계의 시간대에 안 기댄다(0-2) */
export const weekday = (date) => new Date(`${date}T00:00:00+09:00`).getDay();
const between = (date) => `to_date.is.null,to_date.gte.${date}`;

/** 오늘의 반과 아이들(판 없이) — 한 조회: 오늘 요일에 도는 시간표 → 반 → 소속(오늘 살아 있는) → 아이(활동중). 아이가 없는 반도 남긴다(화면이 「오늘 오는 아이가 없습니다」를 말한다) */
export async function rosterPeople(sb, date) {
  const { data: sch, error } = await db(sb).from("class_schedule")
    .select("class_id,start_time,end_time,weekdays,classes!inner(id,kind,nickname,state,class_member(student_id,from_date,to_date,students!inner(id,name,grade,state,school_id)))")
    .lte("from_date", date).or(between(date)).contains("weekdays", [weekday(date)]).eq("classes.state", "active")
    .lte("classes.class_member.from_date", date).or(between(date), { referencedTable: "classes.class_member" }).eq("classes.class_member.students.state", "active")
    .order("start_time");
  if (error) throw new Error(`반과 아이들을 못 읽음: ${error.message}`);
  const seen = new Set(), classes = [];
  for (const s of sch ?? []) {
    if (seen.has(s.class_id)) continue;   // 같은 반에 오늘 시간표가 둘이면 이른 것 하나(start_time 차례)
    seen.add(s.class_id);
    const students = (s.classes.class_member ?? []).map((m) => ({ ...m.students, sheet: null })).sort((a, b) => String(a.name).localeCompare(String(b.name), "ko"));
    classes.push({ id: s.class_id, kind: s.classes.kind, nickname: s.classes.nickname, start: String(s.start_time ?? "").slice(0, 5), end: String(s.end_time ?? "").slice(0, 5), students });
  }
  const studentIds = [...new Set(classes.flatMap((c) => c.students.map((x) => x.id)))];
  return { classes, students: studentIds.length, studentIds };
}
/** 오늘 화면 하나 — 반·아이(①) → 판(②, 없는 것은 세운다) → 아이마다 판을 붙인다 */
export async function roster(sb, date, people = null) {
  const p = people ?? (await rosterPeople(sb, date));
  if (!p.studentIds.length) return p;
  const [{ data: sheets, error }, books] = await Promise.all([
    db(sb).from("day_sheet").select(`*,day_item(*,units(id,book_id,chapter,page_start,page_end,q_count,label,short),learn_items(name)),late_stay(*),sheet_book(*)`).eq("date", date).in("student_id", p.studentIds),
    booksOf(sb, p.studentIds, date),
  ]);
  if (error) throw new Error(`판을 못 읽음: ${error.message}`);
  const all = [...(sheets ?? [])];
  const key = (s) => `${s.student_id}|${s.class_id}`, have = new Set(all.map(key));
  const missing = p.classes.flatMap((c) => c.students.filter((s) => !have.has(`${s.id}|${c.id}`)).map((s) => ({ student_id: s.id, class_id: c.id })));
  if (missing.length) all.push(...(await openSheets(sb, missing, date)));
  const bySheet = new Map(all.map((s) => [key(s), s]));
  return { ...p, classes: p.classes.map((c) => ({ ...c, students: c.students.map((s) => ({ ...s, books: books.filter((b) => b.student_id === s.id), sheet: shape(bySheet.get(`${s.id}|${c.id}`)) })) })) };
}
/** 판을 세운다(여러 아이 한 번에) — 세우기 ∥ 지난 숙제 ∥ 검사한 것, 그리고 검사 줄 넣기. 세운 판을 항목까지 붙여 돌려준다(다시 읽지 않는다) */
async function openSheets(sb, pairs, date) {
  const [homeQ, checkedQ] = unchecked(sb, [...new Set(pairs.map((x) => x.student_id))], date);
  const [made, h, c] = await Promise.all([db(sb).from("day_sheet").insert(pairs.map((x) => ({ student_id: x.student_id, class_id: x.class_id, date }))).select("*"), homeQ, checkedQ]);
  if (made.error) throw new Error(`판을 못 세움: ${made.error.message}`);
  const items = await pullUnchecked(sb, made.data ?? [], h, c);
  // 검사할 지난 숙제가 없는 판은 방아쇠가 없다 — 서는 김에 오늘 학습·숙제를 바로 깐다(확정-⑨ · 「숙제 항목 0 → 검사 없이 학습으로」)
  const fresh = (made.data ?? []).filter((s) => !items.some((i) => i.sheet_id === s.id));
  await Promise.all(fresh.map((s) => layRoutine(sb, s.id)));
  if (!fresh.length) return (made.data ?? []).map((s) => ({ ...s, day_item: items.filter((i) => i.sheet_id === s.id), late_stay: [], sheet_book: [] }));
  const { data: again, error: e3 } = await db(sb).from("day_sheet").select(`*,day_item(*,units(id,book_id,chapter,page_start,page_end,q_count,label,short),learn_items(name)),late_stay(*),sheet_book(*)`).in("id", (made.data ?? []).map((s) => s.id));
  if (e3) throw new Error(`깐 판을 못 읽음: ${e3.message}`);
  return again ?? [];
}
/** 「아직 검사 안 한 지난 숙제 전부」(30일 안, 원장님 9/3 ②)를 읽는 조회 둘 — 지난 숙제 · 이미 검사 줄로 끌어온 것 */
function unchecked(sb, ids, date) {
  const since = new Date(`${date}T00:00:00+09:00`); since.setDate(since.getDate() - 30);
  const from = since.toISOString().slice(0, 10);
  return [
    db(sb).from("day_item").select("id,range_note,memo,unit_id,item_id,day_sheet!inner(student_id,date)").eq("slot", "home").in("day_sheet.student_id", ids).gte("day_sheet.date", from).lt("day_sheet.date", date),
    db(sb).from("day_item").select("carry_of,day_sheet!inner(student_id)").eq("slot", "check").in("day_sheet.student_id", ids).not("carry_of", "is", null),
  ];
}
/** 지난 숙제를 새 판의 검사 줄로 넣는다 — 조각이 원본을 가리킨다(확정-⑳). 넣은 줄을 돌려준다 */
async function pullUnchecked(sb, sheets, h, c) {
  if (h.error) throw new Error(`지난 숙제를 못 읽음: ${h.error.message}`);   // 조용히 0줄로 두지 않는다 — 검사 줄이 비면 원장님이 없는 숙제를 본다
  if (c.error) throw new Error(`검사한 것을 못 읽음: ${c.error.message}`);
  const done = new Set((c.data ?? []).map((x) => x.carry_of));
  const sheetOf = new Map(sheets.map((s) => [s.student_id, s.id]));
  const rows = (h.data ?? []).filter((x) => !done.has(x.id) && sheetOf.has(x.day_sheet.student_id)).map((x, i) => ({ sheet_id: sheetOf.get(x.day_sheet.student_id), slot: "check", carry_of: x.id, range_note: x.range_note, memo: x.memo, unit_id: x.unit_id, item_id: x.item_id, sort: i }));
  if (!rows.length) return [];
  const { data, error } = await db(sb).from("day_item").insert(rows).select("*");
  if (error) throw new Error(`검사 줄을 못 끌어옴: ${error.message}`);
  return data ?? [];
}
function shape(sheet) {
  if (!sheet) return null;
  const items = (sheet.day_item ?? []).sort((a, b) => a.sort - b.sort || String(a.created_at).localeCompare(String(b.created_at)));
  const by = (slot) => items.filter((i) => i.slot === slot && !i.off);   // 뺀 줄(off)은 오늘 분량에 안 든다(검사-⑩)
  return { ...sheet, items, check: by("check"), class: by("class"), home: by("home"), off: items.filter((i) => i.off), books: sheet.sheet_book ?? [], late: (sheet.late_stay ?? [])[0] ?? null, tests: [], closed: Boolean(sheet.closed_at) };   // 단어시험(word_test)은 판이 아니라 학생·날짜에 붙는다(0044 뒤) — 시험 카드를 지을 때 따로 읽는다
}

/** 판 하나를 세운다(있으면 그대로) — 화면의 손(출결)이 판 없는 줄에서 부른다. 세우는 길은 openSheets 하나 */
export async function ensureSheet(sb, studentId, classId, date) {
  const { data: s } = await db(sb).from("day_sheet").select("id,closed_at").eq("student_id", studentId).eq("class_id", classId).eq("date", date).maybeSingle();
  if (s) return s;
  const [made] = await openSheets(sb, [{ student_id: studentId, class_id: classId }], date);
  return { id: made.id, closed_at: made.closed_at };
}
/** 마감된 판은 고칠 수 없다(검사-⑤) — 쓰는 손마다 먼저 부른다 */
export async function assertOpen(sb, sheetId) {
  const { data } = await db(sb).from("day_sheet").select("closed_at").eq("id", sheetId).maybeSingle();
  if (!data) throw new Error("판이 없습니다");
  if (data.closed_at) throw new Error("마감된 판입니다 — 고칠 수 없습니다");
}
export async function saveComment(sb, sheetId, comment) { await assertOpen(sb, sheetId); const { error } = await db(sb).from("day_sheet").update({ comment }).eq("id", sheetId); if (error) throw new Error(`글을 못 저장함: ${error.message}`); }
/** 마감 — 글을 저장하고 닫는다. 서버 답을 기다린다(속도-5: 되돌릴 수 없는 것은 낙관하지 않는다) */
export async function closeSheet(sb, sheetId, comment, by) {
  await assertOpen(sb, sheetId);
  const { error } = await db(sb).from("day_sheet").update({ comment, closed_at: new Date().toISOString(), closed_by: by }).eq("id", sheetId);
  if (error) throw new Error(`마감 못 함: ${error.message}`);
}

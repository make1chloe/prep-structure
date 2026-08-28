"use server";

import { createClient } from "@/lib/supabase/server";
import { isNoCheck } from "@/app/homework/categories";
import { addDays, todaySeoul } from "@/lib/day";
import { buildCheckSource, makeDayCheck } from "@/lib/dayCheck";
import { fetchAll } from "@/lib/fetchAll";
import { inUseOn } from "@/lib/bookUse";

/**
 * **한 학생·한 날의 검사 판 재료** — 대시보드 「검사 안 한 숙제」 칩이
 * 원판(app/check/CheckBoard)을 **그대로 띄우기 위해** 부른다.
 *
 * ── 왜 이게 필요했나 (원장님 2026-08-28) ─────────────────
 * 「첫 번째 꺼 왜 모달 안 붙어?」
 *
 * 앞서 이 칩만 팝오버가 아니라 화면 이동(`/today?d=…&open=…`)이었다.
 * 「판이 커서 안 맞는다」는 판정을 원장님이 받지 않으셨다.
 *
 * ── 판단은 하나도 새로 안 만든다 ─────────────────────
 *
 * 「무엇이 검사할 것인가」는 lib/dayCheck 한 벌이다 — 오늘 수업(/today)과
 * 검사 화면(/check)이 이미 같이 타는 그 판정을 **세 번째로 베끼지 않고
 * 그대로 부른다.** 「검사 안 하는 항목」도 categories 의 isNoCheck 한 곳.
 * 여기가 하는 일은 **조회를 한 학생으로 좁히는 것뿐**이다.
 *
 * 돌려주는 줄의 모양은 app/check/page.jsx 의 rows 와 같다 — CheckBoard 가
 * 그 모양을 먹기 때문이다.
 */
export async function checkRowFor(studentId, date) {
  if (!studentId || !date) return { row: null, items: [] };
  const supabase = await createClient();

  // 파도 (원칙 6-1) — 서로 필요한 것이 없다
  const [stQ, itemQ, repQ, prevQ0, subQ, memberQ, classQ] = await Promise.all([
    supabase.from("students").select("id, name, school, grade").eq("id", studentId).maybeSingle(),
    supabase
      .from("homework_items")
      .select("id, name, sort, in_person, unit_test, category, tool")
      .eq("active", true)
      .order("sort", { ascending: true }),
    supabase.from("daily_reports").select("id, student_id, report_written").eq("date", date).eq("student_id", studentId),
    supabase.rpc("prev_reports_of", { d: date }),
    fetchAll(() =>
      supabase
        .from("homework_submissions")
        .select("id, student_id, kind, path, body, seconds, checked_at, created_at, homework_item_id")
        .eq("student_id", studentId)
        .gte("date", addDays(date, -21))
        .lte("date", date)
        .order("created_at", { ascending: false })),
    supabase.from("class_students").select("class_id, student_id").eq("student_id", studentId),
    supabase.from("classes").select("id, name"),
  ]);

  const student = stQ.data;
  if (!student) return { row: null, items: [] };

  // 0116(tool)·0106(unit_test)·0063(in_person) 전 DB — 한 칸씩 물러난다
  let itemList = itemQ.error ? null : itemQ.data;
  if (!itemList) {
    const { data } = await supabase
      .from("homework_items").select("id, name, sort, category")
      .eq("active", true).order("sort", { ascending: true });
    itemList = data || [];
  }
  const inPerson = new Set(itemList.filter((i) => i.in_person).map((i) => i.id));
  const unitTest = new Set(itemList.filter(isNoCheck).map((i) => i.id));

  // 지난 판 — 검사할 것이 여기 있다 (판정은 lib/dayCheck 한 벌)
  let prevReports = prevQ0.error ? null : prevQ0.data;
  if (!prevReports) {
    const { data } = await supabase
      .from("daily_reports").select("id, student_id, date")
      .eq("student_id", studentId)
      .gte("date", addDays(date, -21)).lt("date", date)
      .order("date", { ascending: false });
    prevReports = data || [];
  }
  prevReports = (prevReports || []).filter((r) => r.student_id === studentId);
  const prevIds = prevReports.map((r) => r.id);
  const { data: prevItems } = prevIds.length
    ? await supabase
        .from("daily_report_items")
        /**
         * **`note` 는 없는 칸이다** (2026-08-28 실사고). daily_report_items 에
         * 있는 것은 `range_note`(0008)·`check_note`(0062) 둘뿐이다. 없는 칸을
         * 고르면 PostgREST 가 42703 을 돌려주고, 이 자리는 오류를 안 보고
         * `[]` 로 넘어가서 **대시보드 「검사 안 한 숙제」 팝오버가 항목을
         * 하나도 못 봤다** — 오류도 없이 빈 판이 떴다.
         */
        .select("daily_report_id, homework_item_id, status, check_note, student_done_at")
        .in("daily_report_id", prevIds)
    : { data: [] };

  const src = buildCheckSource({
    prevReports,
    prevAssignedRows: (prevItems || []).filter((i) => i.status === "assigned"),
    prevAllRows: prevItems || [],
  });
  const { toCheckOf, assignedSinceOf, assignedOnOf, assignedNoteOf } = makeDayCheck(src, unitTest);

  // 오늘 판에 이미 찍힌 것 (○△✕ · 검사 메모 · 아이가 낸 시각)
  const rep = (repQ.data || [])[0] || null;
  const { data: mine } = rep
    ? await supabase
        .from("daily_report_items")
        .select("homework_item_id, status, check_note, student_done_at")
        .eq("daily_report_id", rep.id)
    : { data: [] };
  const marks = {};
  const notes = {};
  const doneAt = {};
  (mine || []).forEach((i) => {
    if (["done", "weak", "missing"].includes(i.status)) {
      marks[i.homework_item_id] = i.status;
      if (i.check_note) notes[i.homework_item_id] = i.check_note;
    }
    if (i.student_done_at) doneAt[i.homework_item_id] = i.student_done_at;
  });

  const subs = subQ.error ? [] : subQ.data || [];
  const myClassIds = new Set((memberQ.data || []).map((m) => m.class_id));
  const klass = (classQ.data || []).find((c) => myClassIds.has(c.id)) || null;

  const row = {
    student,
    klass,
    hasReport: !!rep,
    marks,
    notes,
    doneAt,
    assignedOn: assignedSinceOf(studentId),
    toCheck: toCheckOf(studentId).map((iid) => ({
      id: iid,
      range: assignedNoteOf(studentId, iid),
      on: assignedOnOf(studentId, iid),
      inPerson: inPerson.has(iid),
      noSub: !inPerson.has(iid) && !subs.some((x) => x.homework_item_id === iid),
    })),
    subs,
  };
  return { row, items: itemList };
}

/**
 * **한 학생의 「미리 내기」 재료** — 대시보드 「숙제 배정 안 됨」 칩이
 * 원판(app/check/AheadBoard)을 그대로 띄우기 위해 부른다.
 *
 * 원장님 (2026-08-28): 「최초 숙제배정 어디서 해야 해?」 — 배정하는 자리를
 * 못 찾고 계셨다. 그러니 알리는 데서 끝내지 않고 **그 자리에 배정 판**을 연다.
 *
 * 학생 줄의 모양은 app/check/page.jsx 의 aheadStudents 와 같다 —
 * AheadBoard 가 그 모양을 먹는다. 새 판단은 없다.
 */
export async function aheadOneStudent(studentId) {
  if (!studentId) return { students: [], items: [], textbooks: [] };
  const supabase = await createClient();

  const [stQ, memberQ, classQ, itemQ, bookQ, myBookQ] = await Promise.all([
    supabase.from("students").select("id, name, school, grade").eq("id", studentId).maybeSingle(),
    supabase.from("class_students").select("class_id, student_id").eq("student_id", studentId),
    supabase.from("classes").select("id, name, days"),
    supabase
      .from("homework_items")
      .select("id, name, sort, in_person, unit_test, category, tool")
      .eq("active", true)
      .order("sort", { ascending: true }),
    supabase.from("textbooks").select("id, name, area, status").order("name", { ascending: true }),
    supabase.from("student_textbooks").select("textbook_id, status, assigned_on, ended_on").eq("student_id", studentId),
  ]);

  const student = stQ.data;
  if (!student) return { students: [], items: [], textbooks: [] };

  // 0116(tool) 전 DB — 한 칸 물러난다
  let itemList = itemQ.error ? null : itemQ.data;
  if (!itemList) {
    const { data } = await supabase
      .from("homework_items").select("id, name, sort, category")
      .eq("active", true).order("sort", { ascending: true });
    itemList = data || [];
  }

  const cids = (memberQ.data || []).map((m) => m.class_id);
  const daysOf = new Map((classQ.data || []).map((c) => [c.id, c.days || []]));
  const today = todaySeoul();
  const bookIds = (myBookQ.data || []).filter((r) => inUseOn(r, today)).map((r) => r.textbook_id);

  return {
    students: [{
      id: student.id, name: student.name, school: student.school, grade: student.grade,
      classIds: cids,
      days: [...new Set(cids.flatMap((cid) => daysOf.get(cid) || []))],
      bookIds,
    }],
    items: itemList,
    textbooks: (bookQ.data || [])
      .filter((b) => !b.status || b.status === "active")
      .map((b) => ({ id: b.id, name: b.name, area: b.area || "" })),
  };
}

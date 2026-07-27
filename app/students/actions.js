"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { baseLoginId, resolveLoginId } from "@/lib/studentId";

function clean(formData, key) {
  const v = (formData.get(key) || "").toString().trim();
  return v || null;
}

export async function addStudent(formData) {
  const name = (formData.get("name") || "").toString().trim();
  if (!name) return;

  const row = {
    name,
    school: clean(formData, "school"),
    grade: clean(formData, "grade"),
    birth_year: clean(formData, "birth_year"),
    gender: clean(formData, "gender"),
    student_phone: clean(formData, "student_phone"),
    parent_phone: clean(formData, "parent_phone"),
    status: clean(formData, "status") || "enrolled",
    enrolled_on: clean(formData, "enrolled_on"),
    electives: clean(formData, "electives"),
    note: clean(formData, "note"),
  };

  const supabase = createClient();
  const base = baseLoginId(row.student_phone, row.parent_phone);

  let candidate = base || null;
  for (let attempt = 0; attempt < 25; attempt++) {
    const { error } = await supabase
      .from("students")
      .insert({ ...row, login_id: candidate });
    if (!error) break;
    if (error.code === "23505" && base) {
      candidate = `${base}-${attempt + 2}`;
      continue;
    }
    break;
  }

  revalidatePath("/students");
}

// 한 명 수정
export async function updateStudent(id, patch) {
  if (!id) return { error: "id 없음" };
  const allow = [
    "name", "school", "grade", "birth_year", "gender",
    "student_phone", "parent_phone", "status", "enrolled_on",
    "electives", "note", "login_id",
  ];
  const row = {};
  allow.forEach((k) => {
    if (k in (patch || {})) {
      const v = patch[k];
      row[k] = typeof v === "string" ? v.trim() || null : v ?? null;
    }
  });
  if (Object.keys(row).length === 0) return { error: null };

  const supabase = createClient();
  const { error } = await supabase.from("students").update(row).eq("id", id);
  revalidatePath("/students");
  return { error: error ? error.message : null };
}

// 선택한 학생 삭제
export async function deleteStudents(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return { error: null };
  const supabase = createClient();
  const { error } = await supabase.from("students").delete().in("id", ids);
  revalidatePath("/students");
  return { error: error ? error.message : null };
}

// 선택한 학생 상태 일괄 변경
export async function updateStudentsStatus(ids, status) {
  if (!Array.isArray(ids) || ids.length === 0 || !status) return { error: null };
  const supabase = createClient();
  const { error } = await supabase.from("students").update({ status }).in("id", ids);
  revalidatePath("/students");
  return { error: error ? error.message : null };
}

// 대량 업로드: 파싱된 행 배열을 한 번에 저장한다.
export async function bulkAddStudents(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { inserted: 0, error: null };
  }

  const supabase = createClient();

  // 기존 로그인 아이디를 한 번만 불러와 배치 내에서 충돌을 피한다
  const { data: existing } = await supabase
    .from("students")
    .select("login_id")
    .not("login_id", "is", null);
  const taken = new Set((existing || []).map((r) => r.login_id));

  const payload = rows
    .filter((r) => (r?.name || "").trim() !== "")
    .map((r) => {
      const student_phone = (r.student_phone || "").trim() || null;
      const parent_phone = (r.parent_phone || "").trim() || null;
      const base = baseLoginId(student_phone, parent_phone);
      let login_id = null;
      if (base) {
        login_id = resolveLoginId(base, taken);
        taken.add(login_id);
      }
      return {
        name: r.name.trim(),
        school: (r.school || "").trim() || null,
        grade: (r.grade || "").trim() || null,
        birth_year: r.birth_year || null,
        gender: r.gender || null,
        student_phone,
        parent_phone,
        status: r.status || "enrolled",
        enrolled_on: r.enrolled_on || null,
        electives: (r.electives || "").trim() || null,
        note: (r.note || "").trim() || null,
        login_id,
      };
    });

  const { error } = await supabase.from("students").insert(payload);
  revalidatePath("/students");

  return {
    inserted: error ? 0 : payload.length,
    error: error ? error.message : null,
  };
}

// ---------- 수정하지 않는 기록 (상담 · 교재 사용) ----------
export async function loadStudentHistory(studentId) {
  if (!studentId) return { books: [], inquiries: [], note: "" };
  const supabase = createClient();

  const cols = "textbook_id, status, assigned_on, ended_on, current_page";
  let { data: st, error } = await supabase
    .from("student_textbooks")
    .select(`${cols}, note, round`)
    .eq("student_id", studentId);
  if (error) {
    ({ data: st, error } = await supabase
      .from("student_textbooks")
      .select(`${cols}, note`)
      .eq("student_id", studentId));
  }
  if (error) {
    ({ data: st } = await supabase
      .from("student_textbooks")
      .select("textbook_id, status")
      .eq("student_id", studentId));
  }

  const ids = (st || []).map((x) => x.textbook_id);
  const { data: books } = ids.length
    ? await supabase.from("textbooks").select("id, name, area, total_pages").in("id", ids)
    : { data: [] };
  const bookById = new Map((books || []).map((b) => [b.id, b]));

  // 단원 진도율
  const { data: units } = ids.length
    ? await supabase
        .from("textbook_units")
        .select("id, textbook_id, parent_id")
        .in("textbook_id", ids)
    : { data: [] };
  const parents = new Set((units || []).map((u) => u.parent_id).filter(Boolean));
  const leafByBook = new Map();
  (units || []).forEach((u) => {
    if (parents.has(u.id)) return;
    if (!leafByBook.has(u.textbook_id)) leafByBook.set(u.textbook_id, []);
    leafByBook.get(u.textbook_id).push(u.id);
  });
  // 진도는 **회독별로 쌓인다.** 2회독을 돌려도 1회독 기록이 남아 있다.
  let prog = [];
  {
    const q = await supabase
      .from("student_unit_progress")
      .select("textbook_unit_id, round, done_on")
      .eq("student_id", studentId);
    if (q.error) {
      const fb = await supabase
        .from("student_unit_progress")
        .select("textbook_unit_id")
        .eq("student_id", studentId);
      prog = (fb.data || []).map((p) => ({ ...p, round: 1, done_on: null }));
    } else {
      prog = q.data || [];
    }
  }
  // unitId → textbookId
  const bookOfUnit = new Map((units || []).map((u) => [u.id, u.textbook_id]));
  // `${textbookId}|${round}` → { done, first, last }
  const byRound = new Map();
  prog.forEach((p) => {
    const tid = bookOfUnit.get(p.textbook_unit_id);
    if (!tid) return;
    const key = `${tid}|${p.round || 1}`;
    const cur = byRound.get(key) || { done: 0, first: null, last: null };
    cur.done += 1;
    if (p.done_on) {
      if (!cur.first || p.done_on < cur.first) cur.first = p.done_on;
      if (!cur.last || p.done_on > cur.last) cur.last = p.done_on;
    }
    byRound.set(key, cur);
  });

  const bookRows = (st || [])
    .map((x) => {
      const b = bookById.get(x.textbook_id);
      const leaves = leafByBook.get(x.textbook_id) || [];
      const cur = x.round || 1;

      // 지금 회독을 포함해 지금까지 돈 모든 회독
      const rounds = [];
      for (let r = 1; r <= cur; r += 1) {
        const hit = byRound.get(`${x.textbook_id}|${r}`) || { done: 0, first: null, last: null };
        rounds.push({
          round: r,
          done: hit.done,
          total: leaves.length,
          percent: leaves.length > 0 ? Math.round((hit.done / leaves.length) * 100) : null,
          first: hit.first,
          last: hit.last,
          current: r === cur,
        });
      }
      const now = rounds[rounds.length - 1];
      return {
        textbook_id: x.textbook_id,
        name: b?.name || "교재",
        area: b?.area || "",
        status: x.status || "active",
        assigned_on: x.assigned_on || null,
        ended_on: x.ended_on || null,
        round: cur,
        rounds,
        percent: now?.percent ?? null,
      };
    })
    .sort((a, b) => {
      const rank = (s) => (s === "active" ? 0 : s === "done" ? 1 : 2);
      return rank(a.status) - rank(b.status) || (b.assigned_on || "").localeCompare(a.assigned_on || "");
    });

  const inqQ = await supabase
    .from("inquiries")
    .select("id, status, source, memo, test_result, test_note, created_at")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });

  const { data: s } = await supabase
    .from("students")
    .select("note")
    .eq("id", studentId)
    .maybeSingle();

  // 경고 기록 — 지워지지 않는다. 월간 초기화를 해도 여기에는 남는다.
  const wq = await supabase
    .from("warning_actions")
    .select("id, kind, on_date, target_date, note")
    .eq("student_id", studentId)
    .order("on_date", { ascending: false });

  return {
    books: bookRows,
    warnings: wq.error ? [] : wq.data || [],
    inquiries: inqQ.error ? [] : inqQ.data || [],
    note: s?.note || "",
  };
}

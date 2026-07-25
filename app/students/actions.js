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

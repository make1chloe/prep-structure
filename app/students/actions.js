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

  const school = clean(formData, "school");
  const grade = clean(formData, "grade");
  const birth_year = clean(formData, "birth_year"); // YYYY-MM-DD (date) or null
  const student_phone = clean(formData, "student_phone");
  const parent_phone = clean(formData, "parent_phone");
  const status = clean(formData, "status") || "enrolled";
  const electives = clean(formData, "electives");
  const note = clean(formData, "note");

  const supabase = createClient();

  // 이미 쓰고 있는 로그인 아이디를 모아 충돌을 피한다
  const { data: existing } = await supabase
    .from("students")
    .select("login_id")
    .not("login_id", "is", null);
  const taken = new Set((existing || []).map((r) => r.login_id));
  const login_id = resolveLoginId(baseLoginId(student_phone, parent_phone), taken);

  await supabase.from("students").insert({
    name,
    school,
    grade,
    birth_year,
    student_phone,
    parent_phone,
    status,
    electives,
    note,
    login_id: login_id || null,
  });

  revalidatePath("/students");
}

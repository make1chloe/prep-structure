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

  // 겹칠 수 있는 아이디만 좁게 조회한다 (base 로 시작하는 것만)
  const base = baseLoginId(student_phone, parent_phone);
  let login_id = base;
  if (base) {
    const { data: existing } = await supabase
      .from("students")
      .select("login_id")
      .like("login_id", `${base}%`);
    const taken = new Set((existing || []).map((r) => r.login_id));
    login_id = resolveLoginId(base, taken);
  }

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

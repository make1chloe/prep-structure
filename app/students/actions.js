"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { baseLoginId } from "@/lib/studentId";

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
    birth_year: clean(formData, "birth_year"), // YYYY-MM-DD or null
    student_phone: clean(formData, "student_phone"),
    parent_phone: clean(formData, "parent_phone"),
    status: clean(formData, "status") || "enrolled",
    electives: clean(formData, "electives"),
    note: clean(formData, "note"),
  };

  const supabase = createClient();
  const base = baseLoginId(row.student_phone, row.parent_phone);

  // 로그인 아이디를 붙여 바로 저장(왕복 1번).
  // 뒷자리가 겹쳐 중복(23505)이면 -2, -3 ... 으로만 재시도.
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
    break; // 그 외 에러는 재시도하지 않음
  }

  revalidatePath("/students");
}

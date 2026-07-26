"use server";

import { createClient } from "@/lib/supabase/server";

// 학부모가 로그인 없이 제출하는 양식.
// 전화로 이름만 받아둔 건이 있으면 token 으로 그 건을 채우고, 없으면 새로 접수한다.
export async function submitApply(formData) {
  const name = (formData.get("name") || "").toString().trim();
  const phone = (formData.get("phone") || "").toString().trim();
  if (!name) return { error: "학생 이름을 적어주세요." };
  if (!phone) return { error: "연락처를 적어주세요." };

  const token = (formData.get("token") || "").toString().trim();
  const val = (k) => {
    const v = (formData.get(k) || "").toString().trim();
    return v || null;
  };

  const row = {
    name,
    phone,
    student_phone: val("student_phone"),
    school: val("school"),
    grade: val("grade"),
    source: val("source"),
    prev_academy: val("prev_academy"),
    goal: val("goal"),
    want_days_text: val("want_days_text"),
    want_time: val("want_time"),
    test_want_on: val("test_want_on"),
    test_want_at: val("test_want_at"),
    visit_on: val("visit_on"),
    visit_at: val("visit_at"),
    visit_alt: val("visit_alt"),
    memo: val("memo"),
    form_submitted_at: new Date().toISOString(),
  };

  const supabase = createClient();

  if (token) {
    const { error } = await supabase
      .from("inquiries")
      .update({ ...row, status: "scheduled", updated_at: new Date().toISOString() })
      .eq("token", token);
    if (!error) return { error: null };
    // 링크가 이미 처리됐거나 없으면 새로 접수
  }

  const { error } = await supabase
    .from("inquiries")
    .insert({ ...row, status: "new" });
  if (error) return { error: "접수에 실패했어요. 학원으로 전화 주시면 도와드리겠습니다." };
  return { error: null };
}

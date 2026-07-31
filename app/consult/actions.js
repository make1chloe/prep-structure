"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function ok(error) {
  return { error: error ? error.message : null };
}
function clean(fd, key) {
  const v = (fd.get(key) || "").toString().trim();
  return v || null;
}

// 양식 링크용 토큰
function makeToken() {
  return Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6);
}

// 전화로 받은 건에 양식 링크를 만들어 준다 (엄마가 채워 넣도록)
export async function ensureFormLink(id) {
  if (!id) return { error: "id 없음" };
  const supabase = createClient();
  const { data } = await supabase.from("inquiries").select("token").eq("id", id).maybeSingle();
  if (data?.token) return { error: null, token: data.token };
  const token = makeToken();
  const { error } = await supabase.from("inquiries").update({ token }).eq("id", id);
  if (error) return { error: "0018 SQL을 먼저 실행해주세요." };
  revalidatePath("/consult");
  return { error: null, token };
}

export async function addInquiry(formData) {
  const name = (formData.get("name") || "").toString().trim();
  if (!name) return;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase.from("inquiries").insert({
    name,
    phone: clean(formData, "phone"),
    student_phone: clean(formData, "student_phone"),
    school: clean(formData, "school"),
    grade: clean(formData, "grade"),
    source: clean(formData, "source"),
    want_time: clean(formData, "want_time"),
    consult_on: clean(formData, "consult_on"),
    consult_at: clean(formData, "consult_at"),
    memo: clean(formData, "memo"),
    status: clean(formData, "consult_on") ? "scheduled" : "new",
    created_by: user?.id || null,
  });
  revalidatePath("/consult");
}

export async function updateInquiry(id, patch) {
  if (!id) return { error: "id 없음" };
  const row = { updated_at: new Date().toISOString() };
  [
    "name", "phone", "student_phone", "school", "grade", "source", "status",
    "consult_on", "consult_at", "test_on", "test_at", "test_result", "test_note",
    "want_time", "memo",
  ].forEach((k) => {
    if (k in (patch || {})) row[k] = (patch[k] ?? "").toString().trim() || null;
  });
  if ("class_id" in (patch || {})) row.class_id = patch.class_id || null;

  const supabase = createClient();
  const { error } = await supabase.from("inquiries").update(row).eq("id", id);
  revalidatePath("/consult");
  revalidatePath("/report");
  return ok(error);
}

export async function setInquiryStatus(ids, status) {
  const list = Array.isArray(ids) ? ids : [ids];
  if (list.length === 0 || !status) return { error: null };
  const supabase = createClient();
  const { error } = await supabase
    .from("inquiries")
    .update({ status, updated_at: new Date().toISOString() })
    .in("id", list);
  revalidatePath("/consult");
  return ok(error);
}

export async function deleteInquiries(ids) {
  const list = Array.isArray(ids) ? ids : [ids];
  if (list.length === 0) return { error: null };
  const supabase = createClient();
  const { error } = await supabase.from("inquiries").delete().in("id", list);
  revalidatePath("/consult");
  return ok(error);
}

/**
 * 등록 전환 — 상담 정보를 그대로 학생으로 만든다. (원칙1: 이름·연락처를 다시 안 적는다)
 * 반을 골랐으면 그 반에도 배정하고, 반 교재를 학생에게 깔아준다.
 */
export async function convertToStudent(id, classId) {
  if (!id) return { error: "id 없음" };
  const supabase = createClient();

  const { data: q, error: qErr } = await supabase
    .from("inquiries")
    .select("*")
    .eq("id", id)
    .single();
  if (qErr) return { error: qErr.message };
  if (q.student_id) return { error: "이미 등록된 상담이에요." };

  const { data: student, error: sErr } = await supabase
    .from("students")
    .insert({
      name: q.name,
      school: q.school,
      grade: q.grade,
      parent_phone: q.phone,
      student_phone: q.student_phone,
      note: [q.source && `유입: ${q.source}`, q.memo, q.test_note]
        .filter(Boolean)
        .join("\n"),
      status: "enrolled",
    })
    .select("id")
    .single();
  if (sErr) return { error: sErr.message };

  const cid = classId || q.class_id;
  if (cid) {
    await supabase
      .from("class_students")
      .upsert(
        { class_id: cid, student_id: student.id },
        { onConflict: "class_id,student_id", ignoreDuplicates: true }
      );
    // 교재는 반이 아니라 **학생마다** 붙인다. 재원생 목록에서 그 학생에게 직접 넣는다.
  }

  const { error } = await supabase
    .from("inquiries")
    .update({
      status: "enrolled",
      student_id: student.id,
      class_id: cid || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  revalidatePath("/consult");
  revalidatePath("/students");
  revalidatePath("/classes");
  return { error: error ? error.message : null, studentId: student.id };
}

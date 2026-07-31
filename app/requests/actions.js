"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { addDays, dowOf } from "@/lib/day";

function ok(error) {
  return { error: error ? error.message : null };
}

// 학생·학부모가 직접 넣는 요청 (결석 알림 등)
export async function createRequest(input) {
  const { studentId, kind, fromDate, toDate, body, photos } = input || {};
  if (!studentId) return { error: "학생 정보가 없어요." };
  if (kind === "absence" && !fromDate) return { error: "날짜를 골라주세요." };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const row = {
    student_id: studentId,
    created_by: user?.id || null,
    kind: kind || "absence",
    from_date: fromDate || null,
    to_date: toDate || fromDate || null,
    body: (body || "").trim() || null,
    photos: (photos || []).filter(Boolean),
  };
  let { error } = await supabase.from("requests").insert(row);
  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    // 0068 전이면 사진 없이 — 글이라도 가야 한다
    const { photos: _p, ...noPhotos } = row;
    ({ error } = await supabase.from("requests").insert(noPhotos));
  }
  if (error) return { error: "0019 SQL을 먼저 실행해주세요." };
  revalidatePath("/me");
  revalidatePath("/");
  return { error: null };
}

// 선생님이 확인 — 결석 알림을 받아들이면 그 기간을 결석 예정으로 깐다
export async function handleRequest(id, accept, reply) {
  if (!id) return { error: "id 없음" };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: req, error } = await supabase
    .from("requests")
    .select("id, student_id, kind, from_date, to_date, body")
    .eq("id", id)
    .single();
  if (error) return { error: error.message };

  if (accept && req.kind === "absence" && req.from_date) {
    // 그 학생이 실제로 수업 있는 날만 결석 예정으로
    const { data: members } = await supabase
      .from("class_students")
      .select("class_id")
      .eq("student_id", req.student_id);
    const classIds = (members || []).map((m) => m.class_id);
    const { data: classes } = classIds.length
      ? await supabase.from("classes").select("id, days").in("id", classIds)
      : { data: [] };
    const myDays = new Set((classes || []).flatMap((c) => c.days || []));

    const DOWN = ["일", "월", "화", "수", "목", "금", "토"];
    const rows = [];
    let d = req.from_date;
    const end = req.to_date || req.from_date;
    while (d <= end) {
      if (myDays.has(dowOf(d))) {
        rows.push({
          student_id: req.student_id,
          date: d,
          status: "absent",
          planned: true,
          reason: req.body || "학부모 사전 연락",
        });
      }
      d = addDays(d, 1);
    }
    if (rows.length > 0) {
      const { error: aErr } = await supabase
        .from("attendance")
        .upsert(rows, { onConflict: "student_id,date" });
      if (aErr) return { error: aErr.message };
    }
  }

  const { error: uErr } = await supabase
    .from("requests")
    .update({
      status: accept ? "accepted" : "declined",
      reply: (reply || "").trim() || null,
      handled_by: user?.id || null,
      handled_at: new Date().toISOString(),
    })
    .eq("id", id);

  revalidatePath("/");
  revalidatePath("/today");
  revalidatePath("/plan");
  return ok(uErr);
}

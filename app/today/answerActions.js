"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/guard";
import { uploadName, MAX_UPLOAD } from "@/lib/noticeFile";
import { noTable } from "@/lib/sqlError";

/**
 * **답지 붙이기** (0148, 원장님 2026-08-22 — 「답지가 DB화되지 않았을 때
 * 업로드도 가능해야 해」).
 *
 * 다음 숙제의 (학생·항목·배정일)에 파일 여러 장을 붙인다 — pdf·hwp 도
 * 그대로 (이름·확장자 규칙은 lib/noticeFile 한 벌). 학생에게는 아직 안
 * 보인다 — 제출을 확인하는 순간 열린다 (lib/answers openAnswers).
 */
export async function uploadAnswerFiles(formData) {
  const supabase = createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return { error: guard.error };

  const studentId = formData.get("studentId");
  const itemId = formData.get("itemId");
  const date = formData.get("date");
  if (!studentId || !itemId || !date) return { error: "값이 부족해요." };

  const files = formData
    .getAll("files")
    .filter((f) => f && typeof f !== "string" && f.size > 0);
  if (files.length === 0) return { error: "파일이 없어요." };
  for (const f of files) {
    if (f.size > MAX_UPLOAD) return { error: `파일이 너무 커요 (25MB까지): ${f.name}` };
  }

  // 경로 규칙은 표 주석과 한 벌 — <학생>/<항목>/<배정일>/<시각>-<무작위>-<원래 이름>
  const added = [];
  for (const f of files) {
    const path = `${studentId}/${itemId}/${date}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 7)}-${uploadName(f)}`;
    const up = await supabase.storage
      .from("answers")
      .upload(path, f, { contentType: f.type || undefined, upsert: false });
    if (up.error) {
      // 올린 것까지는 되돌린다 — 반쪽짜리 첨부를 남기지 않는다
      if (added.length) await supabase.storage.from("answers").remove(added);
      if (/bucket|not found/i.test(up.error.message || "")) {
        return { error: "답지 보관함이 아직 없어요 — 설정 → Supabase SQL 에서 0148 을 실행해주세요." };
      }
      return { error: `파일을 올리지 못했어요: ${up.error.message}` };
    }
    added.push(path);
  }

  // 이미 붙인 것 뒤에 잇는다 — 열림 여부(opened_at)는 건드리지 않는다
  const { data: have, error: readErr } = await supabase
    .from("answer_files")
    .select("paths")
    .eq("student_id", studentId)
    .eq("homework_item_id", itemId)
    .eq("date", date)
    .maybeSingle();
  if (readErr && noTable(readErr)) {
    await supabase.storage.from("answers").remove(added);
    return { error: "0148 SQL 을 먼저 실행해주세요 (설정 → Supabase SQL)." };
  }
  const paths = [...(have?.paths || []), ...added];
  const { error } = await supabase.from("answer_files").upsert(
    { student_id: studentId, homework_item_id: itemId, date, paths },
    { onConflict: "student_id,homework_item_id,date" }
  );
  if (error) {
    await supabase.storage.from("answers").remove(added);
    if (noTable(error)) return { error: "0148 SQL 을 먼저 실행해주세요 (설정 → Supabase SQL)." };
    return { error: error.message };
  }

  revalidatePath("/today");
  return { error: null, paths };
}

/** 답지를 뗀다 — 파일과 줄을 함께 지운다 (열림 기록도 같이 사라진다) */
export async function removeAnswerFiles(studentId, itemId, date) {
  if (!studentId || !itemId || !date) return { error: null };
  const supabase = createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return { error: guard.error };

  const { data: have } = await supabase
    .from("answer_files")
    .select("paths")
    .eq("student_id", studentId)
    .eq("homework_item_id", itemId)
    .eq("date", date)
    .maybeSingle();
  if (have?.paths?.length) await supabase.storage.from("answers").remove(have.paths);

  const { error } = await supabase
    .from("answer_files")
    .delete()
    .eq("student_id", studentId)
    .eq("homework_item_id", itemId)
    .eq("date", date);

  revalidatePath("/today");
  return { error: error ? error.message : null };
}

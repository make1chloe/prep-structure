"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { todaySeoul } from "@/lib/day";
import { resolveStudent } from "@/lib/actAs";

/**
 * 숙제 제출 — 사진 · 녹음 · 글.
 *
 * "학습 완료" 는 눌렀다는 말일 뿐이다. 정말 했는지는 등원해서 공책을 봐야
 * 안다. 그런데 루틴에 있는 **구두테스트(숙제로는 녹음)** 는 종이로 받을 수가
 * 없다. 그래서 낼 수 있게 한다.
 *
 * 파일은 비공개 버킷에 넣는다. 경로 맨 앞이 학생 id 라서 남의 것에는
 * 손이 닿지 않는다 (0044 의 storage 정책).
 */

function needSql(error) {
  return error && (error.code === "42P01" || error.code === "PGRST205");
}

const EXT = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic",
  "audio/webm": "webm", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/ogg": "ogg",
  "audio/wav": "wav",
};

/** 사진·녹음 한 건을 낸다 */
export async function submitFile(formData) {
  const supabase = createClient();
  const asId = formData.get("asId") || null;
  const { studentId, error: whoErr } = await resolveStudent(supabase, asId);
  if (!studentId) return { error: whoErr || "학생 계정으로 로그인해주세요." };

  const file = formData.get("file");
  if (!file || typeof file === "string" || file.size === 0) {
    return { error: "파일이 없어요." };
  }
  if (file.size > 25 * 1024 * 1024) {
    return { error: "파일이 너무 커요 (25MB까지)." };
  }

  const kind = (formData.get("kind") || "photo").toString();
  const itemId = formData.get("itemId") || null;
  const reportItemId = formData.get("reportItemId") || null;
  const seconds = parseInt(formData.get("seconds") || "", 10);

  const date = todaySeoul();
  const ext = EXT[file.type] || (kind === "audio" ? "webm" : "jpg");
  const path = `${studentId}/${date}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;

  const up = await supabase.storage
    .from("submissions")
    .upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (up.error) {
    const m = up.error.message || "";
    if (/bucket/i.test(m)) return { error: "선생님이 0044 SQL 을 먼저 실행해야 해요." };
    return { error: m };
  }

  const { error } = await supabase.from("homework_submissions").insert({
    student_id: studentId,
    date,
    homework_item_id: itemId || null,
    report_item_id: reportItemId || null,
    kind,
    path,
    bytes: file.size,
    seconds: Number.isFinite(seconds) ? seconds : null,
  });
  if (needSql(error)) return { error: "선생님이 0044 SQL 을 먼저 실행해야 해요." };
  if (error) {
    // 표에 못 넣었으면 올린 파일도 치운다 (주인 없는 파일을 남기지 않는다)
    await supabase.storage.from("submissions").remove([path]);
    return { error: error.message };
  }

  revalidatePath("/me");
  revalidatePath("/today");
  return { error: null };
}

/** 글로 낸다 */
export async function submitText(itemId, reportItemId, body, asId = null) {
  const text = (body || "").trim();
  if (!text) return { error: "내용을 적어주세요." };

  const supabase = createClient();
  const { studentId, error: whoErr } = await resolveStudent(supabase, asId);
  if (!studentId) return { error: whoErr || "학생 계정으로 로그인해주세요." };

  const { error } = await supabase.from("homework_submissions").insert({
    student_id: studentId,
    date: todaySeoul(),
    homework_item_id: itemId || null,
    report_item_id: reportItemId || null,
    kind: "text",
    body: text,
  });
  if (needSql(error)) return { error: "선생님이 0044 SQL 을 먼저 실행해야 해요." };
  if (error) return { error: error.message };

  revalidatePath("/me");
  revalidatePath("/today");
  return { error: null };
}

/** 잘못 낸 것을 지운다 (선생님이 보기 전까지만) */
export async function removeSubmission(id) {
  if (!id) return { error: null };
  const supabase = createClient();

  const { data: row } = await supabase
    .from("homework_submissions")
    .select("id, path, checked_at")
    .eq("id", id)
    .maybeSingle();
  if (!row) return { error: null };
  if (row.checked_at) return { error: "선생님이 이미 확인했어요." };

  if (row.path) await supabase.storage.from("submissions").remove([row.path]);
  const { error } = await supabase.from("homework_submissions").delete().eq("id", id);

  revalidatePath("/me");
  revalidatePath("/today");
  return { error: error ? error.message : null };
}

/**
 * 볼 수 있는 링크를 잠깐 만들어 준다.
 *
 * 버킷이 비공개라 주소만으로는 안 열린다. 볼 때마다 10분짜리 링크를
 * 새로 만든다 — 링크가 돌아다녀도 금방 죽는다.
 */
export async function viewUrl(path) {
  if (!path) return { error: "없어요.", url: null };
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from("submissions")
    .createSignedUrl(path, 600);
  if (error) return { error: error.message, url: null };
  return { error: null, url: data?.signedUrl || null };
}

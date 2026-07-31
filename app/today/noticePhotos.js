"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * 공지에 붙이는 사진.
 *
 * 학교에서 나눠준 종이 — 학사일정, 시험 시간표, 가정통신문 — 를 옮겨 적기는
 * 번거롭고, 옮겨 적다 틀리면 그게 더 큰 일이다. 찍어서 그대로 보낸다.
 *
 * 비공개 버킷이라 주소를 알아도 못 연다. 볼 때마다 짧은 링크를 새로 만든다.
 * 경로 맨 앞 칸이 공지 id 라서, 그것만 보고 볼 사람인지 가릴 수 있다 (0064).
 */

const EXT = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
  "image/heic": "heic", "image/heif": "heic", "application/pdf": "pdf",
};

function why(error) {
  const m = error?.message || "";
  if (/bucket|not found/i.test(m)) return "사진 보관함이 아직 없어요. 설정 → Supabase SQL 에서 0064 를 실행해주세요.";
  if (/row-level security|policy/i.test(m)) return "권한이 없어요. 0064 SQL 을 실행했는지 확인해주세요.";
  return m || "올리지 못했어요.";
}

/** 공지 한 건에 사진을 붙인다 */
export async function addNoticePhoto(formData) {
  const noticeId = (formData.get("noticeId") || "").toString();
  const file = formData.get("file");
  if (!noticeId) return { error: "공지를 찾지 못했어요." };
  if (!file || typeof file === "string" || file.size === 0) return { error: "파일이 없어요." };
  if (file.size > 25 * 1024 * 1024) return { error: "파일이 너무 커요 (25MB까지)." };

  const supabase = createClient();
  const ext = EXT[file.type] || "jpg";
  const path = `${noticeId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;

  const up = await supabase.storage
    .from("notices")
    .upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (up.error) return { error: why(up.error) };

  const { data: cur, error: readErr } = await supabase
    .from("notices")
    .select("photos")
    .eq("id", noticeId)
    .maybeSingle();
  if (readErr) {
    await supabase.storage.from("notices").remove([path]);
    if (readErr.code === "42703" || readErr.code === "PGRST204") {
      return { error: "0064 SQL 을 먼저 실행해주세요." };
    }
    return { error: readErr.message };
  }

  const photos = [...(cur?.photos || []), path];
  const { error } = await supabase.from("notices").update({ photos }).eq("id", noticeId);
  if (error) {
    await supabase.storage.from("notices").remove([path]);
    return { error: error.message };
  }

  revalidatePath("/today");
  revalidatePath("/me");
  return { error: null, path };
}

/** 붙인 사진을 뗀다 */
export async function removeNoticePhoto(noticeId, path) {
  if (!noticeId || !path) return { error: null };
  const supabase = createClient();

  const { data: cur } = await supabase.from("notices").select("photos").eq("id", noticeId).maybeSingle();
  const photos = (cur?.photos || []).filter((p) => p !== path);
  const { error } = await supabase.from("notices").update({ photos }).eq("id", noticeId);
  if (error) return { error: error.message };

  await supabase.storage.from("notices").remove([path]);
  revalidatePath("/today");
  revalidatePath("/me");
  return { error: null };
}

/**
 * 볼 수 있는 짧은 링크를 만들어준다 (10분).
 * 못 여는 사람에게는 아무것도 안 준다 — 정책이 걸러낸다.
 */
export async function noticePhotoUrls(paths) {
  const list = (paths || []).filter(Boolean);
  if (list.length === 0) return { urls: {}, error: null };

  const supabase = createClient();
  const urls = {};
  for (const p of list) {
    const { data } = await supabase.storage.from("notices").createSignedUrl(p, 600);
    if (data?.signedUrl) urls[p] = data.signedUrl;
  }
  return { urls, error: null };
}

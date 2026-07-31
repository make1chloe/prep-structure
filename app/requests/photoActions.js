"use server";

import { createClient } from "@/lib/supabase/server";
import { resolveStudent } from "@/lib/actAs";

/**
 * 학생·학부모가 알리면서 붙이는 사진 (0068).
 *
 * 결석을 알릴 때 "가족 여행" 이라고 적는 것과, 체험학습 신청서를 찍어
 * 보내는 것은 다르다. 학교 시험 시간표는 옮겨 적으면 틀리고, 틀리면 큰일이다.
 *
 * 보내기 전에 먼저 올린다 — 그래야 무엇을 붙였는지 눈으로 보고 보낸다.
 * 올려만 두고 안 보내면 파일만 남지만, 그건 아무에게도 안 보인다.
 */

const EXT = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
  "image/heic": "heic", "image/heif": "heic", "application/pdf": "pdf",
};

function why(error) {
  const m = error?.message || "";
  if (/bucket|not found/i.test(m)) return "사진 보관함이 아직 없어요. 선생님께 \"0068 SQL 실행\" 이라고 전해주세요.";
  if (/row-level security|policy/i.test(m)) return "사진을 올릴 권한이 없어요. 선생님께 \"0068 SQL 실행\" 이라고 전해주세요.";
  return m || "올리지 못했어요.";
}

/** 사진 한 장을 올리고 경로를 돌려준다 */
export async function uploadRequestPhoto(formData) {
  const supabase = createClient();
  const asId = formData.get("asId") || null;
  const { studentId, error: whoErr } = await resolveStudent(supabase, asId);
  if (!studentId) return { error: whoErr || "로그인이 필요해요." };

  const file = formData.get("file");
  if (!file || typeof file === "string" || file.size === 0) return { error: "파일이 없어요." };
  if (file.size > 25 * 1024 * 1024) return { error: "파일이 너무 커요 (25MB까지)." };

  const ext = EXT[file.type] || "jpg";
  const path = `${studentId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;

  const up = await supabase.storage
    .from("requests")
    .upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (up.error) return { error: why(up.error) };

  return { error: null, path };
}

/** 보내기 전에 뗀다 */
export async function dropRequestPhoto(path) {
  if (!path) return { error: null };
  const supabase = createClient();
  await supabase.storage.from("requests").remove([path]);
  return { error: null };
}

/**
 * 볼 수 있는 짧은 링크 (10분).
 * 못 여는 사람에게는 아무것도 안 준다 — 정책이 걸러낸다.
 */
export async function requestPhotoUrls(paths) {
  const list = (paths || []).filter(Boolean);
  if (list.length === 0) return { urls: {}, error: null };

  const supabase = createClient();
  const urls = {};
  for (const p of list) {
    const { data } = await supabase.storage.from("requests").createSignedUrl(p, 600);
    if (data?.signedUrl) urls[p] = data.signedUrl;
  }
  return { urls, error: null };
}

"use server";

import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/guard";
import { uploadName, MAX_UPLOAD } from "@/lib/noticeFile";
import { todaySeoul } from "@/lib/day";

/**
 * **빠른 메모에 붙이는 사진·파일** (0147. 원장님, 2026-08-22 — 「어제 만든
 * 퀵메모에 클립보드에 저장된 사진 올리기, 파일, 사진 추가 가능하게 해주라」).
 *
 * 공지(0064)·알림(0068)과 같은 규칙 한 벌 — 비공개 버킷, 이름 살리기와
 * 크기 상한은 lib/noticeFile, 볼 때는 그때그때 짧은 링크. 다만 여기는
 * **선생님만** 쓰는 자리라 버킷도 staff 전용이고, 액션도 staff 를 확인한다.
 *
 * **revalidate 는 어디에도 없다** — 빠른 메모의 약속(화면 이동 없음 ·
 * 새로고침 없음)을 첨부도 그대로 따른다.
 */

function why(error) {
  const m = error?.message || "";
  if (/bucket|not found/i.test(m)) return "첨부 보관함이 아직 없어요. 설정 → Supabase SQL 에서 0147 을 실행해주세요.";
  if (/row-level security|policy/i.test(m)) return "올릴 권한이 없어요. 0147 SQL 을 실행했는지 확인해주세요.";
  if (/exceeded|too large|payload/i.test(m)) return "파일이 너무 커요 (25MB까지).";
  return m || "올리지 못했어요.";
}

/** 파일 하나를 올리고 경로를 돌려준다 (할일 저장은 addQuickMemo 가 한다) */
export async function uploadTaskFile(formData) {
  const supabase = createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return { error: guard.error };

  const file = formData.get("file");
  if (!file || typeof file === "string" || file.size === 0) return { error: "파일이 없어요." };
  if (file.size > MAX_UPLOAD) return { error: "파일이 너무 커요 (25MB까지)." };

  const path = `${todaySeoul()}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${uploadName(file)}`;
  const up = await supabase.storage
    .from("tasks")
    .upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (up.error) return { error: why(up.error) };
  return { error: null, path };
}

/** 저장 전에 뗀 첨부를 치운다 (주인 없는 파일을 남기지 않는다) */
export async function dropTaskFile(path) {
  if (!path) return { error: null };
  const supabase = createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return { error: guard.error };
  await supabase.storage.from("tasks").remove([path]);
  return { error: null };
}

/**
 * 볼 수 있는 짧은 링크 (10분). 비공개라 주소만으로는 안 열린다 —
 * 볼 때마다 새로 만든다 (0064 와 같은 규칙).
 */
export async function taskFileUrls(paths) {
  const list = (paths || []).filter(Boolean);
  if (list.length === 0) return { urls: {}, error: null };

  const supabase = createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return { urls: {}, error: guard.error };

  const urls = {};
  for (const p of list) {
    const { data } = await supabase.storage.from("tasks").createSignedUrl(p, 600);
    if (data?.signedUrl) urls[p] = data.signedUrl;
  }
  return { urls, error: null };
}

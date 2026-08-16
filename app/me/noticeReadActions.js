"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * **공지 확인 도장** (0129, 원장님 2026-08-16 — 「확인 누르면 더 보이지
 * 않게」). 길목(NoticeGate)에서 확인을 누르면 여기로 와서 DB 에 남고,
 * 다음부터 그 공지는 화면에서 아예 빠진다. 도장은 「id|고친시각」 이라
 * 원장님이 공지를 고치면(재공지) 안 맞아서 다시 보인다.
 *
 * 실패해도 조용히 넘어간다 — 기기 저장(localStorage)이 받쳐주고 있고,
 * 공지 확인 때문에 화면이 멈추면 본말이 뒤집힌다.
 */
export async function markNoticesRead(studentId, items = []) {
  if (!studentId || !items.length) return { error: null };
  const supabase = createClient();
  const now = new Date().toISOString();
  for (const it of items) {
    if (!it?.id) continue;
    try {
      await supabase
        .from("notice_receipts")
        .update({ read_at: now, read_stamp: it.stamp || it.id })
        .eq("notice_id", it.id)
        .eq("student_id", studentId);
    } catch { /* 0129 전 — 기기 저장만으로 간다 */ }
  }
  return { error: null };
}

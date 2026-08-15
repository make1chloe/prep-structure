"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * **보낸 알림 목록 치우기** (원장님, 2026-08-15 — 「대시보드에서 보낸 알림
 * 말야, 선택/삭제/확인/접기가 필요하지 않나」).
 *
 * push_receipts 는 이 목록 하나를 위한 영수증이다 — 지워도 공지·리포트
 * 발송 기록은 그대로다 (그건 notices·report_sends 에 산다). 그래서
 * 진짜 지운다. 처리 끝난 줄이 계속 쌓여 있으면 새로 온 문제가 안 보인다.
 */
export async function deleteReceipts(ids) {
  const list = [...new Set((ids || []).filter(Boolean))];
  if (list.length === 0) return { error: null, removed: 0 };
  const supabase = createClient();
  const { error } = await supabase.from("push_receipts").delete().in("id", list);
  revalidatePath("/");
  return { error: error ? error.message : null, removed: list.length };
}

/** 확인된 것(열어 본 알림)을 한 번에 치운다 — 남는 것은 오류·미확인뿐 */
export async function clearOpenedReceipts() {
  const supabase = createClient();
  const { error } = await supabase
    .from("push_receipts")
    .delete()
    .not("opened_at", "is", null);
  revalidatePath("/");
  return { error: error ? error.message : null };
}

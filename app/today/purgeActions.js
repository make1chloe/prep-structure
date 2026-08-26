"use server";

import { createClient } from "@/lib/supabase/server";
import { todaySeoul } from "@/lib/day";
import { KEEP_DAYS, cutoff, ranToday } from "@/lib/purge";

/**
 * 한 달 지난 사진·녹음을 치운다.
 *
 * **파일만** 지운다. 언제 뭘 냈는지는 그대로 남는다 (purged_at 만 찍힌다).
 * 체크리스트와 글은 파일이 없으니 손대지 않는다.
 *
 * 따로 도는 서버가 없으므로 **오늘 수업 화면을 열 때 하루 한 번** 돈다.
 * 매일 여는 화면이라 이게 제일 확실하다. 실패해도 화면은 그냥 열린다 —
 * 정리가 안 됐다고 수업을 못 하면 안 된다.
 */
export async function purgeOldSubmissions(days = KEEP_DAYS) {
  const supabase = await createClient();
  const before = cutoff(todaySeoul(), days);

  const { data: rows, error } = await supabase
    .from("homework_submissions")
    .select("id, path")
    .lt("date", before)
    .is("purged_at", null)
    .not("path", "is", null)
    .limit(500);
  // 0044·0056 전이거나 볼 권한이 없으면 그냥 아무것도 안 한다
  if (error) return { error: error.message, count: 0 };
  if (!rows || rows.length === 0) return { error: null, count: 0 };

  const paths = rows.map((r) => r.path).filter(Boolean);
  const del = await supabase.storage.from("submissions").remove(paths);
  if (del.error) return { error: del.error.message, count: 0 };

  const { error: upErr } = await supabase
    .from("homework_submissions")
    .update({ purged_at: new Date().toISOString(), path: null })
    .in("id", rows.map((r) => r.id));
  if (upErr) return { error: upErr.message, count: 0 };

  return { error: null, count: rows.length };
}

/**
 * **휴지통 비우기** (0168 — 원장 확정 8/27). 숨긴 지 30일이 지나도록
 * 안 되살린 판만 진짜 지운다. 발송 이력은 set null(0168)이라 남는다.
 * 칸이 없는 DB(0168 전)면 42703 — 조용히 넘어간다 (정리는 다음 기회에).
 */
async function purgeArchivedReports() {
  const supabase = await createClient();
  const before = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("daily_reports")
    .delete()
    .not("archived_at", "is", null)
    .lt("archived_at", before)
    .select("id");
  if (error) return { count: 0 };
  return { count: (data || []).length };
}

/** 하루에 한 번만 — 마지막으로 돈 날을 integrations 에 적어둔다 */
export async function purgeOncePerDay(days = KEEP_DAYS) {
  const supabase = await createClient();
  const today = todaySeoul();

  const { data, error } = await supabase
    .from("integrations")
    .select("config")
    .eq("id", "purge")
    .maybeSingle();
  if (error) return { error: null, count: 0, skipped: true };
  if (ranToday(data?.config?.lastRun, today)) return { error: null, count: 0, skipped: true };

  const res = await purgeOldSubmissions(days);
  const bin = await purgeArchivedReports();   // 휴지통 30일 (0168)

  // 실패해도 오늘은 더 안 돈다 — 화면 열 때마다 같은 실패를 반복할 이유가 없다
  await supabase.from("integrations").upsert(
    {
      id: "purge",
      enabled: true,
      config: { lastRun: today, count: res.count, binCount: bin.count, error: res.error || null },
    },
    { onConflict: "id" }
  );
  return { ...res, skipped: false };
}

"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * **리포트 열람 도장** (0180, 원장님 2026-08-28 — 「학부모가 열람했는지
 * 여부를 아이콘으로」).
 *
 * 어머니 화면에서 그 날 리포트가 **눈에 실제로 머물렀을 때** 여기로 온다
 * (app/parent/ReportSeen.jsx 가 언제인지 정한다).
 *
 * 도장은 **한 번만** 찍힌다 — 0180 은 학부모에게 insert 만 열어두고
 * update·delete 정책을 안 만들었다. 두 번째부터는 기본키가 겹쳐
 * 조용히 아무 일도 안 일어난다 (ignoreDuplicates).
 *
 * **실패해도 조용히 넘어간다.** 열람 도장 때문에 어머니 화면에 빨간
 * 경고가 뜨면 본말이 뒤집힌다 (0129 markNoticesRead 와 같은 태도).
 * 0180 전 DB 면 표가 없어 실패하는데, 그때 원장 화면은 「안 봄」 이
 * 아니라 **「열람 모름」** 을 그린다 (lib/reportMark · A25).
 */
export async function markReportSeen(reportId) {
  if (!reportId) return { error: null };
  try {
    const supabase = await createClient();
    await supabase
      .from("report_reads")
      // read_at·reader_id 는 안 보낸다 — 서버가 정한다 (0180 트리거).
      // 보내봐야 덮어써지지만, 화면이 시각을 정하는 것처럼 보이면 안 된다.
      .upsert({ daily_report_id: reportId }, {
        onConflict: "daily_report_id,reader_id",
        ignoreDuplicates: true,
      });
  } catch { /* 0180 전 — 원장 화면은 「열람 모름」 으로 그린다 */ }
  return { error: null };
}

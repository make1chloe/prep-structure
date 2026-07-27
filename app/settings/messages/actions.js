"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const NEED = "0029 SQL 을 먼저 실행해주세요.";

function unavailable(error) {
  return error && (error.code === "42703" || error.code === "PGRST204" || error.code === "42P01");
}

/**
 * 문자 문구 전부 (앱이 만드는 것 + 내가 쓰는 것)
 *
 * SQL 을 어디까지 실행했는지에 따라 있는 칸이 다르다.
 * **없는 칸 때문에 화면 전체가 막히지 않게** 한 단계씩 물러나며 읽는다.
 *   full  0030 까지 — 알림톡 연결까지 된다
 *   kinds 0029 까지 — 종류별 인삿말까지 된다
 *   base  0017 까지 — 문구 목록만 보인다
 * 무엇이 모자란지는 화면에 그대로 알려준다.
 */
export async function listMessages() {
  const supabase = createClient();
  const BASE = "id, name, kind, body, sort, active";

  const tries = [
    { level: "full", cols: `${BASE}, key, greeting, closing, alimtalk_id, alimtalk_vars` },
    { level: "kinds", cols: `${BASE}, key, greeting, closing` },
    { level: "base", cols: BASE },
  ];

  let last = null;
  for (const t of tries) {
    const { data, error } = await supabase
      .from("message_templates")
      .select(t.cols)
      .eq("active", true)
      .order("sort", { ascending: true });
    if (!error) return { rows: data || [], level: t.level, error: null };
    last = error;
    // 칸이 없어서 실패한 게 아니면 더 물러나 봐야 소용없다
    if (!unavailable(error)) break;
  }

  // 표 자체가 없다 / 권한이 없다 / 그 밖의 이유 — 있는 그대로 알린다
  const why =
    last?.code === "42P01"
      ? "message_templates 표가 아직 없습니다. SQL 을 실행해주세요."
      : `${last?.message || "알 수 없는 오류"}${last?.code ? ` (${last.code})` : ""}`;
  return { rows: [], level: "none", error: why };
}

/**
 * 하나 저장한다.
 * key 가 있는 것(앱이 본문을 만드는 문자)은 본문을 못 바꾼다 — 바꿔봐야 안 쓰인다.
 */
export async function saveMessage(id, patch = {}) {
  const supabase = createClient();
  const row = {};
  if ("name" in patch) row.name = (patch.name || "").trim() || "이름 없음";
  if ("greeting" in patch) row.greeting = (patch.greeting || "").trim() || null;
  if ("closing" in patch) row.closing = (patch.closing || "").trim() || null;
  if ("sort" in patch) {
    const d = (patch.sort ?? "").toString().replace(/[^\d]/g, "");
    row.sort = d ? parseInt(d, 10) : 0;
  }
  if ("alimtalk_id" in patch) row.alimtalk_id = (patch.alimtalk_id || "").trim() || null;
  if ("alimtalk_vars" in patch) {
    // 빈 연결은 저장하지 않는다
    const v = patch.alimtalk_vars || {};
    row.alimtalk_vars = Object.fromEntries(
      Object.entries(v).filter(([k, val]) => k?.trim() && `${val || ""}`.trim())
    );
  }

  if (id) {
    const { data: cur } = await supabase
      .from("message_templates")
      .select("key")
      .eq("id", id)
      .maybeSingle();
    if (!cur?.key && "body" in patch) row.body = (patch.body || "").trim();

    const { error } = await supabase.from("message_templates").update(row).eq("id", id);
    if (unavailable(error)) return { error: NEED };
    if (error) return { error: error.message };
  } else {
    const { data: last } = await supabase
      .from("message_templates")
      .select("sort")
      .order("sort", { ascending: false })
      .limit(1);
    const { error } = await supabase.from("message_templates").insert({
      name: row.name || "새 문자",
      kind: "general",
      body: (patch.body || "").trim(),
      greeting: row.greeting || null,
      closing: row.closing || null,
      sort: (last?.[0]?.sort ?? 0) + 10,
    });
    if (unavailable(error)) return { error: NEED };
    if (error) return { error: error.message };
  }

  revalidatePath("/settings/messages");
  revalidatePath("/report");
  revalidatePath("/today");
  return { error: null };
}

/**
 * 지운다 — 실제로는 숨긴다. 지난 발송 기록이 어떤 문구였는지 남아야 하기 때문이다.
 * 앱이 본문을 만드는 문자(데일리리포트 등)는 지울 수 없다. 기능이 그걸 쓰기 때문이다.
 */
export async function deleteMessage(id) {
  if (!id) return { error: null };
  const supabase = createClient();
  const { data: cur } = await supabase
    .from("message_templates")
    .select("key, name")
    .eq("id", id)
    .maybeSingle();
  if (cur?.key) {
    return { error: `'${cur.name}' 은 앱이 자동으로 보내는 문자라 지울 수 없어요.` };
  }
  const { error } = await supabase
    .from("message_templates")
    .update({ active: false })
    .eq("id", id);
  revalidatePath("/settings/messages");
  revalidatePath("/report");
  return { error: error ? error.message : null };
}

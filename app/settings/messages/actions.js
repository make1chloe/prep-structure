"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const NEED = "0029 SQL 을 먼저 실행해주세요.";

function unavailable(error) {
  return error && (error.code === "42703" || error.code === "PGRST204" || error.code === "42P01");
}

/** 문자 문구 전부 (앱이 만드는 것 + 내가 쓰는 것) */
export async function listMessages() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("message_templates")
    .select("id, name, kind, key, body, greeting, closing, sort, active")
    .eq("active", true)
    .order("sort", { ascending: true });
  if (error) return { rows: [], error: unavailable(error) ? NEED : error.message };
  return { rows: data || [], error: null };
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

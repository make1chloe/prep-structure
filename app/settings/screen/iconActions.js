"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePrincipal } from "@/lib/guard";

/**
 * 홈 화면 아이콘 — 원장님이 올린 로고를 담아둔다 (0080).
 *
 * 크기 맞추기·여백 주기는 **브라우저에서** 끝낸 뒤 온다. 서버에 그림 다루는
 * 도구를 들이지 않으려는 것이다 — 그것 하나 때문에 배포가 무거워진다.
 * 여기서는 받은 것을 담고, 이상한 것이 오면 거절한다.
 */

const KEYS = [
  "icon-192", "icon-512", "icon-192m", "icon-512m", "icon-apple", "icon-favicon",
  "icon-mark",   // 화면 안 왼쪽 위 로고 (바탕 없음)
];
const MAX = 400 * 1024;   // 한 장 400KB — 아이콘이 이보다 크면 뭔가 잘못된 것이다

const SQL = "0080 SQL 을 먼저 실행해주세요.";

/** 지금 올려둔 것이 있나 */
export async function iconStatus() {
  const supabase = createClient();
  const guard = await requirePrincipal(supabase);
  if (guard.error) return { error: guard.error };
  const { data, error } = await supabase
    .from("app_assets").select("key, updated_at").in("key", KEYS);
  if (error) return { error: SQL };

  const have = new Set((data || []).map((r) => r.key));
  const missing = KEYS.filter((k) => !have.has(k));
  return {
    error: null,
    // **하나라도 있으면 올린 것으로 본다.** 판이 늘어났을 때(예: icon-mark 를
    // 나중에 추가) 「아직 안 올림」 으로 보이면, 이미 올렸는데 왜 그러냐가 된다.
    uploaded: have.size > 0,
    missing,
    updatedAt: (data || [])
      .map((r) => r.updated_at)
      .sort()
      .pop() || null,
  };
}

/**
 * 올린다.
 * @param images { "icon-512": "data:image/png;base64,...", ... }
 */
export async function saveIcons(images = {}) {
  const supabase = createClient();
  const guard = await requirePrincipal(supabase);
  if (guard.error) return guard;

  const rows = [];
  for (const key of KEYS) {
    const url = images[key];
    if (typeof url !== "string" || !url.startsWith("data:image/png;base64,")) {
      return { error: `${key} 그림이 빠졌어요. 다시 올려주세요.` };
    }
    const b64 = url.slice("data:image/png;base64,".length);
    if (b64.length * 0.75 > MAX) {
      return { error: "그림이 너무 큽니다. 로고 파일을 조금 작게 해주세요." };
    }
    rows.push({
      key,
      mime: "image/png",
      data: b64,
      updated_at: new Date().toISOString(),
      updated_by: guard.user.id,
    });
  }

  const { error } = await supabase.from("app_assets").upsert(rows, { onConflict: "key" });
  if (error) return { error: error.message.includes("app_assets") ? SQL : error.message };

  revalidatePath("/settings/screen");
  return { error: null };
}

/** 다시 기본 그림으로 (올린 것을 지운다) */
export async function clearIcons() {
  const supabase = createClient();
  const guard = await requirePrincipal(supabase);
  if (guard.error) return guard;
  const { error } = await supabase.from("app_assets").delete().in("key", KEYS);
  revalidatePath("/settings/screen");
  return { error: error ? error.message : null };
}

/**
 * **왜 안 바뀌는지 서버가 직접 확인한다.**
 *
 * 「올렸는데 안 바뀐다」 는 원인이 여러 개다 — SQL 이 안 들어갔거나, 읽기 권한이
 * 없거나, 브라우저가 옛 그림을 들고 있거나. 화면에서는 셋 다 똑같이
 * 「안 바뀜」 으로 보인다. 그래서 어디서 막혔는지 여기서 알아내 말로 돌려준다.
 */
export async function checkIcons() {
  const supabase = createClient();
  const guard = await requirePrincipal(supabase);
  if (guard.error) return { error: guard.error };

  const lines = [];

  // 1) 표가 있나 · 몇 줄 들어 있나 (로그인한 채로)
  const mine = await supabase.from("app_assets").select("key, updated_at");
  if (mine.error) {
    return {
      error: null,
      ok: false,
      lines: [`표를 못 읽습니다 — ${mine.error.message}`, "→ 0080 SQL 을 먼저 실행해주세요."],
    };
  }
  const keys = (mine.data || []).map((r) => r.key);
  lines.push(`담겨 있는 판: ${keys.length}개${keys.length ? ` (${keys.join(", ")})` : ""}`);
  if (keys.length === 0) {
    return { error: null, ok: false, lines: [...lines, "→ 아직 안 올리셨습니다. 파일을 올려주세요."] };
  }

  // 2) **로그인 없이도** 읽히나 — 실제로 아이콘을 받아가는 것은 이쪽이다
  const { createClient: anonClient } = await import("@supabase/supabase-js");
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = await import("@/lib/supabase/env");
  const anon = anonClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const pub = await anon.from("app_assets").select("key").eq("key", "icon-mark").maybeSingle();

  if (pub.error) {
    lines.push(`로그인 없이는 못 읽습니다 — ${pub.error.message}`);
    lines.push("→ 0081 SQL 을 실행해주세요 (읽기 권한).");
    return { error: null, ok: false, lines };
  }
  if (!pub.data) {
    lines.push("로그인 없이 읽는 것은 되는데, 왼쪽 위 로고용 판(icon-mark)이 없습니다.");
    lines.push("→ 파일을 한 번 더 올려주세요. 그 판은 나중에 생긴 것이라 예전 것에는 없습니다.");
    return { error: null, ok: false, lines };
  }

  lines.push("로그인 없이도 읽힙니다. 서버 쪽은 이상 없습니다.");
  lines.push("→ 그래도 안 바뀌면 브라우저가 옛 그림을 들고 있는 것입니다. 강력 새로고침(Ctrl+Shift+R) 해보세요.");
  return { error: null, ok: true, lines };
}

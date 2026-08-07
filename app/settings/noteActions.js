"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { NOTE_KEYS } from "@/lib/screenNotes";

/**
 * 화면 안내 문구 — 원장님이 직접 적으신다 (0093).
 *
 * 자리 이름은 **우리가 정해둔 것만** 받는다 (lib/screenNotes 의 NOTE_KEYS).
 * 밖에서 아무 이름이나 넣을 수 있으면 화면에 안 뜨는 줄이 표에 쌓이고,
 * 나중에 「이건 뭐지」 가 된다.
 */

const NEED_SQL = "0093 SQL 을 먼저 실행해주세요 (화면 안내 문구).";

function unavailable(error) {
  return error && (error.code === "42P01" || error.code === "PGRST205" || error.code === "42703");
}

async function requireStaff(supabase) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요해요.", user: null };
  const { data: p } = await supabase
    .from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!["principal", "instructor"].includes(p?.role)) {
    return { error: "원장·강사 계정에서만 바꿀 수 있어요.", user: null };
  }
  return { error: null, user };
}

export async function listNotes() {
  const supabase = createClient();
  const { data, error } = await supabase.from("screen_notes").select("key, body");
  if (unavailable(error)) return { notes: {}, error: NEED_SQL };
  if (error) return { notes: {}, error: error.message };
  return {
    notes: Object.fromEntries((data || []).map((r) => [r.key, r.body || ""])),
    error: null,
  };
}

/**
 * 한 자리를 저장한다.
 *
 * **비우면 줄을 지운다.** 빈 글자를 남겨두면 「적어둔 것이 있는데 안 보이나」 로
 * 읽히고, 원래 문구로 돌아간 것인지 알 수가 없다. 비운 것은 안 적은 것이다.
 */
export async function saveNote(key, body) {
  if (!NOTE_KEYS.includes(key)) return { error: "모르는 자리예요." };
  const supabase = createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return { error: guard.error };

  const text = (body || "").toString().trim();
  const { error } = text
    ? await supabase.from("screen_notes").upsert(
        { key, body: text, updated_at: new Date().toISOString(), updated_by: guard.user.id },
        { onConflict: "key" }
      )
    : await supabase.from("screen_notes").delete().eq("key", key);
  if (unavailable(error)) return { error: NEED_SQL };
  if (error) return { error: error.message };

  // 적으신 글이 바로 보여야 한다 — 어느 화면에 뜨는지 여기서 다 되살린다
  revalidatePath("/me");
  revalidatePath("/parent");
  revalidatePath("/settings/messages");
  ["today", "students", "books", "calendar", "send", "manage", "settings"].forEach((k) =>
    revalidatePath(`/menu/${k}`)
  );
  return { error: null };
}

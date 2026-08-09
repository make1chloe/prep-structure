"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { findPage } from "@/lib/screenLayout";
import { requireTeacher } from "@/lib/guard";
import { needSql } from "@/lib/sqlError";

/**
 * 화면 구성 순서 (0095).
 *
 * **우리가 아는 화면·덩어리만 받는다.** 밖에서 아무 이름이나 넣을 수 있으면
 * 화면에 없는 이름이 표에 쌓이고, 나중에 「이건 뭐지」 가 된다.
 */

const NEED_SQL = "0095 SQL 을 먼저 실행해주세요 (화면 구성 순서).";

export async function listLayouts() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("screen_layouts").select("page, order_keys, hidden_keys");
  if (needSql(error)) return { layouts: {}, error: NEED_SQL };
  if (error) return { layouts: {}, error: error.message };
  return {
    layouts: Object.fromEntries(
      (data || []).map((r) => [r.page, { order: r.order_keys || [], hidden: r.hidden_keys || [] }])
    ),
    error: null,
  };
}

/**
 * 한 화면의 차례와 숨김을 저장한다.
 *
 * **모르는 덩어리 이름은 버린다.** 화면에서 지운 덩어리 이름이 표에 남아
 * 있으면, 나중에 같은 이름을 다시 쓸 때 엉뚱한 자리에 붙는다.
 */
export async function saveLayout(pageKey, order = [], hidden = []) {
  const page = findPage(pageKey);
  if (!page) return { error: "모르는 화면이에요." };

  const known = new Set(page.blocks.map((b) => b.key));
  const clean = (list) => [...new Set((list || []).filter((k) => known.has(k)))];

  const supabase = createClient();
  const guard = await requireTeacher(supabase);
  if (guard.error) return { error: guard.error };

  const { error } = await supabase.from("screen_layouts").upsert(
    {
      page: pageKey,
      order_keys: clean(order),
      hidden_keys: clean(hidden),
      updated_at: new Date().toISOString(),
      updated_by: guard.user.id,
    },
    { onConflict: "page" }
  );
  if (needSql(error)) return { error: NEED_SQL };
  if (error) return { error: error.message };

  revalidatePath(page.href);
  revalidatePath("/settings/screen");
  return { error: null };
}

/** 원래 차례로 되돌린다 — 줄을 지우면 코드에 적힌 차례가 그대로 쓰인다 */
export async function resetLayout(pageKey) {
  if (!findPage(pageKey)) return { error: "모르는 화면이에요." };
  const supabase = createClient();
  const guard = await requireTeacher(supabase);
  if (guard.error) return { error: guard.error };

  const { error } = await supabase.from("screen_layouts").delete().eq("page", pageKey);
  if (needSql(error)) return { error: NEED_SQL };
  if (error) return { error: error.message };

  revalidatePath(findPage(pageKey).href);
  revalidatePath("/settings/screen");
  return { error: null };
}

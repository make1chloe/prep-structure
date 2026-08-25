"use server";

import { createClient } from "@/lib/supabase/server";
import { todaySeoul } from "@/lib/day";

/**
 * 「같은 것을 두 번 안 넣기」 가 진짜로 되는지 해본다.
 *
 * 왜 따로 필요한가
 *   위의 표 점검은 **표와 칸**만 본다. 그런데 0061 이 고친 것은 **인덱스**다.
 *   인덱스는 밖에서 물어볼 방법이 없어서, SQL 을 돌렸는지 화면에서는 알 수가 없다.
 *   그래서 "다 됐다" 로 보이는데 나이스는 안 되는 일이 생긴다.
 *
 *   그러니 **실제로 해본다.** 넣어보고, 한 번 더 넣어보고, 치운다.
 *   이게 나이스 받아오기와 숙제→할일이 쓰는 것과 똑같은 문장이다.
 */
export async function checkUpsert() {
  const supabase = await createClient();
  const steps = [];
  const add = (name, ok, why) => steps.push({ name, ok, why: why || null });

  const today = todaySeoul();
  const MARK = "__점검__";

  // 1) 받아온 일정 — 나이스가 쓰는 것과 같은 문장
  const row = {
    title: `${MARK} 지워도 됩니다`,
    kind: "schedule",
    due_on: today,
    source: MARK,
    source_id: `${MARK}:1`,
  };
  let first = await supabase.from("tasks").upsert(row, { onConflict: "source,source_id" });
  if (first.error) {
    add(
      "받아온 일정 넣기",
      false,
      /ON CONFLICT|constraint/i.test(first.error.message || "")
        ? `0061 SQL 이 아직 안 들어갔어요. (${first.error.message})`
        : first.error.message
    );
  } else {
    add("받아온 일정 넣기", true);

    // 2) 한 번 더 — 늘어나면 안 된다
    const again = await supabase
      .from("tasks")
      .upsert({ ...row, title: `${MARK} 두 번째` }, { onConflict: "source,source_id" });
    if (again.error) {
      add("같은 것 두 번 받아도 안 늘어남", false, again.error.message);
    } else {
      const { count } = await supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("source", MARK);
      add(
        "같은 것 두 번 받아도 안 늘어남",
        count === 1,
        count === 1 ? null : `두 번 넣었더니 ${count}줄이 됐어요.`
      );
    }
  }

  // 3) 숙제 → 내 할일 — 이것도 같은 곳에서 막혀 있었다
  const todo = {
    title: `${MARK} 할일`,
    kind: "todo",
    due_on: today,
    auto_key: `${MARK}:auto`,
  };
  const t1 = await supabase.from("tasks").upsert(todo, {
    onConflict: "auto_key",
    ignoreDuplicates: true,
  });
  if (t1.error) {
    add(
      "숙제 → 내 할일 만들기",
      false,
      /ON CONFLICT|constraint/i.test(t1.error.message || "")
        ? `0061 SQL 이 아직 안 들어갔어요. (${t1.error.message})`
        : t1.error.message
    );
  } else {
    add("숙제 → 내 할일 만들기", true);
  }

  // 4) 치운다 — 점검하느라 만든 것이 일정에 남으면 안 된다
  const d1 = await supabase.from("tasks").delete().eq("source", MARK);
  const d2 = await supabase.from("tasks").delete().eq("auto_key", `${MARK}:auto`);
  add("점검한 것 치우기", !d1.error && !d2.error, d1.error?.message || d2.error?.message);

  return { steps };
}

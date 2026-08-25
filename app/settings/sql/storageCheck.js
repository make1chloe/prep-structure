"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * 숙제 파일 보관함이 제대로 되어 있나 실제로 해본다.
 *
 * "될 겁니다" 로는 아무것도 확인되지 않는다. 진짜로 작은 파일을 하나 올려보고,
 * 읽어보고, 지운다. 안 되면 **어디서** 막혔는지 그대로 보여준다.
 */
export async function checkStorage() {
  const supabase = await createClient();
  const steps = [];
  const add = (name, ok, why) => steps.push({ name, ok, why: why || null });

  // 1) 보관함이 있나
  const { data: buckets, error: bErr } = await supabase.storage.listBuckets();
  if (bErr) {
    add("보관함 목록", false, bErr.message);
    return { steps };
  }
  const has = (buckets || []).some((b) => b.id === "submissions");
  add("보관함(submissions) 있음", has, has ? null : "0047 SQL 을 실행하면 만들어집니다");
  if (!has) return { steps };

  // 2) 올려보기 — 선생님 계정으로 (학생은 자기 폴더에만 올라간다)
  const path = `_check/${Date.now()}.txt`;
  const body = new Blob(["ok"], { type: "text/plain" });
  const up = await supabase.storage
    .from("submissions")
    .upload(path, body, { contentType: "text/plain", upsert: true });
  if (up.error) {
    const m = up.error.message || "";
    add(
      "올리기",
      false,
      /row-level security|policy|violates/i.test(m)
        ? `권한이 없습니다 — 0047 SQL 을 실행해주세요. (${m})`
        : m
    );
    return { steps };
  }
  add("올리기", true);

  // 3) 볼 수 있나 (잠깐짜리 링크)
  const signed = await supabase.storage.from("submissions").createSignedUrl(path, 60);
  add("보기 링크 만들기", !signed.error, signed.error?.message);

  // 4) 치우기
  const del = await supabase.storage.from("submissions").remove([path]);
  add("지우기", !del.error, del.error?.message);

  // 5) 기록 표
  const { error: tErr } = await supabase.from("homework_submissions").select("id").limit(1);
  add("숙제 제출 표", !tErr, tErr?.message);

  return { steps };
}

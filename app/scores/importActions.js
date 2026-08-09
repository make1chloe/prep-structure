"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireTeacher } from "@/lib/guard";
import { noTable } from "@/lib/sqlError";

/** 이름 → 학생. 띄어쓰기와 대소문자는 무시한다 */
function nameKey(s) {
  return (s || "").toString().replace(/\s+/g, "").toLowerCase();
}

export async function importScores(rows = []) {
  const list = (Array.isArray(rows) ? rows : []).filter((r) => r?.name && !r.empty);
  if (list.length === 0) {
    return { error: "넣을 줄이 없어요. 학생 이름과 점수가 있는지 봐주세요.", saved: 0, skipped: [] };
  }

  const supabase = createClient();
  const guard = await requireTeacher(supabase);
  if (guard.error) return { error: guard.error, saved: 0, skipped: [] };

  // ── 이름 붙이기 ────────────────────────────────────────
  const { data: students, error: sErr } = await supabase
    .from("students").select("id, name, school");
  if (sErr) return { error: sErr.message, saved: 0, skipped: [] };

  const byName = new Map();
  const dup = new Set();
  (students || []).forEach((s) => {
    const k = nameKey(s.name);
    if (byName.has(k)) dup.add(k);
    byName.set(k, s);
  });

  const skipped = [];
  const ready = [];
  list.forEach((r) => {
    const k = nameKey(r.name);
    const hit = byName.get(k);
    if (!hit) {
      skipped.push({ name: r.name, term: r.term || "", why: "재원생 목록에 없는 이름이에요" });
      return;
    }
    // **같은 이름이 둘이면 넣지 않는다.** 아무 쪽에나 붙이면 그 아이 성적이
    // 남의 것이 된다 — 그건 없느니만 못하다
    if (dup.has(k)) {
      skipped.push({ name: r.name, term: r.term || "", why: "같은 이름이 둘 이상이라 누구인지 못 정해요" });
      return;
    }
    ready.push({ row: r, student: hit });
  });

  if (ready.length === 0) {
    return { error: null, saved: 0, skipped, updated: 0 };
  }

  // ── 이미 있는 것 찾기 (학생 · 종류 · 시험명 · 날짜) ────────
  const ids = [...new Set(ready.map((x) => x.student.id))];
  const { data: have, error: hErr } = await supabase
    .from("scores")
    .select("id, student_id, kind, term, taken_on")
    .in("student_id", ids);
  if (noTable(hErr)) {
    return { error: "설정 → Supabase SQL 에서 0072 를 먼저 실행해주세요.", saved: 0, skipped };
  }
  const sameKey = (x) =>
    [x.student_id, x.kind, (x.term || "").trim(), x.taken_on || ""].join("|");
  const known = new Map((have || []).map((x) => [sameKey(x), x.id]));

  let saved = 0;
  let updated = 0;
  const failed = [];

  for (const { row, student } of ready) {
    const body = {
      student_id: student.id,
      kind: row.kind,
      taken_on: row.taken_on,
      term: row.term,
      subject: row.subject || "영어",
      raw_score: row.raw_score,
      full_score: row.full_score,
      grade: row.grade,
      percentile: row.percentile,
      rank_in: row.rank_in,
      rank_of: row.rank_of,
      // 학교를 안 적었으면 그 아이 학교로 본다 (내신은 자기 학교 시험이다)
      school: row.school || (row.kind === "school" ? student.school || null : null),
      cuts: row.cuts?.length ? row.cuts : null,
      note: row.note,
      source: "excel",
    };
    const at = known.get(sameKey(body));
    const { error } = at
      ? await supabase.from("scores").update(body).eq("id", at)
      : await supabase.from("scores").insert({ ...body, created_by: guard.user.id });

    if (error) {
      failed.push({ name: row.name, term: row.term || "", why: error.message });
      continue;
    }
    at ? (updated += 1) : (saved += 1);
  }

  revalidatePath("/scores");
  revalidatePath("/parent");
  return { error: null, saved, updated, skipped: [...skipped, ...failed] };
}

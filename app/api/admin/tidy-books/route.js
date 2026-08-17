import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * **쌍둥이 교재 대청소** (원장님, 2026-08-17 — 「도구 만들지 않고 바로
 * 할 수는 없어? 이제는 겹치는 교재 안 만들 거라서」).
 *
 * 같은 책이 이름만 다르게 2~4권으로 갈라져, 배정은 A 에 단원은 B 에
 * 있었다. 규칙(원장님 확정): **배정된 이름을 남기고, 단원은 오늘 넣은
 * 엑셀을 정본으로, 나머지 쌍둥이(옛 단원 뭉치)는 없앤다.**
 *
 * 한 묶음 = { keep, twins[], wipeKeeperUnits? }
 *  - twins 의 배정·단어시험·반 교재는 keep 으로 옮기고(겹치면 keep 것),
 *    **단원은 안 옮긴다** — 옛 뭉치이기 때문이다. 그리고 twins 를 지운다.
 *  - wipeKeeperUnits 면 keep 의 기존 단원도 지운다 (엑셀을 새로 올릴
 *    자리를 비우는 것 — 진도가 찍힌 단원이 있으면 그 진도도 사라지므로
 *    옛 뭉치가 확실할 때만 쓴다).
 *
 * 원장님 로그인(직원)으로만 돈다 — 브라우저에서 부르는 일회성 청소.
 */
export async function POST(request) {
  const supabase = createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return NextResponse.json({ error: guard.error }, { status: 403 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON 이 아니에요." }, { status: 400 });
  }
  const groups = Array.isArray(body?.groups) ? body.groups : [];
  if (!groups.length) return NextResponse.json({ error: "groups 가 비었어요." }, { status: 400 });

  const { data: books, error: bErr } = await supabase.from("textbooks").select("id, name");
  if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 });
  const idOf = new Map((books || []).map((b) => [b.name.trim(), b.id]));

  const out = [];
  for (const g of groups) {
    const res = { keep: g.keep, moved: {}, deleted: [], wiped: 0, errors: [] };
    const keepId = idOf.get((g.keep || "").trim());
    if (!keepId) {
      res.errors.push(`남길 교재를 못 찾음: ${g.keep}`);
      out.push(res);
      continue;
    }
    const twinIds = (g.twins || [])
      .map((n) => ({ n, id: idOf.get(n.trim()) }))
      .filter((x) => x.id && x.id !== keepId);
    const missing = (g.twins || []).filter((n) => !idOf.get(n.trim()));
    if (missing.length) res.errors.push(`쌍둥이 못 찾음: ${missing.join(", ")}`);

    for (const { n, id } of twinIds) {
      // 배정 계열 — 같은 짝이 keep 에 이미 있으면 쌍둥이 쪽을 버린다
      for (const { table, who } of [
        { table: "student_textbooks", who: "student_id" },
        { table: "class_textbooks", who: "class_id" },
        { table: "word_test_settings", who: "student_id" },
      ]) {
        try {
          const { data: mine } = await supabase.from(table).select(who).eq("textbook_id", keepId);
          const already = new Set((mine || []).map((r) => r[who]));
          const { data: theirs } = await supabase.from(table).select(who).eq("textbook_id", id);
          const dup = [...new Set((theirs || []).map((r) => r[who]))].filter((w) => already.has(w));
          if (dup.length) {
            await supabase.from(table).delete().eq("textbook_id", id).in(who, dup);
          }
          const { data: movedRows } = await supabase
            .from(table).update({ textbook_id: keepId }).eq("textbook_id", id).select(who);
          res.moved[table] = (res.moved[table] || 0) + (movedRows || []).length;
        } catch (e) {
          res.errors.push(`${n}/${table}: ${e?.message || e}`);
        }
      }
      // 진도·수업 진도는 단원에 붙어 있어 옛 뭉치와 함께 사라진다 (규칙대로)
      const { error: dErr } = await supabase.from("textbooks").delete().eq("id", id);
      if (dErr) res.errors.push(`${n} 삭제 실패: ${dErr.message}`);
      else res.deleted.push(n);
    }

    if (g.wipeKeeperUnits) {
      const { data: gone } = await supabase
        .from("textbook_units").delete().eq("textbook_id", keepId).select("id");
      res.wiped = (gone || []).length;
    }
    out.push(res);
  }

  return NextResponse.json({ ok: true, results: out });
}

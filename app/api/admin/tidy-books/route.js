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
/**
 * GET ?op=end-dead — **죽은 교재의 산 배정 끝내기** (원장님, 2026-08-18 —
 * 「사용중이지 않은 교재가 사용중이라고 체크되어 있어」).
 * 이관으로 들어온 옛 배정이 종료 없이 살아 있어서, 절판·중단된 책이
 * 진도·오늘 수업에 「사용중」 으로 섰다. 책이 죽었으면 배정도 끝낸다
 * (ended_on 오늘 · status done). 폰에서 이 주소를 열면 된다 — 원장님
 * 로그인으로만 돈다.
 */
export async function GET(request) {
  const supabase = createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return NextResponse.json({ error: guard.error }, { status: 403 });
  const op = new URL(request.url).searchParams.get("op");
  if (op !== "end-dead") return NextResponse.json({ error: "op=end-dead 로 열어주세요." }, { status: 400 });

  const { data: dead } = await supabase
    .from("textbooks").select("id, name").neq("status", "active").not("status", "is", null);
  const ids = (dead || []).map((b) => b.id);
  if (!ids.length) return NextResponse.json({ ok: true, ended: 0, note: "죽은 교재가 없어요." });

  /**
   * 「끝냄(done)」 이 아니라 **「배정 취소(dropped)」** 다 (원장님,
   * 2026-08-18 — 「한 적 없는 교재들이 했다고 들어가 있네」). 이관
   * 잔재는 실제로 한 적이 없으니 「했던 교재」 기록에 서면 거짓말이
   * 된다. dropped 는 기록 화면에도 안 선다.
   * 첫 실행에서 done 으로 찍었던 것(오늘 날짜)도 여기서 되돌린다.
   */
  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  const { data: fixedRows } = await supabase
    .from("student_textbooks")
    .update({ status: "dropped" })
    .in("textbook_id", ids)
    .eq("status", "done")
    .eq("ended_on", today)
    .select("student_id");
  const { data: endedRows, error } = await supabase
    .from("student_textbooks")
    .update({ status: "dropped", ended_on: today })
    .in("textbook_id", ids)
    .eq("status", "active")
    .select("student_id, textbook_id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const nameOf = new Map((dead || []).map((b) => [b.id, b.name]));
  return NextResponse.json({
    ok: true,
    ended: (endedRows || []).length,
    fixedFromDone: (fixedRows || []).length,   // done 으로 잘못 찍혔다 정정된 수
    detail: (endedRows || []).slice(0, 60).map((r) => nameOf.get(r.textbook_id) || r.textbook_id),
  });
}

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

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/guard";
import { fetchAll } from "@/lib/fetchAll";
import { bookKey } from "@/lib/bookName";
import EXCEL_PATHS from "./excel-paths.json";

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
  if (op === "dedupe-units") return dedupeUnits(supabase, request);
  if (op === "prune-units") return pruneUnits(supabase, request);
  if (op !== "end-dead") return NextResponse.json({ error: "op=end-dead · dedupe-units · prune-units 로 열어주세요." }, { status: 400 });

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

/**
 * **옛 이관 단원 걷어내기** (원장님, 2026-08-19 — 3300제에 노션 이관분과
 * 엑셀 정본이 섞여 있길래 「어느 쪽?」 물으니 「1」(엑셀만 남기기)).
 *
 * 엑셀 정본의 단원 경로 목록(excel-paths.json — 8/17 단원 엑셀에서 뽑음)에
 * **없는 경로의 단원**을 그 31권에서 지운다. 지워지는 단원에 찍힌 진도도
 * 함께 사라진다 — 원장님이 알고 고른 것. 엑셀에 없는 교재(단어책 등)는
 * 아예 안 건드린다. 정본 단원이 하나도 안 잡히는 교재는 (엑셀 주입이
 * 안 된 것일 수 있어) 건너뛰고 알려만 준다. ?dry=1 이면 세기만 한다.
 */
async function pruneUnits(supabase, request) {
  const dry = new URL(request.url).searchParams.get("dry") === "1";
  const SEP = "";

  const { data: books, error: bErr } = await supabase.from("textbooks").select("id, name");
  if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 });
  const byKey = new Map((books || []).map((b) => [bookKey(b.name), b]));

  const missingBooks = [];
  const results = [];
  let totalRemove = 0;

  for (const [xname, paths] of Object.entries(EXCEL_PATHS)) {
    const book = byKey.get(bookKey(xname));
    if (!book) { missingBooks.push(xname); continue; }

    const { data: units, error } = await fetchAll(() =>
      supabase
        .from("textbook_units")
        .select("id, parent_id, name")
        .eq("textbook_id", book.id)
        .order("id")
    );
    if (error) { results.push({ book: book.name, error: error.message }); continue; }
    if (!units?.length) continue;

    const byId = new Map(units.map((u) => [u.id, u]));
    const pathOf = (u) => {
      const parts = [];
      for (let cur = u, hop = 0; cur && hop < 7; hop += 1) {
        parts.unshift((cur.name || "").trim());
        cur = cur.parent_id ? byId.get(cur.parent_id) : null;
      }
      return parts.join(SEP);
    };
    const valid = new Set(paths);
    const bad = units.filter((u) => !valid.has(pathOf(u)));
    const goodCount = units.length - bad.length;
    if (goodCount === 0) {
      results.push({ book: book.name, skip: "정본 단원이 하나도 없음 — 건너뜀", units: units.length });
      continue;
    }
    if (!bad.length) continue;

    totalRemove += bad.length;
    const row = { book: book.name, before: units.length, remove: bad.length, keep: goodCount };
    if (!dry) {
      // 맨 위 잘못 단원만 지우면 그 아래는 cascade 로 따라 지워진다
      const badSet = new Set(bad.map((u) => u.id));
      const top = bad.filter((u) => !u.parent_id || !badSet.has(u.parent_id)).map((u) => u.id);
      for (let i = 0; i < top.length; i += 150) {
        const { error: dErr } = await supabase
          .from("textbook_units").delete().in("id", top.slice(i, i + 150));
        if (dErr) { row.error = dErr.message; break; }
      }
    }
    results.push(row);
  }

  return NextResponse.json({ ok: true, dry, totalRemove, missingBooks, results });
}

/**
 * **쌍둥이 단원 청소** (원장님, 2026-08-19 — 「왜 단원이 중복되지?」).
 *
 * 단원 엑셀에는 한 줄인데 DB 에 같은 단원이 2~5개씩 있다 — 색인이
 * 1000줄에서 잘리던 시절(fetchAll 전)의 업로드 재시도가 「이미 있음」 을
 * 못 보고 매번 새로 넣은 잔재다. 넣던 길은 고쳐졌으니 남은 중복만 걷는다.
 *
 * 같은 (교재 · 같은 자리(부모) · 이름 · 라벨 · 쪽 · 문제번호) 는 한 몸으로
 * 본다. 맨 먼저 만든 것을 남기고:
 *  - 남는 단원의 부모가 지워질 쪽이면 부모를 남는 쪽으로 옮기고,
 *  - 진도(student_unit_progress)는 남는 쪽으로 합치고 (남는 쪽에 이미
 *    기록이 있으면 채워진 쪽을 남긴다),
 *  - 숙제·수업 기록(daily_report_items 등)의 단원 연결도 남는 쪽으로,
 *  - 그 다음 중복을 지운다.
 * ?dry=1 이면 지우지 않고 세기만 한다.
 */
async function dedupeUnits(supabase, request) {
  const dry = new URL(request.url).searchParams.get("dry") === "1";

  const { data: units, error: uErr } = await fetchAll(() =>
    supabase
      .from("textbook_units")
      .select("id, textbook_id, parent_id, label, name, page_start, page_end, question_no, sort")
      .order("id")
  );
  if (uErr) {
    // 0070 전 DB 는 question_no 가 없다
    const { data: u2, error: e2 } = await fetchAll(() =>
      supabase
        .from("textbook_units")
        .select("id, textbook_id, parent_id, label, name, page_start, page_end, sort")
        .order("id")
    );
    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
    return dedupeCore(supabase, u2, dry);
  }
  return dedupeCore(supabase, units, dry);
}

async function dedupeCore(supabase, units, dry) {
  const byId = new Map(units.map((u) => [u.id, u]));
  const depthOf = (u) => {
    let d = 0;
    for (let p = u.parent_id; p; p = byId.get(p)?.parent_id) {
      if (++d > 6) break; // 고리 방어
    }
    return d;
  };
  // 위(대단원)부터 — 부모가 어느 쪽으로 남는지 정해져야 자식 열쇠가 맞다
  const ordered = [...units].sort(
    (a, b) => depthOf(a) - depthOf(b) || (a.sort ?? 0) - (b.sort ?? 0) || (a.id < b.id ? -1 : 1)
  );
  const canon = new Map();   // 지워질 id -> 남는 id
  const firstOf = new Map(); // 열쇠 -> 남는 id
  for (const u of ordered) {
    const pk = u.parent_id ? canon.get(u.parent_id) || u.parent_id : "root";
    const key = [
      u.textbook_id, pk, (u.name || "").trim(), (u.label || "").trim(),
      u.page_start ?? "", u.page_end ?? "", (u.question_no || "").toString().trim(),
    ].join("|");
    if (firstOf.has(key)) canon.set(u.id, firstOf.get(key));
    else firstOf.set(key, u.id);
  }
  const dupIds = [...canon.keys()];
  const bookCount = new Map();
  for (const id of dupIds) {
    const b = byId.get(id)?.textbook_id;
    bookCount.set(b, (bookCount.get(b) || 0) + 1);
  }
  const { data: bookRows } = await supabase.from("textbooks").select("id, name");
  const bookName = new Map((bookRows || []).map((b) => [b.id, b.name]));
  const byBook = [...bookCount.entries()]
    .map(([b, n]) => `${bookName.get(b) || b}: ${n}`)
    .slice(0, 40);
  const summary = { ok: true, dry, dups: dupIds.length, books: bookCount.size, byBook };
  if (!dupIds.length || dry) return NextResponse.json(summary);

  const chunks = (arr, n = 150) => {
    const out = [];
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
  };
  const dupSet = new Set(dupIds);

  // 1) 살아남는 단원의 부모가 지워질 쪽이면 남는 쪽으로
  let reparented = 0;
  for (const u of units) {
    if (dupSet.has(u.id)) continue;
    if (u.parent_id && dupSet.has(u.parent_id)) {
      await supabase
        .from("textbook_units")
        .update({ parent_id: canon.get(u.parent_id) })
        .eq("id", u.id);
      reparented += 1;
    }
  }

  // 2) 진도 합치기 — 남는 쪽에 (학생·회독) 기록이 없으면 옮기고, 있으면
  //    채워진 쪽을 남긴다 (지워질 쪽만 status 가 있으면 그걸 남는 쪽에 쓴다)
  let movedProgress = 0, mergedProgress = 0;
  const keeperIds = [...new Set(canon.values())];
  const progOf = async (ids) => {
    const rows = [];
    for (const c of chunks(ids)) {
      const { data } = await fetchAll(() =>
        supabase
          .from("student_unit_progress")
          .select("student_id, textbook_unit_id, round, status, done_on, note")
          .in("textbook_unit_id", c)
          .order("student_id")
      );
      rows.push(...(data || []));
    }
    return rows;
  };
  const dupProg = await progOf(dupIds);
  if (dupProg.length) {
    const keepProg = await progOf(keeperIds);
    const keepKey = new Map(
      keepProg.map((r) => [`${r.student_id}|${r.textbook_unit_id}|${r.round ?? 1}`, r])
    );
    for (const r of dupProg) {
      const keeper = canon.get(r.textbook_unit_id);
      const k = `${r.student_id}|${keeper}|${r.round ?? 1}`;
      const exist = keepKey.get(k);
      if (!exist) {
        const { error } = await supabase
          .from("student_unit_progress")
          .update({ textbook_unit_id: keeper })
          .eq("student_id", r.student_id)
          .eq("textbook_unit_id", r.textbook_unit_id)
          .eq("round", r.round ?? 1);
        if (!error) { movedProgress += 1; keepKey.set(k, { ...r, textbook_unit_id: keeper }); }
      } else if (!exist.status && r.status) {
        await supabase
          .from("student_unit_progress")
          .update({ status: r.status, done_on: r.done_on, note: exist.note || r.note })
          .eq("student_id", r.student_id)
          .eq("textbook_unit_id", keeper)
          .eq("round", exist.round ?? 1);
        mergedProgress += 1;
      }
      // 남는 쪽이 이미 채워져 있으면 그대로 — 지워질 쪽 기록은 cascade 로 사라진다
    }
  }

  // 3) 숙제·수업 기록의 단원 연결 — 걸린 줄만 골라 남는 쪽으로
  const repointed = {};
  for (const table of ["daily_report_items", "daily_assignments", "student_curriculum", "class_progress"]) {
    try {
      let n = 0;
      for (const c of chunks(dupIds)) {
        const { data: rows } = await supabase
          .from(table).select("id, textbook_unit_id").in("textbook_unit_id", c);
        for (const r of rows || []) {
          await supabase
            .from(table)
            .update({ textbook_unit_id: canon.get(r.textbook_unit_id) })
            .eq("id", r.id);
          n += 1;
        }
      }
      if (n) repointed[table] = n;
    } catch { /* 없는 표(옛 DB)는 건너뜀 */ }
  }

  // 4) 중복 삭제 — 깊은 것(자식)부터, 부모 cascade 로 산 것이 딸려가지 않게
  const delOrdered = [...dupIds].sort((a, b) => depthOf(byId.get(b)) - depthOf(byId.get(a)));
  let removed = 0;
  for (const c of chunks(delOrdered)) {
    const { data: gone, error } = await supabase
      .from("textbook_units").delete().in("id", c).select("id");
    if (error) return NextResponse.json({ ...summary, error: error.message, removed }, { status: 500 });
    removed += (gone || []).length;
  }

  return NextResponse.json({
    ...summary,
    removed, reparented, movedProgress, mergedProgress, repointed,
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

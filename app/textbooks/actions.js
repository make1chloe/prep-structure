"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { bookKey, pickKeeper } from "@/lib/bookName";
import { noColumn } from "@/lib/sqlError";

function clean(formData, key) {
  const v = (formData.get(key) || "").toString().trim();
  return v || null;
}
function num(formData, key) {
  const v = (formData.get(key) || "").toString().replace(/[^\d]/g, "");
  return v ? parseInt(v, 10) : null;
}

// 새 컬럼(word_range/activity)이 아직 DB에 없으면 그 컬럼만 빼고 다시 저장한다.
// -> Supabase 마이그레이션을 아직 안 돌렸어도 기본 저장은 되게 함.
async function insertSafe(supabase, table, rows, optionalKeys = []) {
  let { error } = await supabase.from(table).insert(rows);
  if (noColumn(error) && optionalKeys.length) {
    const strip = (r) => {
      const c = { ...r };
      optionalKeys.forEach((k) => delete c[k]);
      return c;
    };
    const trimmed = Array.isArray(rows) ? rows.map(strip) : strip(rows);
    ({ error } = await supabase.from(table).insert(trimmed));
  }
  return error;
}

export async function addTextbook(formData) {
  const name = (formData.get("name") || "").toString().trim();
  if (!name) return;

  const supabase = createClient();

  // 이미 **같은 교재**가 있으면 하나 더 만들지 않는다.
  // 「그래머존」 과 「그래머존 개정판」 은 사람 눈에는 같은 책인데, 이름이
  // 다르다는 이유로 둘이 되면 배정은 이쪽에 단원은 저쪽에 붙는다.
  const { data: has } = await supabase.from("textbooks").select("id, name, status");
  const key = bookKey(name);
  // 조용히 넘어가면 "저장을 눌렀는데 아무 일도 안 났다" 가 된다.
  // 이미 있는 그 교재로 **데려다 준다** — 왜 안 만들어졌는지가 바로 보인다.
  const twin = (has || []).find((b) => bookKey(b.name) === key);
  if (twin) {
    revalidatePath("/textbooks");
    /**
     * 쌍둥이가 **절판·중단**이면 그 사정까지 실어 보낸다 (2026-08-14 —
     * 「동아」 계열: 목록·검색에는 안 보이는데 「이미 있어요」 만 떠서,
     * 만들 수도 쓸 수도 없는 것처럼 보였다). dead=1 이면 화면이
     * 「중단 처리돼 숨어 있다 · 되살리는 법」 을 알려준다.
     */
    const dead = twin.status && twin.status !== "active" ? "&dead=1" : "";
    redirect(`/textbooks?tb=${twin.id}&same=${encodeURIComponent(name)}${dead}`);
  }

  await insertSafe(
    supabase,
    "textbooks",
    {
      name,
      area: clean(formData, "area"),
      target_grade: clean(formData, "target_grade"),
      total_pages: num(formData, "total_pages"),
      price: num(formData, "price"),
      purchase_url: clean(formData, "purchase_url"),
      word_range: num(formData, "word_range"),
      feature: clean(formData, "feature"),
      status: clean(formData, "status") || "active",
    },
    ["word_range", "status"]
  );
  revalidatePath("/textbooks");
}

export async function bulkAddTextbooks(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { inserted: 0, error: null };
  }
  const toInt = (v) => {
    const d = (v || "").toString().replace(/[^\d]/g, "");
    return d ? parseInt(d, 10) : null;
  };
  const supabase = createClient();

  // 이미 있는 교재는 다시 만들지 않는다. 띄어쓰기·「2025 개정」만 다른 것도
  // 같은 교재로 본다 (lib/bookName) — 그래야 진도가 둘로 갈리지 않는다.
  const { data: had } = await supabase.from("textbooks").select("name, status");
  const known = new Set((had || []).map((b) => bookKey(b.name)));
  // 같은 이름이 **절판·중단**에 숨어 있는 경우를 따로 센다 (2026-08-14 —
  // 「동아」 계열 52권 중 48권이 조용히 「이미 있음」 으로 넘어가서, 왜
  // 안 생겼는지 알 길이 없었다)
  const deadNames = new Set(
    (had || []).filter((b) => b.status && b.status !== "active").map((b) => bookKey(b.name))
  );
  const aliveNames = new Set(
    (had || []).filter((b) => !b.status || b.status === "active").map((b) => bookKey(b.name))
  );
  let skipped = 0;
  const skippedDead = [];

  const payload = rows
    .filter((r) => (r?.name || "").trim() !== "")
    .filter((r) => {
      const k = bookKey(r.name);
      if (known.has(k)) {
        if (deadNames.has(k) && !aliveNames.has(k)) skippedDead.push(r.name.trim());
        else skipped += 1;
        return false;
      }
      known.add(k);          // 엑셀 안에서 같은 이름이 두 번 나와도 한 번만
      return true;
    })
    .map((r) => ({
      name: r.name.trim(),
      area: (r.area || "").trim() || null,
      target_grade: (r.target_grade || "").trim() || null,
      total_pages: toInt(r.total_pages),
      price: toInt(r.price),
      word_range: toInt(r.word_range),
      purchase_url: (r.purchase_url || "").trim() || null,
      feature: (r.feature || "").trim() || null,
    }));

  if (payload.length === 0) {
    revalidatePath("/textbooks");
    return { inserted: 0, skipped, skippedDead, error: null };
  }
  const error = await insertSafe(supabase, "textbooks", payload, ["word_range"]);
  revalidatePath("/textbooks");
  return {
    inserted: error ? 0 : payload.length,
    skipped,
    skippedDead,
    error: error ? error.message : null,
  };
}

/**
 * 같은 교재 둘을 **하나로 합친다.**
 *
 * 엑셀 이름이 조금 달라서 갈라진 것을 되돌리는 일이다. 무엇이 어디로 가는지
 * 적어두면
 *   · 단원은 남길 교재로 옮긴다 — 단원 id 는 그대로라 **진도·숙제 기록이 살아 있다**
 *   · 학생 배정 · 반 배정은 이미 남길 교재에 있으면 버리고, 없으면 옮긴다
 *   · 단어시험 방식 · 루틴 · 수업진도 · 단원평가도 같이 옮긴다
 *   · 마지막에 없앨 교재만 지운다
 *
 * 지우는 것은 **껍데기뿐**이다. 안에 있던 것은 전부 남길 교재로 갔다.
 */
export async function mergeTextbooks(keepId, dropIds) {
  const drops = (Array.isArray(dropIds) ? dropIds : [dropIds]).filter(
    (id) => id && id !== keepId
  );
  if (!keepId || drops.length === 0) return { error: null, moved: 0 };
  const supabase = createClient();
  let moved = 0;

  // 그냥 옮기면 되는 것들 (겹칠 일이 없다)
  for (const table of ["textbook_units", "class_progress", "routine_steps", "unit_exams"]) {
    const { error } = await supabase
      .from(table)
      .update({ textbook_id: keepId })
      .in("textbook_id", drops);
    // 아직 없는 표는 넘어간다 (마이그레이션을 다 안 돌렸을 수 있다)
    if (error && error.code !== "42P01" && error.code !== "PGRST205") {
      return { error: `${table}: ${error.message}` };
    }
    if (!error) moved += 1;
  }

  // 같은 짝이 이미 있으면 옮길 수 없다 — 이미 있는 쪽을 두고 버린다
  const pairs = [
    { table: "student_textbooks", who: "student_id" },
    { table: "class_textbooks", who: "class_id" },
    { table: "word_test_settings", who: "student_id" },
  ];
  for (const { table, who } of pairs) {
    const { data: mine, error: e1 } = await supabase
      .from(table)
      .select(who)
      .eq("textbook_id", keepId);
    if (e1 && (e1.code === "42P01" || e1.code === "PGRST205")) continue;
    const already = new Set((mine || []).map((r) => r[who]));

    const { data: theirs } = await supabase
      .from(table)
      .select(who)
      .in("textbook_id", drops);
    const dupWho = [...new Set((theirs || []).map((r) => r[who]))].filter((w) => already.has(w));

    if (dupWho.length > 0) {
      await supabase.from(table).delete().in("textbook_id", drops).in(who, dupWho);
    }
    await supabase.from(table).update({ textbook_id: keepId }).in("textbook_id", drops);
  }

  const { error } = await supabase.from("textbooks").delete().in("id", drops);
  revalidatePath("/textbooks");
  revalidatePath("/students");
  revalidatePath("/today");
  return { error: error ? error.message : null, moved };
}

/**
 * 같은 교재로 보이는 묶음을 그대로 다 합친다.
 * 남길 것은 **쓰고 있는 학생이 가장 많은 쪽**으로 고른다 (lib/bookName).
 */
export async function mergeDuplicateBooks(groups) {
  if (!Array.isArray(groups) || groups.length === 0) return { error: null, merged: 0 };
  let merged = 0;
  for (const books of groups) {
    if (!Array.isArray(books) || books.length < 2) continue;
    const keep = pickKeeper(books);
    if (!keep) continue;
    const res = await mergeTextbooks(
      keep.id,
      books.filter((b) => b.id !== keep.id).map((b) => b.id)
    );
    if (res?.error) return { error: res.error, merged };
    merged += 1;
  }
  return { error: null, merged };
}

export async function addUnit(formData) {
  const textbook_id = (formData.get("textbook_id") || "").toString().trim();
  const name = (formData.get("name") || "").toString().trim();
  if (!textbook_id || !name) return;

  const parent_id = (formData.get("parent_id") || "").toString().trim() || null;
  const activity = clean(formData, "activity"); // label 컬럼에 저장(활동)

  const supabase = createClient();

  // 순서: 비어있으면 같은 상위 안에서 최대+1 자동
  let sort = num(formData, "sort");
  if (sort === null) {
    let q = supabase
      .from("textbook_units")
      .select("sort")
      .eq("textbook_id", textbook_id)
      .order("sort", { ascending: false })
      .limit(1);
    q = parent_id ? q.eq("parent_id", parent_id) : q.is("parent_id", null);
    const { data: last } = await q;
    sort = (last?.[0]?.sort ?? 0) + 1;
  }

  const row = {
    textbook_id,
    parent_id,
    name,
    sort,
    label: activity,
    page_start: num(formData, "page_start"),
    page_end: num(formData, "page_end"),
  };
  const question_no = clean(formData, "question_no");

  let { error } = await supabase
    .from("textbook_units")
    .insert({ ...row, question_no });
  if (noColumn(error)) {
    // 0051 전 — 문제번호 칸이 아직 없다
    await supabase.from("textbook_units").insert(row);
  }
  revalidatePath("/textbooks");
}

// ---------- 교재: 수정 / 삭제 ----------

export async function updateTextbook(id, patch) {
  if (!id) return { error: "id 없음" };
  const allow = ["name", "area", "target_grade", "total_pages", "price", "word_range", "words_irregular", "purchase_url", "feature", "status"];
  const row = {};
  allow.forEach((k) => {
    if (k in (patch || {})) {
      let v = patch[k];
      if (k === "total_pages" || k === "price" || k === "word_range") {
        const d = (v ?? "").toString().replace(/[^\d]/g, "");
        v = d ? parseInt(d, 10) : null;
      } else if (k === "words_irregular") {
        v = !!v;
      } else if (typeof v === "string") {
        v = v.trim() || null;
      }
      row[k] = v ?? null;
    }
  });
  if (Object.keys(row).length === 0) return { error: null };

  const supabase = createClient();
  let { error } = await supabase.from("textbooks").update(row).eq("id", id);
  if (noColumn(error)) {
    // 0070 전이면 '불규칙' 없이
    const { words_irregular: _wi, ...noIrr } = row;
    ({ error } = await supabase.from("textbooks").update(noIrr).eq("id", id));
  }
  if (noColumn(error)) {
    const { word_range, words_irregular: _wi2, status, ...rest } = row;
    ({ error } = await supabase.from("textbooks").update(rest).eq("id", id));
  }
  revalidatePath("/textbooks");
  return { error: error ? error.message : null };
}

export async function deleteTextbooks(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return { error: null };
  const supabase = createClient();
  const { error } = await supabase.from("textbooks").delete().in("id", ids);
  revalidatePath("/textbooks");
  return { error: error ? error.message : null };
}

export async function updateTextbooksStatus(ids, status) {
  if (!Array.isArray(ids) || ids.length === 0 || !status) return { error: null };
  const supabase = createClient();
  const { error } = await supabase.from("textbooks").update({ status }).in("id", ids);
  revalidatePath("/textbooks");
  return { error: error ? error.message : null };
}

export async function updateTextbooksArea(ids, area) {
  if (!Array.isArray(ids) || ids.length === 0 || !area) return { error: null };
  const supabase = createClient();
  const { error } = await supabase.from("textbooks").update({ area }).in("id", ids);
  revalidatePath("/textbooks");
  return { error: error ? error.message : null };
}

// ---------- 단원: 수정 / 삭제 / 이동 ----------

/**
 * **배정하던 자리에서 단원 빨리 만들기** (원장님, 2026-08-14 — 「단원평가
 * 배정할 때 내가 단원을 선택할 수가 없어. 추가 기능 필요해」).
 *
 * 숙제를 배정하다 「이 교재에 단원이 없어요」 를 만나면, 교재 화면으로
 * 갔다가 돌아와야 했다 — 수업 중에는 그 동선이 없다. 이름만 적으면
 * 그 자리에서 단원이 생기고 바로 골라진다.
 * · , · 줄바꿈으로 여러 개 한 번에. 순서는 맨 뒤에 붙는다.
 * 고치기·지우기·페이지는 교재 화면(교재 › 단원)에서 — 만들기만 지름길이다.
 */
export async function quickAddUnits(textbookId, text) {
  const names = String(text || "")
    .split(/[,·\n]+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 30);
  if (!textbookId || names.length === 0) return { error: "단원 이름을 적어주세요.", ids: [] };
  const supabase = createClient();
  // 이미 있는 이름은 또 만들지 않고 그 단원을 돌려준다
  const { data: had } = await supabase
    .from("textbook_units")
    .select("id, name, sort")
    .eq("textbook_id", textbookId);
  const byName = new Map((had || []).map((u) => [u.name.trim(), u.id]));
  const maxSort = Math.max(0, ...(had || []).map((u) => u.sort || 0));
  const fresh = names.filter((n) => !byName.has(n));
  if (fresh.length) {
    const { data: made, error } = await supabase
      .from("textbook_units")
      .insert(fresh.map((name, i) => ({ textbook_id: textbookId, name, sort: maxSort + i + 1 })))
      .select("id, name");
    if (error) return { error: error.message, ids: [] };
    (made || []).forEach((u) => byName.set(u.name.trim(), u.id));
  }
  revalidatePath("/textbooks");
  return { error: null, ids: names.map((n) => byName.get(n)).filter(Boolean), made: fresh.length };
}

export async function updateUnit(id, patch) {
  if (!id) return { error: "id 없음" };
  const row = {};
  if ("name" in (patch || {})) row.name = (patch.name || "").trim() || null;
  if ("sort" in (patch || {})) {
    const d = (patch.sort ?? "").toString().replace(/[^\d]/g, "");
    row.sort = d ? parseInt(d, 10) : 0;
  }
  if ("activity" in (patch || {})) row.label = (patch.activity || "").trim() || null;
  if ("parent_id" in (patch || {})) row.parent_id = patch.parent_id || null;
  if ("question_no" in (patch || {})) row.question_no = (patch.question_no || "").trim() || null;
  // 단어 교재 — 이 소단원의 단어 개수 (0070)
  if ("word_count" in (patch || {})) {
    const d = (patch.word_count ?? "").toString().replace(/[^\d]/g, "");
    row.word_count = d ? parseInt(d, 10) : null;
  }
  ["page_start", "page_end"].forEach((k) => {
    if (k in (patch || {})) {
      const d = (patch[k] ?? "").toString().replace(/[^\d]/g, "");
      row[k] = d ? parseInt(d, 10) : null;
    }
  });

  const supabase = createClient();
  let { error } = await supabase.from("textbook_units").update(row).eq("id", id);
  if (noColumn(error)) {
    // 0070 전 — 단어 개수만 빼고 나머지는 저장한다
    const { word_count: _w, ...noWords } = row;
    ({ error } = await supabase.from("textbook_units").update(noWords).eq("id", id));
  }
  if (noColumn(error)) {
    // 0051 전 — 문제번호 칸만 빼고 나머지는 저장한다
    const { question_no, word_count: _w2, ...rest } = row;
    ({ error } = await supabase.from("textbook_units").update(rest).eq("id", id));
  }
  revalidatePath("/textbooks");
  return { error: error ? error.message : null };
}

export async function deleteUnits(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return { error: null };
  const supabase = createClient();
  const { error } = await supabase.from("textbook_units").delete().in("id", ids);
  revalidatePath("/textbooks");
  return { error: error ? error.message : null };
}

// 선택한 단원을 다른 교재로 옮기기 (최상위=대단원으로 이동)
export async function moveUnitsToTextbook(ids, textbookId) {
  if (!Array.isArray(ids) || ids.length === 0 || !textbookId) return { error: null };
  const supabase = createClient();
  const { data: last } = await supabase
    .from("textbook_units")
    .select("sort")
    .eq("textbook_id", textbookId)
    .is("parent_id", null)
    .order("sort", { ascending: false })
    .limit(1);
  let next = (last?.[0]?.sort ?? 0) + 1;

  for (const id of ids) {
    const { error } = await supabase
      .from("textbook_units")
      .update({ textbook_id: textbookId, parent_id: null, sort: next++ })
      .eq("id", id);
    if (error) {
      revalidatePath("/textbooks");
      return { error: error.message };
    }
  }
  revalidatePath("/textbooks");
  return { error: null };
}

// 선택한 단원을 다른 상위 단원 밑으로 옮기기 (parentId 가 null 이면 대단원으로)
export async function moveUnitsUnder(ids, parentId, textbookId) {
  if (!Array.isArray(ids) || ids.length === 0 || !textbookId) return { error: null };
  if (parentId && ids.includes(parentId)) {
    return { error: "자기 자신 아래로는 옮길 수 없어요." };
  }
  const supabase = createClient();

  let q = supabase
    .from("textbook_units")
    .select("sort")
    .eq("textbook_id", textbookId)
    .order("sort", { ascending: false })
    .limit(1);
  q = parentId ? q.eq("parent_id", parentId) : q.is("parent_id", null);
  const { data: last } = await q;
  let next = (last?.[0]?.sort ?? 0) + 1;

  for (const id of ids) {
    const { error } = await supabase
      .from("textbook_units")
      .update({ parent_id: parentId || null, sort: next++ })
      .eq("id", id);
    if (error) {
      revalidatePath("/textbooks");
      return { error: error.message };
    }
  }
  revalidatePath("/textbooks");
  return { error: null };
}

// 선택한 단원을 같은 상위 안에서 위/아래로 한 칸 이동
export async function moveUnits(ids, direction, textbookId) {
  if (!Array.isArray(ids) || ids.length === 0 || !textbookId) return { error: null };
  const supabase = createClient();
  const { data: all } = await supabase
    .from("textbook_units")
    .select("id, sort, parent_id")
    .eq("textbook_id", textbookId)
    .order("sort", { ascending: true });
  if (!all || all.length === 0) return { error: null };

  // 형제(같은 부모)끼리만 자리 교환
  const groups = new Map();
  all.forEach((u) => {
    const k = u.parent_id || "root";
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(u);
  });

  for (const list of groups.values()) {
    const idxs = list
      .map((u, i) => (ids.includes(u.id) ? i : -1))
      .filter((i) => i >= 0);
    if (idxs.length === 0) continue;
    const ordered = direction === "up" ? idxs : [...idxs].reverse();
    for (const i of ordered) {
      const j = direction === "up" ? i - 1 : i + 1;
      if (j < 0 || j >= list.length) continue;
      if (ids.includes(list[j].id)) continue;
      [list[i], list[j]] = [list[j], list[i]];
    }
    for (let i = 0; i < list.length; i++) {
      if (list[i].sort !== i + 1) {
        await supabase.from("textbook_units").update({ sort: i + 1 }).eq("id", list[i].id);
      }
    }
  }
  revalidatePath("/textbooks");
  return { error: null };
}

export async function deleteUnit(formData) {
  const id = (formData.get("id") || "").toString().trim();
  if (!id) return;
  const supabase = createClient();
  await supabase.from("textbook_units").delete().eq("id", id);
  revalidatePath("/textbooks");
}

/**
 * 단원 엑셀 대량 업로드.
 * 각 줄의 교재명(+출판년도)으로 교재를 찾고(없으면 만들고),
 * 대 → 중 → 소 계층을 만들어 가며 단원을 넣는다.
 * 같은 위치에 같은 이름이 이미 있으면 다시 만들지 않고 재사용한다.
 */
export async function bulkAddUnits(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { inserted: 0, error: null, createdBooks: 0 };
  }
  const supabase = createClient();

  // 1) 교재 찾아두기.
  //
  //    **이름 그대로 맞춰보면 안 된다.** 엑셀에 「그래머존 2025 개정」 이라고
  //    적혀 있고 앱에는 「그래머존」 이 있으면, 예전에는 교재가 하나 더 생겼다.
  //    그러면 배정은 옛 교재에 · 단원은 새 교재에 붙어서 진도가 둘로 갈린다.
  //    그래서 띄어쓰기·판 표시를 뺀 **열쇠**로 맞춰본다 (lib/bookName).
  const { data: books } = await supabase.from("textbooks").select("id, name");
  const bookByName = new Map((books || []).map((b) => [bookKey(b.name), b.id]));
  let createdBooks = 0;

  async function ensureBook(name, pubYear) {
    const key = bookKey(name);
    if (bookByName.has(key)) return bookByName.get(key);
    const row = { name: name.trim() };
    if (pubYear) row.pub_year = pubYear;
    let { data, error } = await supabase.from("textbooks").insert(row).select("id").single();
    if (error && noColumn(error)) {
      ({ data, error } = await supabase
        .from("textbooks").insert({ name: name.trim() }).select("id").single());
    }
    if (error) throw new Error(`교재 '${name.trim()}' 생성 실패: ${error.message}`);
    bookByName.set(key, data.id);
    createdBooks += 1;
    return data.id;
  }

  // 2) 기존 단원을 (교재, 부모, 이름) 으로 색인
  const { data: existing } = await supabase
    .from("textbook_units")
    .select("id, textbook_id, parent_id, name, sort");
  const unitKey = (tb, parent, name) => `${tb}|${parent || "root"}|${name}`;
  const unitIndex = new Map(
    (existing || []).map((u) => [unitKey(u.textbook_id, u.parent_id, u.name), u.id])
  );
  const maxSort = new Map();
  (existing || []).forEach((u) => {
    const k = `${u.textbook_id}|${u.parent_id || "root"}`;
    maxSort.set(k, Math.max(maxSort.get(k) ?? 0, u.sort ?? 0));
  });

  // 엑셀을 고쳐서 다시 올렸을 때 **고친 것이 반영되어야 한다.**
  //   예전에는 이름이 같으면 그냥 넘어가서, 페이지를 고치고 다시 올려도 그대로였다.
  //   무엇을 건드렸는지 알 수 있게 센다.
  let updated = 0;
  const touched = new Set();

  async function ensureUnit(textbookId, parentId, name, extra = {}) {
    const key = unitKey(textbookId, parentId, name);
    if (unitIndex.has(key)) {
      const id = unitIndex.get(key);
      touched.add(id);
      // 파일에 값이 있는 것만 덮어쓴다. 비어 있는 칸으로 지우면
      // 앱에서 손으로 고쳐둔 것이 날아간다.
      const patch = {};
      if (extra.activity) patch.label = extra.activity;
      if (extra.page_start != null && extra.page_start !== "") patch.page_start = extra.page_start;
      if (extra.page_end != null && extra.page_end !== "") patch.page_end = extra.page_end;
      if (extra.question_no) patch.question_no = extra.question_no;
      // 분량과 내용 (0100) — 오늘 수업에서 보시는 것들
      if (extra.question_count != null && extra.question_count !== "") patch.question_count = extra.question_count;
      if (extra.question_range) patch.question_range = extra.question_range;
      if (extra.word_count != null && extra.word_count !== "") patch.word_count = extra.word_count;
      if (extra.summary) patch.summary = extra.summary;
      if (extra.minutes != null && extra.minutes !== "") patch.minutes = extra.minutes;
      if (Object.keys(patch).length > 0) {
        let { error } = await supabase.from("textbook_units").update(patch).eq("id", id);
        if (error && noColumn(error)) {
          // 0100 전이면 분량·내용 칸 없이
          const { question_count: _c, question_range: _r, summary: _s, minutes: _m, ...noVol } = patch;
          ({ error } = await supabase.from("textbook_units").update(noVol).eq("id", id));
          if (error && noColumn(error)) {
            // 0070 전이면 단어 개수도 없이
            const { word_count: _w, question_no: _q, ...noQ } = noVol;
            ({ error } = await supabase.from("textbook_units").update(noQ).eq("id", id));
          }
        }
        if (!error) updated += 1;
      }
      return id;
    }
    const sk = `${textbookId}|${parentId || "root"}`;
    const sort = (maxSort.get(sk) ?? 0) + 1;
    maxSort.set(sk, sort);

    const row = {
      textbook_id: textbookId,
      parent_id: parentId,
      name,
      sort,
      label: extra.activity || null,
      page_start: extra.page_start ?? null,
      page_end: extra.page_end ?? null,
      total_pages: extra.total_pages ?? null,
      question_no: extra.question_no ?? null,
      // 분량과 내용 (0100)
      question_count: extra.question_count ?? null,
      question_range: extra.question_range || null,
      word_count: extra.word_count ?? null,
      summary: extra.summary || null,
      minutes: extra.minutes ?? null,
    };
    let { data, error } = await supabase
      .from("textbook_units").insert(row).select("id").single();
    if (error && noColumn(error)) {
      // 0100 전이면 분량·내용 없이 → 0070 전이면 단어수도 없이 →
      // 0051 전이면 문제번호 없이 → 그래도 안 되면 총분량도 빼고
      const { question_count: _c, question_range: _r, summary: _s, minutes: _m, ...noVol } = row;
      ({ data, error } = await supabase
        .from("textbook_units").insert(noVol).select("id").single());
      if (error && noColumn(error)) {
        const { word_count: _w, ...noWords } = noVol;
        ({ data, error } = await supabase
          .from("textbook_units").insert(noWords).select("id").single());
        if (error && noColumn(error)) {
          const { question_no, ...noQ } = noWords;
          ({ data, error } = await supabase
            .from("textbook_units").insert(noQ).select("id").single());
          if (error && noColumn(error)) {
            const { total_pages, ...rest } = noQ;
            ({ data, error } = await supabase
              .from("textbook_units").insert(rest).select("id").single());
          }
        }
      }
    }
    if (error) throw new Error(`단원 '${name}' 생성 실패: ${error.message}`);
    unitIndex.set(key, data.id);
    touched.add(data.id);
    return data.id;
  }

  let inserted = 0;
  try {
    for (const r of rows) {
      const bookId = await ensureBook(r.textbook, r.pub_year);

      let parent = null;
      // 상위 단계는 이름만 만들고, 페이지·활동은 마지막(가장 아래) 단계에만 붙인다
      const levels = [r.big, r.mid, r.small].map((v) => (v || "").trim());
      const lastIdx = levels.reduce((acc, v, i) => (v ? i : acc), -1);

      for (let i = 0; i < levels.length; i++) {
        if (!levels[i]) continue;
        const isLast = i === lastIdx && !(r.name || "").trim();
        parent = await ensureUnit(
          bookId, parent, levels[i],
          isLast
            ? {
                activity: r.activity, page_start: r.page_start, page_end: r.page_end,
                total_pages: r.total_pages, question_count: r.question_count,
                question_range: r.question_range, word_count: r.word_count,
                summary: r.summary, minutes: r.minutes,
              }
            : {}
        );
      }

      // 단원명이 따로 있으면 마지막 단계 아래에 실제 단원으로 넣는다
      const leafName = (r.name || "").trim();
      const qNo = (r.question_no || "").trim();
      // 문제번호가 있으면 **한 겹 더 아래**에 문제로 넣는다.
      //   모의고사처럼 단원이 없으면 중단원 바로 아래에 문제가 온다.
      const leafExtra = {
        activity: r.activity,
        page_start: r.page_start,
        page_end: r.page_end,
        total_pages: r.total_pages,
        question_count: r.question_count,
        question_range: r.question_range,
        word_count: r.word_count,
        summary: r.summary,
        minutes: r.minutes,
      };
      if (leafName) {
        const leafId = await ensureUnit(bookId, parent, leafName, qNo ? {} : leafExtra);
        if (qNo) {
          await ensureUnit(bookId, leafId, `${qNo}번`, { ...leafExtra, question_no: qNo });
        }
      } else if (qNo) {
        await ensureUnit(bookId, parent, `${qNo}번`, { ...leafExtra, question_no: qNo });
      }
      inserted += 1;
    }
  } catch (e) {
    revalidatePath("/textbooks");
    return { inserted, error: e.message, createdBooks, updated };
  }

  // **파일에 없는데 앱에는 있는 단원** — 엑셀에서 지웠거나 이름을 바꾼 것이다.
  // 자동으로 지우지 않는다. 학생 진도가 단원에 걸려 있어서, 지우면 그 기록도
  // 함께 사라진다. 무엇이 남았는지만 알려주고 지울지는 원장님이 정한다.
  const bookIds = [...new Set(rows.map((r) => bookByName.get((r.textbook || "").trim())).filter(Boolean))];
  let leftover = [];
  if (bookIds.length) {
    const { data: after } = await supabase
      .from("textbook_units")
      .select("id, name, textbook_id")
      .in("textbook_id", bookIds);
    const bookName = new Map();
    bookByName.forEach((id, name) => bookName.set(id, name));
    leftover = (after || [])
      .filter((u) => !touched.has(u.id))
      .map((u) => ({ id: u.id, name: u.name, book: bookName.get(u.textbook_id) || "" }));
  }

  revalidatePath("/textbooks");
  return { inserted, error: null, createdBooks, updated, leftover };
}

// ---------- 단원 빠르게 만들기 ----------
// "Unit 1 ~ Unit 20"처럼 규칙적인 교재는 손으로 치지 않고 한 번에 만든다.
// 페이지 범위를 넣으면 균등하게 나눠 배분한다 (나중에 개별 수정 가능).
export async function generateUnits(input) {
  const {
    textbookId,
    prefix = "Unit",
    from = 1,
    to = 10,
    pageStart,
    pageEnd,
    parentId,
    activity,
  } = input || {};
  if (!textbookId) return { error: "교재를 고르세요.", created: 0 };

  const a = parseInt(from, 10) || 1;
  const b = parseInt(to, 10) || a;
  if (b < a) return { error: "끝 번호가 시작 번호보다 작아요.", created: 0 };
  const count = b - a + 1;
  if (count > 200) return { error: "한 번에 200개까지 만들 수 있어요.", created: 0 };

  const supabase = createClient();

  // 같은 위치의 마지막 순서 뒤에 붙인다
  let q = supabase
    .from("textbook_units")
    .select("sort")
    .eq("textbook_id", textbookId)
    .order("sort", { ascending: false })
    .limit(1);
  q = parentId ? q.eq("parent_id", parentId) : q.is("parent_id", null);
  const { data: last } = await q;
  let sort = (last?.[0]?.sort ?? 0) + 1;

  const ps = parseInt(pageStart, 10);
  const pe = parseInt(pageEnd, 10);
  const evenSplit = Number.isFinite(ps) && Number.isFinite(pe) && pe >= ps;
  const per = evenSplit ? Math.floor((pe - ps + 1) / count) : 0;

  const rows = [];
  for (let i = 0; i < count; i++) {
    const start = evenSplit ? ps + per * i : null;
    const end = evenSplit ? (i === count - 1 ? pe : start + per - 1) : null;
    rows.push({
      textbook_id: textbookId,
      parent_id: parentId || null,
      name: `${prefix} ${a + i}`.trim(),
      sort: sort++,
      label: activity || null,
      page_start: start,
      page_end: end,
      total_pages: evenSplit ? end - start + 1 : null,
    });
  }

  let { error } = await supabase.from("textbook_units").insert(rows);
  if (error && (error.code === "PGRST204" || error.code === "42703")) {
    const trimmed = rows.map(({ total_pages, ...rest }) => rest);
    ({ error } = await supabase.from("textbook_units").insert(trimmed));
  }
  revalidatePath("/textbooks");
  return { error: error ? error.message : null, created: error ? 0 : rows.length };
}

/**
 * 지금 들어 있는 단원을 **엑셀로 내보낸다.**
 *
 * 원장님 말씀 (2026-08-05) — 대량 작업은 AI 도움을 받아야 해서 결국 엑셀이 편하다.
 * 그런데 지금은 **빈 양식에서 시작**해야 했다. 이미 200줄을 넣어둔 교재의 층을
 * 바꾸려면 그 200줄을 처음부터 다시 쳐야 한다는 뜻이다.
 *
 * 그래서 들어 있는 것을 그대로 내어준다. 고쳐서 다시 올리면
 * `bulkAddUnits` 가 **이름이 같은 것은 고치고 없는 것은 만든다.**
 * (파일에서 지운 것은 자동으로 안 지운다 — 학생 진도가 거기 걸려 있다)
 *
 * 층은 **깊이 그대로** 적는다 — 1층 대단원 · 2층 중단원 · 3층 소단원 · 4층 단원명.
 * 다시 올리면 같은 모양으로 다시 쌓인다.
 */
export async function exportUnits(bookIds = null) {
  const supabase = createClient();

  let bq = supabase.from("textbooks").select("id, name, pub_year, status").order("name");
  if (Array.isArray(bookIds) && bookIds.length) bq = bq.in("id", bookIds);
  let books = await bq;
  if (books.error) {
    books = await supabase.from("textbooks").select("id, name, status").order("name");
  }
  if (books.error) return { rows: [], error: books.error.message };
  const bookList = (books.data || []).filter((b) => !b.status || b.status === "active");
  if (bookList.length === 0) return { rows: [], error: null };

  const ids = bookList.map((b) => b.id);
  const COLS = "id, textbook_id, parent_id, name, label, page_start, page_end, total_pages, sort";
  // 분량·내용(0100)까지 내려받아야 **고쳐서 다시 올릴 때 안 날아간다**
  const VOL = "question_count, question_range, word_count, summary, minutes";
  let uq = await supabase
    .from("textbook_units")
    .select(`${COLS}, question_no, ${VOL}`)
    .in("textbook_id", ids)
    .order("sort", { ascending: true });
  if (uq.error) {
    uq = await supabase
      .from("textbook_units")
      .select(`${COLS}, question_no`)
      .in("textbook_id", ids)
      .order("sort", { ascending: true });
  }
  if (uq.error) {
    uq = await supabase
      .from("textbook_units")
      .select(COLS)
      .in("textbook_id", ids)
      .order("sort", { ascending: true });
  }
  if (uq.error) return { rows: [], error: uq.error.message };

  const units = uq.data || [];
  const byId = new Map(units.map((u) => [u.id, u]));
  const hasChild = new Set(units.map((u) => u.parent_id).filter(Boolean));
  const bookById = new Map(bookList.map((b) => [b.id, b]));

  // 맨 아래 단원 하나가 엑셀 한 줄이다 — 위층은 그 줄의 왼쪽 칸으로 적힌다
  const rows = [];
  for (const u of units) {
    if (hasChild.has(u.id)) continue;
    const chain = [];
    let cur = u;
    const seen = new Set();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      chain.unshift(cur);
      cur = cur.parent_id ? byId.get(cur.parent_id) : null;
    }
    const book = bookById.get(u.textbook_id);
    const q = (u.question_no || "").toString().trim();
    // 문제번호로 만든 줄은 그 자체가 한 층이라 이름 칸에서 뺀다
    const names = (q ? chain.slice(0, -1) : chain).map((x) => x.name || "");
    rows.push([
      book?.name || "",
      book?.pub_year || "",
      names[0] || "",
      names[1] || "",
      names[2] || "",
      names[3] || "",
      q,
      u.label || "",
      u.page_start ?? "",
      u.page_end ?? "",
      u.total_pages ?? "",
      u.question_count ?? "",
      u.question_range || "",
      u.word_count ?? "",
      u.summary || "",
      u.minutes ?? "",
    ]);
  }
  return { rows, error: null };
}

/**
 * **지금 들어 있는 교재를 내려받는다** (원장님, 2026-08-09 — 「이미 앱에
 * 있는 교재 목록을 확인하고 다 만들어야 해」).
 *
 * 단원에는 내려받기가 있는데 **교재에는 없었다.** 그래서 지금 앱에 무엇이
 * 들어 있는지 밖으로 꺼낼 방법이 없었고, 새 단원표를 만들려면 화면을 보고
 * 손으로 옮겨 적어야 했다.
 *
 * 내려받은 파일은 **그대로 다시 올릴 수 있다** — 이름이 같은 교재는 고쳐지고
 * 없는 것만 새로 생긴다. 그래서 열 이름을 올리는 양식과 똑같이 맞춘다.
 */
export async function exportTextbooks() {
  const supabase = createClient();
  const COLS = "id, name, area, target_grade, total_pages, price, word_range, purchase_url, feature, status";
  let q = await supabase.from("textbooks").select(COLS).order("name");
  if (q.error) {
    // 옛 SQL 이면 뒤에 붙은 칸들이 없다 — 있는 것만이라도 내려받는다
    q = await supabase.from("textbooks").select("id, name, area, target_grade, status").order("name");
  }
  if (q.error) return { rows: [], error: q.error.message };

  const live = (q.data || []).filter((b) => !b.status || b.status === "active");
  if (live.length === 0) return { rows: [], error: null };

  // 교재마다 단원이 몇 개인지 — 「이 교재는 아직 단원이 없다」 가 한눈에 보여야 한다
  const counts = new Map();
  const { data: units } = await supabase
    .from("textbook_units").select("textbook_id, parent_id")
    .in("textbook_id", live.map((b) => b.id));
  (units || []).forEach((u) => {
    if (!u.parent_id) return;                    // 대단원은 안 센다 (묶음일 뿐이다)
    counts.set(u.textbook_id, (counts.get(u.textbook_id) || 0) + 1);
  });

  const rows = live.map((b) => [
    b.name || "",
    b.area || "",
    b.target_grade || "",
    b.total_pages ?? "",
    b.price ?? "",
    b.word_range || "",
    b.purchase_url || "",
    // **단원 수를 비고에 적어 보낸다.** 올릴 때는 그냥 글자라 아무 해가 없고,
    // 파일만 보고도 어느 교재에 단원이 없는지 알 수 있다
    [b.feature || "", `단원 ${counts.get(b.id) || 0}개`].filter(Boolean).join(" · "),
  ]);
  return { rows, error: null };
}

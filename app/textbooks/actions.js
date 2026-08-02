"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
function isMissingColumn(error) {
  if (!error) return false;
  return error.code === "PGRST204" || error.code === "42703";
}
async function insertSafe(supabase, table, rows, optionalKeys = []) {
  let { error } = await supabase.from(table).insert(rows);
  if (isMissingColumn(error) && optionalKeys.length) {
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
  const payload = rows
    .filter((r) => (r?.name || "").trim() !== "")
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

  const supabase = createClient();
  const error = await insertSafe(supabase, "textbooks", payload, ["word_range"]);
  revalidatePath("/textbooks");
  return { inserted: error ? 0 : payload.length, error: error ? error.message : null };
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
  if (isMissingColumn(error)) {
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
  if (isMissingColumn(error)) {
    // 0070 전이면 '불규칙' 없이
    const { words_irregular: _wi, ...noIrr } = row;
    ({ error } = await supabase.from("textbooks").update(noIrr).eq("id", id));
  }
  if (isMissingColumn(error)) {
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
  if (isMissingColumn(error)) {
    // 0070 전 — 단어 개수만 빼고 나머지는 저장한다
    const { word_count: _w, ...noWords } = row;
    ({ error } = await supabase.from("textbook_units").update(noWords).eq("id", id));
  }
  if (isMissingColumn(error)) {
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

  // 1) 교재 찾아두기 (이름 기준)
  const { data: books } = await supabase.from("textbooks").select("id, name");
  const bookByName = new Map((books || []).map((b) => [b.name.trim(), b.id]));
  let createdBooks = 0;

  async function ensureBook(name, pubYear) {
    const key = name.trim();
    if (bookByName.has(key)) return bookByName.get(key);
    const row = { name: key };
    if (pubYear) row.pub_year = pubYear;
    let { data, error } = await supabase.from("textbooks").insert(row).select("id").single();
    if (error && isMissingColumn(error)) {
      ({ data, error } = await supabase
        .from("textbooks").insert({ name: key }).select("id").single());
    }
    if (error) throw new Error(`교재 '${key}' 생성 실패: ${error.message}`);
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
      if (Object.keys(patch).length > 0) {
        let { error } = await supabase.from("textbook_units").update(patch).eq("id", id);
        if (error && isMissingColumn(error)) {
          const { question_no: _q, ...noQ } = patch;
          ({ error } = await supabase.from("textbook_units").update(noQ).eq("id", id));
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
    };
    let { data, error } = await supabase
      .from("textbook_units").insert(row).select("id").single();
    if (error && isMissingColumn(error)) {
      // 0051 전이면 문제번호 없이, 그래도 안 되면 총분량도 빼고
      const { question_no, ...noQ } = row;
      ({ data, error } = await supabase
        .from("textbook_units").insert(noQ).select("id").single());
      if (error && isMissingColumn(error)) {
        const { total_pages, ...rest } = noQ;
        ({ data, error } = await supabase
          .from("textbook_units").insert(rest).select("id").single());
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
          isLast ? { activity: r.activity, page_start: r.page_start, page_end: r.page_end, total_pages: r.total_pages } : {}
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

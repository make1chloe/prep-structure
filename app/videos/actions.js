"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseVideo } from "@/lib/video";
import { resolveStudent } from "@/lib/actAs";
import { todaySeoul } from "@/lib/day";
import { requireStaff } from "@/lib/guard";
import { noTable } from "@/lib/sqlError";

function ok(error) {
  if (noTable(error)) return { error: "설정 → Supabase SQL 에서 0065 를 먼저 실행해주세요." };
  return { error: error ? error.message : null };
}

// ---------- 폴더 ----------
export async function addFolder(formData) {
  const name = (formData.get("name") || "").toString().trim();
  if (!name) return { error: "이름을 적어주세요." };
  const supabase = createClient();
  const { error } = await supabase
    .from("video_folders")
    .insert({ name, note: (formData.get("note") || "").toString().trim() || null, sort: 100 });
  revalidatePath("/videos");
  return ok(error);
}

export async function removeFolder(id) {
  if (!id) return { error: null };
  const supabase = createClient();
  const { error } = await supabase.from("video_folders").delete().eq("id", id);
  revalidatePath("/videos");
  return ok(error);
}

// ---------- 영상 ----------
export async function addVideo(formData) {
  const url = (formData.get("url") || "").toString().trim();
  if (!url) return { error: "주소를 붙여넣어 주세요." };
  const { provider, vid } = parseVideo(url);
  if (!provider) {
    return { error: "유튜브나 비메오 주소만 됩니다. 주소를 다시 확인해주세요." };
  }
  const title = (formData.get("title") || "").toString().trim();

  const supabase = createClient();

  // 제목을 안 적었으면 유튜브에서 받아온다 (키가 있을 때만).
  // 키가 없거나 실패해도 넣는 것은 넣는다 — 제목은 나중에 고칠 수 있다.
  let name = title;
  if (!name && provider === "youtube" && vid) {
    const key = await ytKey(supabase);
    if (key) {
      const { titles } = await fetchTitles(key, [vid]);
      name = titles.get(vid) || "";
    }
  }

  const { error } = await supabase.from("videos").insert({
    folder_id: (formData.get("folderId") || "").toString() || null,
    title: name || url,
    url,
    provider,
    vid,
    note: (formData.get("note") || "").toString().trim() || null,
    sort: 100,
  });
  revalidatePath("/videos");
  return ok(error);
}

export async function updateVideo(id, patch) {
  if (!id) return { error: null };
  const row = {};
  if ("title" in (patch || {})) row.title = (patch.title || "").trim();
  if ("note" in (patch || {})) row.note = (patch.note || "").trim() || null;
  if ("folder_id" in (patch || {})) row.folder_id = patch.folder_id || null;
  if ("active" in (patch || {})) row.active = !!patch.active;
  if ("url" in (patch || {})) {
    const { provider, vid } = parseVideo(patch.url);
    if (!provider) return { error: "유튜브나 비메오 주소만 됩니다." };
    row.url = (patch.url || "").trim();
    row.provider = provider;
    row.vid = vid;
  }
  if (row.title === "") return { error: "제목은 비울 수 없어요." };

  const supabase = createClient();
  const { error } = await supabase.from("videos").update(row).eq("id", id);
  revalidatePath("/videos");
  return ok(error);
}

export async function removeVideo(id) {
  if (!id) return { error: null };
  const supabase = createClient();
  const { error } = await supabase.from("videos").delete().eq("id", id);
  revalidatePath("/videos");
  return ok(error);
}

// ---------- 배정 ----------
/**
 * 이 영상을 볼 학생을 **통째로** 정한다.
 * 뺀 학생의 본 기록은 지우지 않는다 — 이미 본 것은 본 것이다.
 */
export async function setVideoStudents(videoId, studentIds, dueOn) {
  if (!videoId) return { error: "영상을 찾지 못했어요." };
  const want = [...new Set((studentIds || []).filter(Boolean))];
  const supabase = createClient();

  const { data: have, error: readErr } = await supabase
    .from("video_assignments")
    .select("student_id")
    .eq("video_id", videoId);
  if (readErr) return ok(readErr);

  const now = new Set((have || []).map((r) => r.student_id));
  const add = want.filter((id) => !now.has(id));
  const drop = [...now].filter((id) => !want.includes(id));

  if (add.length) {
    const { error } = await supabase.from("video_assignments").insert(
      add.map((student_id) => ({
        video_id: videoId,
        student_id,
        assigned_on: todaySeoul(),
        due_on: dueOn || null,
      }))
    );
    if (error) return ok(error);
  }
  if (drop.length) {
    const { error } = await supabase
      .from("video_assignments")
      .delete()
      .eq("video_id", videoId)
      .in("student_id", drop);
    if (error) return ok(error);
  }
  // 기한만 바뀌었을 수도 있다
  if (dueOn !== undefined && want.length) {
    await supabase
      .from("video_assignments")
      .update({ due_on: dueOn || null })
      .eq("video_id", videoId)
      .in("student_id", want);
  }

  revalidatePath("/videos");
  revalidatePath("/me");
  return { error: null, added: add.length, dropped: drop.length };
}

// ---------- 학생이 누르는 것 ----------
/**
 * 영상을 열었다. **아이가 누른 게 아니라 화면이 열리면 저절로 적힌다.**
 * 물어보면 다들 봤다고 하니까, 물어보지 않고 기계가 적는다.
 */
export async function openVideo(videoId, asId = null) {
  if (!videoId) return { error: null };
  const supabase = createClient();
  const { studentId } = await resolveStudent(supabase, asId);
  if (!studentId) return { error: null };   // 선생님이 미리보기로 여는 것 — 기록하지 않는다

  const { data: cur } = await supabase
    .from("video_views")
    .select("opens, opened_at")
    .eq("video_id", videoId)
    .eq("student_id", studentId)
    .maybeSingle();

  const nowIso = new Date().toISOString();
  const { error } = await supabase.from("video_views").upsert(
    {
      video_id: videoId,
      student_id: studentId,
      opened_at: cur?.opened_at || nowIso,
      last_at: nowIso,
      opens: (cur?.opens || 0) + 1,
    },
    { onConflict: "video_id,student_id" }
  );
  return ok(error);
}

/** 다 봤어요 */
export async function finishVideo(videoId, asId = null) {
  if (!videoId) return { error: null };
  const supabase = createClient();
  const { studentId, error: whoErr } = await resolveStudent(supabase, asId);
  if (!studentId) return { error: whoErr || "학생 계정으로 로그인해주세요." };

  const nowIso = new Date().toISOString();
  const { data: cur } = await supabase
    .from("video_views")
    .select("opened_at, opens")
    .eq("video_id", videoId)
    .eq("student_id", studentId)
    .maybeSingle();

  const { error } = await supabase.from("video_views").upsert(
    {
      video_id: videoId,
      student_id: studentId,
      opened_at: cur?.opened_at || nowIso,
      last_at: nowIso,
      opens: cur?.opens || 1,
      done_at: nowIso,
    },
    { onConflict: "video_id,student_id" }
  );
  revalidatePath("/me");
  revalidatePath("/videos");
  return ok(error);
}

/** 다시 보기 — 「다 봤어요」를 잘못 눌렀을 때 */
export async function undoFinishVideo(videoId, asId = null) {
  if (!videoId) return { error: null };
  const supabase = createClient();
  const { studentId } = await resolveStudent(supabase, asId);
  if (!studentId) return { error: null };
  const { error } = await supabase
    .from("video_views")
    .update({ done_at: null })
    .eq("video_id", videoId)
    .eq("student_id", studentId);
  revalidatePath("/me");
  return ok(error);
}

// ---------- 유튜브 키 ----------
//
// 제목을 손으로 적으면, 유튜브에서 제목이 바뀌어도 여기는 옛날 제목 그대로다.
// 키를 넣어두면 주소만 붙여넣어도 제목을 받아온다.
//
// 키는 integrations 에 담기고 **서버에서만** 읽는다. 코드에도 화면에도 없다
// (나이스 키와 같은 규칙).

async function ytKey(supabase) {
  const { data } = await supabase
    .from("integrations").select("config").eq("id", "youtube").maybeSingle();
  return (data?.config?.key || "").trim();
}

export async function saveYoutubeKey(key) {
  const supabase = createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return guard;
  const { error } = await supabase
    .from("integrations")
    .upsert({ id: "youtube", enabled: true, config: { key: (key || "").trim() } }, { onConflict: "id" });
  revalidatePath("/videos");
  return { error: error ? error.message : null };
}

/** 키가 들어 있나 (키 자체는 절대 돌려주지 않는다) */
export async function youtubeReady() {
  const supabase = createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return { ready: false };
  return { ready: !!(await ytKey(supabase)) };
}

/** 영상 id 여러 개의 제목을 한 번에 받아온다 (한 번에 50개까지) */
async function fetchTitles(key, ids) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    const part = ids.slice(i, i + 50);
    const url =
      "https://www.googleapis.com/youtube/v3/videos" +
      `?part=snippet&id=${part.join(",")}&key=${encodeURIComponent(key)}`;
    let json;
    try {
      const res = await fetch(url, { cache: "no-store" });
      json = await res.json();
    } catch (e) {
      return { titles: out, error: `유튜브를 부르지 못했어요: ${e.message}` };
    }
    if (json?.error) {
      // 왜 안 됐는지 그대로 말해준다 — "안 돼요" 로는 고칠 수가 없다
      return { titles: out, error: `유튜브: ${json.error.message || "키를 확인해주세요."}` };
    }
    (json?.items || []).forEach((it) => {
      if (it.id && it.snippet?.title) out.set(it.id, it.snippet.title);
    });
  }
  return { titles: out, error: null };
}

/**
 * 제목을 유튜브에서 다시 받아온다.
 * ids 를 주면 그것만, 안 주면 유튜브 영상 전부.
 */
export async function syncTitles(ids = null) {
  const supabase = createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return guard;

  const key = await ytKey(supabase);
  if (!key) return { error: "유튜브 키를 먼저 넣어주세요." };

  let q = supabase.from("videos").select("id, vid, title").eq("provider", "youtube");
  if (Array.isArray(ids) && ids.length) q = q.in("id", ids);
  const { data: rows, error: readErr } = await q;
  if (readErr) return ok(readErr);

  const list = (rows || []).filter((r) => r.vid);
  if (list.length === 0) return { error: null, changed: 0 };

  const { titles, error } = await fetchTitles(key, [...new Set(list.map((r) => r.vid))]);
  if (error) return { error };

  let changed = 0;
  for (const r of list) {
    const t = titles.get(r.vid);
    if (!t || t === r.title) continue;
    const { error: upErr } = await supabase.from("videos").update({ title: t }).eq("id", r.id);
    if (!upErr) changed += 1;
  }
  revalidatePath("/videos");
  return { error: null, changed, missing: list.length - titles.size };
}

// ---------- 골라서 한 번에 ----------
//
// 영상이 쌓이면 하나씩 누르는 것이 일이다. 폴더를 새로 만들면 스무 개를
// 옮겨야 하고, 학기가 끝나면 열 개를 한꺼번에 접는다.

export async function setVideosActive(ids, active) {
  if (!Array.isArray(ids) || ids.length === 0) return { error: null };
  const supabase = createClient();
  const { error } = await supabase.from("videos").update({ active: !!active }).in("id", ids);
  revalidatePath("/videos");
  return ok(error);
}

export async function setVideosFolder(ids, folderId) {
  if (!Array.isArray(ids) || ids.length === 0) return { error: null };
  const supabase = createClient();
  const { error } = await supabase
    .from("videos")
    .update({ folder_id: folderId || null })
    .in("id", ids);
  revalidatePath("/videos");
  return ok(error);
}

export async function removeVideos(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return { error: null };
  const supabase = createClient();
  const { error } = await supabase.from("videos").delete().in("id", ids);
  revalidatePath("/videos");
  return ok(error);
}

/** 고른 영상들을 고른 학생들에게 **한꺼번에** 낸다 (이미 받은 학생은 그대로 둔다) */
export async function assignVideosTo(videoIds, studentIds, dueOn) {
  const vids = [...new Set((videoIds || []).filter(Boolean))];
  const sids = [...new Set((studentIds || []).filter(Boolean))];
  if (vids.length === 0 || sids.length === 0) return { error: "영상과 학생을 골라주세요." };

  const supabase = createClient();
  const { data: have, error: readErr } = await supabase
    .from("video_assignments")
    .select("video_id, student_id")
    .in("video_id", vids);
  if (readErr) return ok(readErr);

  const had = new Set((have || []).map((r) => `${r.video_id}|${r.student_id}`));
  const rows = [];
  vids.forEach((v) => sids.forEach((s) => {
    if (!had.has(`${v}|${s}`)) {
      rows.push({ video_id: v, student_id: s, assigned_on: todaySeoul(), due_on: dueOn || null });
    }
  }));
  if (rows.length === 0) return { error: null, added: 0 };

  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase.from("video_assignments").insert(rows.slice(i, i + 200));
    if (error) return ok(error);
  }
  revalidatePath("/videos");
  revalidatePath("/me");
  return { error: null, added: rows.length };
}

/**
 * **영상 엑셀 한 번에 넣기** (원장님, 2026-08-09 — 「영상 엑셀로 한 번에
 * 넣을 수 있게 해 줘」).
 *
 * 문법 강의 한 단원이 스무 개면 스무 번을 붙여넣어야 했다.
 *
 * ── 무엇을 어떻게 다루나 ────────────────────────────
 *
 *   주소가 유튜브·비메오가 아니면   넣지 않고 **몇 번째 줄인지 알려준다**
 *   이미 들어 있는 영상이면          건너뛴다 (같은 영상 id 로 본다 — 주소
 *                                    모양이 달라도 같은 영상이다)
 *   폴더 이름이 아직 없으면          그 이름으로 폴더를 만든다
 *   제목이 비어 있으면               유튜브에서 받아온다 (키가 있을 때).
 *                                    못 받으면 주소를 제목으로 둔다 —
 *                                    나중에 「제목 받아오기」 로 채워진다
 *
 * **한 줄이 틀렸다고 전부를 안 넣지 않는다.** 스무 줄 중 한 줄이 오타면
 * 나머지 열아홉은 들어가야 하고, 틀린 한 줄이 몇 번째인지 알아야 고친다.
 */
export async function bulkAddVideos(rows = []) {
  const supabase = createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return guard;

  const list = (rows || []).filter((r) => (r?.url || "").trim());
  if (list.length === 0) return { error: null, inserted: 0, skipped: 0, bad: [] };

  // 이미 들어 있는 것 — 같은 영상 id 면 주소 모양이 달라도 같은 영상이다
  const { data: had, error: readErr } = await supabase
    .from("videos").select("id, url, vid");
  if (readErr) return ok(readErr);
  const haveVid = new Set((had || []).map((v) => v.vid).filter(Boolean));
  const haveUrl = new Set((had || []).map((v) => (v.url || "").trim()));

  // 폴더 — 이름으로 찾고, 없으면 만든다
  const { data: folders } = await supabase.from("video_folders").select("id, name");
  const byName = new Map((folders || []).map((f) => [(f.name || "").replace(/\s/g, ""), f.id]));
  let madeFolders = 0;
  const folderId = async (name) => {
    const key = (name || "").replace(/\s/g, "");
    if (!key) return null;
    if (byName.has(key)) return byName.get(key);
    const { data, error } = await supabase
      .from("video_folders").insert({ name: name.trim(), sort: 100 }).select("id").single();
    if (error || !data) return null;
    byName.set(key, data.id);
    madeFolders += 1;
    return data.id;
  };

  const bad = [];        // 주소가 아닌 줄 — 몇 번째인지 그대로 알려준다
  const seen = new Set();
  const ready = [];
  for (let i = 0; i < list.length; i += 1) {
    const r = list[i];
    const url = (r.url || "").trim();
    const { provider, vid } = parseVideo(url);
    if (!provider) { bad.push(`${i + 2}번째 줄 — ${url.slice(0, 40)}`); continue; }
    const key = vid || url;
    if (seen.has(key)) continue;                       // 파일 안에서 겹친 줄
    if (vid ? haveVid.has(vid) : haveUrl.has(url)) continue;
    seen.add(key);
    ready.push({ ...r, url, provider, vid });
  }
  if (ready.length === 0) {
    return { error: null, inserted: 0, skipped: list.length - bad.length, bad, madeFolders: 0 };
  }

  // 제목이 빈 줄만 유튜브에 물어본다 (한 번에 50개씩 — fetchTitles 가 나눈다)
  const need = ready.filter((r) => !(r.title || "").trim() && r.provider === "youtube" && r.vid);
  let titles = new Map();
  let titleNote = null;
  if (need.length) {
    const key = await ytKey(supabase);
    if (key) {
      const got = await fetchTitles(key, need.map((r) => r.vid));
      titles = got.titles;
      if (got.error) titleNote = got.error;
    } else {
      titleNote = "유튜브 키가 없어 제목은 주소로 넣었어요. 설정에서 키를 넣고 「제목 받아오기」 를 누르시면 채워집니다.";
    }
  }

  let inserted = 0;
  for (const r of ready) {
    const row = {
      folder_id: await folderId(r.folder),
      title: (r.title || "").trim() || titles.get(r.vid) || r.url,
      url: r.url,
      provider: r.provider,
      vid: r.vid,
      note: (r.note || "").trim() || null,
      sort: 100,
    };
    const { error } = await supabase.from("videos").insert(row);
    if (error && error.code !== "23505") return { ...ok(error), inserted };
    if (!error) inserted += 1;
  }

  revalidatePath("/videos");
  return {
    error: null,
    inserted,
    skipped: list.length - bad.length - inserted,
    bad,
    madeFolders,
    titleNote,
  };
}

/**
 * **지금 들어 있는 영상을 내려받는다.**
 *
 * 빈 양식만 있으면 「이미 뭐가 들어 있나」 를 화면에서 눈으로 세어 옮겨
 * 적어야 한다. 내려받아 고쳐 다시 올리면 **이미 있는 것은 건너뛰고**
 * 없는 것만 새로 들어간다.
 */
export async function exportVideos() {
  const supabase = createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return { error: guard.error, rows: [] };

  const { data: folders } = await supabase.from("video_folders").select("id, name");
  const fname = new Map((folders || []).map((f) => [f.id, f.name]));
  const { data, error } = await supabase
    .from("videos").select("title, url, folder_id, note").order("sort");
  if (error) return { error: ok(error).error, rows: [] };
  return {
    error: null,
    rows: (data || []).map((v) => [
      v.title || "", v.url || "", fname.get(v.folder_id) || "", v.note || "",
    ]),
  };
}

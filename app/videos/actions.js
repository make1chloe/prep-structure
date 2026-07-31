"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseVideo } from "@/lib/video";
import { resolveStudent } from "@/lib/actAs";
import { todaySeoul } from "@/lib/day";

function needSql(error) {
  return error && (error.code === "42P01" || error.code === "PGRST205");
}
function ok(error) {
  if (needSql(error)) return { error: "설정 → Supabase SQL 에서 0065 를 먼저 실행해주세요." };
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
  const { error } = await supabase.from("videos").insert({
    folder_id: (formData.get("folderId") || "").toString() || null,
    // 제목을 안 적으면 주소를 그대로 둔다. 나중에 고칠 수 있다 —
    // 유튜브 제목을 여기서 받아오려면 바깥으로 나가야 하는데, 그건 다음 일이다.
    title: title || url,
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

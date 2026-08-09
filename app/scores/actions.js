"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { noTable } from "@/lib/sqlError";

function ok(error) {
  if (noTable(error)) return { error: "설정 → Supabase SQL 에서 0072 를 먼저 실행해주세요." };
  return { error: error ? error.message : null };
}

function num(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** "90, 84, 77" 을 [90, 84, 77] 로 — 원장님은 학교 표를 보고 그대로 옮겨 적는다 */
function toCuts(v) {
  if (Array.isArray(v)) return v.map(Number).filter(Number.isFinite);
  return (v || "")
    .toString()
    .split(/[,\s/·]+/)
    .map((x) => Number(x))
    .filter((x) => Number.isFinite(x));
}

export async function saveScore(input) {
  const { id, studentId } = input || {};
  if (!studentId) return { error: "학생을 골라주세요." };

  const row = {
    student_id: studentId,
    kind: input.kind || "school",
    taken_on: input.taken_on || null,
    year: num(input.year),
    term: (input.term || "").trim() || null,
    subject: (input.subject || "영어").trim(),
    raw_score: num(input.raw_score),
    full_score: num(input.full_score),
    grade: num(input.grade),
    percentile: num(input.percentile),
    rank_in: num(input.rank_in),
    rank_of: num(input.rank_of),
    school: (input.school || "").trim() || null,
    cuts: toCuts(input.cuts),
    note: (input.note || "").trim() || null,
    /**
     * **어느 회차인가** (0097 의 자리, 2026-08-08 에 비로소 채운다).
     *
     * 그동안은 비워두고 날짜·학교로 짐작했다(lib/scores 의 findExam).
     * 등급컷은 짐작해도 크게 안 틀리지만, 성적표를 며칠 늦게 받아 적으면
     * 엉뚱한 회차에 붙고, 문항별 분석이 통째로 어긋난다.
     */
    exam_id: input.exam_id || null,
  };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 0097 전이면 exam_id 칸이 없다 — 그것만 빼고 넣는다
  const { exam_id: _e, ...noExam } = row;
  const retry = (error) => error && (error.code === "42703" || error.code === "PGRST204");

  if (id) {
    let { error } = await supabase.from("scores").update(row).eq("id", id);
    if (retry(error)) ({ error } = await supabase.from("scores").update(noExam).eq("id", id));
    revalidatePath("/scores");
    revalidatePath("/me");
    return ok(error);
  }

  let { data, error } = await supabase
    .from("scores")
    .insert({ ...row, created_by: user?.id || null })
    .select("id")
    .single();
  if (retry(error)) {
    ({ data, error } = await supabase
      .from("scores")
      .insert({ ...noExam, created_by: user?.id || null })
      .select("id")
      .single());
  }
  revalidatePath("/scores");
  revalidatePath("/me");
  return { ...ok(error), id: data?.id || null };
}

export async function removeScores(ids) {
  const list = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
  if (list.length === 0) return { error: null };
  const supabase = createClient();
  const { error } = await supabase.from("scores").delete().in("id", list);
  revalidatePath("/scores");
  revalidatePath("/me");
  return ok(error);
}

/**
 * 틀린 문제 — **점수만 남기면 "몇 점이었다" 로 끝난다.**
 * 무엇을 틀렸는지가 남아야 다음에 무엇을 다시 볼지 정할 수 있다.
 *
 * **표를 옮겼다** (0098). 전에는 `score_wrongs` 에 「12번」 이라는 **글자**로
 * 적었는데, 글자로는 영역별 정답률을 못 센다. 이제 `score_items` 에 숫자로
 * 넣는다 — 아이가 오답 화면에서 적는 것과 **같은 자리**다.
 *
 * 번호로 못 적는 것(「서술형 2」)은 `label` 에 그대로 둔다. 버리면 안 되고,
 * 없는 번호를 지어내면 45문항이 46문항이 된다.
 */
export async function addWrong(scoreId, input) {
  if (!scoreId) return { error: "성적을 먼저 저장해주세요." };
  const supabase = createClient();

  const raw = (input?.question || "").trim();
  const m = raw.match(/^\s*(\d+)/);
  const no = m ? Number(m[1]) : null;

  const { error } = await supabase.from("score_items").insert({
    score_id: scoreId,
    no,
    wrong: true,
    reason: (input?.reason || "").trim() || null,
    // 번호로 안 읽히는 것만 남긴다 (「12번」 은 no 로 충분하다)
    label: no == null ? raw || null : null,
    // 유형은 문항표(exam_questions)가 갖는 자리다. 손으로 적으신 것은 메모로
    note: (input?.topic || "").trim() || null,
  });
  if (error?.code === "42P01" || error?.code === "PGRST205") {
    return { error: "0097 · 0098 SQL 을 먼저 실행해주세요." };
  }
  revalidatePath("/scores");
  return ok(error);
}

export async function removeWrongs(ids) {
  const list = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
  if (list.length === 0) return { error: null };
  const supabase = createClient();
  const { error } = await supabase.from("score_items").delete().in("id", list);
  revalidatePath("/scores");
  return ok(error);
}

/** 그 성적의 틀린 문제들 */
export async function listWrongs(scoreId) {
  if (!scoreId) return { rows: [] };
  const supabase = createClient();
  const { data, error } = await supabase
    .from("score_items")
    .select("id, no, label, reason, note")
    .eq("score_id", scoreId)
    .eq("wrong", true)
    // 번호 없는 것(서술형 등)은 뒤로 보낸다
    .order("no", { ascending: true, nullsFirst: false });
  if (error) return { rows: [], error: ok(error).error };
  return {
    rows: (data || []).map((x) => ({
      id: x.id,
      question: x.no != null ? `${x.no}번` : x.label || "",
      topic: x.note || "",
      reason: x.reason || "",
    })),
    error: null,
  };
}

/**
 * **`saveFormLinks` 가 여기 있었다 — 지웠다** (2026-08-06).
 *
 * 노션 설문지 주소 세 개를 저장하던 함수다. 0097·0098 로 앱 안에 입력 화면
 * (`app/me/MyScoreForm`)을 만들면서 학생 화면이 그 주소를 안 읽게 되었는데,
 * 저장 칸만 화면에 남아 있었다 — 넣어도 아무 일이 안 일어나는 칸이었다.
 *
 * 원장님 (2026-08-06) — 「그러면 또 노션에서 받아오기 해야 하는 거잖아.
 * 그냥 학생 앱 자체에서 입력시킨다는 거 아니었어?」
 *
 * 노션을 거치면 아이가 적은 것이 **노션 → 내려받기 → 올리기** 를 지나야
 * 성적이 되고, 그 사이에 성적표와 따로 논다. 앱에서 적으면 곧바로 리포트다.
 *
 * `integrations` 의 `score_form` 줄은 **지우지 않는다** — 옛 자료를 지우는
 * 마이그레이션은 되돌릴 수가 없다. 안 읽으면 그만이다.
 */

/**
 * **이 아이는 이 시험을 안 봤다** (0112).
 *
 * 원장님 (2026-08-08) — 「시험없음 체크박스도 추가해줘. 없을때가 있어」
 *
 * 「성적 미입력」 은 그 학교 · 그 학년 아이는 그 시험을 봤을 것이라는
 * 짐작으로 센다. 병결 · 전학 · 그 과목을 안 듣는 아이는 성적이 영영 안
 * 들어오고, 그러면 **배지가 영영 안 꺼진다.** 안 꺼지는 배지는 며칠 안에
 * 배경이 되고, 그때부터는 진짜 빠진 성적도 안 보이게 된다.
 *
 * **0점짜리 성적을 넣어 치우지 않는다** — 평균과 추이가 나빠지고
 * 리포트에도 「0점」 이 적혀 나간다. 안 본 것은 없는 것이지 0점이 아니다.
 */
export async function markNoExam(studentId, examId, on = true, note = "") {
  if (!studentId || !examId) return { error: "학생이나 시험이 없어요." };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const q = on
    ? await supabase.from("exam_skips").upsert(
        {
          student_id: studentId,
          exam_id: examId,
          note: (note || "").trim() || null,
          created_by: user?.id || null,
        },
        { onConflict: "student_id,exam_id" }
      )
    : await supabase
        .from("exam_skips")
        .delete()
        .eq("student_id", studentId)
        .eq("exam_id", examId);

  if (q.error && (q.error.code === "42P01" || q.error.code === "PGRST205")) {
    return { error: "설정 → 관리자 → Supabase SQL 에서 0112 를 실행해주세요." };
  }
  revalidatePath("/scores");
  revalidatePath("/");
  return { error: q.error ? q.error.message : null };
}

/**
 * **이 회차를 이 학년이 통째로 안 봤다** (0112).
 *
 * 원장님 (2026-08-08) — 「중1학년 1학기는 시험이 없고 중3학년 2학기도
 * 시험 한 번밖에 안 봐. 고3도. 이걸 어떻게 체크해야 할까」
 *
 * 안 보는 것은 아이 사정이 아니라 **학년 사정**일 때가 더 많다 —
 *   · 중1 1학기 : 자유학년제라 지필이 아예 없다
 *   · 중3 2학기 : 한 번만 본다 (기말이 없거나 중간이 없다)
 *   · 고3       : 학교마다 다르고, 수능 뒤로는 사실상 안 본다
 *
 * 이걸 아이마다 하나씩 누르게 하면 스무 번 눌러야 한다. 스무 번 눌러야
 * 하는 버튼은 안 눌리고, 안 눌린 배지는 그대로 남아 배경이 된다.
 * 그래서 **그 학년 전부**를 한 번에 적어둔다.
 *
 * 학년 규칙을 앱에 못 박지 않는 까닭 — 자유학년제도 학교마다 다르고
 * 해마다 바뀐다. 못 박으면 틀린 해에 고칠 데가 없다. 나이스가 알려준
 * 회차를 그대로 두고, **안 본 것만 지워나가는** 쪽이 항상 맞다.
 */
export async function markNoExamMany(studentIds = [], examId, note = "") {
  const ids = (studentIds || []).filter(Boolean);
  if (!ids.length || !examId) return { error: "학생이나 시험이 없어요." };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("exam_skips").upsert(
    ids.map((student_id) => ({
      student_id,
      exam_id: examId,
      note: (note || "").trim() || null,
      created_by: user?.id || null,
    })),
    { onConflict: "student_id,exam_id" }
  );

  if (error && (error.code === "42P01" || error.code === "PGRST205")) {
    return { error: "설정 → 관리자 → Supabase SQL 에서 0112 를 실행해주세요." };
  }
  revalidatePath("/scores");
  revalidatePath("/");
  return { error: error ? error.message : null, count: ids.length };
}

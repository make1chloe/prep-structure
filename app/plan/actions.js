"use server";

import { revalidatePath } from "next/cache";
import { clearMonthNotice } from "@/app/schedule/confirmActions";
import { createClient } from "@/lib/supabase/server";
import { addDays, dowOf, todaySeoul, DOW as DOWN } from "@/lib/day";
import { pushToFamilies } from "@/app/push/actions";
import { queuePush } from "@/lib/pushQueue";
import { noColumn } from "@/lib/sqlError";
import { syncPrepTasks } from "@/app/today/actions";

function ok(error) {
  return { error: error ? error.message : null };
}
// ---------- 결석 예정 ----------
// 미리 연락받은 결석. 당일 결석과 구분해서 남긴다.
export async function setPlannedAbsence(studentId, date, reason) {
  if (!studentId || !date) return { error: "값이 부족해요." };
  const supabase = await createClient();
  let { error } = await supabase.from("attendance").upsert(
    {
      student_id: studentId,
      date,
      status: "absent",
      planned: true,
      reason: (reason || "").trim() || null,
    },
    { onConflict: "student_id,date" }
  );
  if (noColumn(error)) {
    return { error: "0017 SQL을 먼저 실행해주세요 (planned/reason 컬럼)." };
  }
  // 결석이 바뀌면 그 달 안내는 「다시 보내야 함」 으로 (0152)
  await clearMonthNotice((date || "").slice(0, 7));
  revalidatePath("/plan");
  revalidatePath("/today");
  return ok(error);
}

/**
 * 기간 결석 예정 — 가족여행처럼 여러 날 빠질 때 한 번에.
 * 그 학생이 실제로 수업 있는 날만 넣는다.
 */
export async function setPlannedAbsenceRange(studentIds, from, to, reason) {
  const sids = Array.isArray(studentIds) ? studentIds : [studentIds];
  if (sids.length === 0 || !from) return { error: "학생과 날짜를 골라주세요.", count: 0 };
  const end = to || from;

  const supabase = await createClient();
  const { data: members } = await supabase
    .from("class_students")
    .select("class_id, student_id")
    .in("student_id", sids);
  /**
   * 반을 **전부** 읽는다. 고른 학생의 반만 읽으면 아래 `openDays`(학원이
   * 도는 요일)가 그 학생 반의 요일과 같아져서, 반을 옮긴 학생의 지난
   * 날을 여는 구실을 못 한다 (2026-08-28 — 화목→월수로 옮긴 학생의
   * 화요일이 계속 막히던 자리). 반 수는 열 몇 개라 한 번에 읽어도 싸다.
   */
  const { data: classes } = await supabase.from("classes").select("id, days");
  const daysOf = new Map((classes || []).map((c) => [c.id, c.days || []]));

  /**
   * **지난 날은 지금 반으로 따지지 않는다** (원장님, 2026-08-28 실사고 —
   * 「서한결이 8/27까지 화목반이었다가 월수반으로 바뀌었는데, 8/25 결석을
   * 사후에 넣으려니 그날 화요일이라 수업이 없다고 뜬다」).
   *
   * 뿌리: `class_students` 에 **기간이 없다**(0001 — PK 는 반·학생 둘뿐).
   * 반을 옮기면 옛 소속이 통째로 사라지므로, **그 학생이 8월 25일에 어느
   * 반이었는지 앱은 알 길이 없다.** 그런데 이 함수는 「지금 반의 요일」로
   * 지난 날을 판정했다 — 반이 한 번이라도 바뀐 학생은 **바뀌기 전 날짜의
   * 결석을 영영 못 넣는다.**
   *
   * 앞일(결석 예정)은 지금 반이 맞으니 그대로 거른다. **지난 날은 원장님이
   * 보고 넣는 사실**이라 요일 잣대를 들이대지 않는다. 다만 아무 날이나
   * 열어두면 일요일까지 결석이 생기므로, **학원이 도는 요일**(어느 반이든
   * 수업이 있는 요일)까지만 연다.
   *
   * ⚠️ 이건 뿌리를 고친 것이 아니다. 반 이동 이력(class_students 에 기간)을
   * 두기 전까지, 지난 날의 수업일수·회차·수강료도 **지금 반 기준**으로
   * 세어진다. 별건으로 남긴다.
   */
  const today = todaySeoul();
  const openDays = new Set((classes || []).flatMap((c) => c.days || []));

    const rows = [];
  for (const sid of sids) {
    const myDays = new Set(
      (members || []).filter((m) => m.student_id === sid).flatMap((m) => daysOf.get(m.class_id) || [])
    );
    let d = from;
    const last = end;
    while (d <= last) {
      const dow = dowOf(d);
      if (myDays.has(dow) || (d < today && openDays.has(dow))) {
        rows.push({
          student_id: sid,
          date: d,
          status: "absent",
          planned: true,
          reason: (reason || "").trim() || null,
        });
      }
      d = addDays(d, 1);
    }
  }
  if (rows.length === 0) {
    return {
      error:
        end < today
          ? "그 기간에는 학원이 도는 날이 없어요 (주말·전 학원 휴강)."
          : "그 기간에 수업이 없어요.",
      count: 0,
    };
  }

  let { error } = await supabase
    .from("attendance")
    .upsert(rows, { onConflict: "student_id,date" });
  if (noColumn(error)) {
    return { error: "0017 SQL을 먼저 실행해주세요 (planned/reason 컬럼).", count: 0 };
  }
  await clearMonthNotice((from || "").slice(0, 7));
  revalidatePath("/plan");
  revalidatePath("/today");
  return { error: error ? error.message : null, count: rows.length };
}

// 기간 결석 예정 취소
export async function clearPlannedAbsenceRange(studentIds, from, to) {
  const sids = Array.isArray(studentIds) ? studentIds : [studentIds];
  if (sids.length === 0 || !from) return { error: null };
  const supabase = await createClient();
  const { error } = await supabase
    .from("attendance")
    .delete()
    .in("student_id", sids)
    .gte("date", from)
    .lte("date", to || from);
  await clearMonthNotice((from || "").slice(0, 7));
  revalidatePath("/plan");
  revalidatePath("/today");
  return ok(error);
}

export async function clearPlannedAbsence(studentId, date) {
  if (!studentId || !date) return { error: null };
  const supabase = await createClient();
  const { error } = await supabase
    .from("attendance")
    .delete()
    .eq("student_id", studentId)
    .eq("date", date);
  // 결석이 바뀌면 그 달 안내는 「다시 보내야 함」 으로 (0152)
  await clearMonthNotice((date || "").slice(0, 7));
  revalidatePath("/plan");
  revalidatePath("/today");
  return ok(error);
}

/**
 * 보강일을 잡으면 그 날짜에 보강으로 넣는다 (원 결석일을 함께 남김).
 *
 * **시간까지 받는다** (원장님, 2026-08-07 — 「보강잡을 때 시간을 못써」).
 * 보강은 비어 있는 틈에 끼워 넣는 것이라 **몇 시인지가 날짜만큼 중요하다.**
 * 날짜만 잡아두면 그날 아침에 「몇 시에 오라고 했더라」 를 다시 찾으시게 된다.
 */
export async function setMakeup(studentId, makeupDate, absentDate, makeupTime, reason) {
  if (!studentId || !makeupDate) return { error: "값이 부족해요." };
  const supabase = await createClient();
  const row = {
    student_id: studentId,
    date: makeupDate,
    status: "makeup",
    makeup_of: absentDate || null,
    makeup_time: (makeupTime || "").trim() || null,
    // 결석 보강이 아닌 추가 보강의 까닭 (원장님 2026-08-21 「사유 칸 필요」)
    reason: (reason || "").trim() || null,
  };
  let { error } = await supabase
    .from("attendance")
    .upsert(row, { onConflict: "student_id,date" });
  if (noColumn(error)) {
    // 0046 전이면 시간·사유 칸이 없다 — 날짜라도 잡힌다
    const { makeup_time: _t, reason: _r, ...noTime } = row;
    ({ error } = await supabase
      .from("attendance")
      .upsert(noTime, { onConflict: "student_id,date" }));
  }
  revalidatePath("/");
  revalidatePath("/plan");
  revalidatePath("/today");
  return ok(error);
}

/**
 * **보강 취소** — 잡았다가 무르는 길 (원장님, 2026-08-07 —
 * 「보강일정 잡았다가 취소하려면 어떻게 해야해?」).
 *
 * 없었다. 잡는 길만 있고 무르는 길이 없었다 — 잘못 잡으면 그 줄이 그대로
 * 남아서, 그날 「오늘 수업」 에 오지도 않을 아이가 뜬다.
 *
 * 보강 줄만 지운다. **원래 결석은 그대로 둔다** — 결석이 없던 일이 된 것이
 * 아니므로, 지우면 회차와 수강료가 어긋난다. 결석은 다시 「보강 필요」
 * 목록으로 돌아간다 (그게 맞다 — 아직 보강을 못 해드린 상태니까).
 *
 * **알려야 한다.** 어머니는 그날 아이를 보내실 참이었다. 조용히 지우면
 * 헛걸음을 하시게 된다.
 */
/**
 * **보강 일정 바꾸기** (원장님, 2026-08-21 — 「보강 일정을 수정할 수가
 * 없음」). 취소+재등록이 아니라 그 줄을 옮긴다 — 원 결석 연결(makeup_of)과
 * 사유는 따라간다. 옮길 날짜에 이미 출결이 있으면 막고 말해준다.
 * 알림은 배치 규칙대로 다음 정각에 「변경」 으로 나간다.
 */
export async function moveMakeup(studentId, fromDate, toDate, toTime) {
  if (!studentId || !fromDate || !toDate) return { error: "값이 부족해요." };
  const supabase = await createClient();
  if (fromDate !== toDate) {
    const { data: clash } = await supabase
      .from("attendance")
      .select("status")
      .eq("student_id", studentId)
      .eq("date", toDate)
      .maybeSingle();
    if (clash) return { error: `옮길 날짜(${toDate})에 이미 출결 기록이 있어요 (${clash.status}). 그 날을 먼저 정리해주세요.` };
  }
  const { data: old } = await supabase
    .from("attendance")
    .select("makeup_of, reason, note")
    .eq("student_id", studentId)
    .eq("date", fromDate)
    .eq("status", "makeup")
    .maybeSingle();
  if (!old) return { error: "그 날짜의 보강을 못 찾았어요." };

  const { error: delErr } = await supabase
    .from("attendance").delete()
    .eq("student_id", studentId).eq("date", fromDate).eq("status", "makeup");
  if (delErr) return { error: delErr.message };
  const row = {
    student_id: studentId,
    date: toDate,
    status: "makeup",
    makeup_of: old.makeup_of || null,
    reason: old.reason || null,
    note: old.note || null,
    makeup_time: (toTime || "").trim() || null,
  };
  let { error } = await supabase.from("attendance").upsert(row, { onConflict: "student_id,date" });
  if (noColumn(error)) {
    const { makeup_time: _t, reason: _r, ...bare } = row;
    ({ error } = await supabase.from("attendance").upsert(bare, { onConflict: "student_id,date" }));
  }
  if (error) return { error: error.message };

  try {
    const { data: me } = await supabase
      .from("students").select("name").eq("id", studentId).maybeSingle();
    await queuePush(supabase, {
      studentIds: [studentId],
      who: "all",
      title: "보강 일정이 바뀌었습니다",
      body: `${fromDate} → ${toDate}${(toTime || "").trim() ? ` ${toTime}` : ""} 로 변경되었어요.`,
      url: "/parent",
    }, `${me?.name || "학생"} · 보강 변경 알림`);
  } catch { /* 알림 실패는 변경을 막지 않는다 */ }

  revalidatePath("/");
  revalidatePath("/plan");
  revalidatePath("/today");
  return { error: null };
}

export async function cancelMakeup(studentId, date, why, notify = true) {
  if (!studentId || !date) return { error: "어느 보강인지 모르겠어요." };
  const supabase = await createClient();

  const { error } = await supabase
    .from("attendance")
    .delete()
    .eq("student_id", studentId)
    .eq("date", date)
    .eq("status", "makeup");        // 결석·출석 줄은 안 건드린다
  if (error) return ok(error);

  /**
   * **알리지 않고 무르는 길도 있다** (원장님, 2026-08-07 —
   * 「보강 자체를 취소할 수도 있게 해줘. 이 경우 어머니 알림 없이」).
   *
   * 잘못 눌러서 생긴 줄이나, 아직 아무에게도 말하지 않은 보강은 알릴 것이
   * 없다. 그런데도 알림이 나가면 **없던 일을 있었던 일로 만든다** —
   * 어머니는 「무슨 보강이요?」 하고 전화를 주시게 된다.
   */
  if (!notify) {
    revalidatePath("/");
    revalidatePath("/plan");
    revalidatePath("/today");
    return { error: null, quiet: true };
  }

  try {
    const { data: me } = await supabase
      .from("students").select("name").eq("id", studentId).maybeSingle();
    // 배치 규칙 (2026-08-21) — 다음 정각에. 그 전엔 보낼 것에서 취소 가능
    await queuePush(supabase, {
      studentIds: [studentId],
      who: "all",
      title: "보강 일정이 취소되었습니다",
      body: `${date} 보강이 취소되었어요.${(why || "").trim() ? ` ${why.trim()}` : " 다시 잡아서 알려드리겠습니다."}`,
      url: "/parent",
    }, `${me?.name || "학생"} · 보강 취소 알림`);
  } catch {
    /* 알림이 안 가도 취소는 됐다 — 다만 전화를 한 번 드리는 편이 낫다 */
  }

  revalidatePath("/");
  revalidatePath("/plan");
  revalidatePath("/today");
  return { error: null };
}

/**
 * **결석 취소** — 그 결석이 없던 일이 됐을 때 (원장님, 2026-08-07).
 *
 * 사전 연락을 받아 결석 예정으로 깔아뒀는데 「그냥 갈게요」 가 되는 일이
 * 흔하다. 지금까지는 되돌리는 길이 없어서 그 줄이 그대로 남았고,
 * **회차와 수강료가 오지도 않은 결석을 계속 세고 있었다.**
 *
 * 「보강 없음」 과는 다르다 — 그쪽은 결석은 있었고 보강만 안 하는 것이라
 * 기록을 남긴다. 이쪽은 **결석 자체가 없던 일**이라 줄을 지운다.
 *
 * 지우는 것은 결석 줄뿐이다. 이미 잡아둔 보강이 있으면 그건 그대로 둔다 —
 * 아이에게 이미 「그날 와라」 라고 말한 뒤일 수 있다.
 */
export async function cancelAbsence(studentId, date) {
  if (!studentId || !date) return { error: "어느 결석인지 모르겠어요." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("attendance")
    .delete()
    .eq("student_id", studentId)
    .eq("date", date)
    .eq("status", "absent");       // 보강·출석 줄은 건드리지 않는다
  revalidatePath("/");
  revalidatePath("/plan");
  revalidatePath("/today");
  return ok(error);
}

/**
 * **보강 없음** — 이 결석은 보강을 안 한다 (0103).
 *
 * 원장님 (2026-08-06) — 「대시보드에서 보강 없음 버튼도 만들어줘」
 *
 * 「보강 필요」 은 결석 줄이 있는데 보강 줄이 없으면 뜬다. 그래서 보강을
 * 안 하기로 한 결석은 **영원히 목록에 남았다.** 치우는 길이 「없는 보강을
 * 억지로 잡기」 밖에 없었고, 그러면 출결 기록이 거짓이 된다.
 *
 * **결석은 지우지 않는다** — 회차·수강료가 그 결석을 세고 있다.
 * 목록에서만 내린다. 되돌릴 수 있게 `on` 을 받는다.
 */
export async function waiveMakeup(studentId, absentDate, on = true) {
  if (!studentId || !absentDate) return { error: "어느 결석인지 모르겠어요." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("attendance")
    .update({ makeup_waived: !!on })
    .eq("student_id", studentId)
    .eq("date", absentDate);
  if (error && (error.code === "PGRST204" || error.code === "42703")) {
    return { error: "설정 → Supabase 에서 0103 을 한 번 실행해주세요." };
  }
  revalidatePath("/");
  revalidatePath("/plan");
  revalidatePath("/today");
  return ok(error);
}

// ---------- 숙제 미리 배정 ----------
/**
 * 여러 학생에게 같은 숙제를 그 날짜로 배정한다.
 * 그 날짜 리포트에 status='assigned' 로 들어가고, 다음 수업에 검사 대상이 된다.
 * @param items [{ homeworkItemId, unitIds, note }]
 */

/**
 * **미리 내주기도 숙제 준비 할일을 만든다** (값-지도 P1-11, 2026-08-16).
 * 오늘 수업 경로만 syncPrepTasks 를 불러서, 미리 내준 단원평가 대비는
 * 「문제 내기」 할일이 안 생겼다 — 시험지 없이 수업날이 온다.
 *
 * 지금 넣은 것만 넘기면 안 된다: syncPrepTasks 는 그날 배정 전체와
 * 견줘서 빠진 할일을 지우므로, **그날 배정 전체**를 다시 읽어 넘긴다.
 * (빼기 경로도 같은 까닭으로 이걸 부른다)
 */
async function syncPrepForDay(supabase, studentIds, date) {
  for (const sid of studentIds) {
    try {
      const { data: rep } = await supabase
        .from("daily_reports").select("id").eq("student_id", sid).eq("date", date).maybeSingle();
      if (!rep) continue;
      let { data: items } = await supabase
        .from("daily_report_items")
        .select("homework_item_id, textbook_unit_id, textbook_unit_ids, range_note")
        .eq("daily_report_id", rep.id).eq("status", "assigned");
      if (!items) items = [];
      const units = {};
      items.forEach((it) => {
        units[it.homework_item_id] = {
          unitIds: it.textbook_unit_ids || (it.textbook_unit_id ? [it.textbook_unit_id] : []),
          note: it.range_note || "",
        };
      });
      await syncPrepTasks(supabase, sid, date, items.map((it) => it.homework_item_id), units);
    } catch { /* 할일은 덤 — 배정이 먼저다 */ }
  }
}

export async function assignHomeworkAhead(studentIds, date, items) {
  const sids = Array.isArray(studentIds) ? studentIds : [studentIds];
  const list = Array.isArray(items) ? items.filter((x) => x?.homeworkItemId) : [];
  if (sids.length === 0 || list.length === 0 || !date) {
    return { error: "학생과 숙제를 골라주세요.", count: 0 };
  }

  const supabase = await createClient();

  // 리포트가 없으면 만든다 (점수·태도는 수업 당일에 채운다)
  const { data: reports, error: repErr } = await supabase
    .from("daily_reports")
    .upsert(
      sids.map((student_id) => ({ student_id, date })),
      { onConflict: "student_id,date", ignoreDuplicates: false }
    )
    .select("id, student_id");
  if (repErr) return { error: repErr.message, count: 0 };

  const rows = [];
  (reports || []).forEach((r) => {
    list.forEach((it) => {
      rows.push({
        daily_report_id: r.id,
        homework_item_id: it.homeworkItemId,
        status: "assigned",
        textbook_unit_id: (it.unitIds || [])[0] || null,
        textbook_unit_ids: (it.unitIds || []).length ? it.unitIds : null,
        range_note: (it.note || "").trim() || null,
      });
    });
  });

  // 같은 숙제가 이미 배정돼 있으면 지우고 다시 넣는다
  const reportIds = (reports || []).map((r) => r.id);
  if (reportIds.length > 0) {
    await supabase
      .from("daily_report_items")
      .delete()
      .in("daily_report_id", reportIds)
      .eq("status", "assigned")
      .in("homework_item_id", list.map((x) => x.homeworkItemId));
  }

  let { error } = await supabase.from("daily_report_items").insert(rows);
  if (noColumn(error)) {
    const noArray = rows.map(({ textbook_unit_ids, ...rest }) => rest);
    ({ error } = await supabase.from("daily_report_items").insert(noArray));
    if (noColumn(error)) {
      const bare = noArray.map(({ textbook_unit_id, range_note, ...rest }) => rest);
      ({ error } = await supabase.from("daily_report_items").insert(bare));
    }
  }
  if (error) return { error: error.message, count: 0 };

  // 숙제 준비 할일 (P1-11) — 오늘 수업 경로와 같은 한 벌
  await syncPrepForDay(supabase, sids, date);

  revalidatePath("/plan");
  revalidatePath("/today");
  return { error: null, count: rows.length };
}

// 미리 배정한 숙제 지우기
export async function unassignHomeworkAhead(studentIds, date, homeworkItemId) {
  const sids = Array.isArray(studentIds) ? studentIds : [studentIds];
  if (sids.length === 0 || !date || !homeworkItemId) return { error: null };
  const supabase = await createClient();
  const { data: reports } = await supabase
    .from("daily_reports")
    .select("id")
    .in("student_id", sids)
    .eq("date", date);
  const ids = (reports || []).map((r) => r.id);
  if (ids.length === 0) return { error: null };
  const { error } = await supabase
    .from("daily_report_items")
    .delete()
    .in("daily_report_id", ids)
    .eq("status", "assigned")
    .eq("homework_item_id", homeworkItemId);
  // 배정을 뺐으면 아직 안 한 준비 할일도 같이 정리된다 (P1-11)
  await syncPrepForDay(supabase, sids, date);
  revalidatePath("/plan");
  revalidatePath("/today");
  return ok(error);
}

// ---------- 지난 수업 고치기 ----------
/**
 * 고른 학생들의 **최근 수업**을 모아 준다.
 *
 * 검사를 빠뜨렸거나 리포트를 고쳐야 할 때, 지금까지는 날짜를 손으로 바꿔가며
 * 오늘 수업 화면을 뒤져야 했다. 여기서 날짜가 보이면 바로 그 판으로 들어간다.
 *
 * **고치는 곳은 여기가 아니다.** 오늘 수업 화면의 학생 판 하나가 검사·숙제·
 * 리포트·등원 학습을 다 갖고 있다. 같은 것을 두 군데에 만들면 언젠가 한쪽만
 * 고치게 된다 — 여기서는 **데려다만 준다.**
 */
export async function recentClasses(studentIds = [], days = 60) {
  const ids = (studentIds || []).filter(Boolean);
  if (ids.length === 0) return { rows: [], error: null };
  const supabase = await createClient();
  const from = addDays(new Date().toISOString().slice(0, 10), -days);

  const BASE = "id, student_id, date, word_total, word_correct, notice";
  let { data: reps, error } = await supabase
    .from("daily_reports")
    .select(`${BASE}, report_written`)
    .in("student_id", ids)
    .gte("date", from)
    .order("date", { ascending: false });
  if (error) {
    ({ data: reps, error } = await supabase
      .from("daily_reports")
      .select(BASE)
      .in("student_id", ids)
      .gte("date", from)
      .order("date", { ascending: false }));
  }
  if (error) return { rows: [], error: error.message };

  const repIds = (reps || []).map((r) => r.id);
  const { data: its } = repIds.length
    ? await supabase
        .from("daily_report_items")
        .select("daily_report_id, status")
        .in("daily_report_id", repIds)
    : { data: [] };
  const gave = new Map();     // 그날 내준 숙제
  const checked = new Map();  // 그날 검사한 숙제
  (its || []).forEach((x) => {
    const m = x.status === "assigned" ? gave : checked;
    if (x.status === "inclass") return;
    m.set(x.daily_report_id, (m.get(x.daily_report_id) || 0) + 1);
  });

  const dates = [...new Set((reps || []).map((r) => r.date))];
  const { data: att } = dates.length
    ? await supabase
        .from("attendance")
        .select("student_id, date, status")
        .in("student_id", ids)
        .in("date", dates)
    : { data: [] };
  const attOf = new Map((att || []).map((a) => [`${a.student_id}|${a.date}`, a.status]));

  return {
    rows: (reps || []).map((r) => ({
      id: r.id,
      studentId: r.student_id,
      date: r.date,
      attendance: attOf.get(`${r.student_id}|${r.date}`) || null,
      word: r.word_total ? `${r.word_correct ?? 0}/${r.word_total}` : "",
      written: !!r.report_written,
      gave: gave.get(r.id) || 0,
      checked: checked.get(r.id) || 0,
    })),
    error: null,
  };
}

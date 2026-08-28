"use server";

import { createClient } from "@/lib/supabase/server";
import { todaySeoul } from "@/lib/day";
import { inUseOn } from "@/lib/bookUse";
import { fetchAll } from "@/lib/fetchAll";
import { ccUserIdxOf, dayNum } from "@/lib/classcard";
import { ccAlignPlan } from "@/lib/ccAlign";
import { setUnitProgress } from "./actions";

/**
 * **「플래너에 맞추기」의 재료** — 대시보드 「진도 어긋남」 칩이 부른다.
 *
 * 원장님 (2026-08-28): 「보고 맞추게 할 때 버튼 누르기」.
 * 그래서 여기는 **읽기만** 한다 — 무엇이 바뀔지 이름까지 돌려주고,
 * 실제로 고치는 것은 원장님이 단추를 눌렀을 때(ccAlignApply)뿐이다.
 *
 * 판단은 새로 안 만든다 — 어느 교재가 「지금 쓰는 단어 교재」인지는
 * inUseOn + area 로 대시보드와 같은 잣대, 이름→Day 는 dayNum 한 벌,
 * 무엇을 찍고 지울지는 ccAlignPlan 한 벌.
 */
async function loadAlign(supabase, studentId) {
  const today = todaySeoul();

  const [meQ, stQ, bookQ, rosterQ] = await Promise.all([
    supabase.from("students").select("id, name, login_id, classcard_login").eq("id", studentId).maybeSingle(),
    supabase.from("student_textbooks").select("textbook_id, status, assigned_on, ended_on").eq("student_id", studentId),
    supabase.from("textbooks").select("id, name, area, status"),
    supabase.from("classcard_students").select("user_idx, login_id"),
  ]);

  // 0131 전 DB — classcard_login 칸이 없다
  let me = meQ.error ? null : meQ.data;
  if (!me) {
    const { data } = await supabase.from("students").select("id, name, login_id").eq("id", studentId).maybeSingle();
    me = data;
  }
  if (!me) return { error: "학생을 찾지 못했어요." };

  const uidx = ccUserIdxOf(me, rosterQ.error ? [] : rosterQ.data || []);
  if (!uidx) return { error: "이 학생의 클래스카드 아이디가 이어져 있지 않아요 — 재원생 화면에서 먼저 맞춰주세요." };

  const { data: dayRow } = await supabase
    .from("classcard_day").select("sets, fetched_at").eq("user_idx", uidx).eq("date", today).maybeSingle();
  const ccDays = ((dayRow?.sets) || []).map((s) => dayNum(s.name)).filter((n) => n !== null);
  if (!ccDays.length) {
    return { error: "오늘 받아온 플래너 세트가 없어요 — 클래스카드에서 다시 받아온 뒤에 맞출 수 있어요." };
  }
  const ccMax = Math.max(...ccDays);

  // 지금 쓰는 **단어** 교재 (대시보드와 같은 잣대)
  const bookOf = new Map((bookQ.data || []).map((b) => [b.id, b]));
  const wordBooks = (stQ.data || [])
    .filter((r) => inUseOn(r, today))
    .map((r) => bookOf.get(r.textbook_id))
    .filter((b) => b && b.area === "단어" && (!b.status || b.status === "active"));
  if (!wordBooks.length) return { error: "지금 쓰는 단어 교재가 없어요." };

  const ids = wordBooks.map((b) => b.id);
  const uq = await fetchAll(() =>
    supabase.from("textbook_units").select("id, textbook_id, name, parent_id").in("textbook_id", ids).order("id"));
  // 소단원만 — 진도는 소단원에 찍힌다 (대단원은 묶음일 뿐)
  const all = uq.error ? [] : uq.data || [];
  const hasChild = new Set(all.map((u) => u.parent_id).filter(Boolean));
  const units = all
    .filter((u) => !hasChild.has(u.id))
    .map((u) => ({ id: u.id, name: u.name, bookName: bookOf.get(u.textbook_id)?.name || "" }));

  const pq = await fetchAll(() =>
    supabase.from("student_unit_progress").select("textbook_unit_id, status")
      .eq("student_id", studentId).order("textbook_unit_id"));
  // 대시보드가 「완료」로 세는 것과 같게 — status 가 done 이거나 비어 있으면 완료
  const unitSet = new Set(units.map((u) => u.id));
  const doneIds = new Set(
    (pq.error ? [] : pq.data || [])
      .filter((x) => (!x.status || x.status === "done") && unitSet.has(x.textbook_unit_id))
      .map((x) => x.textbook_unit_id)
  );

  const appMax = Math.max(
    0,
    ...units.filter((u) => doneIds.has(u.id)).map((u) => dayNum(u.name)).filter((n) => n !== null)
  );

  return { me, ccMax, appMax, units, doneIds, plan: ccAlignPlan({ units, doneIds, ccMax }) };
}

/** 미리보기 — **무엇이 바뀔지 이름까지**. 누르기 전에 보여준다 */
export async function ccAlignPreview(studentId) {
  if (!studentId) return { error: "학생이 없어요." };
  const supabase = await createClient();
  const r = await loadAlign(supabase, studentId);
  if (r.error) return { error: r.error };
  return {
    error: null,
    name: r.me.name,
    ccMax: r.ccMax,
    appMax: r.appMax,
    toDone: r.plan.toDone.map((u) => ({ id: u.id, name: u.name, book: u.bookName, day: u.day })),
    toClear: r.plan.toClear.map((u) => ({ id: u.id, name: u.name, book: u.bookName, day: u.day })),
    skipped: r.plan.skipped.map((u) => u.name),
  };
}

/**
 * **원장님이 누른 그때만** 고친다.
 *
 * @param mode "fill"  완료만 채운다 — 지우지 않는다 (안전한 쪽)
 *             "both"  플래너에 정확히 맞춘다 — 앞서간 완료를 **해제**한다
 *
 * 저장은 setUnitProgress 한 곳으로만 나간다 (회독·날짜 자물쇠·메모 보존이
 * 전부 거기 있다 — 여기서 표를 직접 건드리면 그 규칙들이 새 벌이 된다).
 * 무엇을 바꿨는지 돌려준다 — 원장님이 진도 화면에서 되돌릴 수 있게.
 */
export async function ccAlignApply(studentId, mode = "fill") {
  if (!studentId) return { error: "학생이 없어요." };
  const supabase = await createClient();
  const r = await loadAlign(supabase, studentId);
  if (r.error) return { error: r.error };

  // 미리보기와 **같은 함수의 답**을 그대로 쓴다 (보여준 것과 바뀐 것이 달라지지 않게)
  const { toDone, toClear } = r.plan;
  const doneIds = toDone.map((u) => u.id);
  const clearIds = mode === "both" ? toClear.map((u) => u.id) : [];

  if (doneIds.length) {
    const res = await setUnitProgress(studentId, doneIds, "done");
    if (res?.error) return { error: res.error };
  }
  if (clearIds.length) {
    const res = await setUnitProgress(studentId, clearIds, null);
    if (res?.error) return { error: res.error };
  }
  return {
    error: null,
    marked: toDone.map((u) => u.name),
    cleared: mode === "both" ? toClear.map((u) => u.name) : [],
  };
}

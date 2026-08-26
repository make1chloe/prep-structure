// **그날 오는 학생** — 공지·전달사항의 대상은 이 한 곳이 정한다.
//
// 전에는 세 자리(오늘 수업 공지 · 일정 전달사항 · 일정 학부모 공지)가
// 저마다 반 목록을 읽어 요일만 봤다 — 특강(0164 — 재원생 속성)은 반이
// 아니라 세 곳 모두에서 특강 전용 학생이 빠졌고(T4), 오늘 수업 공지는
// 기간 칸도 안 읽어 **종강한 반 학생이 계속 공지 대상에 남았다**
// (tasks 쪽은 loadRunningClasses 를 써서 두 곳의 판단이 서로 달랐다).
// 같은 질문(「그날 누가 오나」)의 답은 한 벌이어야 한다 (원칙 1).

import { dowOf } from "./day.js";
import { loadClassesWithTerm, meetsOn } from "./classTerm.js";
import { toTermShape } from "./extraTerm.js";

/**
 * 그날 오는 학생 — [{ class_id, student_id }].
 * 특강은 class_id 가 uuid 가 아니라 `extra:라벨` 이다 — scope==="class"
 * 처럼 uuid 로 거르는 자리는 특강을 절대 안 잡는다 (8단계의
 * notices.extra_label 전까지는 그것이 맞는 동작이다).
 */
export async function rosterOn(supabase, date) {
  const dow = dowOf(date);
  // 기간 칸까지 읽고 meetsOn 으로 — 요일만 보면 종강한 반이 살아난다
  const classes = await loadClassesWithTerm(supabase, "id, days", null);
  const ids = classes.filter((c) => meetsOn(c, date, dow)).map((c) => c.id);
  const [memQ, exQ] = await Promise.all([
    ids.length
      ? supabase.from("class_students").select("class_id, student_id").in("class_id", ids)
      : Promise.resolve({ data: [] }),
    supabase
      .from("student_extra_schedules")
      .select("student_id, label, days, from_date, to_date, off_dates")
      .lte("from_date", date)
      .gte("to_date", date),
  ]);
  const out = [...(memQ.data || [])];
  const seen = new Set(out.map((m) => `${m.class_id}|${m.student_id}`));
  ((exQ.error ? [] : exQ.data) || [])                 // 0164 전 DB 면 조용히 정규만
    .filter((x) => meetsOn(toTermShape(x), date, dow) && !(x.off_dates || []).includes(date))
    .forEach((x) => {
      const k = `extra:${x.label}|${x.student_id}`;
      if (seen.has(k)) return;
      seen.add(k);
      out.push({ class_id: `extra:${x.label}`, student_id: x.student_id });
    });
  return out;
}

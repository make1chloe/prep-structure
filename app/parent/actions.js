"use server";
/**
 * 학부모 화면의 **쓰는 길.** 두 가지뿐이다 — 결석·지각 예정, 남기실 말.
 *
 * ⚠️⚠️ **학부모는 출결을 직접 못 찍는다.** `v2.day_sheet` 는 원장·강사만 쓴다(접근 규칙).
 *    그래서 여기서 하는 일은 **`v2.request` 에 한 줄 남기는 것**이고,
 *    원장님이 그것을 받아들일 때 `lib/attend.js` 의 `attendanceWrite({via:'parent'})` 가 돈다
 *    (`WRITE_PATHS.parent` 가 바로 그 자리다). **여기서 출결을 쓰지 마라** — 쓰는 길이 두 벌이 된다.
 *
 * ⚠️ **여기서 문자·알림을 안 보낸다.** 내보내는 자리는 `lib/notify.js` 하나뿐이고,
 *    학부모 계정은 `notify_log`·`job_queue` 에 쓸 권한이 아예 없다(0017 grants).
 *    → 원장님은 이 요청을 **화면에서** 본다. 「보냈습니다」라고 말하지 않는다.
 *
 * ⚠️ **지각 「얼마나」를 안 받는다** (원장님 2026-09-02 「지각은 시간이 필요없을 듯」).
 *    아이가 등원을 찍은 그 시각이 곧 도착 시각이라 미리 고를 것이 없고, 담을 칸도 없었다.
 *    늦는 시각을 아시면 **까닭 한 줄에** 적으시면 그 글이 원장님께 그대로 간다.
 *
 * ⚠️ **되돌릴 수 없는 것은 서버 답을 기다린다**(대전제 8). 원장님께 가는 말이라 낙관적 갱신을 안 쓴다.
 */
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { serverClientFromStore, roleOf, keys, SCHEMA } from "@/lib/supabase-server";
import { countDates, ymd, monthRange } from "@/lib/session";
import { ROLE, MONTHS_AHEAD, addMonth, ymOf } from "./shape";
import { PLAN_TAG } from "./words";
import { readClasses } from "./read";
import { orderToSave, SCREENS } from "@/lib/screens";


const say = (error) => ({ ok: false, error });
const done = (msg) => ({ ok: true, msg });

/** 로그인한 학부모와 그 아이 — **모든 쓰는 길이 여기를 지난다** */
async function whoAmI(studentId) {
  if (!keys().ok)
    return { why: "앱 설정이 아직 덜 됐습니다. 원장님께 알려주세요. (로그인 열쇠 없음)" };

  const supabase = serverClientFromStore(await cookies());
  const me = await roleOf(supabase);
  if (!me.user) return { why: "로그인이 풀렸습니다. 다시 로그인해 주세요." };
  if (me.role !== ROLE) return { why: me.msg || "학부모 계정으로만 보낼 수 있습니다." };

  const sb = supabase.schema(SCHEMA);
  // ⚠️ **형제가 있으면 누구 것인지 반드시 정해져야 한다**(계획 ㊸). 화면이 안 물었으면 여기서 거절한다.
  //    안 거절하면 형 이야기가 동생 줄에 붙고, 그대로 굳는다.
  const mine = await sb.from("parent_student").select("student_id").eq("parent_profile_id", me.user.id);
  if (mine.error) return { why: `아이를 확인하지 못했습니다 (${mine.error.code || mine.error.message}).` };
  const ids = (mine.data ?? []).map((r) => r.student_id);
  if (!ids.length) return { why: "아직 아이가 연결되어 있지 않습니다. 원장님께 알려주세요." };
  if (!studentId) return { why: "어느 아이인지 먼저 골라 주세요." };
  if (!ids.includes(studentId)) return { why: "그 아이는 이 계정에 연결되어 있지 않습니다." };

  return { supabase, sb, me, studentId };
}

/** 그 아이의 앞으로 있을 수업일 — 달력이 **수업일만** 고르게 하려고 쓴다 */
async function futureClassDays(sb, studentId) {
  const t = await sb.rpc("today");
  const today = t?.error ? null : ymd(t?.data);
  if (!today) return { why: "오늘 날짜를 못 읽었습니다. 원장님께 알려주세요." };

  // ⚠️ **앞날은 다음 달까지만**(계획 ⑯ 2번). 그 너머는 휴강·반 이동으로 자주 틀린다
  const last = monthRange(addMonth(ymOf(today), MONTHS_AHEAD)).last;
  // ⚠️ 명단 표를 직접 읽지 않는다 — `v2.student_classes()` 한 벌을 지난다 (자동 검사 ⑮)
  const { schedules, hasNow } = await readClasses(sb, studentId, { back: today, today });
  // 오늘 배정된 반이 없으면 앞으로 고를 수 있는 날도 없다 (퇴원·반 배정 대기)
  if (!hasNow) return { today, days: new Set(), schedules };

  // ⚠️ 휴강은 학부모에게 0줄이라 뺄 수가 없다 — 휴강일도 고를 수 있게 된다.
  //    막지 않고 **원장님이 보고 판단한다**(요청일 뿐이라 출결이 바뀌지 않는다).
  const { dates } = countDates({ schedules, holidays: [], first: today, last, today: last });
  return { today, days: new Set(dates), schedules };
}

// ⚠️ 여기 있던 `startTimeOn()`(그날 그 반의 수업 시작 시각)을 **지웠다** —
//    지각 「얼마나」를 안 받게 되면서 부르는 곳이 없어졌다. 죽은 채로 두면 다음 사람이
//    「이걸 왜 안 쓰지」로 되살린다. 시작 시각이 다시 필요해지면 `lib/attend.js` 의
//    `lateFromStamp(startTime, stampedAt)` 이 받는 자리이고, 그 시각을 **어디서 읽는가**는
//    등원 한 벌(`lib/arrival.js`)의 몫이다 — 학부모 화면의 몫이 아니다.

/**
 * **결석·지각 예정을 알린다** (계획 ㉔).
 *
 * ⚠️ 날짜는 **수업일만** 받는다. 화면이 그렇게 그렸어도 서버가 다시 본다 —
 *    화면 값을 믿으면 아무 날이나 들어온다.
 * ⚠️ **「얼마나」를 안 묻는다**(원장님 2026-09-02) — 물어도 담을 칸이 없었다.
 */
export async function tellPlan(prev, form) {
  const studentId = String(form?.get("studentId") ?? "") || null;
  const date = String(form?.get("date") ?? "");
  const what = String(form?.get("what") ?? "");        // 'absent' | 'late'
  const reason = String(form?.get("reason") ?? "").trim();

  const who = await whoAmI(studentId);
  if (who.why) return say(who.why);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return say("날짜를 골라 주세요.");
  if (what !== "absent" && what !== "late") return say("결석인지 지각인지 골라 주세요.");

  const cal = await futureClassDays(who.sb, who.studentId);
  if (cal.why) return say(cal.why);
  if (date < cal.today) return say("지난 날짜는 미리 알릴 수 없습니다. 원장님께 직접 말씀해 주세요.");
  if (!cal.days.has(date)) return say("그날은 수업이 있는 날이 아닙니다. 달력에서 수업일을 골라 주세요.");

  // ⚠️ **몇 분 늦는지 안 적는다**(원장님 2026-09-02). 찍은 시각이 곧 도착 시각이라
  //    미리 받아 봐야 담을 칸이 없다 — 「약 20분」이라 적어 놓고 아무 데도 안 남기는 것이 제일 나쁘다.
  //    늦는 시각을 아시면 학부모가 **까닭 한 줄에** 적으시고, 그 글이 그대로 원장님께 간다.
  const body = [
    PLAN_TAG[what], date,
    what === "late" ? "늦습니다" : "결석합니다",
    reason ? `사유: ${reason}` : null,
  ].filter(Boolean).join(" · ");

  // ⚠️ `seen_at`·`answered_at` 은 **넣지 않는다.** 접근 규칙(`mine_rq`)이 둘 다 비어 있기를 요구한다 —
  //    넣으면 「원장님이 이미 봤다」로 위조되어, 답 안 한 문의를 찾는 유일한 길이 막힌다
  const ins = await who.sb.from("request").insert({
    by_profile: who.me.user.id, student_id: who.studentId, kind: "absence", body,
  }).select("id");

  if (ins.error) return say(사람말로(ins.error, "미리 알리기"));
  // ⚠️ **0줄이면 실패다.** 접근 규칙이 막았는데 화면이 「보냈습니다」라고 말하면 안 된다
  if (!(ins.data ?? []).length) return say("보내지 못했습니다 — 한 줄도 저장되지 않았습니다. 원장님께 알려주세요.");

  revalidatePath("/parent");
  // ⚠️ 「보냈습니다」가 아니라 **「남겼습니다」**다. 문자로 나가는 것이 아니라 원장님이 화면에서 본다
  return done(`${date} ${what === "late" ? "지각" : "결석"} 예정을 남겼습니다. 원장님이 확인하시면 표시가 바뀝니다.`);
}

/**
 * **남기실 말** — 원장님께 한 줄 남긴다 (`v2.request` kind='question').
 * ⚠️ 「원장이 봤나」는 원장 쪽이 `seen_at` 에 찍는다. 여기서 못 찍는다(접근 규칙이 막는다).
 */
export async function leaveWord(prev, form) {
  const studentId = String(form?.get("studentId") ?? "") || null;
  const text = String(form?.get("text") ?? "").trim();

  const who = await whoAmI(studentId);
  if (who.why) return say(who.why);
  if (!text) return say("남기실 말을 적어 주세요.");
  if (text.length > 1000) return say("너무 깁니다 — 1000자 안으로 적어 주세요.");

  const ins = await who.sb.from("request").insert({
    by_profile: who.me.user.id, student_id: who.studentId, kind: "question", body: text,
  }).select("id");

  if (ins.error) return say(사람말로(ins.error, "남기실 말"));
  if (!(ins.data ?? []).length) return say("남기지 못했습니다 — 한 줄도 저장되지 않았습니다. 원장님께 알려주세요.");

  revalidatePath("/parent");
  return done("남겼습니다. 원장님이 확인하시면 표시가 바뀝니다.");
}

/**
 * 오류를 사람 말로. ⚠️ 원문을 그대로 보여주지 않는다 — 영어도 문제지만 안쪽 사정이 새어 나온다.
 */
function 사람말로(error, what) {
  const code = String(error?.code ?? "");
  if (code === "PGRST106") return "앱 설정이 아직 덜 됐습니다. 원장님께 알려주세요. (스키마 노출 안 됨)";
  if (code === "42501" || /row-level security/i.test(String(error?.message ?? "")))
    return "권한이 없어 저장하지 못했습니다. 원장님께 알려주세요.";
  return `${what}을(를) 저장하지 못했습니다 (${code || "까닭 모름"}). 원장님께 알려주세요.`;
}

/* ── 카드 차례 (계획 ⑮ 1) ───────────────────────────────────────────────
 * ⚠️ **사람마다 따로다.** 그래서 안내 글에서 「세 번째 칸을 보세요」를 못 쓴다 —
 *    이름으로 가리켜야 한다(계획 ⑮ 1 의 「대가」).
 * ⚠️ 여기서는 **되돌릴 수 있는 것**이라 낙관적 갱신을 쓴다(대전제 8 의 반대편) —
 *    화면이 먼저 바뀌고, 실패하면 그 자리만 되돌린다.
 * ⚠️ 판단(모르는 이름 버리기·빠진 것 붙이기)은 `lib/screens.js` 한 벌이다.  */
export async function saveCardOrder(order) {
  if (!keys().ok) return say("앱 설정이 아직 덜 됐습니다. 원장님께 알려주세요.");
  const supabase = serverClientFromStore(await cookies());
  const me = await roleOf(supabase);
  if (!me.user) return say("로그인이 풀렸습니다. 다시 로그인해 주세요.");
  if (me.role !== ROLE) return say(me.msg || "학부모 계정에서만 바꿀 수 있습니다.");

  const 걸러진 = orderToSave(order, SCREENS.parent);
  if (!걸러진.ok) return say(걸러진.why);

  const r = await supabase.schema(SCHEMA).from("screen_pref")
    .upsert({ profile_id: me.user.id, screen: SCREENS.parent, layout: { order: 걸러진.order } },
            { onConflict: "profile_id,screen" })
    .select("screen");
  // ⚠️ **몇 줄이 바뀌었는지 본다** (자동 검사 ⑪). 접근 규칙이 막았는데 「저장됨」이라 하면 안 된다
  if (r.error) return say(r.error.message);
  if (!r.data?.length) return say("한 줄도 안 바뀌었습니다 — 저장되지 않았습니다.");
  return { ok: true, order: 걸러진.order };
}

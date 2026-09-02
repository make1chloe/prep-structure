"use server";
/**
 * 학생 화면이 **쓰는** 자리 — 네 가지뿐이다.
 *   ① 숙제 「다 했어요」   ② 진도 찍기(○◐·)   ③ ❗ 이의 달기   ④ 카드 차례 저장
 *
 * ⚠️⚠️ **서비스 열쇠를 안 쓴다.** 로그인한 그 아이의 쿠키로만 쓴다.
 *    그래야 세 겹 잠금(0009·0052)이 **서버에서** 걸린다:
 *      ① `v2.can_edit_progress()` 가 참일 때만   ② 원장·검사가 찍은 줄은 못 덮는다
 *      ③ 아이가 쓰면 반드시 `last_by='student' · confirmed=false` (= 확인 기다리는 중)
 *    화면이 이 셋을 흉내 내는 것이 아니라 **DB 가 거절한다** — 화면은 거절을 옮겨 적을 뿐이다.
 *
 * ⚠️ **❗는 진도를 안 바꾼다**(절 ㊶ · 표 4-7). 여기서 이의를 달아도 `v2.progress` 는 그대로다.
 *    아이가 스스로 되돌리게 하면 잘못 건드리는 길이 다시 열린다 — 원장님이 누를 때만 바뀐다.
 *
 * ⚠️ 되돌릴 수 없는 것은 **서버 답을 기다린다**(속도-5). 숙제 「다 했어요」가 그렇다 —
 *    0082 문지기가 `said_done_at` 을 아이 손으로 내리는 것을 막아서 **도로 못 내린다.**
 */
import { cookies } from "next/headers";
import { serverClientFromStore, roleOf, SCHEMA } from "@/lib/supabase-server";
import { seoulToday } from "@/lib/queue";
import { 아이가_찍는_칸, 표시들, 카드들, 순서입히기 } from "./derive";
import { 화면 } from "./read";

const 안됨 = (why) => ({ ok: false, why });

/**
 * 로그인한 **학생 자신**인가. ⚠️ 학부모는 여기 못 들어온다(0052 `my_own_student` 와 같은 잣대).
 * ⚠️ 이것은 **화면 쪽 문**일 뿐이다. DB 쪽 문은 0084 의 `v2.sheet_mine()` 이 따로 막는다 —
 *    앱을 안 거치는 길(PostgREST)로 학부모가 찔러도 거기서 걸린다(원장님 「절대안돼」).
 */
async function 나() {
  let sb;
  try {
    sb = serverClientFromStore(await cookies());
  } catch (e) {
    return { ok: false, why: `앱 설정이 아직 덜 됐습니다 — ${String(e?.message ?? e)}` };
  }
  const { user, role } = await roleOf(sb);
  if (!user) return 안됨("로그인이 풀렸습니다. 다시 들어와 주세요.");
  if (role !== "student") return 안됨("이 자리는 학생 계정만 쓸 수 있습니다.");
  const r = await sb.schema(SCHEMA).from("students").select("id").eq("profile_id", user.id).maybeSingle();
  if (r.error) return 안됨(옮겨적기(r.error));
  if (!r.data) return 안됨("이 계정에 이어진 학생이 없습니다. 원장님께 알려주세요.");
  return { ok: true, sb, q: sb.schema(SCHEMA), uid: user.id, sid: r.data.id };
}

/** DB 가 거절한 말을 아이가 읽을 말로. ⚠️ **성공이라고 하지 않는다** — 그게 제일 나쁘다 */
function 옮겨적기(error) {
  const code = String(error?.code ?? "");
  const msg = String(error?.message ?? "");
  if (code === "PGRST106") return "앱 설정이 아직 덜 됐습니다 (v2 스키마 노출 안 됨). 원장님께 알려주세요.";
  if (code === "42501" || /row-level security|permission denied/i.test(msg))
    return "지금은 고칠 수 없는 자리입니다 — 쌤이 찍은 줄이거나 진도 체크가 닫혀 있어요.";
  if (/violates check constraint/i.test(msg)) return "그 값은 앱이 받지 않습니다.";
  return `저장하지 못했습니다 (${code || "까닭 모름"}). 원장님께 알려주세요.`;
}

/* ── ① 숙제 「다 했어요」 ─────────────────────────────────────────────
 * ⚠️⚠️ **원장님의 검사 칸(`status`)이 아니라 `said_done_at` 에 적는다** (0082).
 *    예전에는 둘이 **같은 칸**이라, 아이가 누르면 그 줄이 **원장님 검사 목록에서 사라졌다.**
 *    「다 했어요」는 **검사해 달라는 신호**지 검사가 아니다.
 * ⚠️ **시각은 서버가 정한다**(표-10) — 여기서 보낸 값을 DB 가 안 믿고 제 시계로 덮는다.
 * ⚠️ **되돌릴 수 없다.** 문지기가 아이 손으로 내리는 것을 막는다 —
 *    아이가 잘못 눌러도 원장님께 말씀드려야 한다. 화면은 그 사실을 눌리기 전에 적는다.
 * ⚠️⚠️ **DB 가 정한 시각을 돌려준다** — 화면의 덮개가 그 값을 그대로 쓴다.
 *    전에는 받아 놓고 **버렸고**, 화면은 엉뚱하게 `status` 를 채웠다. 덮개가 채우는 칸과
 *    화면이 보는 칸(`said_done_at`)이 **다른 이름**이라 단추도 「몇 개 했나」 숫자도 안 움직였다
 *    (규칙-어긋난곳 ⑰). 여기서 값을 안 돌려주면 화면이 다시 그 자리로 간다. */
export async function 다했어요(itemId) {
  const me = await 나();
  if (!me.ok) return me;
  if (!itemId) return 안됨("어느 줄인지 모르겠습니다.");

  const r = await me.q.from("day_item")
    // ⚠️ 값은 아무거나 보내도 된다 — **DB 가 제 시계로 덮는다**(0082 문지기). 그래도 지어내지 않는다
    .update({ said_done_at: new Date().toISOString() })
    .eq("id", String(itemId))
    .in("slot", 아이가_찍는_칸)     // ⚠️ 접근 규칙과 **같은 목록**을 여기서도 건다 (헛수고 왕복을 줄인다)
    .select("id,said_done_at");
  if (r.error) return 안됨(옮겨적기(r.error));
  if (!r.data?.length)
    // ⚠️ 0줄인데 「됐다」고 말하지 않는다 — 남의 판이거나(0084 sheet_mine) 쌤이 검사하는 줄이면 여기로 온다
    return 안됨("이 줄은 지금 찍을 수 없습니다 — 오늘 내 판이 아직 안 열렸거나 쌤이 검사하는 줄입니다.");
  const 찍힌때 = r.data[0]?.said_done_at ?? null;
  if (!찍힌때)
    // ⚠️ **지어내지 않는다**(대전제-0). 문지기가 now() 로 채우므로 여기 오면 안 되지만,
    //    오면 「됐다」고 말하지 않고 화면을 새로 열게 한다 — 화면이 헛되이 「다 함」을 그리면 안 된다
    return 안됨("저장은 됐는데 앱이 찍힌 시각을 못 받았습니다. 화면을 새로 열어 주세요.");
  return { ok: true, said_done_at: 찍힌때 };
}

/* ── ② 진도 찍기 (절 ㊶ · 오류 101 — **소단원마다**) ────────────────── */

/**
 * @param 표시 'done' ○ · 'doing' ◐ · 'none' ·
 *
 * ⚠️ `done_on` 을 여기서 채운다 — 「언제쯤 끝나나」가 그 날짜로 속도를 잰다.
 *    ⚠️ **이것은 `lib/progress.js` 가 갖고 있어야 할 규칙이다.** 지금 그 파일은
 *    raw SQL 어댑터(`db.query`)로만 부를 수 있어 아이 쿠키로는 못 지나간다.
 *    → `lib/` 가 열리면 **여기를 지우고** 그쪽 한 벌을 부른다. 두 벌인 채로 오래 두지 마라.
 */
export async function 진도찍기({ unitId, round, 표시 } = {}) {
  const me = await 나();
  if (!me.ok) return me;
  if (!unitId) return 안됨("어느 단원인지 모르겠습니다.");
  if (!표시들.some((t) => t.key === 표시)) return 안됨("그런 표시는 없습니다.");
  const r회독 = Number(round);
  if (!Number.isInteger(r회독) || r회독 < 1)
    // ⚠️ 회독을 지어내지 않는다 — 1로 치면 2회독 아이의 1회독 줄을 덮는다
    return 안됨("이 교재의 회독을 모르겠습니다. 원장님께 알려주세요.");

  const 오늘 = seoulToday();
  const 줄 = {
    student_id: me.sid, unit_id: String(unitId), round: r회독,
    status: 표시,
    done_on: 표시 === "done" ? 오늘 : null,
    last_by: "student",        // ⚠️ 이 둘은 접근 규칙이 **강제한다**. 다른 값을 넣으면 거절당한다
    confirmed: false,          //    = 「확인 기다리는 중」 (노란 테두리)
  };

  const r = await me.q.from("progress")
    .upsert(줄, { onConflict: "student_id,unit_id,round" })
    .select("unit_id,round,status,last_by,confirmed,done_on");
  if (r.error) return 안됨(옮겨적기(r.error));
  if (!r.data?.length) return 안됨("저장되지 않았습니다 — 쌤이 찍은 줄일 수 있어요.");
  return { ok: true, 진도: r.data[0] };
}

/* ── ③ ❗ 이의 (오류 102) ──────────────────────────────────────────── */

/** ⚠️ **진도는 안 바뀐다.** 원장님 목록에 서기만 한다 */
export async function 이의달기({ unitId, round, kind, said } = {}) {
  const me = await 나();
  if (!me.ok) return me;
  if (!unitId) return 안됨("어느 단원인지 모르겠습니다.");
  if (!["not_done", "already_done", "other"].includes(kind)) return 안됨("무엇이 잘못됐는지 골라 주세요.");
  const r회독 = Number(round);
  if (!Number.isInteger(r회독) || r회독 < 1) return 안됨("이 교재의 회독을 모르겠습니다.");

  const 말 = String(said ?? "").trim().slice(0, 500);
  const r = await me.q.from("progress_flag")
    .insert({ student_id: me.sid, unit_id: String(unitId), round: r회독, kind, said: 말 || null })
    .select("id");
  if (r.error) return 안됨(옮겨적기(r.error));
  return { ok: true, id: r.data?.[0]?.id ?? null };
}

/* ── ④ 카드 차례 (절 ⑮-1 · v2.screen_pref) ─────────────────────────── */

/** ⚠️ 사람마다 따로 저장된다. 그래서 안내 글에서 **「세 번째 칸을 보세요」를 못 쓴다** */
export async function 카드차례저장(order) {
  const me = await 나();
  if (!me.ok) return me;
  const 새 = 순서입히기(order, 카드들);          // 모르는 이름은 버리고 빠진 것은 뒤에 붙인다
  const r = await me.q.from("screen_pref")
    .upsert({ profile_id: me.uid, screen: 화면, layout: { order: 새 } }, { onConflict: "profile_id,screen" })
    .select("screen");
  if (r.error) return 안됨(옮겨적기(r.error));
  return { ok: true, order: 새 };
}

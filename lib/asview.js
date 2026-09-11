/** 👁 「그 아이가 보는 화면을 그대로 본다」 한 벌 — 아이 07·08·달력·영상과 학부모 09·달력, 여섯 화면이 다 여기로 묻는다(원칙-1).
 *
 *  까닭(원장님 2026-09-11 「학생 학부모기능 없고」): 아이·학부모 화면 여섯은 지어져 있는데
 *  **원장님이 열 길이 아예 없었다.** 아이가 로그인해야만 뜬다. 화면이 있어도 볼 수 없으면 없는 것이다(대전제-0).
 *
 *  규칙 셋 — 여기서 한 번만 정하고, 화면은 가져다 쓴다:
 *  ① **직원만.** 아이·학부모가 `?as=` 를 붙여도 조용히 제 화면 그대로다(오류도 안 낸다 — 남의 것이 있다는 것조차 안 알린다).
 *  ② **읽기만.** 쓰는 손은 이미 역할을 본다(app/me/actions child() 는 아이만, app/parent/actions 는 학부모만) —
 *     원장 자격으로는 애초에 못 쓴다. 화면도 `<fieldset disabled>` 로 단추를 눌리지 않게 한다(두 겹).
 *  ③ **화면이 스스로 말한다.** 띠 한 줄로 「누구 화면을 보는 중인지 · 읽기만 된다」고 적는다(app/_shell/asband.js).
 */
import { db } from "./supabase.js";
import { row } from "./sqlError.js";
import { isStaff } from "./roles.js";
import { myStudent } from "./arrival.js";

/** 주소의 `?as=` — 없으면 null (배열로 와도 첫 것) */
export function asId(sp) {
  const v = sp?.as;
  const s = Array.isArray(v) ? v[0] : v;
  return s ? String(s) : null;
}

/** 지금 「남의 화면을 보는 중」인가 — 직원 + ?as= 일 때만 참 */
export const asView = (me, sp) => Boolean(asId(sp)) && isStaff(me?.role);

/** 이 화면에 들어가도 되나 — 제 역할이거나, 직원이 보는 중이거나 */
export const mayEnter = (me, sp, role) => me?.role === role || asView(me, sp);

/** 볼 아이 줄 — `?as=` 의 아이(직원일 때만 · 접근 규칙이 한 번 더 본다) */
export async function studentById(sb, id) {
  const st = row(await db(sb).from("students").select("id,name,profile_id,grade,school_id,schools(name,level)").eq("id", String(id)).maybeSingle(), "볼 아이");
  if (!st) throw new Error("그 아이 줄이 없습니다 — 재원생에서 다시 들어와 주세요");
  return st;
}

/** 이 화면의 주인 — 보는 중이면 그 아이, 아니면 제 아이(아이 계정). 여섯 화면이 같은 줄을 쓴다 */
export const screenStudent = async (sb, me, user, sp) => (asView(me, sp) ? studentById(sb, asId(sp)) : myStudent(sb, user.id));

/** 「남기실 말」처럼 **사람**으로 거르는 조회의 임자 — 보는 중이면 그 아이의 계정(없으면 아무것도 안 나오게 빈 것) */
export const screenProfile = (st, user, viewing) => (viewing ? st?.profile_id ?? "00000000-0000-0000-0000-000000000000" : user.id);

/** 보는 중에 화면 안 링크가 `?as=` 를 잃지 않게 — 「내 교재 ↗」를 눌렀더니 제 화면으로 튀던 일이 없게 */
export function keepAs(href, me, sp) {
  if (!asView(me, sp)) return href;
  const id = asId(sp);
  return href.includes("?") ? `${href}&as=${encodeURIComponent(id)}` : `${href}?as=${encodeURIComponent(id)}`;
}

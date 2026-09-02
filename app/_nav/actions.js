"use server";
/**
 * 퀵메모를 적는 손 (0-10 · QUICK).
 *
 * ⚠️ **새 표도, 두 번째 insert 도 만들지 않는다**(원칙-1).
 *    `v2.todo` 에 쓰는 손은 `lib/todo.js` 의 `addTodo` 한 벌이고 여기는 **부르기만** 한다.
 *    어느 갈래로·개인 줄로 들어가는지는 `lib/menu.js` 의 `QUICK` 이 정한다 — 여기서 다시 안 정한다.
 *
 * ⚠️ **원장·강사만 쓴다.** `v2.todo` 의 정책은 `staff_all` 하나뿐이라(실측)
 *    아이·학부모가 부르면 0줄이 되고, 그러면 `addTodo` 가 **실패로 되돌린다**(검사-⑪).
 *    그래서 화면에도 아예 안 그린다(`canQuick`) — 두 겹으로 막는다.
 *
 * ⚠️ **되돌릴 수 없는 것이 아니다** — 적은 메모는 할 일에서 지울 수 있다.
 *    그래도 서버 답을 기다린다: 안 그러면 「적었다」고 믿고 창을 닫는데 실제로는 안 들어간다.
 */
import { cookies } from "next/headers";
import { serverClientFromStore, roleOf, keys } from "@/lib/supabase-server";
import { QUICK, canQuick } from "@/lib/menu";
import { addTodo } from "@/lib/todo";
import { openAs } from "../today/db.js";

export async function saveQuick(text) {
  const 글 = String(text ?? "").trim();
  if (!글) return { ok: false, msg: "빈 메모는 저장하지 않습니다" };
  if (글.length > QUICK.max) return { ok: false, msg: `${QUICK.max}자까지 적을 수 있습니다 (지금 ${글.length}자)` };

  if (!keys().ok) return { ok: false, msg: "앱 설정이 아직 덜 됐습니다 (로그인 열쇠 없음)" };
  const me = await roleOf(serverClientFromStore(await cookies()));
  if (!me.user) return { ok: false, msg: "로그인이 풀렸습니다. 다시 로그인해 주세요." };
  if (!canQuick(me.role)) return { ok: false, msg: "원장·강사만 적을 수 있습니다." };

  const c = await openAs(me.user.id);
  if (!c.ok) return { ok: false, msg: c.why };
  try {
    // ⚠️ 갈래가 KINDS 일곱에 없으므로 `allowOther` 를 준다 — 「그 밖」으로 버리는 것이 아니라
    //    `v2.todo` 에 이미 있는 `todo` 갈래다(대전제-6 — 버리지 않는다).
    const row = await addTodo(c.db, {
      kind: QUICK.kind, title: 글, private: QUICK.private, allowOther: true,
      why: "퀵메모 — 어느 화면에서든 적은 것",
    });
    return { ok: true, id: row.id, msg: "할 일에 세웠습니다" };
  } catch (e) {
    return { ok: false, msg: String(e?.message ?? e).slice(0, 200) };
  } finally {
    await c.end();
  }
}

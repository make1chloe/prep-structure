/**
 * 학부모 첫 화면 `/parent`.
 *
 * ⚠️⚠️ **실측 — 학부모 20명이 한 번도 로그인한 적이 없다.**
 *    그러니 이 화면은 늘 **처음 여는 사람의 화면**이다. 안내를 맨 위에 둔다.
 *
 * ⚠️⚠️ **문지기가 역할로 이 화면을 지키지 않는다** (`middleware.js` 의 경고 —
 *    실측 2026-09-02: 학생 세션으로 `GET /parent` → 200). 그래서 **여기서 스스로 본다** —
 *    `loadParent()` 가 역할이 학부모가 아니면 값을 하나도 안 싣고 돌아온다.
 *
 * ⚠️ **로그아웃 단추를 빼지 마라** (대전제 10). 문지기가 학부모를 `/login` 에서 여기로 되돌리므로,
 *    이 화면에 없으면 홈 화면에 깐 앱에서 **계정을 바꿀 길이 아예 없다** — 실측으로 그랬다.
 *    단추 모양·동작은 `app/logout-button.js` 한 벌뿐이다 (원칙 1).
 *
 * ⚠️ 옛 서비스워커가 알림을 눌렀을 때 여는 주소이기도 하다. 비어 있어도 **404 는 안 된다.**
 */
import LogoutButton from "../logout-button";
import ParentView from "./view";
import { loadParent } from "./read";
import { tellPlan, leaveWord } from "./actions";

// ⚠️ 사람마다 다른 값을 그린다 — 통째로 굳히면 남의 아이 화면이 캐시로 나간다
export const dynamic = "force-dynamic";

export const metadata = { title: "우리 아이 · 클로이영어" };

export default async function Parent({ searchParams }) {
  const sp = await searchParams;
  // 형제 중 누구를 보고 있나. ⚠️ 안 고르셨으면 첫째를 보여 주되 **화면에 누구인지 적는다**
  const studentId = typeof sp?.s === "string" ? sp.s : null;
  const model = await loadParent({ studentId });

  return (
    <main className="wrap stack">
      <h1>{model.student?.name ? `${model.student.name} 학생` : "우리 아이"}</h1>
      <ParentView model={model} tellPlan={tellPlan} leaveWord={leaveWord} />
      <LogoutButton />
    </main>
  );
}

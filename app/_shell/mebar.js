"use client";
/** (어77) 아이·학부모 앱 상단의 단추 셋 — 원장님 2026-09-17 「새로고침, 알림 설정, 사용가이드를 이모지를 이용한
 *  버튼의 형태로 학생 어플 학부모 어플 상단의 배치 해 줘 최대한 스크롤늘리지 않는 방향으로.」
 *  ① 🔄 새로고침 — 폰에서 **당겨서 새로고침이 막혀 있어**(폰-4 · 적던 글을 날리지 않으려고) 여태 길이 없었다.
 *     통째로 다시 열지 않고 지금 화면만 다시 받는다(router.refresh · 적던 글은 그대로).
 *  ② 🔔 알림 설정 — 새로 안 만든다. 이미 있는 카드(🔔 app/_shell/bell.js)로 **데려다 준다**(원칙-1 · 두 벌 금지).
 *  ③ ❓ 사용 가이드 — /guide 한 화면.
 *  상단 띠는 아이·학부모에게 **탭이 없어** 자리가 비어 있다 — 그 자리에 세워 줄을 안 늘린다.
 *  그림은 lib/emoji.js ACT 한 곳에서 온다(대전제-25). */
import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ACT } from "@/lib/emoji";
import { icon } from "./icon.js";
export default function MeBar({ home = "/me" }) {
  const router = useRouter(); const [pending, start] = useTransition();
  return (
    <span className="mebar" data-g="mebar">
      <button type="button" className="btn sm" data-act="reload" disabled={pending} {...icon("새로고침")} onClick={() => start(() => router.refresh())}>{ACT.reload}</button>
      <Link prefetch={false} className="btn sm" data-act="bell" href={`${home}#bell`} {...icon("알림 설정")}>{ACT.push}</Link>
      <Link prefetch={false} className="btn sm" data-act="guide" href="/guide" {...icon("사용 가이드")}>{ACT.guide}</Link>
    </span>
  );
}

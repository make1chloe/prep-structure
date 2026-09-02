"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { menuFor, currentOf, QUICK } from "@/lib/menu";

/**
 * **어느 화면에서든 늘 손에 닿는 자리** (계획 0단계 10번).
 *
 * ⚠️ **스크롤로 접지 않는다.** 표·목록 안쪽 스크롤이 이 줄을 접게 만들면
 *    화면이 짧을 때 다시 펼 방법이 없어져 **그 자리가 영영 사라진다** —
 *    지금 앱에서 실제로 나는 일이고, 「아무 페이지에나 다 있어야 한다」는
 *    원장님 요구가 절반만 지켜지는 까닭이다.
 * ⚠️ **닫는 길이 화면 안에 있어야 한다**(대전제 10) — 홈에 깐 앱엔 주소창도 뒤로가기도 없다.
 * ⚠️ `position:fixed` 로 화면을 잠그지 않는다(대전제 9) — 가로로 돌리면 영구히 얼어붙는다.
 *    `sticky` 만 쓴다.
 */
export default function Nav({ role, onQuick }) {
  const path = usePathname();
  const items = menuFor(role);
  if (!items.length) return null;          // ⚠️ 역할을 모르면 안 그린다 (짐작해서 열지 않는다)
  const now = currentOf(path, items);

  return (
    <nav className="nv" aria-label="메뉴">
      <div className="nv-in">
        {items.map((s) => (
          <Link key={s.href} href={s.href} className={"nv-a" + (now === s.href ? " nv-here" : "")}
                aria-current={now === s.href ? "page" : undefined} title={s.hint || s.name}>
            <span className="nv-i" aria-hidden="true">{s.icon}</span>
            <span className="nv-t">{s.name}</span>
          </Link>
        ))}
        <span className="nv-gap" />
        {/* ⚠️ 퀵메모·로그아웃은 **늘 여기 있다.** 접히는 자리에 두지 않는다 */}
        {onQuick && (
          <button type="button" className="nv-a nv-quick" onClick={onQuick} title={QUICK.hint}>
            <span className="nv-i" aria-hidden="true">{QUICK.icon}</span>
            <span className="nv-t">{QUICK.name}</span>
          </button>
        )}
        <Link href="/login?switch=1" className="nv-a nv-out" title="다른 사람으로 들어가기">
          <span className="nv-i" aria-hidden="true">🚪</span>
          <span className="nv-t">나가기</span>
        </Link>
      </div>
    </nav>
  );
}

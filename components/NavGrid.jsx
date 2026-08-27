"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { keyOfPath, sectionOf } from "@/lib/menu";

/**
 * 위 메뉴의 **칸들** — 어디에 있는지 표시하는 부분.
 *
 * 왜 여기만 브라우저 몫인가 (성능수리 3차):
 *   위 메뉴는 화면마다 그리던 것을 뿌리 레이아웃 한 곳으로 올렸다. 그래야
 *   화면을 옮길 때 배지 조회 스물두 자리가 통째로 안 돈다. 그런데 **레이아웃은
 *   화면을 옮겨도 다시 안 그려진다** (실측: 소프트 이동 시 layout 재렌더 0회).
 *   그래서 「지금 여기」 표시를 서버에서 붙여두면 **첫 화면에서 굳는다** —
 *   오늘 수업이 계속 하얗게 떠 있고 재원생으로 가도 안 옮겨간다.
 *
 *   주소는 브라우저가 안다. usePathname 은 서버가 처음 그릴 때도 제 주소를
 *   내어주므로(실측: SSR HTML 에 이미 맞는 주소가 박힌다) 깜빡임도 없다.
 *
 * **세는 일도 문구 만드는 일도 서버가 한다** (TopBar). 여기로는 이미 다 된
 * 글자만 넘어온다 — lib/menuBadges 나 lib/inbox 를 여기서 부르면 그 계산
 * 뭉치가 통째로 브라우저로 내려간다. 성능을 고치러 와서 늘리는 꼴이 된다.
 */
export default function NavGrid({ rows }) {
  const active = keyOfPath(usePathname(), useSearchParams().toString());

  return (
    <nav className="navgrid-wrap">
      <div className="navgrid">
        {rows.map((row) => (
          /* 묶음마다 제 색 — 아래 소메뉴도 같은 색을 물려받는다 (lib/menu 의 tone) */
          <div className={`navcol ${row.solo ? "solo" : ""}`} data-tone={row.tone} key={row.group}>
            {/**
              * 대메뉴 — **굴려도 이 줄만은 남는다.**
              * 하위가 없는 묶음(대시보드)은 이 이름이 곧 그 화면이다.
              */}
            <Link
              href={row.solo ? row.solo.href : row.href}
              className={`navgroup-tag ${
                row.solo
                  ? active === row.solo.key ? "on" : ""
                  : sectionOf(active) === row.group ? "on" : ""
              }`}
              title={row.tagTitle}
            >
              {row.label}
              {/**
                * 대시보드는 **저쪽이 걸어온 말**의 수(안 본 알림),
                * 나머지 묶음은 **그 안에 남은 일**의 합이다.
                *
                * 접히면 소메뉴가 안 보이므로, 여기 합계가 없으면 어느
                * 묶음에 일이 밀렸는지 알 수가 없다 — 배지를 붙이는 뜻이
                * 절반 사라진다.
                */}
              {row.group === "home" && row.homeBadge && (
                <span className="navbadge">{row.homeBadge}</span>
              )}
              {!row.solo && row.groupBadge && (
                <span className="navbadge todo" title={row.groupBadgeTitle}>
                  {row.groupBadge}
                </span>
              )}
            </Link>

            {/**
              * 소메뉴. 굴리면 사라진다.
              *   폰      이름 **바로 아래로** 세로로
              *   컴퓨터  이름 **오른쪽으로** 가로로 (칸을 격자에 앉힌다)
              *
              * 하위가 없는 묶음(대시보드)은 아예 안 그린다 — 대신 이름이
              * **두 칸을 차지한다**(.navcol.solo). 빈 칸으로 두면 그 자리에
              * 다른 묶음 몫의 넓은 여백이 생겨서 혼자 뚝 떨어져 보인다.
              */}
            {row.items.length > 0 && (
              <div className="navitems">
                {row.items.map((it) => (
                  <Link
                    key={it.key}
                    href={it.href}
                    className={active === it.key ? "on" : ""}
                    title={it.title}
                  >
                    {it.label}
                    {it.badge && <span className="navbadge todo">{it.badge}</span>}
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </nav>
  );
}

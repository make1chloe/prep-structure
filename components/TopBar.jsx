import { Fragment } from "react";
import Link from "next/link";
import { menuFor, findSection } from "@/lib/menu";
import BrandMark from "./BrandMark";
import Refresh from "./Refresh";
import TopBarHeight from "./TopBarHeight";
import { createClient } from "@/lib/supabase/server";
import { isStaff } from "@/lib/roles";
import { unreadForStaff, badgeText } from "@/lib/inbox";

/** 묶음 이름과 그 묶음 화면 — 대시보드처럼 하위가 없으면 바로 그 화면으로 */
function groupLabel(key) {
  return findSection(key)?.label || "";
}
function groupHref(key) {
  const sec = findSection(key);
  return sec?.items?.length ? sec.href : sec?.href || "/";
}

const ROLE_LABEL = {
  principal: "원장",
  instructor: "강사",
  assistant: "조교",
  student: "학생",
  parent: "학부모",
};

/**
 * 메뉴는 **항상 펴져 있다.**
 *
 * 예전에는 큰 이름 다섯 개만 두고, 눌러 들어가면 그 안의 화면을 고르게 했다.
 * 그건 한 번 갈 때마다 두 번 누르는 일이고, 좁은 화면에서는 ☰ 를 먼저 열어야
 * 해서 세 번이 됐다. 원장님은 이걸 수업 중에 누른다.
 *
 * 그래서 전부 위에 늘어놓는다. 지금 보고 있는 화면은 하얗게 떠 있어서
 * 어디 있는지 바로 안다.
 */
export default async function TopBar({ profile, active }) {
  const items = menuFor(profile);

  /**
   * 한 줄로 온 목록을 **묶음별 줄**로 접는다. menuFor 가 묶음을 안 깨고
   * 내려주므로(lib/menu) 앞엣것과 묶음이 같으면 같은 줄에 얹으면 된다.
   *
   * `solo` — 그 묶음에 화면이 하나뿐이고 이름도 묶음과 같은 경우
   *          (대시보드). 왼쪽 이름 칸이 그대로 그 화면이 된다.
   */
  const rows = [];
  for (const it of items) {
    const last = rows[rows.length - 1];
    if (last?.group === it.group) last.items.push(it);
    else rows.push({ group: it.group, label: groupLabel(it.group), items: [it] });
  }
  for (const r of rows) {
    if (r.items.length === 1 && r.items[0].label === r.label) {
      r.solo = r.items[0];
      r.items = [];
    }
  }

  /**
   * **안 본 것이 있으면 「대시보드」 옆에 숫자** (원장님, 2026-08-07 —
   * 「확인 안 한 알람이 있으면 카톡처럼 대시보드 메뉴에 배지로」).
   *
   * 결석 알림이나 댓글은 대시보드 안에만 쌓인다. 다른 화면에서 일하고
   * 계시면 온 줄도 모르고 지나간다 — 폰 알림이 가더라도 컴퓨터 앞에서는
   * 그 알림을 못 보신다.
   *
   * 선생님 계정에서만 센다. 학생·학부모 메뉴에는 대시보드가 없다.
   */
  const unread = isStaff(profile?.role)
    ? await unreadForStaff(createClient())
    : { total: 0 };
  const badge = badgeText(unread.total);

  return (
    <header className="topbar">
      {/* 붙어 있는 이 메뉴의 높이를 CSS 에 알려준다 — 아래 판이 그만큼 내려가야
          메뉴 뒤로 들어가지 않는다 */}
      <TopBarHeight />
      <div className="topbar-in">
        <Link href="/" className="brand">
          <BrandMark /> 클로이영어
        </Link>
        <div className="spacer" />
        <span className="who">
          <b>{profile?.name || "사용자"}</b>{" "}
          {profile?.role ? `· ${ROLE_LABEL[profile.role] || profile.role}` : ""}
        </span>
        {/* 홈 화면에 담은 앱에는 주소창이 없다 — 새로고침이 여기 없으면 방법이 없다 */}
        <Refresh />
        <form action="/logout" method="post">
          <button className="btn btn-ghost" type="submit">
            로그아웃
          </button>
        </form>
      </div>

      {/**
        * **묶음마다 한 줄, 이름은 맨 왼쪽** (원장님, 2026-08-07 —
        * 「메뉴 정렬해줘. 대메뉴 라벨을 줄바꿔서 맨 왼쪽에 놓는 게 어때」).
        *
        * 예전에는 열여덟 개가 한 줄로 흘러가다 화면 너비에 따라 아무 데서나
        * 접혔다. 그래서 **묶음이 줄 중간에서 갈라졌다** — 「일정」 세 개 중
        * 둘은 윗줄, 하나는 아랫줄. 넓이가 바뀔 때마다 자리가 달라지니
        * 「그건 저기쯤」 이라는 감이 안 생긴다.
        *
        * 이제 왼쪽 칸에 묶음 이름, 오른쪽 칸에 그 묶음 화면들이다.
        * 줄이 곧 묶음이라 눈이 세로로 훑는다. 화면이 좁아져도 묶음은
        * 안 갈라진다 — 그 묶음 안에서만 접힌다.
        */}
      <nav className="navgrid-wrap">
        <div className="navgrid">
          {rows.map((row) => (
            <Fragment key={row.group}>
              {/**
                * 묶음 이름을 누르면 그 묶음 화면으로 간다.
                *
                * **하위가 없는 묶음은 이름 자리에 그대로 놓는다** (원장님,
                * 2026-08-07 — 「대시보드 메뉴가 두 개인 것도 하나만 살리고」).
                * 대시보드는 묶음 안에 화면이 없어서 「대시보드 대시보드」 로
                * 나왔었다.
                */}
              <Link
                href={row.solo ? row.solo.href : groupHref(row.group)}
                className={`navgroup-tag ${row.solo && active === row.solo.key ? "on" : ""}`}
                title={
                  row.solo?.key === "home" && badge
                    ? `안 본 알림 ${unread.total}건 (결석·문의 ${unread.requests} · 댓글 ${unread.comments})`
                    : `${row.label} 묶음`
                }
              >
                {row.label}
                {row.solo?.key === "home" && badge && <span className="navbadge">{badge}</span>}
              </Link>
              <div className="navrow">
                {row.items.map((it) => (
                  <Link
                    key={it.key}
                    href={it.href}
                    className={active === it.key ? "on" : ""}
                    title={it.desc || it.label}
                  >
                    {it.label}
                  </Link>
                ))}
              </div>
            </Fragment>
          ))}
        </div>
      </nav>
    </header>
  );
}

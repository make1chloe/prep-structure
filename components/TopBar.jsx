import Link from "next/link";
import { menuFor, findSection, sectionOf } from "@/lib/menu";
import BrandMark from "./BrandMark";
import Refresh from "./Refresh";
import TopBarHeight from "./TopBarHeight";
import NavScroll from "./NavScroll";
import { createClient } from "@/lib/supabase/server";
import { isStaff } from "@/lib/roles";
import { unreadForStaff, badgeText } from "@/lib/inbox";
import { menuTodos, TODO_LABEL } from "@/lib/menuBadges";

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
    else rows.push({
      group: it.group,
      label: groupLabel(it.group),
      tone: findSection(it.group)?.tone || "navy",
      items: [it],
    });
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
  /**
   * **메뉴마다 남은 일 숫자** (원장님, 2026-08-08 — 「해야 할 일이 남은
   * 경우 메뉴마다 알림 배지를 다 추가해줘」).
   *
   * 대시보드가 세는 것은 **저쪽이 말을 걸어온 것**뿐이다(결석 요청 ·
   * 댓글). 내가 해야 하는 일은 그 화면에 들어가 봐야만 알았다.
   * 무엇을 세는지는 lib/menuBadges 한 곳에 있다.
   *
   * 둘을 한꺼번에 묻는다 — 줄줄이 기다리면 **모든 화면**이 그만큼 느려진다.
   */
  const staff = isStaff(profile?.role);
  const db = staff ? createClient() : null;
  const [unread, todos] = staff
    ? await Promise.all([unreadForStaff(db), menuTodos(db)])
    : [{ total: 0 }, {}];
  const badge = badgeText(unread.total);

  /** 그 묶음 안에 남은 일이 몇인가 — 접혔을 때는 이것만 보인다 */
  const groupTodo = (row) =>
    (row.solo ? [row.solo] : row.items).reduce((sum, it) => sum + (todos[it.key] || 0), 0);

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
        * **대메뉴는 가로, 소메뉴는 그 아래로 세로** (원장님, 2026-08-07 —
        * 「이 부분을 세로로 배열하고, 대메뉴는 스크롤해도 보이게,
        *  소메뉴는 스크롤하면 사라짐」).
        *
        * ── 여기까지 온 길 ──────────────────────────────────
        *
        *  1) 열여덟 개를 한 줄로 흘렸다 → 화면 너비에 따라 아무 데서나
        *     접혀서 **묶음이 줄 중간에서 갈라졌다.**
        *  2) 묶음마다 가로 한 줄씩 → 안 갈라지는데 **줄이 여덟**이라
        *     붙여둘 수가 없었다 (화면의 3분의 1).
        *  3) 대메뉴 한 줄 + 소메뉴 한 줄 → 소메뉴가 다시 한 줄로 흘러서,
        *     어느 화면이 어느 묶음인지는 세로줄로만 짐작해야 했다.
        *
        * 이제 **묶음 하나가 세로 한 칸**이다. 이름이 맨 위에 있고 그
        * 아래로 그 묶음 화면들이 줄줄이 선다 — 어디 것인지 눈으로 바로
        * 안다. 갈라질 일도 없다 (칸 자체가 안 쪼개진다).
        *
        * 굴려 내려가면 **각 칸의 아랫부분만** 접힌다. 그러면 남는 것이
        * 이름 여덟 개, 곧 대메뉴 한 줄이다.
        */}
      <NavScroll />
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
                href={row.solo ? row.solo.href : groupHref(row.group)}
                className={`navgroup-tag ${
                  row.solo
                    ? active === row.solo.key ? "on" : ""
                    : sectionOf(active) === row.group ? "on" : ""
                }`}
                title={
                  row.solo?.key === "home" && badge
                    ? `안 본 알림 ${unread.total}건 (결석·문의 ${unread.requests} · 댓글 ${unread.comments})`
                    : `${row.label} 묶음`
                }
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
                {row.solo?.key === "home" && badge && <span className="navbadge">{badge}</span>}
                {!row.solo && badgeText(groupTodo(row)) && (
                  <span className="navbadge todo" title={`${row.label} — 남은 일 ${groupTodo(row)}건`}>
                    {badgeText(groupTodo(row))}
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
                    title={
                      todos[it.key]
                        // **숫자만 있으면 「3이 뭐지」 하고 눌러봐야 안다**
                        ? TODO_LABEL[it.key]?.(todos[it.key]) || `남은 일 ${todos[it.key]}건`
                        : it.desc
                        ? `${row.label} · ${it.desc}`
                        : `${row.label} · ${it.label}`
                    }
                  >
                    {it.label}
                    {badgeText(todos[it.key]) && (
                      <span className="navbadge todo">{badgeText(todos[it.key])}</span>
                    )}
                  </Link>
                ))}
              </div>
              )}
            </div>
          ))}
        </div>
      </nav>
    </header>
  );
}

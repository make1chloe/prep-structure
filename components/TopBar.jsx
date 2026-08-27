import Link from "next/link";
import { menuFor, findSection } from "@/lib/menu";
import BrandMark from "./BrandMark";
import Refresh from "./Refresh";
import TopBarHeight from "./TopBarHeight";
import QuickMemo from "./QuickMemo";
import NavScroll from "./NavScroll";
import NavGrid from "./NavGrid";
import TopBarGate from "./TopBarGate";
import { createClient } from "@/lib/supabase/server";
import { sessionUser } from "@/lib/session";
import { cachedProfile } from "@/lib/profileCache";
import { isStaff } from "@/lib/roles";
import { unreadForStaff, badgeText } from "@/lib/inbox";
import { menuTodos, TODO_LABEL } from "@/lib/menuBadges";
import { pendingSqlCount } from "@/lib/sqlBadge";

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
 *
 * ── **화면마다가 아니라 뿌리에 한 번** (성능수리 3차) ────────
 *
 * 이 메뉴는 서른 화면이 저마다 그리고 있었다. 배지를 세느라 조회가
 * **스물두 자리**인데, 가벼운 화면일수록 그 비중이 압도적이었다 —
 * 반·학생 배정은 조회 스물여덟 중 스물두 개(79%)가 이 메뉴 몫이었다.
 *
 * 이제 app/layout.jsx 가 한 번 그린다. **화면을 옮겨도 다시 안 그려진다**
 * (실측: 소프트 이동 시 layout 재렌더 0회 · Next 16.3.3) — 오늘 ↔ 재원생 ↔
 * 달력을 오가는 수업 중 동선에서 스물두 자리가 통째로 빠진다.
 *
 * 대신 두 가지가 서버에서 브라우저로 내려왔다. **지금 어느 화면인가**
 * (NavGrid) 와 **이 화면에 메뉴를 붙이나**(TopBarGate) — 레이아웃이 다시
 * 안 그려지므로 서버에서 정하면 첫 화면 값으로 굳는다.
 *
 * 배지 신선도는 그대로다 (실측): 서버 액션이 revalidatePath 를 **한 번이라도**
 * 부르면 — 어느 주소든, `"layout"` 인자가 없어도 — 레이아웃까지 다시 그려진다.
 * ⚠️ 이건 Next 가 「임시」라고 예고해 둔 동작이다 (next.config.mjs 의 같은
 * 경고). 그날이 오면 배지가 최대 30초(staleTimes) 낡을 수 있다 — Next 를
 * 올릴 때 「저장 → 다른 화면 → 배지가 줄었나」 를 손으로 확인할 것.
 */
export default async function TopBar() {
  const supabase = await createClient();
  const user = await sessionUser(supabase);
  const { data: profile } = user ? await cachedProfile(supabase, user.id) : { data: null };

  /**
   * **선생님 메뉴다.** 학생·학부모 계정에는 아예 안 그린다 — 전에는 화면마다
   * 손으로 붙였으니 학생 화면에 붙을 일이 없었지만, 이제 뿌리에서 한 번
   * 그리므로 여기서 가른다. (원장님이 미리보기로 여신 학생 화면은
   * TopBarGate 가 주소로 가른다 — 그쪽은 계정이 선생님이라 여기선 안 걸린다)
   */
  const staff = isStaff(profile?.role);
  if (!staff) return null;

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
      href: groupHref(it.group),
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
  // 위에서 `await createClient()` 로 받아둔 것을 그대로 쓴다. createClient 는
  // async 다 (2026-08-26 f52f704) — await 를 빠뜨리면 Promise 가 그대로 넘어가
  // 모든 배지 조회가 조용히 죽는다 (8/26~27 실사고)
  const db = supabase;
  /**
   * **안 돌린 SQL 도 배지로** (원장님, 2026-08-14 — 「SQL 이 추가됐을 때도
   * 그걸 표시하게 해줘. 설정 메뉴 말이야」). 설정 화면은 원장만 여니
   * (menu.js 의 only:"principal") 배지도 원장에게만 센다.
   * menuTodos 가 돌려주는 것은 메모된 원본이라 **고치지 않고** 새로 합친다.
   */
  const [unread, baseTodos, sqlN] = await Promise.all([
    unreadForStaff(db),
    menuTodos(db),
    profile?.role === "principal" ? pendingSqlCount(db) : 0,
  ]);
  const todos = sqlN > 0 ? { ...baseTodos, settings: sqlN } : baseTodos;
  const badge = badgeText(unread.total);

  /** 그 묶음 안에 남은 일이 몇인가 — 접혔을 때는 이것만 보인다 */
  const groupTodo = (row) =>
    (row.solo ? [row.solo] : row.items).reduce((sum, it) => sum + (todos[it.key] || 0), 0);

  /**
   * **숫자도 말도 여기서 다 만들어 넘긴다.** NavGrid 는 브라우저 몫이라,
   * 거기서 badgeText·TODO_LABEL 을 부르면 lib/menuBadges 계산 뭉치가
   * 통째로 내려간다 — 속도를 고치러 와서 늘리는 꼴이 된다.
   */
  const view = rows.map((row) => ({
    ...row,
    tagTitle:
      row.group === "home" && badge
        ? `안 본 알림 ${unread.total}건 (결석·문의 ${unread.requests} · 댓글 ${unread.comments})`
        : `${row.label} 묶음`,
    homeBadge: badge,
    groupBadge: row.solo ? null : badgeText(groupTodo(row)),
    groupBadgeTitle: row.solo ? null : `${row.label} — 남은 일 ${groupTodo(row)}건`,
    items: row.items.map((it) => ({
      key: it.key,
      href: it.href,
      label: it.label,
      badge: badgeText(todos[it.key]),
      title: todos[it.key]
        // **숫자만 있으면 「3이 뭐지」 하고 눌러봐야 안다**
        ? TODO_LABEL[it.key]?.(todos[it.key]) || `남은 일 ${todos[it.key]}건`
        : it.desc
        ? `${row.label} · ${it.desc}`
        : `${row.label} · ${it.label}`,
    })),
    solo: row.solo ? { key: row.solo.key, href: row.solo.href, label: row.solo.label } : undefined,
  }));

  return (
    <TopBarGate>
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
        {/* 빠른 메모 (2026-08-21) — 수업 중 떠오른 것을 그 자리에서 할일로 */}
        <QuickMemo />
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
        *
        * 칸을 그리는 일만 NavGrid(브라우저)로 갈라져 있다 — 「지금 여기」
        * 표시가 화면을 옮길 때 따라와야 하기 때문이다. 세는 일은 여기 남는다.
        */}
      <NavScroll />
      <NavGrid rows={view} />
    </TopBarGate>
  );
}

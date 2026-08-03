import { Fragment } from "react";
import Link from "next/link";
import { menuFor, findSection } from "@/lib/menu";

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
export default function TopBar({ profile, active }) {
  const items = menuFor(profile);
  return (
    <header className="topbar">
      <div className="topbar-in">
        <Link href="/" className="brand">
          <span className="mark">클</span> 클로이영어
        </Link>
        <div className="spacer" />
        <span className="who">
          <b>{profile?.name || "사용자"}</b>{" "}
          {profile?.role ? `· ${ROLE_LABEL[profile.role] || profile.role}` : ""}
        </span>
        <form action="/logout" method="post">
          <button className="btn btn-ghost" type="submit">
            로그아웃
          </button>
        </form>
      </div>

      <nav className="navgrid-wrap">
        <div className="navgrid">
          {items.map((it, i) => (
            <Fragment key={it.key}>
              {/* **묶음 이름을 보여준다.** 예전에는 옅은 금 하나뿐이라
                  「학교」「발송」 같은 묶음이 있다는 것 자체가 안 보였다.
                  누르면 그 묶음이 펼쳐진다. */}
              {it.group !== items[i - 1]?.group && (
                <Link
                  href={groupHref(it.group)}
                  className="navgroup-tag"
                  title={`${groupLabel(it.group)} 묶음`}
                >
                  {groupLabel(it.group)}
                </Link>
              )}
              <Link
                href={it.href}
                className={active === it.key ? "on" : ""}
                title={it.desc || it.label}
              >
                {it.label}
              </Link>
            </Fragment>
          ))}
        </div>
      </nav>
    </header>
  );
}

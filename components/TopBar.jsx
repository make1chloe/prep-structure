import { Fragment } from "react";
import Link from "next/link";
import { ALL_ITEMS } from "@/lib/menu";

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
          {ALL_ITEMS.map((it, i) => (
            <Fragment key={it.key}>
              {/* 묶음이 바뀌는 자리에 옅은 금 하나. 줄이 여러 개라도 어디쯤인지 보인다 */}
              {i > 0 && it.group !== ALL_ITEMS[i - 1].group && <span className="navsep" />}
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

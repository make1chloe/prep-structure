import Link from "next/link";
import { SECTIONS, sectionOf } from "@/lib/menu";

const ROLE_LABEL = {
  principal: "원장",
  instructor: "강사",
  assistant: "조교",
  student: "학생",
  parent: "학부모",
};

export default function TopBar({ profile, active }) {
  const here = sectionOf(active) || active;
  return (
    <header className="topbar">
      <div className="topbar-in">
        <Link href="/" className="brand">
          <span className="mark">클</span> 클로이영어
        </Link>

        {/* 좁은 화면 — 큰 이름만 접어둔다 */}
        <details className="navburger">
          <summary aria-label="메뉴">☰ 메뉴</summary>
          <div className="navsheet">
            {SECTIONS.map((sec) => (
              <Link
                key={sec.key}
                href={sec.href}
                className={here === sec.key ? "on" : ""}
              >
                {sec.label}
              </Link>
            ))}
          </div>
        </details>

        <nav className="nav">
          {SECTIONS.map((sec) => (
            <Link
              key={sec.key}
              href={sec.href}
              className={here === sec.key ? "on" : ""}
            >
              {sec.label}
            </Link>
          ))}
        </nav>

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
    </header>
  );
}

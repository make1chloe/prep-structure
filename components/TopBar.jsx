import Link from "next/link";

const ROLE_LABEL = {
  principal: "원장",
  instructor: "강사",
  assistant: "조교",
  student: "학생",
  parent: "학부모",
};

export default function TopBar({ profile, active }) {
  return (
    <header className="topbar">
      <div className="topbar-in">
        <Link href="/" className="brand">
          <span className="mark">클</span> 클로이영어
        </Link>
        <nav className="nav">
          <Link href="/" className={active === "home" ? "on" : ""}>
            대시보드
          </Link>
          <Link href="/today" className={active === "today" ? "on" : ""}>
            오늘 수업
          </Link>
          <Link href="/students" className={active === "students" ? "on" : ""}>
            학생
          </Link>
          <Link href="/classes" className={active === "classes" ? "on" : ""}>
            반
          </Link>
          <Link href="/textbooks" className={active === "textbooks" ? "on" : ""}>
            교재
          </Link>
          <Link href="/tuition" className={active === "tuition" ? "on" : ""}>
            수강료
          </Link>
          <Link href="/consult" className={active === "consult" ? "on" : ""}>
            상담
          </Link>
          <Link href="/plan" className={active === "plan" ? "on" : ""}>
            미리 작성
          </Link>
          <Link href="/tasks" className={active === "tasks" ? "on" : ""}>
            일정
          </Link>
          <Link href="/report" className={active === "report" ? "on" : ""}>
            발송
          </Link>
          <Link href="/resend" className={active === "resend" ? "on" : ""}>
            재발송
          </Link>
          <Link href="/homework" className={active === "homework" ? "on" : ""}>
            학습 항목
          </Link>
          <Link href="/settings" className={active === "settings" ? "on" : ""}>
            설정
          </Link>
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

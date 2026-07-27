import Link from "next/link";

const ROLE_LABEL = {
  principal: "원장",
  instructor: "강사",
  assistant: "조교",
  student: "학생",
  parent: "학부모",
};

// 늘 보이는 것 — 매일 쓰는 화면만
const MAIN = [
  { href: "/", key: "home", label: "대시보드" },
  { href: "/today", key: "today", label: "오늘 수업" },
  { href: "/plan", key: "plan", label: "수업 준비" },
  { href: "/report", key: "report", label: "발송" },
];

// 묶어서 넣는 것
const GROUPS = [
  {
    label: "학생 · 반",
    keys: ["students", "classes", "consult"],
    items: [
      { href: "/students", key: "students", label: "재원생" },
      { href: "/classes", key: "classes", label: "반 · 학생 배정" },
      { href: "/consult", key: "consult", label: "신규 상담" },
    ],
  },
  {
    label: "교재 · 숙제",
    keys: ["textbooks", "homework"],
    items: [
      { href: "/textbooks", key: "textbooks", label: "교재 · 단원" },
      { href: "/homework", key: "homework", label: "학습 항목" },
    ],
  },
  {
    label: "일정 · 정산",
    keys: ["schedule", "tasks", "todo", "tuition"],
    items: [
      { href: "/schedule", key: "schedule", label: "수업 스케줄 · 시험" },
      { href: "/tasks", key: "tasks", label: "일정" },
      { href: "/todo", key: "todo", label: "할일" },
      { href: "/tuition", key: "tuition", label: "수강료" },
    ],
  },
  {
    label: "설정",
    keys: ["resend", "import", "settings"],
    items: [
      { href: "/resend", key: "resend", label: "재발송" },
      { href: "/import", key: "import", label: "노션 이관" },
      { href: "/settings", key: "settings", label: "발송 · 연동 설정" },
      { href: "/settings/messages", key: "messages", label: "문자 문구" },
    ],
  },
];

export default function TopBar({ profile, active }) {
  return (
    <header className="topbar">
      <div className="topbar-in">
        <Link href="/" className="brand">
          <span className="mark">클</span> 클로이영어
        </Link>

        {/* 좁은 화면 — 메뉴를 하나로 접는다 (가로 스크롤은 눌러도 잘려서 안 보임) */}
        <details className="navburger">
          <summary aria-label="메뉴">☰ 메뉴</summary>
          <div className="navsheet">
            {MAIN.map((m) => (
              <Link key={m.key} href={m.href} className={active === m.key ? "on" : ""}>
                {m.label}
              </Link>
            ))}
            {GROUPS.map((g) => (
              <div key={g.label} className="navsheet-group">
                <b>{g.label}</b>
                {g.items.map((it) => (
                  <Link key={it.key} href={it.href} className={active === it.key ? "on" : ""}>
                    {it.label}
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </details>

        <nav className="nav">
          {MAIN.map((m) => (
            <Link key={m.key} href={m.href} className={active === m.key ? "on" : ""}>
              {m.label}
            </Link>
          ))}

          {GROUPS.map((g) => {
            const on = g.keys.includes(active);
            return (
              <details key={g.label} className="navgroup">
                <summary className={on ? "on" : ""}>{g.label} ▾</summary>
                <div className="navmenu">
                  {g.items.map((it) => (
                    <Link key={it.key} href={it.href} className={active === it.key ? "on" : ""}>
                      {it.label}
                    </Link>
                  ))}
                </div>
              </details>
            );
          })}
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

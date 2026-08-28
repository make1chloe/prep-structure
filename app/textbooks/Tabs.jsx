import Link from "next/link";

/**
 * 「교재」 화면의 탭 — 교재 · 단원 / 학습 항목 (원장님 확정, 2026-08-27).
 *
 * 학습 항목은 따로 메뉴 한 칸이었지만 들어오는 링크가 없었고, 여는 까닭도
 * 같다 — 무엇을 가르치나를 정리할 때. 그래서 교재 화면의 탭으로 들어왔다.
 * 탭마다 **제 주소**를 준다 (성능수리 4차). ?view= 로 한 화면 안에서 갈라놓으면
 * 두 판이 한 꾸러미로 묶여서, 교재 판만 열어도 학습항목 판이 같이 내려왔다.
 * 두 화면(교재 판 · 학습항목 판)이 같은 줄을 그리므로 **여기 한 벌**만 둔다 —
 * 두 벌이면 한쪽만 고치게 된다.
 */
const VIEWS = [
  { key: "books", label: "교재 · 단원", href: "/textbooks" },
  { key: "items", label: "학습 항목", href: "/textbooks/items" },
];

export default function Tabs({ view }) {
  return (
    <div className="row" style={{ gap: 6, marginTop: 10 }}>
      {VIEWS.map((v) => (
        <Link key={v.key} className={`btn btn-sm ${view === v.key ? "btn-on" : ""}`} href={v.href}>
          {v.label}
        </Link>
      ))}
    </div>
  );
}

import Link from "next/link";
import { dayLabel } from "@/lib/day";

/**
 * **보낼 것 모아보기 — 발송의 첫 화면** (원장님, 2026-08-16 — 「전체
 * 미발송목록 한번에 보는 페이지 만들고 그걸 발송의 첫화면으로 해줘」).
 *
 * 보낼 것이 리포트·하원·안내 탭에 흩어져 있으면, 탭을 다 돌아야
 * 「오늘 다 보냈나」 를 안다. 여기 한 판에 남은 것만 모아 세우고,
 * 누르면 그 탭이 그 날짜로 열린다. 없으면 없다고 말한다 — 그게 제일
 * 좋은 화면이다.
 *
 * 결석 안내도 리포트에 실려 나간다 — 결석 찍고 리포트를 쓰면 여기
 * 「데일리리포트」 줄에 선다.
 */
export default function SendTodo({ unsentByDate = [], bookWait = [], monthlyLeft = 0, ym = "" }) {
  const total =
    unsentByDate.reduce((a, d) => a + d.names.length, 0) +
    bookWait.length +
    monthlyLeft;

  return (
    <div className="stack" style={{ gap: 10, marginTop: 12 }}>
      {total === 0 && (
        <div className="card">
          <p className="muted" style={{ margin: 0, fontSize: 15 }}>
            보낼 것이 없어요 👏 리포트를 쓰면 여기에 자동으로 섭니다.
          </p>
        </div>
      )}

      {unsentByDate.length > 0 && (
        <div className="card">
          <h2 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 800 }}>
            데일리리포트 미발송{" "}
            <span className="tag tag-amber">
              {unsentByDate.reduce((a, d) => a + d.names.length, 0)}건
            </span>
          </h2>
          <div className="stack" style={{ gap: 4 }}>
            {unsentByDate.map((d) => (
              <div className="unitrow" key={d.date}>
                <span className="hint" style={{ minWidth: 90 }}>{dayLabel(d.date)}</span>
                <span style={{ fontSize: 14, flex: 1 }}>{d.names.join(" · ")}</span>
                <Link className="btn btn-sm" href={`/report?t=report&d=${d.date}`}>
                  보내러 가기
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {bookWait.length > 0 && (
        <div className="card">
          <h2 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 800 }}>
            교재 안내 미발송 <span className="tag tag-amber">{bookWait.length}명</span>
          </h2>
          <div className="stack" style={{ gap: 4 }}>
            {bookWait.map((w) => (
              <div className="unitrow" key={w.studentId}>
                <b style={{ fontSize: 14, minWidth: 70 }}>{w.name}</b>
                <span className="hint" style={{ flex: 1 }}>{w.books.join(" · ")}</span>
              </div>
            ))}
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <Link className="btn btn-sm" href="/report?t=notice">
              안내 문자로 — 이 학생들이 골라진 채 열립니다
            </Link>
          </div>
        </div>
      )}

      {monthlyLeft > 0 && (
        <div className="card">
          <h2 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 800 }}>
            {Number(ym.slice(5, 7))}월 월간리포트{" "}
            <span className="tag tag-amber">미작성 {monthlyLeft}명</span>
          </h2>
          <div className="row">
            <Link className="btn btn-sm" href="/monthly">월간리포트로</Link>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listBookProgress } from "@/app/progress/actions";

/**
 * 이 교재를 쓰는 학생들이 **어디까지 갔나** — 교재 판의 「진도」 탭.
 *
 * 원장님 (2026-08-14): 「이 교재 다들 어디까지 갔지」 를 보려면 재원생에서
 * 아이를 하나씩 열어야 했다.
 *
 * **여기서는 읽기만 한다.** 고치는 곳은 학생 쪽 진도 판(BookProgress) 하나다 —
 * 같은 일을 하는 자리가 두 벌이 되면 어느 쪽이 맞는지 알 수 없게 된다.
 * 이름을 누르면 그 학생의 교재 탭으로 간다 (거기가 고치는 자리다).
 */
export default function BookProgressBoard({ textbookId, initialRows = null }) {
  // 처음 데이터는 페이지가 실어 보낸다 — 탭을 누르는 순간 바로 보인다 (원칙 6)
  const [rows, setRows] = useState(initialRows);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (rows !== null) return;   // 실려 온 것이 있으면 다녀올 일 없다
    let dead = false;
    listBookProgress(textbookId).then((res) => {
      if (dead) return;
      if (res.error) setErr(res.error);
      setRows(res.rows || []);
    });
    return () => { dead = true; };
  }, [textbookId]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (err) return <div className="err">{err}</div>;
  if (rows === null) return <p className="hint">진도 불러오는 중…</p>;
  if (rows.length === 0) {
    return (
      <p className="hint" style={{ margin: 0 }}>
        이 교재를 쓰는 재원생이 없습니다. 「학생」 탭에서 먼저 배정해 주세요.
      </p>
    );
  }

  const pct = (r) => (r.total > 0 ? Math.round((r.done / r.total) * 100) : null);

  return (
    <div className="stack" style={{ gap: 6 }}>
      <p className="hint" style={{ margin: 0 }}>
        진도 낮은 순입니다 — 챙길 아이가 위로 옵니다. 이름을 누르면 그 학생
        화면에서 진도를 적을 수 있어요.
      </p>
      {rows.map((r) => (
        <Link
          key={r.studentId}
          href={`/students?s=${r.studentId}`}
          className="unitrow"
          style={{ textDecoration: "none" }}
        >
          <b style={{ fontSize: 14, minWidth: 76 }}>
            {r.grade ? `${r.grade} ` : ""}
            {r.name}
          </b>
          {r.round > 1 && <span className="tag tag-lav">{r.round}회독</span>}
          {r.total > 0 ? (
            <>
              {/* 진도 막대 — 숫자만 있으면 훑어지지 않는다 */}
              <span className="bar" style={{ flex: 1, minWidth: 60 }}>
                <span style={{ width: `${pct(r)}%` }} />
              </span>
              <span className="hint" style={{ fontVariantNumeric: "tabular-nums" }}>
                {r.done}/{r.total}
              </span>
              <span className={`tag ${pct(r) >= 80 ? "tag-mint" : "tag-sky"}`}>{pct(r)}%</span>
              {r.doing > 0 && <span className="tag tag-amber">◐ {r.doing}</span>}
            </>
          ) : (
            // 단원이 없는 교재는 쪽수로 적는다 — 없는 것과 못 읽은 것을 가른다
            <span className="hint" style={{ flex: 1 }}>
              {r.curPage ? `${r.curPage}p 까지` : "진도 기록 전"} (단원 없는 교재)
            </span>
          )}
          {/* 오래 멈춘 아이가 보이게 — 마지막으로 찍은 날 */}
          {r.lastOn && <span className="hint">{r.lastOn.slice(5).replace("-", "/")}</span>}
        </Link>
      ))}
    </div>
  );
}

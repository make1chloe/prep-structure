"use client";

import { useEffect, useState } from "react";
import { loadStudentHistory } from "./actions";

const BOOK_STATUS = {
  active: { label: "사용중", cls: "tag-mint" },
  done: { label: "끝냄", cls: "tag-sky" },
  dropped: { label: "중단", cls: "tag-muted" },
};
const WARN_KIND = {
  waive: { label: "경고 빼줌", cls: "tag-muted" },
  reflection: { label: "반성문 씀", cls: "tag-red" },
  defer: { label: "유예", cls: "tag-amber" },
  reset: { label: "월간 정리", cls: "tag-muted" },
};
const INQ_STATUS = {
  new: "신규 문의",
  scheduled: "상담 예정",
  consulted: "상담 완료",
  tested: "레벨테스트",
  enrolled: "등록",
  hold: "보류",
  declined: "미등록",
};

// 수정하지 않는 기록 — 교재 사용 이력, 상담 이력
export default function StudentHistoryPanel({ studentId }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await loadStudentHistory(studentId);
      if (alive) setData(res);
    })();
    return () => {
      alive = false;
    };
  }, [studentId]);

  if (data === null) return <span className="hint">불러오는 중…</span>;

  return (
    <div className="grid2" style={{ gap: 14 }}>
      <div>
        <b style={{ fontSize: 13 }}>교재 사용 기록</b>
        {data.books.length === 0 ? (
          <p className="hint" style={{ margin: "6px 0 0" }}>기록이 없습니다.</p>
        ) : (
          <div className="stack" style={{ gap: 4, marginTop: 6 }}>
            {data.books.map((b) => {
              const st = BOOK_STATUS[b.status] || BOOK_STATUS.active;
              return (
                <div className="unitrow" key={b.textbook_id}>
                  <span className={`tag ${st.cls}`}>{st.label}</span>
                  <b style={{ fontSize: 12.5 }}>{b.name}</b>
                  {b.area && <span className="tag tag-muted">{b.area}</span>}
                  <span className="spacer" />
                  <span className="hint">
                    {b.assigned_on || "?"} ~ {b.ended_on || (b.status === "active" ? "지금" : "?")}
                  </span>
                  {b.percent !== null && <span className="tag tag-sky">{b.percent}%</span>}
                  {(b.rounds || []).length > 1 && (
                    <div style={{ flexBasis: "100%", paddingLeft: 4, marginTop: 2 }}>
                      {b.rounds.map((r) => (
                        <div className="hint" key={r.round} style={{ fontSize: 11.5 }}>
                          {r.round}회독 {r.percent === null ? "—" : `${r.percent}%`}
                          {r.total > 0 ? ` (${r.done}/${r.total})` : ""}
                          {r.first ? ` · ${r.first} ~ ${r.last || "지금"}` : ""}
                          {r.current ? " · 진행중" : ""}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <b style={{ fontSize: 13 }}>경고 기록</b>
        {(data.warnings || []).length === 0 ? (
          <p className="hint" style={{ margin: "6px 0 12px" }}>기록이 없습니다.</p>
        ) : (
          <div className="stack" style={{ gap: 4, margin: "6px 0 14px" }}>
            {data.warnings.map((w) => {
              const k = WARN_KIND[w.kind] || { label: w.kind, cls: "tag-muted" };
              return (
                <div className="unitrow" key={w.id}>
                  <span className={`tag ${k.cls}`}>{k.label}</span>
                  <span className="hint" style={{ minWidth: 74 }}>{w.on_date}</span>
                  <span style={{ fontSize: 12.5, flex: 1 }}>
                    {w.kind === "waive" && w.target_date ? `${w.target_date} 경고 제외` : ""}
                    {w.note || ""}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <b style={{ fontSize: 13 }}>상담 기록</b>
        {data.inquiries.length === 0 ? (
          <p className="hint" style={{ margin: "6px 0 0" }}>기록이 없습니다.</p>
        ) : (
          <div className="stack" style={{ gap: 4, marginTop: 6 }}>
            {data.inquiries.map((q) => (
              <div className="unitrow" key={q.id} style={{ alignItems: "flex-start" }}>
                <span className="tag tag-lav">{INQ_STATUS[q.status] || q.status}</span>
                <div style={{ flex: 1 }}>
                  <span className="hint">
                    {(q.created_at || "").slice(0, 10)}
                    {q.source ? ` · ${q.source}` : ""}
                  </span>
                  {q.test_result && <div style={{ fontSize: 12.5 }}>테스트: {q.test_result}</div>}
                  {q.memo && <div className="hint">{q.memo}</div>}
                  {q.test_note && <div className="hint">{q.test_note}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
        {data.note && (
          <div style={{ marginTop: 10 }}>
            <b style={{ fontSize: 13 }}>특이사항</b>
            <p className="hint" style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>
              {data.note}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

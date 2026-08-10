"use client";

/**
 * **나이스 원본 보기** (원장님, 2026-08-09 — 「나이스 일정 페이지를 만들어서
 * 순수하게 나이스에 입력된 일정을 전수 볼 수 있게 해줘. 지금 오류가 난 건지
 * 입력이 안 된 건지 알 수가 없네」).
 *
 * 지금까지 볼 수 있던 것은 전부 **우리가 바꾼 뒤**의 모습이었다. 그래서
 * 화면에 뭔가 없을 때 「나이스에 원래 없었는지」 와 「있었는데 우리가
 * 못 알아봤는지」 를 가릴 수가 없었다.
 *
 * 이 화면은 나이스가 준 줄을 **하나도 안 버리고** 그대로 늘어놓고, 옆에
 * 우리가 그 줄을 어떻게 봤는지를 적는다. 저장은 하지 않는다.
 */

import { useState, useTransition } from "react";
import { shortName } from "@/lib/schoolName";
import { peekNeis } from "@/app/schedule/neisActions";

const HOW_CLS = {
  시험: "tag-amber",
  전국: "tag-lav",
  쉼: "tag-muted",
  행사: "tag-muted",
  버림: "tag-muted",
};

export default function NeisPeek({ from, to, schools = [] }) {
  const [range, setRange] = useState({ from, to });
  const [schoolId, setSchoolId] = useState("");
  const [res, setRes] = useState(null);
  const [err, setErr] = useState("");
  const [only, setOnly] = useState("all");     // all | exam | gap
  const [q, setQ] = useState("");
  const [pending, startTransition] = useTransition();

  function load() {
    setErr("");
    startTransition(async () => {
      const r = await peekNeis(range.from, range.to, schoolId || null);
      if (r?.error) { setErr(r.error); setRes(null); return; }
      setRes(r);
    });
  }

  const rows = (res?.rows || []).filter((r) => {
    if (only === "exam" && r.how !== "시험") return false;
    // **어긋난 줄만** — 나이스엔 있는데 앱엔 없는 것, 시험인데 회차가 없는 것
    if (only === "gap" && !(r.inApp === false || r.hasExam === false)) return false;
    const kw = q.trim();
    if (kw && !`${r.school} ${r.raw} ${r.event || ""}`.includes(kw)) return false;
    return true;
  });

  const gaps = (res?.rows || []).filter((r) => r.inApp === false || r.hasExam === false).length;

  return (
    <div className="stack" style={{ gap: 12, marginTop: 12 }}>
      <div className="card">
        <div className="row" style={{ gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="field" style={{ width: 150 }}>
            <label className="label">부터</label>
            <input
              className="input input-sm" type="date" value={range.from}
              onChange={(e) => setRange({ ...range, from: e.target.value })}
            />
          </div>
          <div className="field" style={{ width: 150 }}>
            <label className="label">까지</label>
            <input
              className="input input-sm" type="date" value={range.to}
              onChange={(e) => setRange({ ...range, to: e.target.value })}
            />
          </div>
          <div className="field" style={{ width: 170 }}>
            <label className="label">학교</label>
            <select
              className="input input-sm" value={schoolId}
              onChange={(e) => setSchoolId(e.target.value)}
            >
              <option value="">전체 학교</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>{shortName(s.name)}</option>
              ))}
            </select>
          </div>
          <button className="btn btn-primary btn-sm" disabled={pending} onClick={load}>
            {pending ? "나이스에 물어보는 중…" : "나이스에 물어보기"}
          </button>
        </div>
        <p className="hint" style={{ margin: "8px 0 0", fontSize: 12, lineHeight: 1.7 }}>
          누를 때마다 <b>나이스에 그 자리에서 다시 물어봅니다.</b> 받은 줄을 하나도 안 버리고
          그대로 보여주고, 옆에 <b>앱이 그 줄을 어떻게 봤는지</b>를 적습니다.
          <b> 아무것도 저장하지 않습니다.</b>
        </p>
        {err && <div className="err" style={{ marginTop: 8 }}>{err}</div>}
      </div>

      {res && (
        <div className="card">
          <div className="row" style={{ gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
            <b style={{ fontSize: 14 }}>나이스가 준 것 {res.rows.length}줄</b>
            {gaps > 0 ? (
              <span className="tag tag-amber">앱에 안 들어온 줄 {gaps}개</span>
            ) : (
              <span className="tag tag-mint">전부 앱에 들어와 있습니다</span>
            )}
            <span className="spacer" />
            <input
              className="input input-sm" style={{ width: 140 }} placeholder="이름으로 찾기"
              value={q} onChange={(e) => setQ(e.target.value)}
            />
            <select className="input input-sm" style={{ width: 150 }} value={only} onChange={(e) => setOnly(e.target.value)}>
              <option value="all">전부 보기</option>
              <option value="exam">시험만</option>
              <option value="gap">앱에 안 들어온 것만</option>
            </select>
          </div>

          {/* **나이스가 뭐라고 했는지도 그대로** — 0줄인 학교의 까닭이 여기 있다 */}
          {res.notes?.length > 0 && (
            <div className="notice" style={{ marginTop: 8, fontSize: 12.5, lineHeight: 1.8 }}>
              {res.notes.map((n, i) => <div key={i}>· {n}</div>)}
            </div>
          )}

          <PeekTable rows={rows} />
          {rows.length === 0 && (
            <p className="hint" style={{ marginTop: 8 }}>고른 조건에 맞는 줄이 없습니다.</p>
          )}
          {rows.length > 400 && (
            <p className="hint" style={{ marginTop: 6 }}>… 외 {rows.length - 400}줄 (기간이나 학교를 좁혀보세요)</p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * **받은 줄을 그대로 늘어놓는 표.**
 *
 * 따로 떼어 둔다 — 나이스가 막힌 곳에서도 **가짜 줄로 그려볼 수 있어야**
 * 하기 때문이다. 빌드가 통과해도 화면은 터질 수 있다는 것을 이번에 겪었다.
 * (scripts/check-neispeek.mjs 가 이것을 직접 그려본다)
 */
export function PeekTable({ rows = [] }) {
  return (
    <div style={{ overflowX: "auto", marginTop: 10 }}>
      <table className="tbl">
        <thead>
          <tr>
            <th>날짜</th>
            <th>학교</th>
            <th>나이스에 적힌 이름</th>
            <th>학년</th>
            <th>앱이 본 것</th>
            <th>앱에 들어옴</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 400).map((r, i) => (
            <tr key={i}>
              <td style={{ whiteSpace: "nowrap" }}>{r.date || "—"}</td>
              <td style={{ whiteSpace: "nowrap" }}>{shortName(r.school)}</td>
              <td>
                <b>{r.raw}</b>
                {/* 우리가 이름을 폈으면 원래 것과 편 것을 같이 보여준다 */}
                {r.event && <span className="hint"> → {r.event}</span>}
                {r.sbtr && <span className="hint" style={{ marginLeft: 6 }}>({r.sbtr})</span>}
              </td>
              <td className="muted">{r.grades?.length ? r.grades.join("·") : "—"}</td>
              <td><span className={`tag ${HOW_CLS[r.how] || "tag-muted"}`}>{r.how}</span></td>
              <td>
                {/* **어긋난 줄이 이 화면의 존재 이유다** — 눈에 띄게 */}
                {r.inApp === false ? (
                  <span className="tag tag-amber">안 들어옴</span>
                ) : r.hasExam === false ? (
                  <span className="tag tag-amber">회차 없음</span>
                ) : r.inApp === null ? (
                  <span className="hint">전국</span>
                ) : (
                  <span className="hint">들어옴</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { checkImport } from "./checkActions";

/**
 * 이관 점검.
 *
 * 올린 뒤에 "다 들어갔나?" 를 눈으로 확인할 방법이 없었다.
 * 월별로 세어보면 바로 보인다 — 비어 있는 달, 통째로 빠진 학생.
 */
export default function CheckBox() {
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [data, setData] = useState(null);
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      setData(await checkImport(year.trim() || null));
    });
  }

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="row" style={{ gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div className="field" style={{ width: 110 }}>
          <label className="label">연도</label>
          <input
            className="input input-sm"
            inputMode="numeric"
            value={year}
            onChange={(e) => setYear(e.target.value)}
          />
        </div>
        <button className="btn btn-primary btn-sm" disabled={pending} onClick={run}>
          {pending ? "세는 중…" : "이관 점검"}
        </button>
        <span className="hint" style={{ alignSelf: "center" }}>
          올린 뒤에 눌러보세요. 월별로 몇 건이 들어갔는지 셉니다.
        </span>
      </div>

      {data && (
        <div style={{ marginTop: 14 }}>
          <div className="row" style={{ gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            <span className="tag tag-sky">리포트 {data.totals.reports}건</span>
            <span className="tag tag-muted">숙제 붙은 것 {data.totals.withItems}건</span>
            <span className="tag tag-muted">학생 {data.totals.students} / {data.enrolled}명</span>
            <span className="tag tag-muted">결석 {data.totals.absence}</span>
            <span className="tag tag-muted">보강 {data.totals.makeup}</span>
            {data.totals.first && (
              <span className="hint" style={{ alignSelf: "center" }}>
                {data.totals.first} ~ {data.totals.last}
              </span>
            )}
          </div>

          {data.zero.length > 0 && (
            <div className="notice" style={{ marginBottom: 10, fontSize: 14, lineHeight: 1.8 }}>
              <b>기록이 하나도 없는 재원생 {data.zero.length}명</b>
              <br />
              {data.zero.join(", ")}
              <br />
              CSV 의 이름과 <b>재원생 이름이 다르면 통째로 빠집니다.</b> (띄어쓰기·한자·별칭)
              이 학생들이 이번 해에 수업을 했다면 이름을 맞춰 다시 올려주세요.
            </div>
          )}

          <div className="tblwrap">
            <table className="tbl tbl-tight">
              <thead>
                <tr>
                  <th>달</th>
                  <th>리포트</th>
                  <th>숙제 검사</th>
                  <th>숙제 배정</th>
                  <th>결석</th>
                  <th>보강</th>
                </tr>
              </thead>
              <tbody>
                {data.months.map((m) => (
                  <tr key={m.ym}>
                    <td style={{ fontWeight: 600 }}>{m.ym}</td>
                    <td>{m.reports}</td>
                    <td className={m.reports > 0 && m.withItems === 0 ? "" : "muted"}>
                      {m.withItems}
                      {m.reports > 0 && m.withItems === 0 && (
                        <span className="tag tag-amber" style={{ marginLeft: 6 }}>없음</span>
                      )}
                    </td>
                    <td className="muted">{m.assigned}</td>
                    <td className="muted">{m.absence}</td>
                    <td className="muted">{m.makeup}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.months.length === 0 && (
            <p className="hint" style={{ marginTop: 8 }}>이 해에는 기록이 없습니다.</p>
          )}
          <p className="hint" style={{ marginTop: 8, lineHeight: 1.8 }}>
            수업을 한 달인데 <b>리포트가 0</b> 이거나, 리포트는 있는데{" "}
            <b>숙제 검사가 0</b> 이면 그 달 CSV 가 빠진 것입니다. 그 달만 다시 올리시면 됩니다
            (같은 날짜·학생은 덮어씁니다).
          </p>
        </div>
      )}
    </div>
  );
}

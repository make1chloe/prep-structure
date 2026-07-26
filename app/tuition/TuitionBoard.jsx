"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addHoliday,
  deleteHoliday,
  setClassTuition,
  setStudentTuition,
} from "./actions";
import { won } from "@/lib/tuition";

function shiftMonth(ym, n) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function dayShort(d) {
  const t = new Date(`${d}T00:00:00+09:00`);
  const dow = ["일", "월", "화", "수", "목", "금", "토"][t.getDay()];
  return `${t.getDate()}(${dow})`;
}

export default function TuitionBoard({
  ym,
  groups = [],
  makeupDays = [],
  holidays = [],
  total = 0,
  totalCredit = 0,
  totalMakeup = 0,
  unavailable = false,
}) {
  const [open, setOpen] = useState(() => new Set(groups.map((g) => g.klass.id)));
  const [hDate, setHDate] = useState(`${ym}-01`);
  const [hName, setHName] = useState("");
  const [hClass, setHClass] = useState("");
  const [editClass, setEditClass] = useState(null);
  const [draft, setDraft] = useState({});
  const [editStudent, setEditStudent] = useState(null);
  const [sDraft, setSDraft] = useState({});
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function run(fn) {
    startTransition(async () => {
      const res = await fn();
      if (res?.error) {
        alert(res.error);
        return;
      }
      router.refresh();
    });
  }

  function toggle(id) {
    const n = new Set(open);
    n.has(id) ? n.delete(id) : n.add(id);
    setOpen(n);
  }

  if (unavailable) {
    return (
      <div className="card" style={{ marginTop: 12 }}>
        <div className="notice">
          수강료 계산을 쓰려면 Supabase에서 <b>0018 SQL</b>을 먼저 실행해주세요.
        </div>
      </div>
    );
  }

  const allOff = holidays.filter((h) => h.scope === "all");

  return (
    <>
      <div className="row" style={{ gap: 6, alignItems: "center", marginTop: 12 }}>
        <a className="btn btn-ghost btn-sm" href={`/tuition?m=${shiftMonth(ym, -1)}`}>◂ 지난달</a>
        <input
          className="input input-sm"
          type="month"
          style={{ width: 140 }}
          defaultValue={ym}
          onChange={(e) => e.target.value && router.push(`/tuition?m=${e.target.value}`)}
        />
        <a className="btn btn-ghost btn-sm" href={`/tuition?m=${shiftMonth(ym, 1)}`}>다음달 ▸</a>
        <span className="spacer" />
        <span className="tag tag-mint" style={{ fontSize: 13, padding: "5px 12px" }}>
          이번 달 합계 <b>{won(total)}</b>
        </span>
        {totalMakeup > 0 && (
          <span className="tag tag-amber" style={{ fontSize: 13, padding: "5px 12px" }}>
            보강 필요 <b>{totalMakeup}회</b> · 차액 {won(totalCredit)}
          </span>
        )}
      </div>

      {/* 휴강일 */}
      <div className="card" style={{ marginTop: 12 }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>휴강일</h2>
        <p className="muted" style={{ margin: "0 0 10px", fontSize: 12.5 }}>
          휴강으로 넣으면 그 날짜가 회차에서 빠집니다. <b>수강료는 그대로</b>이고,
          대신 학생마다 <b>보강 필요 횟수</b>와 <b>차액</b>이 계산됩니다.
        </p>
        <div className="row" style={{ gap: 6, alignItems: "center" }}>
          <input
            className="input input-sm"
            type="date"
            style={{ width: 150 }}
            value={hDate}
            onChange={(e) => setHDate(e.target.value)}
          />
          <input
            className="input input-sm"
            style={{ width: 150 }}
            placeholder="사유 (설날 등)"
            value={hName}
            onChange={(e) => setHName(e.target.value)}
          />
          <select
            className="input input-sm"
            style={{ width: 170 }}
            value={hClass}
            onChange={(e) => setHClass(e.target.value)}
          >
            <option value="">전체 휴강</option>
            {groups.map((g) => (
              <option key={g.klass.id} value={g.klass.id}>{g.klass.name} 만</option>
            ))}
          </select>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => run(() => addHoliday(hDate, hName, hClass || null))}
            disabled={pending}
          >
            휴강 추가
          </button>
        </div>

        {holidays.length > 0 && (
          <div className="row" style={{ gap: 4, marginTop: 10 }}>
            {holidays.map((h) => (
              <button
                key={h.id}
                className={`hwchip ${h.scope === "all" ? "hw-missing" : ""}`}
                onClick={() => {
                  if (!confirm("이 휴강을 지울까요?")) return;
                  run(() => deleteHoliday(h.id));
                }}
                title="클릭하면 지웁니다"
              >
                {dayShort(h.date)} {h.name || (h.scope === "all" ? "휴강" : "반 휴강")} ✕
              </button>
            ))}
          </div>
        )}
        {allOff.length === 0 && (
          <p className="hint" style={{ marginTop: 8 }}>이번 달 전체 휴강은 없습니다.</p>
        )}
      </div>

      {/* 반별 */}
      <div className="stack" style={{ gap: 12, marginTop: 12 }}>
        {groups.map(({ klass, live, off, all, base, rows, sum, makeupSum, creditSum, makeupOnly = [] }) => {
          const opened = open.has(klass.id);
          const editing = editClass === klass.id;
          return (
            <div className="card" key={klass.id} style={{ padding: 0, overflow: "hidden" }}>
              <button className="grouphead" onClick={() => toggle(klass.id)}>
                <span style={{ fontWeight: 800 }}>
                  {opened ? "▾" : "▸"} {klass.name}{" "}
                  <span className="muted" style={{ fontWeight: 600 }}>
                    {(klass.days || []).join("·")}
                    {makeupOnly.length > 0 && (
                      <span className="tag tag-muted" style={{ marginLeft: 6 }}>
                        보강일 {makeupOnly.length}일 제외
                      </span>
                    )}
                  </span>
                </span>
                <span className="muted" style={{ fontSize: 12.5 }}>
                  {live.length}회{off.length > 0 && ` (휴강 ${off.length}회)`} · 기준 {base}회 ·{" "}
                  <b>{won(sum)}</b>
                  {makeupSum > 0 && (
                    <b style={{ color: "var(--amber)" }}> · 보강 {makeupSum}회</b>
                  )}
                </span>
              </button>

              {opened && (
                <div style={{ padding: "10px 16px 14px" }}>
                  {/* 수업일 */}
                  <div className="row" style={{ gap: 4, marginBottom: 10 }}>
                    {all.map((d) => {
                      const isOff = off.includes(d);
                      return (
                        <span
                          key={d}
                          className={`tag ${isOff ? "tag-muted" : "tag-sky"}`}
                          style={isOff ? { textDecoration: "line-through" } : undefined}
                        >
                          {dayShort(d)}
                        </span>
                      );
                    })}
                  </div>

                  {/* 반 단가 */}
                  <div className="row" style={{ gap: 6, alignItems: "center", marginBottom: 10 }}>
                    {editing ? (
                      <>
                        <span className="hint">월 수강료</span>
                        <input
                          className="input input-sm"
                          style={{ width: 110 }}
                          inputMode="numeric"
                          value={draft.tuition}
                          onChange={(e) => setDraft({ ...draft, tuition: e.target.value })}
                        />
                        <span className="hint">기준 회차 (비우면 {live.length}회)</span>
                        <input
                          className="input input-sm"
                          style={{ width: 70 }}
                          inputMode="numeric"
                          value={draft.base}
                          onChange={(e) => setDraft({ ...draft, base: e.target.value })}
                        />
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() =>
                            run(async () => {
                              const r = await setClassTuition(klass.id, draft.tuition, draft.base);
                              setEditClass(null);
                              return r;
                            })
                          }
                          disabled={pending}
                        >
                          저장
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditClass(null)}>취소</button>
                      </>
                    ) : (
                      <>
                        <span className="hint">월 수강료</span>
                        <b>{won(klass.tuition)}</b>
                        {klass.base_sessions ? (
                          <span className="hint">· 기준 {klass.base_sessions}회</span>
                        ) : (
                          <span className="hint">· 기준 그 달 정상 회차</span>
                        )}
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => {
                            setEditClass(klass.id);
                            setDraft({
                              tuition: klass.tuition ?? "",
                              base: klass.base_sessions ?? "",
                            });
                          }}
                        >
                          수정
                        </button>
                      </>
                    )}
                  </div>

                  {/* 학생별 */}
                  <div className="tblwrap">
                    <table className="tbl tbl-tight">
                      <thead>
                        <tr>
                          <th style={{ minWidth: 90 }}>학생</th>
                          <th style={{ width: 70 }}>회차</th>
                          <th style={{ width: 84 }}>보강 필요</th>
                          <th style={{ width: 100 }}>등원 시작</th>
                          <th style={{ width: 100 }}>퇴원</th>
                          <th style={{ width: 110 }}>금액</th>
                          <th style={{ width: 70 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => {
                          const se = editStudent === r.student.id;
                          return (
                            <tr key={r.student.id}>
                              <td style={{ fontWeight: 600 }}>{r.student.name}</td>
                              <td>
                                {r.sessions}/{r.base}
                                {!r.full && <span className="tag tag-muted" style={{ marginLeft: 4 }}>일부</span>}
                              </td>
                              <td>
                                {r.makeupNeeded > 0 ? (
                                  <span className="tag tag-amber" title={`차액 ${won(r.credit)}`}>
                                    {r.makeupNeeded}회 · {won(r.credit)}
                                  </span>
                                ) : (
                                  <span className="hint">—</span>
                                )}
                              </td>
                              {se ? (
                                <>
                                  <td>
                                    <input
                                      className="input input-sm"
                                      type="date"
                                      value={sDraft.started_on}
                                      onChange={(e) => setSDraft({ ...sDraft, started_on: e.target.value })}
                                    />
                                  </td>
                                  <td>
                                    <input
                                      className="input input-sm"
                                      type="date"
                                      value={sDraft.ended_on}
                                      onChange={(e) => setSDraft({ ...sDraft, ended_on: e.target.value })}
                                    />
                                  </td>
                                  <td>
                                    <input
                                      className="input input-sm"
                                      style={{ width: 100 }}
                                      inputMode="numeric"
                                      placeholder="반 금액 사용"
                                      value={sDraft.tuition}
                                      onChange={(e) => setSDraft({ ...sDraft, tuition: e.target.value })}
                                    />
                                  </td>
                                  <td>
                                    <div className="row" style={{ gap: 3, flexWrap: "nowrap" }}>
                                      <button
                                        className="btn btn-primary btn-sm"
                                        onClick={() =>
                                          run(async () => {
                                            const res = await setStudentTuition(r.student.id, sDraft);
                                            setEditStudent(null);
                                            return res;
                                          })
                                        }
                                        disabled={pending}
                                      >
                                        저장
                                      </button>
                                      <button className="btn btn-ghost btn-sm" onClick={() => setEditStudent(null)}>
                                        취소
                                      </button>
                                    </div>
                                  </td>
                                </>
                              ) : (
                                <>
                                  <td className="muted">{r.student.started_on || "—"}</td>
                                  <td className="muted">{r.student.ended_on || "—"}</td>
                                  <td>
                                    <b>{won(r.amount)}</b>
                                    {r.student.tuition ? (
                                      <span className="tag tag-lav" style={{ marginLeft: 4 }}>개별</span>
                                    ) : null}
                                  </td>
                                  <td>
                                    <button
                                      className="btn btn-ghost btn-sm"
                                      onClick={() => {
                                        setEditStudent(r.student.id);
                                        setSDraft({
                                          started_on: r.student.started_on || "",
                                          ended_on: r.student.ended_on || "",
                                          tuition: r.student.tuition ?? "",
                                        });
                                      }}
                                    >
                                      수정
                                    </button>
                                  </td>
                                </>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {klass.tuition ? null : (
                    <p className="hint" style={{ marginTop: 8 }}>
                      월 수강료를 넣으면 금액이 계산됩니다.
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {groups.length === 0 && (
          <div className="card">
            <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
              반이 없습니다. <b>반</b> 메뉴에서 먼저 만들어주세요.
            </p>
          </div>
        )}
      </div>
    </>
  );
}

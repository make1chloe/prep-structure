"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addHoliday,
  deleteHoliday,
  setClassTuition,
  setStudentTuition,
  setPaid,
  setPaidMany,
  saveGradeTuition,
} from "./actions";
import { won } from "@/lib/tuition";
import { shortLabel } from "@/lib/day";

function shiftMonth(ym, n) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
const dayShort = shortLabel;

export default function TuitionBoard({
  ym,
  groups = [],
  makeupDays = [],
  noClass = [],
  holidays = [],
  total = 0,
  totalCredit = 0,
  totalMakeup = 0,
  unavailable = false,
  totalUnpaid = 0,
  payReady = true,
  byGrade = {},
  grades = [],
}) {
  const [open, setOpen] = useState(() => new Set(groups.map((g) => g.klass.id)));
  // 수납 일괄 처리 — 반 하나가 다 들어오는 날이면 열댓 번을 눌러야 했다
  const [payPick, setPayPick] = useState(() => new Set());
  const [payOn, setPayOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [hDate, setHDate] = useState(`${ym}-01`);
  const [hName, setHName] = useState("");
  const [hClass, setHClass] = useState("");
  const [editClass, setEditClass] = useState(null);
  const [draft, setDraft] = useState({});
  const [editStudent, setEditStudent] = useState(null);
  const [sDraft, setSDraft] = useState({});
  const [gDraft, setGDraft] = useState(() => ({ ...byGrade }));
  const [gRow, setGRow] = useState({ grade: "", amount: "" });
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // 반을 가로질러 고를 수 있어야 한다 — 반 하나가 다 들어오는 날도 있고,
  // 여기저기서 한 명씩 들어오는 날도 있다
  const allRows = groups.flatMap((g) => g.rows || []);

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
        <span className="tag tag-mint" style={{ fontSize: 14.5, padding: "5px 12px" }}>
          이번 달 합계 <b>{won(total)}</b>
        </span>
        {totalUnpaid > 0 && (
          <span className="tag tag-red" style={{ fontSize: 14.5, padding: "5px 12px" }}>
            아직 못 받음 <b>{won(totalUnpaid)}</b>
          </span>
        )}
        {totalMakeup > 0 && (
          <span className="tag tag-amber" style={{ fontSize: 14.5, padding: "5px 12px" }}>
            보강 필요 <b>{totalMakeup}회</b> · 차액 {won(totalCredit)}
          </span>
        )}
      </div>

      {!payReady && (
        <p className="hint" style={{ marginTop: 8 }}>
          수납 칸을 쓰려면 <b>supabase/migrations/0055_payments.sql</b> 을 먼저 실행해주세요.
          결제선생 엑셀은 <a className="sky" href="/import">노션 이관 · 수납</a> 에서 올립니다.
        </p>
      )}


      {/* 학년별 수강료 — 학년이 오르면 금액이 오른다 */}
      <div className="card" style={{ marginTop: 12 }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 800 }}>학년별 수강료</h2>
        <p className="muted" style={{ margin: "0 0 10px", fontSize: 14, lineHeight: 1.7 }}>
          한 반에 학년이 섞여 있어도 학생마다 손으로 고쳐 넣지 않아도 됩니다.
          <br />
          금액은 <b>좁은 것이 이깁니다</b> — 학생에게 따로 적은 금액 ▸ 학년별 금액 ▸ 반 금액 순입니다.
          비워두면 &apos;안 적음&apos; 이라 합계에서 빠집니다 (0원과 다릅니다).
        </p>

        <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          {[...new Set([...grades, ...Object.keys(gDraft)])].sort().map((g) => (
            <div className="field" key={g} style={{ width: 128 }}>
              <label className="label">{g}</label>
              <input
                className="input input-sm"
                inputMode="numeric"
                placeholder="안 적음"
                value={gDraft[g] ?? ""}
                onChange={(e) => setGDraft({ ...gDraft, [g]: e.target.value })}
              />
            </div>
          ))}
          {[...new Set([...grades, ...Object.keys(gDraft)])].length === 0 && (
            <p className="hint" style={{ margin: 0 }}>
              재원생에 학년이 적혀 있으면 여기 자동으로 칸이 생깁니다.
            </p>
          )}
        </div>

        <div className="row" style={{ gap: 6, marginTop: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="field" style={{ width: 110 }}>
            <label className="label">학년 추가</label>
            <input
              className="input input-sm"
              placeholder="고1"
              value={gRow.grade}
              onChange={(e) => setGRow({ ...gRow, grade: e.target.value })}
            />
          </div>
          <div className="field" style={{ width: 128 }}>
            <label className="label">금액</label>
            <input
              className="input input-sm"
              inputMode="numeric"
              placeholder="250000"
              value={gRow.amount}
              onChange={(e) => setGRow({ ...gRow, amount: e.target.value })}
            />
          </div>
          <button
            className="btn btn-sm"
            style={{ marginBottom: 1 }}
            disabled={pending || !gRow.grade.trim()}
            onClick={() => {
              setGDraft({ ...gDraft, [gRow.grade.trim()]: gRow.amount });
              setGRow({ grade: "", amount: "" });
            }}
          >
            칸 만들기
          </button>
          <span className="spacer" />
          <button
            className="btn btn-primary btn-sm"
            style={{ marginBottom: 1 }}
            disabled={pending}
            onClick={() => run(() => saveGradeTuition(gDraft))}
          >
            학년별 수강료 저장
          </button>
        </div>
      </div>

      {/* 휴강일 */}
      <div className="card" style={{ marginTop: 12 }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 800 }}>휴강일</h2>
        <p className="muted" style={{ margin: "0 0 10px", fontSize: 14 }}>
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

      {noClass.length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="notice">
            <b>반이 없는 재원생 {noClass.length}명</b> — {noClass.join(", ")}
            <br />
            아래 목록에 <b>안 나오고 합계에도 안 들어갑니다.</b>
            {" "}<a className="sky" href="/classes">반 · 학생 배정</a> 에서 반에 넣어주세요.
          </div>
        </div>
      )}

      {/* **고른 사람을 한 번에 수납 처리한다.**
          받은 날을 고를 수 있어야 한다 — 계좌를 며칠 만에 확인하시는 일이
          흔해서, 오늘로 찍어버리면 실제 받은 날과 어긋난다. */}
      {payPick.size > 0 && (
        <div className="bulkbar">
          <b>{payPick.size}명 선택</b>
          <span className="hint">받은 날</span>
          <input
            className="input input-sm"
            type="date"
            style={{ width: 148 }}
            value={payOn}
            onChange={(e) => setPayOn(e.target.value)}
          />
          <button
            className="btn btn-primary btn-sm"
            disabled={pending || !payReady}
            onClick={() => {
              const picked = allRows.filter((r) => payPick.has(r.student.id));
              if (picked.length === 0) return;
              if (!confirm(`${picked.length}명을 ${payOn} 에 받은 것으로 처리할까요?`)) return;
              run(async () => {
                const res = await setPaidMany(
                  picked.map((r) => ({ studentId: r.student.id, amount: r.amount })),
                  ym, true, payOn
                );
                if (!res?.error) setPayPick(new Set());
                return res;
              });
            }}
          >
            받음으로 처리
          </button>
          <button
            className="btn btn-ghost btn-sm"
            disabled={pending || !payReady}
            onClick={() => {
              const picked = allRows.filter((r) => payPick.has(r.student.id));
              if (picked.length === 0) return;
              if (!confirm(`${picked.length}명을 미납으로 되돌릴까요?`)) return;
              run(async () => {
                const res = await setPaidMany(
                  picked.map((r) => ({ studentId: r.student.id })),
                  ym, false
                );
                if (!res?.error) setPayPick(new Set());
                return res;
              });
            }}
          >
            미납으로 되돌리기
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setPayPick(new Set())}>
            선택 해제
          </button>
        </div>
      )}

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
                <span className="muted" style={{ fontSize: 14 }}>
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
                  <div className="row" style={{ gap: 6, alignItems: "center", marginBottom: 6 }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={!payReady}
                      onClick={() => {
                        const ids = rows.map((r) => r.student.id);
                        const every = ids.length > 0 && ids.every((id) => payPick.has(id));
                        const n = new Set(payPick);
                        ids.forEach((id) => (every ? n.delete(id) : n.add(id)));
                        setPayPick(n);
                      }}
                    >
                      이 반 전체 고르기
                    </button>
                    {/* 안 받은 사람만 고르는 것이 실제로 제일 잦다 */}
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={!payReady}
                      onClick={() => {
                        const n = new Set(payPick);
                        rows.filter((r) => !r.paid).forEach((r) => n.add(r.student.id));
                        setPayPick(n);
                      }}
                    >
                      안 받은 사람만
                    </button>
                  </div>
                  <div className="tblwrap">
                    <table className="tbl tbl-tight">
                      <thead>
                        <tr>
                          <th style={{ width: 28 }}></th>
                          <th style={{ minWidth: 90 }}>학생</th>
                          {/* **수납이 두 번째다.** 전에는 여덟째 칸이라, 폰에서는
                              가로로 한참 밀어야 나왔다 — 「납부 버튼이 없다」 는
                              말이 여기서 나왔다. 이 표에서 매일 누르는 것은 이것 하나다 */}
                          <th style={{ width: 96 }}>수납</th>
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
                              <td>
                                <input
                                  type="checkbox"
                                  checked={payPick.has(r.student.id)}
                                  onChange={() => {
                                    const n = new Set(payPick);
                                    n.has(r.student.id) ? n.delete(r.student.id) : n.add(r.student.id);
                                    setPayPick(n);
                                  }}
                                  disabled={!payReady}
                                />
                              </td>
                              <td style={{ fontWeight: 600 }}>{r.student.name}</td>
                              {/* 받았는가 — 한 번 눌러 뒤집는다. 엑셀로 올린 것도 여기 나온다 */}
                              <td>
                                <button
                                  className={`btn btn-sm ${r.paid ? "btn-ghost" : ""}`}
                                  style={
                                    r.paid
                                      ? { color: "var(--mint)", borderColor: "var(--mint)" }
                                      : { color: "var(--red)", borderColor: "var(--red)" }
                                  }
                                  title={
                                    r.paid
                                      ? `${r.pay?.paid_on || ""} 받음${r.pay?.source === "결제선생" ? " (결제선생)" : ""}`
                                      : r.pay?.note || "아직 안 받음 — 누르면 받음으로"
                                  }
                                  onClick={() =>
                                    run(() => setPaid(r.student.id, ym, !r.paid, r.amount))
                                  }
                                  disabled={pending || !payReady}
                                >
                                  {r.paid ? "받음" : "미납"}
                                </button>
                              </td>
                              <td>
                                {r.sessions}/{r.base}
                                {!r.full && <span className="tag tag-muted" style={{ marginLeft: 4 }}>일부</span>}
                              </td>
                              <td>
                                {r.makeupNeeded > 0 ? (
                                  <span
                                    className="tag tag-amber"
                                    title={
                                      `휴강 ${r.offCount || 0}회 · 결석 ${r.absentCount || 0}회` +
                                      ` (차액은 휴강분만 ${won(r.credit)})`
                                    }
                                  >
                                    {r.makeupNeeded}회
                                    {r.absentCount > 0 && ` (결석 ${r.absentCount})`}
                                    {r.credit > 0 && ` · ${won(r.credit)}`}
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
                                    {r.noPrice && (
                                      <span
                                        className="tag tag-red"
                                        style={{ marginLeft: 4 }}
                                        title="반에도 학생에도 수강료가 없어서 합계에서 빠집니다"
                                      >
                                        수강료 미입력
                                      </span>
                                    )}
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
            <p className="muted" style={{ margin: 0, fontSize: 15 }}>
              반이 없습니다. <b>반</b> 메뉴에서 먼저 만들어주세요.
            </p>
          </div>
        )}
      </div>
    </>
  );
}

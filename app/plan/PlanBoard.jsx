"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  setPlannedAbsenceRange,
  clearPlannedAbsenceRange,
  assignHomeworkAhead,
  unassignHomeworkAhead,
} from "./actions";
import { createNotice } from "@/app/today/actions";
import { listUnitOptions } from "@/app/today/actions";
import { unitOptionText } from "@/lib/unitTree";

const REASONS = ["학교 행사", "시험 기간", "병원", "가족 일정", "여행", "기타"];
const CAT_CLS = {
  단어: "tag-amber", 독해: "tag-sky", 문법: "tag-lav",
  노트: "tag-mint", 내신: "tag-muted", 기타: "tag-muted",
};

function shiftDate(date, days) {
  const d = new Date(`${date}T00:00:00+09:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function dayLabel(d) {
  const t = new Date(`${d}T00:00:00+09:00`);
  const dow = ["일", "월", "화", "수", "목", "금", "토"][t.getDay()];
  return `${t.getMonth() + 1}월 ${t.getDate()}일 (${dow})`;
}

export default function PlanBoard({
  date,
  groups = [],
  items = [],
  textbooks = [],
  planReady = true,
}) {
  const [tab, setTab] = useState("homework"); // homework | absence | notice
  const [sel, setSel] = useState(() => new Set());
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // 숙제 미리 배정
  const [picked, setPicked] = useState(() => new Map()); // itemId → { textbookId, unitIds, note }
  const [unitsByBook, setUnitsByBook] = useState({});
  const [loadingBook, setLoadingBook] = useState(null);
  const [cat, setCat] = useState("전체");

  // 공지 · 전달사항
  const [kind, setKind] = useState("deliver");
  const [body, setBody] = useState("");
  const [scope, setScope] = useState("all");
  const [classId, setClassId] = useState(groups[0]?.klass.id || "");

  // 결석 예정 — 기간으로 넣는다
  const [reason, setReason] = useState("학교 행사");
  const [absFrom, setAbsFrom] = useState(date);
  const [absTo, setAbsTo] = useState(date);

  const allStudents = groups.flatMap((g) =>
    g.rows.map((r) => ({ ...r, className: g.klass.name, classId: g.klass.id }))
  );
  const cats = ["전체", ...new Set(items.map((i) => i.category).filter(Boolean))];
  const shownItems = cat === "전체" ? items : items.filter((i) => i.category === cat);

  function toggleStudent(id) {
    const n = new Set(sel);
    n.has(id) ? n.delete(id) : n.add(id);
    setSel(n);
  }
  function selectClass(cid) {
    const ids = allStudents.filter((s) => s.classId === cid).map((s) => s.student.id);
    const every = ids.every((id) => sel.has(id));
    const n = new Set(sel);
    ids.forEach((id) => (every ? n.delete(id) : n.add(id)));
    setSel(n);
  }

  function run(fn, okMsg) {
    startTransition(async () => {
      const res = await fn();
      if (res?.error) {
        alert(res.error);
        return;
      }
      if (okMsg) alert(okMsg);
      router.refresh();
    });
  }

  async function loadBook(bookId) {
    if (!bookId || unitsByBook[bookId]) return;
    setLoadingBook(bookId);
    const res = await listUnitOptions(bookId);
    setUnitsByBook((m) => ({ ...m, [bookId]: res.options || [] }));
    setLoadingBook(null);
  }

  const AREA_OF = { 단어: "단어", 독해: "독해", 문법: "문법", 내신: "내신", 듣기: "듣기", 영작: "영작" };
  function bookFor(itemId) {
    const item = items.find((i) => i.id === itemId);
    const area = AREA_OF[item?.category] || "";
    const hit = area ? textbooks.find((b) => b.area === area) : null;
    return hit?.id || "";
  }

  function toggleItem(id) {
    const m = new Map(picked);
    if (m.has(id)) {
      m.delete(id);
    } else {
      const b = bookFor(id);
      m.set(id, { textbookId: b, unitIds: [], note: "" });
      loadBook(b);
    }
    setPicked(m);
  }
  function patchItem(id, patch) {
    const m = new Map(picked);
    m.set(id, { ...(m.get(id) || { textbookId: "", unitIds: [], note: "" }), ...patch });
    setPicked(m);
  }
  function unitMeta(unitId) {
    for (const opts of Object.values(unitsByBook)) {
      const hit = opts.find((o) => o.id === unitId);
      if (hit) return hit;
    }
    return null;
  }

  function saveHomework() {
    if (sel.size === 0) return alert("학생을 골라주세요.");
    if (picked.size === 0) return alert("숙제를 골라주세요.");
    run(
      () =>
        assignHomeworkAhead(
          [...sel],
          date,
          [...picked.entries()].map(([homeworkItemId, v]) => ({
            homeworkItemId,
            unitIds: v.unitIds,
            note: v.note,
          }))
        ),
      `${sel.size}명에게 숙제를 미리 배정했어요.`
    );
  }

  function saveNotice() {
    if (!body.trim()) return;
    run(
      () =>
        createNotice({
          date,
          kind,
          scope,
          classId: classId || null,
          studentIds: [...sel],
          body,
        }),
      "저장했어요. 그날 오늘 수업 화면에 나타납니다."
    );
    setBody("");
  }

  if (!planReady) {
    return (
      <div className="card" style={{ marginTop: 12 }}>
        <div className="notice">
          미리 작성을 쓰려면 Supabase에서 <b>0017 SQL</b>을 먼저 실행해주세요.
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="row" style={{ gap: 6, alignItems: "center", marginTop: 12 }}>
        <a className="btn btn-ghost btn-sm" href={`/plan?d=${shiftDate(date, -1)}`}>◂</a>
        <input
          className="input input-sm"
          type="date"
          style={{ width: 150 }}
          defaultValue={date}
          onChange={(e) => e.target.value && router.push(`/plan?d=${e.target.value}`)}
        />
        <a className="btn btn-ghost btn-sm" href={`/plan?d=${shiftDate(date, 1)}`}>▸</a>
        <a className="btn btn-ghost btn-sm" href={`/plan?d=${shiftDate(date, 7)}`}>+1주</a>
        <a className="btn btn-ghost btn-sm" href={`/plan?d=${shiftDate(date, 14)}`}>+2주</a>
        <b style={{ fontSize: 14, marginLeft: 6 }}>{dayLabel(date)}</b>
        <span className="spacer" />
        {[
          ["homework", "숙제 미리 내기"],
          ["absence", "결석 예정"],
          ["notice", "공지 · 전달사항"],
        ].map(([k, label]) => (
          <button
            key={k}
            className={`btn btn-sm ${tab === k ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setTab(k)}
          >
            {label}
          </button>
        ))}
      </div>

      {groups.length === 0 ? (
        <div className="card" style={{ marginTop: 12 }}>
          <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
            이 날짜에는 수업이 없어요. 다른 날짜를 골라주세요.
          </p>
        </div>
      ) : (
        <div className="grid-side" style={{ marginTop: 12 }}>
          {/* 학생 고르기 */}
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div className="row" style={{ padding: "12px 16px 0", alignItems: "baseline" }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>
                학생 고르기{" "}
                <span className="muted" style={{ fontWeight: 600, fontSize: 13 }}>
                  {sel.size}명 선택
                </span>
              </h2>
              <span className="spacer" />
              <button className="btn btn-ghost btn-sm" onClick={() => setSel(new Set())}>
                해제
              </button>
            </div>

            {groups.map((g) => (
              <div key={g.klass.id} style={{ marginTop: 10 }}>
                <button className="grouphead" onClick={() => selectClass(g.klass.id)}>
                  <span style={{ fontWeight: 800 }}>
                    {g.klass.name}{" "}
                    <span className="muted" style={{ fontWeight: 600 }}>{g.rows.length}명</span>
                  </span>
                  <span className="hint">반 전체 선택</span>
                </button>
                <div className="row" style={{ gap: 4, padding: "8px 16px" }}>
                  {g.rows.map((r) => (
                    <button
                      key={r.student.id}
                      className={`hwchip ${sel.has(r.student.id) ? "hw-next" : ""}`}
                      onClick={() => toggleStudent(r.student.id)}
                      style={
                        r.plannedAbsent
                          ? { borderColor: "var(--amber)", borderWidth: 2 }
                          : undefined
                      }
                      title={r.plannedAbsent ? `결석 예정 · ${r.reason || ""}` : undefined}
                    >
                      {sel.has(r.student.id) && <b>＋</b>} {r.student.name}
                      {r.plannedAbsent && <span className="hint"> 결석</span>}
                      {r.assignedCount > 0 && <span className="hint"> 숙제{r.assignedCount}</span>}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* 오른쪽: 탭별 작업 */}
          <div className="card">
            {tab === "homework" && (
              <>
                <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>숙제 미리 내기</h2>
                <p className="muted" style={{ margin: "0 0 10px", fontSize: 12.5 }}>
                  고른 학생들에게 <b>{dayLabel(date)}</b> 숙제로 들어갑니다. 그 다음 수업에 검사 대상이 돼요.
                </p>

                <div className="row" style={{ gap: 3, marginBottom: 6 }}>
                  {cats.map((c) => (
                    <button
                      key={c}
                      className={`btn btn-sm ${cat === c ? "btn-primary" : "btn-ghost"}`}
                      style={{ padding: "3px 8px" }}
                      onClick={() => setCat(c)}
                    >
                      {c}
                    </button>
                  ))}
                </div>

                <div className="row" style={{ gap: 4, marginBottom: 10 }}>
                  {shownItems.map((i) => (
                    <button
                      key={i.id}
                      className={`hwchip ${picked.has(i.id) ? "hw-next" : ""}`}
                      onClick={() => toggleItem(i.id)}
                    >
                      {picked.has(i.id) && <b>＋</b>} {i.name}
                    </button>
                  ))}
                </div>

                {[...picked.keys()].length > 0 && (
                  <div className="stack" style={{ gap: 6 }}>
                    {[...picked.entries()].map(([iid, v]) => {
                      const opts = unitsByBook[v.textbookId] || [];
                      return (
                        <div className="unitrow" key={iid}>
                          <span className={`tag ${CAT_CLS[items.find((x) => x.id === iid)?.category] || "tag-muted"}`}>
                            {items.find((x) => x.id === iid)?.name}
                          </span>
                          <select
                            className="input input-sm"
                            style={{ width: 150 }}
                            value={v.textbookId}
                            onChange={(e) => {
                              patchItem(iid, { textbookId: e.target.value });
                              loadBook(e.target.value);
                            }}
                          >
                            <option value="">교재 선택</option>
                            {textbooks.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.area ? `[${t.area}] ` : ""}{t.name}
                              </option>
                            ))}
                          </select>
                          <select
                            className="input input-sm"
                            style={{ flex: 1, minWidth: 180 }}
                            value=""
                            onChange={(e) => {
                              const uid = e.target.value;
                              e.target.value = "";
                              if (uid && !v.unitIds.includes(uid)) {
                                patchItem(iid, { unitIds: [...v.unitIds, uid] });
                              }
                            }}
                            disabled={!v.textbookId}
                          >
                            <option value="">
                              {!v.textbookId
                                ? "교재를 먼저 고르세요"
                                : loadingBook === v.textbookId
                                ? "단원 불러오는 중…"
                                : opts.length === 0
                                ? "등록된 단원이 없어요"
                                : "단원 추가…"}
                            </option>
                            {opts.map((o) => (
                              <option key={o.id} value={o.id} disabled={v.unitIds.includes(o.id)}>
                                {" ".repeat(o.depth * 3)}
                                {unitOptionText(o)}
                              </option>
                            ))}
                          </select>
                          <input
                            className="input input-sm"
                            style={{ width: 110 }}
                            placeholder="범위 메모"
                            value={v.note}
                            onChange={(e) => patchItem(iid, { note: e.target.value })}
                          />
                          {v.unitIds.length > 0 && (
                            <span className="unitmeta" style={{ flexBasis: "100%" }}>
                              {v.unitIds.map((uid) => {
                                const m = unitMeta(uid);
                                return (
                                  <button
                                    key={uid}
                                    className="hwchip hw-next"
                                    onClick={() =>
                                      patchItem(iid, { unitIds: v.unitIds.filter((x) => x !== uid) })
                                    }
                                  >
                                    {m ? [m.big, m.mid, m.small].filter(Boolean).join(" › ") : "단원"}
                                    {m?.activity ? ` · ${m.activity}` : ""}
                                    {m?.amount ? ` · ${m.amount}` : ""} ✕
                                  </button>
                                );
                              })}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="row" style={{ gap: 6, marginTop: 12 }}>
                  <button className="btn btn-primary btn-sm" onClick={saveHomework} disabled={pending}>
                    {pending ? "저장 중…" : `${sel.size}명에게 배정`}
                  </button>
                  {picked.size === 1 && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() =>
                        run(
                          () => unassignHomeworkAhead([...sel], date, [...picked.keys()][0]),
                          "배정을 취소했어요."
                        )
                      }
                      disabled={pending || sel.size === 0}
                    >
                      이 숙제 배정 취소
                    </button>
                  )}
                </div>
              </>
            )}

            {tab === "absence" && (
              <>
                <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>결석 예정</h2>
                <p className="muted" style={{ margin: "0 0 10px", fontSize: 12.5 }}>
                  미리 연락받은 결석을 남겨두면, 그날 <b>오늘 수업</b> 화면에서 기다리지 않아도 됩니다.
                  당일 결석과 구분되어 기록돼요.
                </p>
                <div className="row" style={{ gap: 4, marginBottom: 10 }}>
                  {REASONS.map((r) => (
                    <button
                      key={r}
                      className={`btn btn-sm ${reason === r ? "btn-primary" : "btn-ghost"}`}
                      onClick={() => setReason(r)}
                    >
                      {r}
                    </button>
                  ))}
                  <input
                    className="input input-sm"
                    style={{ width: 150 }}
                    placeholder="직접 입력"
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>
                <div className="row" style={{ gap: 6, alignItems: "center", marginBottom: 8 }}>
                  <span className="hint">기간</span>
                  <input className="input input-sm" type="date" style={{ width: 145 }}
                    value={absFrom} onChange={(e) => setAbsFrom(e.target.value)} />
                  <span className="hint">~</span>
                  <input className="input input-sm" type="date" style={{ width: 145 }}
                    value={absTo} onChange={(e) => setAbsTo(e.target.value)} />
                  <button className="btn btn-ghost btn-sm" onClick={() => { setAbsFrom(date); setAbsTo(date); }}>
                    하루만
                  </button>
                  <span className="hint">수업 있는 날만 자동으로 들어갑니다</span>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={pending || sel.size === 0 || !absFrom}
                    onClick={() =>
                      run(
                        () => setPlannedAbsenceRange([...sel], absFrom, absTo, reason),
                        `${sel.size}명 결석 예정으로 남겼어요.`
                      )
                    }
                  >
                    결석 예정으로 남기기
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={pending || sel.size === 0 || !absFrom}
                    onClick={() =>
                      run(
                        () => clearPlannedAbsenceRange([...sel], absFrom, absTo),
                        "취소했어요."
                      )
                    }
                  >
                    이 기간 취소
                  </button>
                </div>

                {allStudents.filter((s) => s.plannedAbsent).length > 0 && (
                  <div style={{ marginTop: 14 }}>
                    <b style={{ fontSize: 13 }}>이 날 결석 예정</b>
                    <div className="stack" style={{ gap: 4, marginTop: 6 }}>
                      {allStudents
                        .filter((s) => s.plannedAbsent)
                        .map((s) => (
                          <div className="unitrow" key={s.student.id}>
                            <b style={{ fontSize: 12.5 }}>{s.student.name}</b>
                            <span className="hint">{s.className}</span>
                            <span className="tag tag-amber">{s.reason || "결석 예정"}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {tab === "notice" && (
              <>
                <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>공지 · 전달사항</h2>
                <p className="muted" style={{ margin: "0 0 10px", fontSize: 12.5 }}>
                  <b>{dayLabel(date)}</b> 에 나갈 내용을 미리 써둡니다.
                </p>
                <div className="row" style={{ gap: 4, marginBottom: 8 }}>
                  {[
                    ["deliver", "전달사항 (학생에게)"],
                    ["notice", "공지 (학부모 리포트)"],
                  ].map(([k, label]) => (
                    <button
                      key={k}
                      className={`btn btn-sm ${kind === k ? "btn-primary" : "btn-ghost"}`}
                      onClick={() => setKind(k)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="row" style={{ gap: 4, marginBottom: 8, alignItems: "center" }}>
                  {[
                    ["all", "전체"],
                    ["class", "반별"],
                    ["student", "고른 학생"],
                  ].map(([k, label]) => (
                    <button
                      key={k}
                      className={`btn btn-sm ${scope === k ? "btn-primary" : "btn-ghost"}`}
                      onClick={() => setScope(k)}
                    >
                      {label}
                    </button>
                  ))}
                  {scope === "class" && (
                    <select
                      className="input input-sm"
                      style={{ width: 170 }}
                      value={classId}
                      onChange={(e) => setClassId(e.target.value)}
                    >
                      {groups.map((g) => (
                        <option key={g.klass.id} value={g.klass.id}>{g.klass.name}</option>
                      ))}
                    </select>
                  )}
                  {scope === "student" && <span className="tag tag-sky">{sel.size}명</span>}
                </div>
                <textarea
                  className="input input-sm"
                  rows={3}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={
                    kind === "deliver"
                      ? "예) 다음 주 월요일은 학교 행사로 6시 시작"
                      : "예) 이번 주 단어 시험 범위는 Unit 5~6입니다"
                  }
                />
                <button
                  className="btn btn-primary btn-sm"
                  style={{ marginTop: 8 }}
                  onClick={saveNotice}
                  disabled={pending || !body.trim()}
                >
                  저장
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

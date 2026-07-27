"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  setPlannedAbsenceRange,
  clearPlannedAbsenceRange,
  assignHomeworkAhead,
  unassignHomeworkAhead,
} from "./actions";
import { createNotice, listUnitOptions } from "@/app/today/actions";
import { unitOptionText } from "@/lib/unitTree";
import { addDays, dayLabel as fmtDay, dowOf, todaySeoul } from "@/lib/day";

const REASONS = ["학교 행사", "시험 기간", "병원", "가족 일정", "여행", "기타"];
const CAT_CLS = {
  단어: "tag-amber", 독해: "tag-sky", 문법: "tag-lav",
  노트: "tag-mint", 내신: "tag-muted", 기타: "tag-muted",
};
const DOWN = ["일", "월", "화", "수", "목", "금", "토"];

function todayISO() {
  return todaySeoul();
}

function dayLabel(d) {
  if (!d) return "";
  return fmtDay(d);
}

/**
 * 반·학생을 먼저 고르고, 할 일을 고른 다음 날짜를 정한다.
 * (날짜를 먼저 정하면 그날 수업 있는 반만 보여서 오히려 불편했다)
 */
export default function PlanBoard({
  classes = [],
  students = [],
  items = [],
  textbooks = [],
  planReady = true,
}) {
  const [tab, setTab] = useState("homework");
  const [sel, setSel] = useState(() => new Set());
  const [q, setQ] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const [hwDate, setHwDate] = useState("");
  const [picked, setPicked] = useState(() => new Map());
  const [unitsByBook, setUnitsByBook] = useState({});
  const [loadingBook, setLoadingBook] = useState(null);
  const [cat, setCat] = useState("전체");

  const [reason, setReason] = useState("학교 행사");
  const [absFrom, setAbsFrom] = useState("");
  const [absTo, setAbsTo] = useState("");

  const [kind, setKind] = useState("deliver");
  const [body, setBody] = useState("");
  const [noticeDate, setNoticeDate] = useState("");

  const kw = q.trim().toLowerCase();
  const shown = students.filter(
    (s) =>
      !kw ||
      [s.name, s.school, s.grade].filter(Boolean).some((v) => v.toLowerCase().includes(kw))
  );

  const selStudents = students.filter((s) => sel.has(s.id));
  const selDays = new Set(selStudents.flatMap((s) => s.days || []));

  function nextDates(count = 6) {
    const out = [];
    let d = todayISO();
    for (let i = 0; i < 30 && out.length < count; i++) {
      d = addDays(d, 1);
      const dow = dowOf(d);
      if (selDays.size === 0 || selDays.has(dow)) out.push(d);
    }
    return out;
  }
  const suggested = nextDates();

  function toggleStudent(id) {
    const n = new Set(sel);
    n.has(id) ? n.delete(id) : n.add(id);
    setSel(n);
  }
  function selectClass(cid) {
    const ids = students.filter((s) => (s.classIds || []).includes(cid)).map((s) => s.id);
    const every = ids.length > 0 && ids.every((id) => sel.has(id));
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
    const mine = selStudents.flatMap((s) => s.bookIds || []);
    const hit = textbooks.find((b) => b.area === area && mine.includes(b.id));
    return hit?.id || textbooks.find((b) => b.area === area)?.id || "";
  }

  function toggleItem(id) {
    const m = new Map(picked);
    if (m.has(id)) m.delete(id);
    else {
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

  const cats = ["전체", ...new Set(items.map((i) => i.category).filter(Boolean))];
  const shownItems = cat === "전체" ? items : items.filter((i) => i.category === cat);

  if (!planReady) {
    return (
      <div className="card" style={{ marginTop: 12 }}>
        <div className="notice">
          미리 작성을 쓰려면 Supabase에서 <b>0017 SQL</b>을 먼저 실행해주세요.
        </div>
      </div>
    );
  }

  const datePicker = (value, onChange, label) => (
    <div className="row" style={{ gap: 6, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
      <span className="hint" style={{ minWidth: 34 }}>{label}</span>
      <input
        className="input input-sm"
        type="date"
        style={{ width: 150 }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {suggested.map((d) => (
        <button
          key={d}
          className={`btn btn-sm ${value === d ? "btn-primary" : "btn-ghost"}`}
          style={{ padding: "3px 8px" }}
          onClick={() => onChange(d)}
        >
          {dayLabel(d)}
        </button>
      ))}
      {selDays.size > 0 && <span className="hint">고른 학생 수업일</span>}
    </div>
  );

  return (
    <div className="grid-side" style={{ marginTop: 12 }}>
      {/* 1. 누구에게 */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 16px 0" }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>
            1. 누구에게{" "}
            <span className="muted" style={{ fontWeight: 600, fontSize: 13 }}>{sel.size}명</span>
          </h2>
          <div className="row" style={{ gap: 6, margin: "8px 0", alignItems: "center" }}>
            <input
              className="input input-sm"
              style={{ width: 150 }}
              placeholder="학생 검색"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setSel(new Set(shown.map((s) => s.id)))}
            >
              보이는 학생 전체
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setSel(new Set())}>해제</button>
          </div>
        </div>

        {classes.map((c) => {
          const list = shown.filter((s) => (s.classIds || []).includes(c.id));
          if (list.length === 0) return null;
          return (
            <div key={c.id}>
              <button className="grouphead" onClick={() => selectClass(c.id)}>
                <span style={{ fontWeight: 800 }}>
                  {c.name}{" "}
                  <span className="muted" style={{ fontWeight: 600 }}>
                    {(c.days || []).join("·")} · {list.length}명
                  </span>
                </span>
                <span className="hint">반 전체 선택</span>
              </button>
              <div className="row" style={{ gap: 4, padding: "8px 16px" }}>
                {list.map((s) => (
                  <button
                    key={s.id}
                    className={`hwchip ${sel.has(s.id) ? "hw-next" : ""}`}
                    onClick={() => toggleStudent(s.id)}
                  >
                    {sel.has(s.id) && <b>＋</b>} {s.name}
                  </button>
                ))}
              </div>
            </div>
          );
        })}

        {shown.filter((s) => (s.classIds || []).length === 0).length > 0 && (
          <div>
            <div className="grouphead" style={{ cursor: "default" }}>
              <span style={{ fontWeight: 800 }}>반 미배정</span>
            </div>
            <div className="row" style={{ gap: 4, padding: "8px 16px" }}>
              {shown
                .filter((s) => (s.classIds || []).length === 0)
                .map((s) => (
                  <button
                    key={s.id}
                    className={`hwchip ${sel.has(s.id) ? "hw-next" : ""}`}
                    onClick={() => toggleStudent(s.id)}
                  >
                    {sel.has(s.id) && <b>＋</b>} {s.name}
                  </button>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* 2. 무엇을 */}
      <div className="card">
        <h2 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 800 }}>2. 무엇을</h2>
        <div className="row" style={{ gap: 4, marginBottom: 10 }}>
          {[
            ["homework", "숙제 내기"],
            ["absence", "결석 예정"],
            ["notice", "공지 · 전달사항"],
          ].map(([k, l]) => (
            <button
              key={k}
              className={`btn btn-sm ${tab === k ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setTab(k)}
            >
              {l}
            </button>
          ))}
        </div>

        {sel.size === 0 && (
          <div className="notice" style={{ marginBottom: 10 }}>
            왼쪽에서 <b>반 이름</b>을 누르면 반 전체가, 학생 이름을 누르면 그 학생만 선택됩니다.
          </div>
        )}

        {tab === "homework" && (
          <>
            {datePicker(hwDate, setHwDate, "수업일")}
            <p className="hint" style={{ margin: "0 0 8px" }}>
              고른 날짜의 숙제로 들어가고, 그 <b>다음 수업</b>에 검사 대상이 됩니다.
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

            {picked.size > 0 && (
              <div className="stack" style={{ gap: 6 }}>
                {[...picked.entries()].map(([iid, v]) => {
                  const opts = unitsByBook[v.textbookId] || [];
                  const item = items.find((x) => x.id === iid);
                  return (
                    <div className="unitrow" key={iid}>
                      <span className={`tag ${CAT_CLS[item?.category] || "tag-muted"}`}>
                        {item?.name}
                      </span>
                      <select
                        className="input input-sm"
                        style={{ width: 150 }}
                        value={v.textbookId}
                        onChange={(e) => {
                          patchItem(iid, { textbookId: e.target.value, unitIds: [] });
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
              <button
                className="btn btn-primary btn-sm"
                disabled={pending || sel.size === 0 || picked.size === 0 || !hwDate}
                onClick={() =>
                  run(
                    () =>
                      assignHomeworkAhead(
                        [...sel],
                        hwDate,
                        [...picked.entries()].map(([homeworkItemId, v]) => ({
                          homeworkItemId,
                          unitIds: v.unitIds,
                          note: v.note,
                        }))
                      ),
                    `${sel.size}명에게 ${dayLabel(hwDate)} 숙제를 넣었어요.`
                  )
                }
              >
                {pending ? "저장 중…" : `${sel.size}명에게 숙제 내기`}
              </button>
              {picked.size === 1 && (
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={pending || sel.size === 0 || !hwDate}
                  onClick={() =>
                    run(
                      () => unassignHomeworkAhead([...sel], hwDate, [...picked.keys()][0]),
                      "배정을 취소했어요."
                    )
                  }
                >
                  이 숙제 취소
                </button>
              )}
              {!hwDate && (
                <span className="hint" style={{ alignSelf: "center" }}>수업일을 골라주세요</span>
              )}
            </div>
          </>
        )}

        {tab === "absence" && (
          <>
            <div
              className="row"
              style={{ gap: 6, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}
            >
              <span className="hint" style={{ minWidth: 34 }}>기간</span>
              <input
                className="input input-sm"
                type="date"
                style={{ width: 150 }}
                value={absFrom}
                onChange={(e) => {
                  setAbsFrom(e.target.value);
                  if (!absTo) setAbsTo(e.target.value);
                }}
              />
              <span className="hint">~</span>
              <input
                className="input input-sm"
                type="date"
                style={{ width: 150 }}
                value={absTo}
                onChange={(e) => setAbsTo(e.target.value)}
              />
              <button className="btn btn-ghost btn-sm" onClick={() => setAbsTo(absFrom)}>
                하루만
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setAbsFrom(addDays(todayISO(), 1));
                  setAbsTo(addDays(todayISO(), 7));
                }}
              >
                다음 한 주
              </button>
            </div>
            <p className="hint" style={{ margin: "0 0 10px" }}>
              기간 안에서 그 학생이 <b>실제로 수업 있는 날만</b> 들어갑니다.
              시험 기간·여행처럼 여러 날 빠질 때 한 번에 넣으세요.
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
            <div className="row" style={{ gap: 6 }}>
              <button
                className="btn btn-primary btn-sm"
                disabled={pending || sel.size === 0 || !absFrom}
                onClick={() =>
                  run(
                    () => setPlannedAbsenceRange([...sel], absFrom, absTo || absFrom, reason),
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
                    () => clearPlannedAbsenceRange([...sel], absFrom, absTo || absFrom),
                    "취소했어요."
                  )
                }
              >
                이 기간 취소
              </button>
            </div>
          </>
        )}

        {tab === "notice" && (
          <>
            {datePicker(noticeDate, setNoticeDate, "날짜")}
            <div className="row" style={{ gap: 4, marginBottom: 8 }}>
              {[
                ["deliver", "전달사항 (학생에게)"],
                ["notice", "공지 (학부모 리포트)"],
              ].map(([k, l]) => (
                <button
                  key={k}
                  className={`btn btn-sm ${kind === k ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setKind(k)}
                >
                  {l}
                </button>
              ))}
              <span className="tag tag-sky">고른 학생 {sel.size}명</span>
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
              disabled={pending || !body.trim() || sel.size === 0 || !noticeDate}
              onClick={() =>
                run(async () => {
                  const res = await createNotice({
                    date: noticeDate,
                    kind,
                    scope: "student",
                    studentIds: [...sel],
                    body,
                  });
                  if (!res?.error) setBody("");
                  return res;
                }, "저장했어요. 그날 오늘 수업 화면에 나타납니다.")
              }
            >
              저장
            </button>
          </>
        )}
      </div>
    </div>
  );
}

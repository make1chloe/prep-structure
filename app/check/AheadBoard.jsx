"use client";

import { useState, useTransition } from "react";
import BookPicker from "@/components/BookPicker";
import { useRouter } from "next/navigation";
import { assignHomeworkAhead, unassignHomeworkAhead } from "@/app/plan/actions";
import { createNotice, listUnitOptions } from "@/app/today/actions";
import { unitOptionText } from "@/lib/unitTree";
import { addDays, dayLabel as fmtDay, dowOf, todaySeoul } from "@/lib/day";
import { CAT_CLS } from "@/app/homework/categories";
import { NOTICE_KINDS } from "@/lib/notices";

/** 미리 적는 자리라 「지금 울리는」 갈래는 없다 — 예도 그에 맞춘다 */
const AHEAD_PLACEHOLDER = {
  homework: "학생에게 (숙제 안내에 실림) — 예) 다음 주 월요일은 학교 행사로 6시 시작",
  notice: "학부모님께 (리포트에 실림) — 예) 이번 주 단어 시험 범위는 Unit 5~6입니다",
  memo: "교실에서 말할 것 — 예) 지난주 결석분 보강 언제 할지 물어보기",
};

const dayLabel = (d) => (d ? fmtDay(d) : "");

/**
 * **미리 내기** — 다음 수업 숙제와 공지.
 *
 * 원장님 (2026-08-07) — 「수업준비페이지가 필요없나 싶어」
 *
 * 원래 「수업 준비」 라는 따로 있는 화면이었다. 그런데 실제로 하는 순서는
 * **검사를 하면서 다음 숙제를 정하는 것**이다 — 이 아이가 단어를 반만
 * 해왔으니 다음에 다시, 하는 식이다. 두 화면으로 갈라져 있으면 매번 두 번
 * 열어야 하고, 검사 화면을 닫고 나면 방금 본 것을 기억으로 옮겨 적게 된다.
 *
 * 접어둔다. 검사가 이 화면의 본일이고, 이건 그 끝에 붙는 일이다.
 */
export default function AheadBoard({
  classes = [],
  students = [],
  items = [],
  textbooks = [],
}) {
  const [open, setOpen] = useState(false);
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

  const [kind, setKind] = useState("homework");
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
    let d = todaySeoul();
    for (let i = 0; i < 30 && out.length < count; i++) {
      d = addDays(d, 1);
      if (selDays.size === 0 || selDays.has(dowOf(d))) out.push(d);
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
      if (res?.error) { alert(res.error); return; }
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
          className={`btn btn-sm ${value === d ? "btn-on" : "btn-ghost"}`}
          style={{ padding: "3px 8px" }}
          onClick={() => onChange(d)}
        >
          {dayLabel(d)}
        </button>
      ))}
      {selDays.size > 0 && <span className="hint">고른 학생 수업일</span>}
    </div>
  );

  if (!open) {
    return (
      <button
        className="btn btn-ghost btn-sm"
        style={{ marginTop: 12 }}
        onClick={() => setOpen(true)}
      >
        다음 수업 숙제 · 전달사항 미리 넣기
      </button>
    );
  }

  return (
    <div className="grid-side" style={{ marginTop: 12 }}>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 16px 0" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>
            누구{" "}
            <span className="muted" style={{ fontWeight: 600, fontSize: 14.5 }}>{sel.size}명</span>
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

      <div className="card">
        <div className="row" style={{ gap: 4, marginBottom: 10 }}>
          {[
            ["homework", "숙제 내기"],
            ["notice", "공지 · 메모"],
          ].map(([k, l]) => (
            <button
              key={k}
              className={`btn btn-sm ${tab === k ? "btn-on" : "btn-ghost"}`}
              onClick={() => setTab(k)}
            >
              {l}
            </button>
          ))}
          <span className="spacer" />
          <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>접기</button>
        </div>

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
                  className={`btn btn-sm ${cat === c ? "btn-on" : "btn-ghost"}`}
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
                      {/* 교재 고르기 한 벌 (C3) — 오늘 수업과 같은 BookPicker */}
                      <BookPicker
                        books={textbooks}
                        mine={selStudents.flatMap((s2) => (s2.bookIds || []).map((id) => ({ id })))}
                        value={v.textbookId}
                        width={150}
                        placeholder="교재 선택"
                        onChange={(bid) => {
                          patchItem(iid, { textbookId: bid, unitIds: [] });
                          loadBook(bid);
                        }}
                      />
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
                            {" ".repeat(o.depth * 3)}
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

        {tab === "notice" && (
          <>
            {datePicker(noticeDate, setNoticeDate, "날짜")}
            <div className="row" style={{ gap: 4, marginBottom: 8 }}>
              {/**
                * **여기는 미리 적어두는 자리라 「알림」 갈래가 없다**
                * (2026-08-07). 다음 주 수업 것을 적는데 지금 폰이 울리면
                * 아무도 무슨 소린지 모른다. 지금 울려야 하는 것은
                * 오늘 수업 화면에서 보내신다.
                */}
              {NOTICE_KINDS.filter((k) => !k.push).map((k) => [k.key, k.label]).map(([k, l]) => (
                <button
                  key={k}
                  className={`btn btn-sm ${kind === k ? "btn-on" : "btn-ghost"}`}
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
              placeholder={AHEAD_PLACEHOLDER[kind] || ""}
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

        {sel.size === 0 && (
          <div className="notice" style={{ marginTop: 10 }}>
            왼쪽에서 <b>반 이름</b>을 누르면 반 전체가, 학생 이름을 누르면 그 학생만 선택됩니다.
          </div>
        )}
      </div>
    </div>
  );
}

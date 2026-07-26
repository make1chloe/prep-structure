"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveStudentDay, listUnitOptions, setDelivered } from "./actions";
import { unitOptionText } from "@/lib/unitTree";
import BookProgress from "./BookProgress";
import StudentBooks from "./StudentBooks";

const ATT = [
  { key: "present", label: "정시" },
  { key: "late", label: "지각" },
  { key: "absent", label: "결석" },
  { key: "makeup", label: "보강" },
  { key: "early_leave", label: "조퇴" },
  { key: "online", label: "온라인" },
];

const ATTITUDE = [
  { key: "Excellent", label: "⭐⭐⭐⭐⭐" },
  { key: "Good", label: "⭐⭐⭐⭐" },
  { key: "Satisfactory", label: "⭐⭐⭐" },
  { key: "Needs improvement", label: "⭐⭐" },
  { key: "Area of Concern", label: "🚩" },
];

// 클릭할 때마다 순환: 없음 → 완료 → 미흡 → 미제출 → 없음
const CAT_CLS = {
  단어: "tag-amber", 독해: "tag-sky", 문법: "tag-lav",
  노트: "tag-mint", 내신: "tag-muted", 기타: "tag-muted",
};

const CYCLE = { "": "done", done: "weak", weak: "missing", missing: "" };
const MARK = { done: "○", weak: "△", missing: "✕" };
const MARK_CLS = { done: "hw-done", weak: "hw-weak", missing: "hw-missing" };

export default function StudentPanel({
  row,
  date,
  items = [],
  textbooks = [],
  classTextbookIds = [],
  unitNames = {},
  onSaved,
}) {
  const r = row.report || {};
  const [form, setForm] = useState({
    attendance: row.status || "present",
    attitude: r.attitude || "",
    word_correct: r.word_correct ?? "",
    word_total: r.word_total ?? "",
    sent_correct: r.sent_correct ?? "",
    sent_total: r.sent_total ?? "",
    own_progress: r.own_progress || "",
    notice: r.notice || "",
  });
  const [marks, setMarks] = useState(() => ({ ...(row.items || {}) }));
  const [next, setNext] = useState(() => new Set(row.nextHomework || []));
  // 배정한 숙제에 붙는 교재 단원 { [itemId]: { textbookId, unitIds: [], note } }
  //   textbookId 는 "지금 단원을 고를 교재"일 뿐, 고른 단원은 교재가 달라도 함께 쌓인다
  const defaultBook = classTextbookIds[0] || (textbooks.length === 1 ? textbooks[0].id : "");

  // 숙제 분류와 교재 영역이 같으면 그 교재를 자동으로 고른다
  //   독해 숙제 → 이 학생의 독해 교재 (예: 수능딥독3)
  const AREA_OF = { 단어: "단어", 독해: "독해", 문법: "문법", 내신: "내신", 듣기: "듣기", 영작: "영작" };
  const myBooks = row.books || [];
  function bookFor(itemId) {
    const item = items.find((i) => i.id === itemId);
    const area = AREA_OF[item?.category] || "";
    if (area) {
      // 이 학생에게 배정된 교재 중 같은 영역 우선
      const mine = myBooks.find((b) => b.area === area);
      if (mine) return mine.id;
      const any = textbooks.find((b) => b.area === area);
      if (any) return any.id;
    }
    return myBooks[0]?.id || defaultBook;
  }
  const [nextUnits, setNextUnits] = useState(() => {
    const seed = {};
    Object.entries(row.nextUnits || {}).forEach(([iid, v]) => {
      const ids = v.unitIds && v.unitIds.length ? v.unitIds : v.unitId ? [v.unitId] : [];
      seed[iid] = {
        textbookId: (ids[0] && unitNames[ids[0]]?.textbookId) || "",
        unitIds: ids,
        note: v.note || "",
      };
    });
    return seed;
  });
  const [unitsByBook, setUnitsByBook] = useState({});   // textbookId → options
  const [loadingBook, setLoadingBook] = useState(null);

  const [cat, setCat] = useState("전체");
  const [methodOf, setMethodOf] = useState(null);
  // 검사 화면은 기본적으로 "검사해야 하는 것"만 보여준다
  const [showAllItems, setShowAllItems] = useState(false);
  const [delivered, setDeliveredMap] = useState(() =>
    Object.fromEntries((row.notices || []).map((n) => [n.id, n.delivered]))
  );
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const toCheck = row.toCheck || [];          // 지난 수업에 배정한 숙제 = 오늘 검사 대상
  const toCheckSet = new Set(toCheck);
  const unchecked = toCheck.filter((id) => !marks[id]);
  const nameOf = (id) => items.find((i) => i.id === id)?.name || "";
  // 지난 수업에 낸 숙제의 교재 단원 (무엇을 검사해야 하는지 그대로 보여준다)
  const checkUnitList = Object.entries(row.checkUnits || {}).filter(
    ([, u]) => u.unitId || u.note
  );

  const cats = ["전체", "자주", ...new Set(items.map((i) => i.category).filter(Boolean))];
  const COMMON = ["단어(교재)", "단어(온라인)", "독해", "워크북", "문법", "영작", "듣기", "오답노트"];
  const shown =
    cat === "전체"
      ? items
      : cat === "자주"
      ? items.filter((i) => COMMON.includes(i.name) || marks[i.id] || toCheckSet.has(i.id) || next.has(i.id))
      : items.filter((i) => i.category === cat);

  // 분류별로 묶어 줄을 나눈다
  function grouped(list) {
    const m = new Map();
    list.forEach((i) => {
      const k = i.category || "기타";
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(i);
    });
    return [...m.entries()];
  }

  // 교재 단원 목록은 고를 때 한 번만 불러와 캐시한다
  async function loadBook(bookId) {
    if (!bookId || unitsByBook[bookId]) return;
    setLoadingBook(bookId);
    const res = await listUnitOptions(bookId);
    setUnitsByBook((m) => ({ ...m, [bookId]: res.options || [] }));
    setLoadingBook(null);
  }
  // 이미 저장된 배정이 가리키는 교재는 열자마자 단원을 불러온다
  useEffect(() => {
    const ids = new Set(
      Object.values(nextUnits).flatMap((v) => [
        v.textbookId,
        ...(v.unitIds || []).map((uid) => unitNames[uid]?.textbookId),
      ]).filter(Boolean)
    );
    // 검사 대상 숙제가 가리키는 교재도 함께
    Object.values(row.checkUnits || {}).forEach((u) =>
      (u.unitIds || []).forEach((uid) => {
        const b = unitNames[uid]?.textbookId;
        if (b) ids.add(b);
      })
    );
    if (defaultBook) ids.add(defaultBook);
    ids.forEach((id) => loadBook(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setUnitField(itemId, patch) {
    setNextUnits((m) => ({
      ...m,
      [itemId]: { textbookId: defaultBook, unitIds: [], note: "", ...(m[itemId] || {}), ...patch },
    }));
  }
  function addUnit(itemId, unitId) {
    if (!unitId) return;
    const cur = nextUnits[itemId]?.unitIds || [];
    if (cur.includes(unitId)) return;
    setUnitField(itemId, { unitIds: [...cur, unitId] });
  }
  function removeUnit(itemId, unitId) {
    const cur = nextUnits[itemId]?.unitIds || [];
    setUnitField(itemId, { unitIds: cur.filter((x) => x !== unitId) });
  }
  const bookName = (id) => textbooks.find((t) => t.id === id)?.name || "";

  // 단원 한 개의 표시 정보 — 불러온 교재 목록에서 먼저, 없으면 서버가 준 이름으로
  function unitMeta(unitId) {
    for (const opts of Object.values(unitsByBook)) {
      const hit = opts.find((o) => o.id === unitId);
      if (hit) return hit;
    }
    const n = unitNames[unitId];
    return n
      ? {
          id: unitId, big: n.path, mid: "", small: "",
          activity: n.activity || "", pages: "", amount: n.amount || "",
        }
      : null;
  }
  function unitText(unitId) {
    const m = unitMeta(unitId);
    if (!m) return "단원";
    const path = [m.big, m.mid, m.small].filter(Boolean).join(" › ");
    const tail = [m.activity, m.pages, m.amount && `분량 ${m.amount}`].filter(Boolean).join(" · ");
    return tail ? `${path} — ${tail}` : path;
  }

  function cycle(id) {
    setMarks((m) => ({ ...m, [id]: CYCLE[m[id] || ""] }));
  }
  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function save() {
    startTransition(async () => {
      const res = await saveStudentDay(row.student.id, date, {
        ...form,
        items: marks,
        toCheck,
        nextHomework: [...next],
        nextUnits: Object.fromEntries(
          [...next].map((iid) => [
            iid,
            {
              unitIds: nextUnits[iid]?.unitIds || [],
              note: nextUnits[iid]?.note || "",
            },
          ])
        ),
      });
      if (res?.error) {
        alert(res.error);
        return;
      }
      const notYet = (row.notices || []).filter(
        (n) => n.kind === "deliver" && !delivered[n.id]
      );
      if (notYet.length > 0) {
        alert(`아직 전달하지 않은 사항이 ${notYet.length}건 있어요.\n하원 전에 꼭 전달해주세요.`);
      }
      if (res && res.complete === false) {
        alert(`저장했지만 아직 완료가 아니에요.\n지난 수업 숙제 ${res.unchecked}개가 검사되지 않았습니다.`);
      }
      onSaved?.();
      router.refresh();
    });
  }

  return (
    <div className="stuPanel">
      {/* 출결 */}
      <div className="prow">
        <span className="plabel">출결</span>
        <div className="row" style={{ gap: 4 }}>
          {ATT.map((a) => (
            <button
              key={a.key}
              className={`btn btn-sm ${form.attendance === a.key ? "btn-primary" : "btn-ghost"}`}
              onClick={() => set("attendance", a.key)}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* 테스트 점수 */}
      <div className="prow">
        <span className="plabel">테스트</span>
        <div className="row" style={{ gap: 10, alignItems: "center" }}>
          <span className="hint">단어</span>
          <input
            className="input input-sm" style={{ width: 44, textAlign: "center" }}
            inputMode="numeric" value={form.word_correct}
            onChange={(e) => set("word_correct", e.target.value)}
          />
          <span className="muted">/</span>
          <input
            className="input input-sm" style={{ width: 44, textAlign: "center" }}
            inputMode="numeric" value={form.word_total}
            onChange={(e) => set("word_total", e.target.value)}
          />
          <span className="hint" style={{ marginLeft: 8 }}>문장</span>
          <input
            className="input input-sm" style={{ width: 44, textAlign: "center" }}
            inputMode="numeric" value={form.sent_correct}
            onChange={(e) => set("sent_correct", e.target.value)}
          />
          <span className="muted">/</span>
          <input
            className="input input-sm" style={{ width: 44, textAlign: "center" }}
            inputMode="numeric" value={form.sent_total}
            onChange={(e) => set("sent_total", e.target.value)}
          />
        </div>
      </div>

      {/* 숙제 */}
      <div className="prow" style={{ alignItems: "flex-start" }}>
        <span className="plabel" style={{ paddingTop: 5 }}>숙제</span>
        <div style={{ flex: 1 }}>
          {toCheck.length > 0 && (
            <>
              <p className="hint" style={{ margin: "0 0 6px" }}>
                {row.assignedFrom
                  ? `${row.assignedFrom.slice(5).replace("-", "/")} 수업에 낸 숙제 `
                  : "지난 수업에 낸 숙제 "}
                {toCheck.length}개
                {unchecked.length > 0 ? (
                  <b style={{ color: "var(--amber)" }}> · 미검사 {unchecked.length}개</b>
                ) : (
                  <b style={{ color: "var(--mint)" }}> · 모두 검사함</b>
                )}
              </p>
              {/* 배정할 때 적어둔 단원과 분량 — 무엇을 검사할지 여기서 바로 본다 */}
              <div className="stack" style={{ gap: 4, marginBottom: 8 }}>
                {toCheck.map((iid) => {
                  const u = row.checkUnits?.[iid] || {};
                  const uids = u.unitIds && u.unitIds.length ? u.unitIds : u.unitId ? [u.unitId] : [];
                  const st = marks[iid] || "";
                  const item = items.find((x) => x.id === iid);
                  return (
                    <div className="unitrow" key={iid}>
                      <button
                        className={`hwchip ${st ? MARK_CLS[st] : ""}`}
                        onClick={() => cycle(iid)}
                        style={!st ? { borderColor: "var(--amber)", borderWidth: 2 } : undefined}
                        title="클릭: 완료 → 미흡 → 미제출 → 없음"
                      >
                        {st ? <b>{MARK[st]}</b> : <b>·</b>} {nameOf(iid) || "숙제"}
                      </button>
                      {item?.method && (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => setMethodOf(methodOf === iid ? null : iid)}
                          title="학습 방법 보기"
                        >
                          방법
                        </button>
                      )}
                      {uids.length === 0 && !u.note ? (
                        <span className="hint">단원 지정 없음</span>
                      ) : (
                        <span className="unitmeta">
                          {uids.map((uid) => {
                            const m = unitMeta(uid);
                            return (
                              <span className="tag tag-sky" key={uid}>
                                {m ? [m.big, m.mid, m.small].filter(Boolean).join(" › ") : "단원"}
                                {m?.activity ? ` · ${m.activity}` : ""}
                                {m?.amount ? ` · ${m.amount}` : m?.pages ? ` · ${m.pages}` : ""}
                              </span>
                            );
                          })}
                          {u.note && <span className="tag tag-muted">{u.note}</span>}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              {methodOf && (
                <div className="notice" style={{ marginBottom: 8, whiteSpace: "pre-wrap" }}>
                  <b>{nameOf(methodOf)} 학습 방법</b>
                  {"\n"}
                  {items.find((x) => x.id === methodOf)?.method}
                </div>
              )}
            </>
          )}
          {!showAllItems ? (
            <button
              className="btn btn-ghost btn-sm"
              style={{ marginBottom: 6 }}
              onClick={() => setShowAllItems(true)}
            >
              ＋ 다른 항목도 검사하기
            </button>
          ) : (
          <div className="row" style={{ gap: 3, marginBottom: 6 }}>
            <button
              className="btn btn-ghost btn-sm"
              style={{ padding: "3px 8px" }}
              onClick={() => setShowAllItems(false)}
            >
              접기
            </button>
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
          )}
          {showAllItems && (
            <div className="stack" style={{ gap: 6 }}>
              {grouped(shown.filter((i) => !toCheckSet.has(i.id))).map(([g, list]) => (
                <div className="hwgroup" key={g}>
                  <span className={`tag ${CAT_CLS[g] || "tag-muted"} hwcat`}>{g}</span>
                  <div className="row" style={{ gap: 4 }}>
                    {list.map((i) => {
                      const st = marks[i.id] || "";
                      return (
                        <button
                          key={i.id}
                          className={`hwchip ${st ? MARK_CLS[st] : ""}`}
                          onClick={() => cycle(i.id)}
                          title="클릭: 완료 → 미흡 → 미제출 → 없음"
                        >
                          {st && <b>{MARK[st]}</b>} {i.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
          {toCheck.length === 0 && !showAllItems && (
            <span className="hint">지난 수업에 낸 숙제가 없어요.</span>
          )}
        </div>
      </div>

      {/* 사용중인 교재 · 단원 진도 (순서 무관 체크) */}
      <div className="prow" style={{ alignItems: "flex-start" }}>
        <span className="plabel" style={{ paddingTop: 3 }}>진도</span>
        <div className="row" style={{ gap: 6, flex: 1 }}>
          {myBooks.map((b) => (
            <BookProgress key={b.id} studentId={row.student.id} book={b} />
          ))}
          {myBooks.length === 0 && (
            <span className="hint" style={{ alignSelf: "center" }}>
              배정된 교재가 없어요.
            </span>
          )}
          <StudentBooks
            studentId={row.student.id}
            myBooks={myBooks}
            textbooks={textbooks}
          />
        </div>
      </div>

      {/* 다음 숙제 배정 */}
      <div className="prow" style={{ alignItems: "flex-start" }}>
        <span className="plabel" style={{ paddingTop: 5 }}>다음</span>
        <div style={{ flex: 1 }}>
          <p className="hint" style={{ margin: "0 0 6px" }}>
            다음 수업에 검사할 숙제를 골라두면, 그때 이 항목들이 검사 대상이 돼요.
            {next.size > 0 && <b> · {next.size}개 배정</b>}
          </p>
          <div className="stack" style={{ gap: 6 }}>
            {grouped(shown).map(([g, list]) => (
              <div className="hwgroup" key={g}>
                <span className={`tag ${CAT_CLS[g] || "tag-muted"} hwcat`}>{g}</span>
                <div className="row" style={{ gap: 4 }}>
                  {list.map((i) => (
                    <button
                      key={i.id}
                      className={`hwchip ${next.has(i.id) ? "hw-next" : ""}`}
                      onClick={() => {
                        const n = new Set(next);
                        if (n.has(i.id)) {
                          n.delete(i.id);
                        } else {
                          n.add(i.id);
                          const b = bookFor(i.id);
                          setUnitField(i.id, { textbookId: b });
                          loadBook(b);
                        }
                        setNext(n);
                      }}
                    >
                      {next.has(i.id) && <b>＋</b>} {i.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* 배정한 숙제별 교재 단원 — 교재DB의 단원명과 연동, 여러 단원 가능 */}
          {next.size > 0 && (
            <div className="stack" style={{ gap: 6, marginTop: 8 }}>
              {[...next].map((iid) => {
                const u = nextUnits[iid] || { textbookId: defaultBook, unitIds: [], note: "" };
                const bookId = u.textbookId ?? defaultBook;
                const opts = unitsByBook[bookId] || [];
                const chosen = u.unitIds || [];
                return (
                  <div className="unitrow" key={iid}>
                    <span className="tag tag-lav" style={{ fontWeight: 800 }}>
                      {nameOf(iid) || "숙제"}
                    </span>
                    <select
                      className="input input-sm"
                      style={{ width: 150 }}
                      value={bookId}
                      onChange={(e) => {
                        const v = e.target.value;
                        setUnitField(iid, { textbookId: v });
                        loadBook(v);
                      }}
                      title="여기서 교재를 바꿔 다른 교재 단원도 이어서 추가할 수 있어요"
                    >
                      <option value="">교재 선택</option>
                      {myBooks.length > 0 && (
                        <optgroup label="이 학생 교재">
                          {myBooks.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.area ? `[${t.area}] ` : ""}{t.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      <optgroup label="전체 교재">
                        {textbooks.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.area ? `[${t.area}] ` : ""}{t.name}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                    <select
                      className="input input-sm"
                      style={{ flex: 1, minWidth: 200 }}
                      value=""
                      onChange={(e) => { addUnit(iid, e.target.value); e.target.value = ""; }}
                      disabled={!bookId}
                    >
                      <option value="">
                        {!bookId
                          ? "교재를 먼저 고르세요"
                          : loadingBook === bookId
                          ? "단원 불러오는 중…"
                          : opts.length === 0
                          ? "이 교재에 등록된 단원이 없어요"
                          : "단원 추가…"}
                      </option>
                      {opts.map((o) => (
                        <option key={o.id} value={o.id} disabled={chosen.includes(o.id)}>
                          {"\u00a0".repeat(o.depth * 3)}
                          {unitOptionText(o)}
                        </option>
                      ))}
                    </select>
                    <input
                      className="input input-sm"
                      style={{ width: 120 }}
                      placeholder="범위 메모"
                      value={u.note || ""}
                      onChange={(e) => setUnitField(iid, { note: e.target.value })}
                    />
                    {chosen.length > 0 && (
                      <span className="unitmeta" style={{ flexBasis: "100%" }}>
                        {chosen.map((uid) => {
                          const m = unitMeta(uid);
                          return (
                            <button
                              key={uid}
                              className="hwchip hw-next"
                              onClick={() => removeUnit(iid, uid)}
                              title="클릭하면 뺍니다"
                            >
                              {m ? [m.big, m.mid, m.small].filter(Boolean).join(" › ") : "단원"}
                              {m?.activity ? ` · ${m.activity}` : ""}
                              {m?.pages ? ` · ${m.pages}` : ""}
                              {m?.amount ? ` · 분량 ${m.amount}` : ""} ✕
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
        </div>
      </div>

      {/* 전달사항 — 하원 전에 전달했는지 확인 */}
      {(row.notices || []).filter((n) => n.kind === "deliver").length > 0 && (
        <div className="prow" style={{ alignItems: "flex-start" }}>
          <span className="plabel" style={{ paddingTop: 5 }}>전달</span>
          <div className="stack" style={{ gap: 4, flex: 1 }}>
            {(row.notices || [])
              .filter((n) => n.kind === "deliver")
              .map((n) => (
                <label
                  className="unitrow"
                  key={n.id}
                  style={{ cursor: "pointer", gap: 8 }}
                >
                  <input
                    type="checkbox"
                    checked={!!delivered[n.id]}
                    onChange={(e) => {
                      const v = e.target.checked;
                      setDeliveredMap((m) => ({ ...m, [n.id]: v }));
                      startTransition(async () => {
                        const res = await setDelivered(n.id, row.student.id, v);
                        if (res?.error) alert(res.error);
                      });
                    }}
                  />
                  <span style={{ fontSize: 13, flex: 1 }}>{n.body}</span>
                  <span className={`tag ${delivered[n.id] ? "tag-mint" : "tag-amber"}`}>
                    {delivered[n.id] ? "전달함" : "전달 전"}
                  </span>
                </label>
              ))}
          </div>
        </div>
      )}

      {/* 전체 공지 (읽기용) */}
      {(row.notices || []).filter((n) => n.kind === "notice").length > 0 && (
        <div className="prow" style={{ alignItems: "flex-start" }}>
          <span className="plabel" style={{ paddingTop: 3 }}>공지</span>
          <div className="stack" style={{ gap: 2, flex: 1 }}>
            {(row.notices || [])
              .filter((n) => n.kind === "notice")
              .map((n) => (
                <span className="hint" key={n.id}>· {n.body}</span>
              ))}
          </div>
        </div>
      )}

      {/* 진도 · 태도 */}
      <div className="prow">
        <span className="plabel">메모</span>
        <input
          className="input input-sm" style={{ flex: 1, minWidth: 160 }}
          placeholder={row.lastProgress ? `지난 수업: ${row.lastProgress}` : "진도 메모 (예: Unit 3 뒷부분만)"}
          value={form.own_progress}
          onChange={(e) => set("own_progress", e.target.value)}
        />
        {row.lastProgress && !form.own_progress && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => set("own_progress", row.lastProgress)}
          >
            지난 진도 가져오기
          </button>
        )}
      </div>

      <div className="prow">
        <span className="plabel">태도</span>
        <div className="row" style={{ gap: 4 }}>
          {ATTITUDE.map((a) => (
            <button
              key={a.key}
              className={`btn btn-sm ${form.attitude === a.key ? "btn-primary" : "btn-ghost"}`}
              onClick={() => set("attitude", form.attitude === a.key ? "" : a.key)}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      <div className="prow">
        <span className="plabel">공지</span>
        <input
          className="input input-sm" style={{ flex: 1, minWidth: 160 }}
          placeholder="이 학생 학부모에게만 전할 말 (선택)"
          value={form.notice}
          onChange={(e) => set("notice", e.target.value)}
        />
      </div>

      <div className="row" style={{ justifyContent: "flex-end", marginTop: 8 }}>
        <button className="btn btn-primary btn-sm" onClick={save} disabled={pending}>
          {pending ? "저장 중…" : unchecked.length > 0 ? `저장 (숙제 ${unchecked.length}개 미검사)` : "저장하고 완료"}
        </button>
      </div>
    </div>
  );
}

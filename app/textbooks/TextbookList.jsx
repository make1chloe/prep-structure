"use client";

import { useState, useEffect, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateTextbook,
  deleteTextbooks,
  updateTextbooksArea,
  updateTextbooksStatus,
} from "./actions";
import { sortBooks, BOOK_SORTS, DEFAULT_SORT } from "@/lib/bookSort";
import { AREA_ORDER as AREAS } from "@/lib/bookSort";
import { missingIn, hasMissing, countMissing } from "@/lib/listMissing";
import MissingPicker from "@/components/MissingPicker";

/**
 * **빠진 것** — 이 교재가 제구실을 하려면 있어야 하는 칸.
 *
 * 영역이 없으면 목록에서 어디에도 안 묶이고, 교재비가 없으면 교재 안내
 * 문자에 값이 안 나간다. 단어범위는 **단어 교재만** 필요하다 —
 * 문법책에 단어범위를 채우라고 하면 그 재촉은 늘 켜져 있는 재촉이 된다.
 */
const NEED = [
  { key: "area", label: "영역" },
  { key: "target_grade", label: "레벨" },
  { key: "price", label: "교재비" },
  { key: "word_range", label: "단어범위", when: (t) => t.area === "단어" },
];

const TB_STATUS = {
  active: { label: "사용중", cls: "tag tag-mint" },
  discontinued: { label: "절판", cls: "tag tag-muted" },
  paused: { label: "중단", cls: "tag tag-amber" },
};

const COLS = [
  { key: "name", label: "교재명", w: 220, strong: true },
  { key: "area", label: "영역", w: 74, type: "area" },
  { key: "target_grade", label: "레벨", w: 92 },
  { key: "students", label: "학생", w: 62, type: "students", readOnly: true },
  { key: "total_pages", label: "페이지", w: 62 },
  { key: "price", label: "교재비", w: 78 },
  { key: "word_range", label: "단어범위", w: 78 },
  { key: "status", label: "상태", w: 76, type: "status" },
  { key: "purchase_url", label: "구매링크", w: 120, type: "url" },
  { key: "feature", label: "비고", w: 140 },
];

// 한 판에서 고치는 것 — 표는 **훑어보는 곳**, 판은 **고치는 곳** (재원생과 같다).
// 「학생」 은 표에서 세어 보여줄 뿐 여기서 고치지 않는다 (학생 탭에서 고친다).
const ALL_FIELDS = COLS.filter((c) => !c.readOnly);

// 표에 늘어놓을 열 — 전부 켜면 가로가 넘친다. 매일 보는 것만 켜둔다.
const DEFAULT_ON = ["name", "area", "target_grade", "students", "status"];
const COL_KEY = "chloe.textbooks.cols";

const TABS = [
  ["units", "단원"],
  ["routine", "루틴"],
  ["students", "학생"],
  ["progress", "진도"],
  ["info", "정보"],
];

export default function TextbookList({
  textbooks = [],
  unitCount = {},
  selectedId,
  students = [],
  byBook = {},
  unitsPanel = null,
  routinePanel = null,
  studentsPanel = null,
  progressPanel = null,
  missKeys = null,
}) {
  // 「빠진 것」 은 원장님이 고른 칸만 센다 (11-11). 안 정했으면 후보 전부.
  const need = missKeys === null ? NEED : NEED.filter((d) => missKeys.includes(d.key));
  const [sel, setSel] = useState(() => new Set());
  const [draft, setDraft] = useState({});
  const [q, setQ] = useState("");
  const [areaFilter, setAreaFilter] = useState("");
  // **누가 쓰는 교재인가로 걸러 보기** — 「이 아이 교재만 한 번 훑기」 는
  // 실제로 자주 하는 일이다 (상담 전, 교재 안내를 보낼 때). 검색으로는
  // 아이 이름이 교재에 안 적혀 있으니 아예 찾을 수가 없었다.
  const [studentFilter, setStudentFilter] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [noUnitsOnly, setNoUnitsOnly] = useState(false);
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [on, setOn] = useState(() => new Set(DEFAULT_ON));
  const [colBox, setColBox] = useState(false);
  // 좁은 화면에서는 판이 위로 올라온다. 목록을 보려면 접을 수 있어야 한다.
  const [folded, setFolded] = useState(false);
  const [tab, setTab] = useState("units");
  /**
   * **차례 (원장님, 2026-08-06 — 「교재정렬이 기준이 없어」).**
   *
   * 지금까지는 넣은 순서의 거꾸로였다. 기계에는 기준이지만 사람에게는 아무
   * 기준이 아니다 — 문법책과 단어책이 뒤섞이고 같은 시리즈가 흩어진다.
   * 기본을 **영역 › 이름**으로 둔다. 교재를 찾을 때 먼저 떠오르는 것이 영역이다.
   *
   * **고르신 차례는 기억한다.** 매번 다시 고르게 하면 안 쓰신다.
   */
  const [sort, setSort] = useState(DEFAULT_SORT);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("tbSort") || "null");
      if (saved?.key) setSort(saved);
    } catch {}
    try {
      const saved = JSON.parse(localStorage.getItem(COL_KEY) || "null");
      if (Array.isArray(saved) && saved.length) setOn(new Set(saved));
    } catch { /* 저장된 게 깨졌으면 기본값 그대로 */ }
  }, []);
  function pickSort(next) {
    setSort(next);
    try { localStorage.setItem("tbSort", JSON.stringify(next)); } catch {}
  }
  /** 열 이름을 누르면 그 기준으로 · 같은 것을 또 누르면 뒤집는다 */
  function clickCol(key) {
    pickSort(sort.key === key ? { key, dir: sort.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });
  }
  function toggleCol(k) {
    const n = new Set(on);
    n.has(k) ? n.delete(k) : n.add(k);
    if (n.size === 0) return;          // 전부 끄면 표가 사라진다
    setOn(n);
    try { localStorage.setItem(COL_KEY, JSON.stringify([...n])); } catch { /* 사파리 비공개 */ }
  }
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const cols = COLS.filter((c) => on.has(c.key));
  const selected = textbooks.find((t) => t.id === selectedId) || null;
  const nameById = useMemo(
    () => new Map(students.map((s) => [s.id, s.name])),
    [students]
  );

  // 열린 교재가 바뀌면 고치던 값도 그 교재 것으로 갈아끼운다.
  // (안 하면 A 를 열어 고치다 B 로 옮겼을 때 A 의 값이 B 에 저장된다)
  useEffect(() => {
    if (!selected) return;
    const d = {};
    ALL_FIELDS.forEach(({ key }) => (d[key] = selected[key] ?? ""));
    d.status = selected.status || "active";
    setDraft(d);
  }, [selectedId]);   // eslint-disable-line react-hooks/exhaustive-deps

  /** 교재를 고르면 주소가 바뀐다 — 단원은 서버가 그 교재 것으로 다시 읽어온다 */
  function open(t) {
    setFolded(false);   // 접어둔 채로 다른 교재를 누르면 아무 일도 안 난 것처럼 보인다
    router.push(`/textbooks?tb=${t.id}`, { scroll: false });
  }

  const norm = (v) => (v || "").toString().toLowerCase();
  const kw = norm(q).trim();
  const shown = useMemo(() => {
    const kept = textbooks.filter((t) => {
      const st = t.status || "active";
      if (!showHidden && st !== "active") return false;
      if (areaFilter && t.area !== areaFilter) return false;
      if (studentFilter && !(byBook[t.id] || []).includes(studentFilter)) return false;
      if (noUnitsOnly && (unitCount[t.id] || 0) > 0) return false;
      if (onlyMissing && !hasMissing(t, need)) return false;
      if (!kw) return true;
      return [t.name, t.area, t.target_grade, t.feature].some((v) => norm(v).includes(kw));
    });
    return sortBooks(kept, sort, unitCount);
  }, [textbooks, showHidden, areaFilter, studentFilter, byBook, noUnitsOnly, onlyMissing, kw, sort, unitCount]);
  const hiddenCount = textbooks.filter((t) => (t.status || "active") !== "active").length;
  const noUnitCount = textbooks.filter(
    (t) => (t.status || "active") === "active" && !(unitCount[t.id] || 0)
  ).length;

  const allChecked = shown.length > 0 && sel.size === shown.length;
  const someChecked = sel.size > 0 && !allChecked;

  function toggleAll() {
    setSel(allChecked ? new Set() : new Set(shown.map((t) => t.id)));
  }
  function toggleOne(id) {
    const next = new Set(sel);
    next.has(id) ? next.delete(id) : next.add(id);
    setSel(next);
  }

  function saveEdit() {
    const id = selectedId;
    startTransition(async () => {
      const res = await updateTextbook(id, draft);
      if (res?.error) alert(res.error);
      router.refresh();
    });
  }

  function run(fn, clear = true) {
    startTransition(async () => {
      const res = await fn();
      if (res?.error) alert(res.error);
      if (clear) setSel(new Set());
      router.refresh();
    });
  }

  function runDelete() {
    if (sel.size === 0) return;
    if (!confirm(`선택한 교재 ${sel.size}권을 삭제할까요? 단원도 함께 삭제됩니다.`)) return;
    run(() => deleteTextbooks([...sel]));
  }

  if (textbooks.length === 0) {
    return (
      <p className="muted" style={{ padding: 16, margin: 0, fontSize: 15 }}>
        아직 교재가 없습니다. 위에서 추가하거나 엑셀로 올려보세요.
      </p>
    );
  }

  function cell(t, c) {
    const v = t[c.key];
    if (c.type === "status") {
      const st = TB_STATUS[t.status || "active"];
      return <span className={st.cls}>{st.label}</span>;
    }
    // **몇 명이 쓰는지** — 교재를 지울지 합칠지 정할 때 제일 먼저 보는 숫자다.
    // 마우스를 올리면 누구인지 나온다 (숫자만 보면 또 눌러봐야 한다)
    if (c.type === "students") {
      const ids = byBook[t.id] || [];
      if (ids.length === 0) return <span className="muted">—</span>;
      return (
        <span
          className="tag tag-sky"
          title={ids.map((id) => nameById.get(id)).filter(Boolean).join(" · ")}
        >
          {ids.length}
        </span>
      );
    }
    if (c.type === "url") {
      return v ? (
        <a href={v} target="_blank" rel="noreferrer" className="sky">링크</a>
      ) : <span className="muted">—</span>;
    }
    if (c.key === "price") return v ? `${Number(v).toLocaleString()}` : <span className="muted">—</span>;
    if (!v) return <span className="muted">—</span>;
    return v;
  }

  function editor(c) {
    if (c.type === "status") {
      return (
        <select className="input input-sm" value={draft.status || "active"}
          onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
          {Object.entries(TB_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      );
    }
    if (c.type === "area") {
      return (
        <select className="input input-sm" value={draft.area || ""}
          onChange={(e) => setDraft({ ...draft, area: e.target.value })}>
          <option value="">—</option>
          {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      );
    }
    return (
      <input className="input input-sm" value={draft[c.key] ?? ""}
        onChange={(e) => setDraft({ ...draft, [c.key]: e.target.value })} />
    );
  }

  /**
   * 열 이름을 **누를 수 있는 것**으로. 지금 기준에는 화살표를 붙인다 —
   * 무엇으로 늘어서 있는지 보이지 않으면 정렬이 있어도 없는 것과 같다.
   */
  function sortableTh(key, label) {
    const on = sort.key === key;
    return (
      <button
        onClick={() => clickCol(key)}
        title={`${label}(으)로 정렬`}
        style={{
          background: "none", border: 0, padding: 0, font: "inherit", cursor: "pointer",
          color: on ? "var(--ink)" : "inherit", fontWeight: on ? 800 : "inherit",
        }}
      >
        {label}
        <span className="hint" style={{ marginLeft: 3, fontSize: 12 }}>
          {on ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    );
  }

  /**
   * 오른쪽 판 — **고르는 곳(왼쪽 표)과 고치는 곳(오른쪽 판)을 나란히.**
   * 재원생 화면과 같은 구조다. 예전에는 교재를 누르면 단원이 **화면 아래**에
   * 붙어서, 다른 교재를 보려면 위로 올라가 다시 찾아 눌러야 했다.
   *
   * 단원·루틴·학생 판은 서버가 그려서 내려준다 (그 교재의 단원을 읽어야 한다).
   */
  function panel() {
    if (!selected) return null;
    return (
      <aside className={`card split-panel ${folded ? "split-folded" : ""}`}>
        {/* 판이 화면보다 길면 안쪽이 스크롤된다. 그때 **이름이 사라지면**
            지금 어느 교재를 보고 있는지 알 수 없다. 머리줄은 붙여둔다. */}
        <div className="row split-head" style={{ gap: 6, alignItems: "center" }}>
          <button
            className="btn btn-ghost btn-sm split-fold"
            onClick={() => setFolded(!folded)}
            title={folded ? "펴기" : "접기"}
          >
            {folded ? "▾" : "▴"}
          </button>
          <b style={{ fontSize: 15 }}>{selected.name}</b>
          <span className="hint">
            {[selected.area, `단원 ${unitCount[selected.id] || 0}`, `학생 ${(byBook[selected.id] || []).length}`]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
        {!folded && (
          <div className="split-body">
            <div className="row" style={{ gap: 3, margin: "8px 0 10px" }}>
              {TABS.map(([k, label]) => (
                <button
                  key={k}
                  className={`hwchip ${tab === k ? "hw-next" : ""}`}
                  onClick={() => setTab(k)}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === "units" && unitsPanel}
            {tab === "routine" && routinePanel}
            {tab === "students" && studentsPanel}
            {tab === "progress" && progressPanel}

            {/* 정보 — 표에 안 켜둔 칸도 여기서는 전부 고친다 */}
            {tab === "info" && (
              <>
                <div className="editgrid">
                  {ALL_FIELDS.map((c) => (
                    <div className="field" key={c.key}>
                      <label className="label">{c.label}</label>
                      {editor(c)}
                    </div>
                  ))}
                </div>
                <div className="row" style={{ gap: 6, marginTop: 10, alignItems: "center" }}>
                  <button className="btn btn-primary btn-sm" onClick={saveEdit} disabled={pending}>
                    {pending ? "저장 중…" : "저장"}
                  </button>
                  <span className="hint">고친 뒤 저장을 눌러주세요.</span>
                </div>
              </>
            )}
          </div>
        )}
      </aside>
    );
  }

  return (
    <>
      <div className="row" style={{ gap: 6, padding: "12px 16px 0", alignItems: "center" }}>
        <input className="input input-sm" style={{ width: 200 }} placeholder="교재명 검색"
          value={q} onChange={(e) => { setQ(e.target.value); setSel(new Set()); }} />
        <select className="input input-sm" style={{ width: 90 }} value={areaFilter}
          onChange={(e) => { setAreaFilter(e.target.value); setSel(new Set()); }}>
          <option value="">전 영역</option>
          {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        {/* 학생별로 걸러 보기 — 「이 아이 교재만」 */}
        <select
          className="input input-sm"
          style={{ width: 128 }}
          value={studentFilter}
          onChange={(e) => { setStudentFilter(e.target.value); setSel(new Set()); }}
          title="그 학생이 쓰는 교재만 봅니다"
        >
          <option value="">학생 전체</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.grade ? ` (${s.grade})` : ""}
            </option>
          ))}
        </select>
        {hiddenCount > 0 && (
          <button className={`btn btn-sm ${showHidden ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setShowHidden((v) => !v)}>
            절판·중단 {hiddenCount} {showHidden ? "숨기기" : "보기"}
          </button>
        )}
        {/* 폰에서는 열 이름을 누르기가 어렵다 — 고르는 칸도 같이 둔다 */}
        <select
          className="input input-sm"
          style={{ width: 128 }}
          value={sort.key}
          onChange={(e) => pickSort({ key: e.target.value, dir: "asc" })}
          title={BOOK_SORTS.find((s) => s.key === sort.key)?.hint || ""}
        >
          {BOOK_SORTS.map((s) => (
            <option key={s.key} value={s.key}>{s.label}순</option>
          ))}
        </select>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => pickSort({ ...sort, dir: sort.dir === "asc" ? "desc" : "asc" })}
          title={sort.dir === "asc" ? "오름차순 (누르면 뒤집기)" : "내림차순 (누르면 뒤집기)"}
        >
          {sort.dir === "asc" ? "▲" : "▼"}
        </button>
        <span className="spacer" />
        <span className="hint">
          {shown.length}권
          {studentFilter && ` · ${nameById.get(studentFilter) || ""}`}
        </span>
        <label className="hint" style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={noUnitsOnly}
            onChange={(e) => setNoUnitsOnly(e.target.checked)}
          />
          단원 없는 교재만 ({noUnitCount})
        </label>
        {/* 「단원 없음」 과 따로 둔다 — 단원은 나중에 채우기도 하지만
            영역·교재비가 비면 지금 당장 문자와 목록이 어긋난다 */}
        {countMissing(textbooks.filter((t) => (t.status || "active") === "active"), need) > 0 && (
          <label className="hint" style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
            <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
            빠진 것만 ({countMissing(textbooks.filter((t) => (t.status || "active") === "active"), need)})
          </label>
        )}
        <MissingPicker listKey="textbooks" defs={NEED} chosen={missKeys} />
        <button className="btn btn-ghost btn-sm" onClick={() => setColBox(!colBox)}>
          열 고르기 {cols.length}/{COLS.length}
        </button>
      </div>

      {colBox && (
        <div className="card card-tight" style={{ marginTop: 8 }}>
          <p className="hint" style={{ margin: "0 0 8px" }}>
            볼 것만 켜두세요. <b>이 브라우저에 기억됩니다.</b>
            끈 것도 교재를 열면 「정보」 탭에서 그대로 고칠 수 있어요.
          </p>
          <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
            {COLS.map((c) => (
              <button
                key={c.key}
                className={`hwchip ${on.has(c.key) ? "hw-next" : ""}`}
                onClick={() => toggleCol(c.key)}
              >
                {on.has(c.key) && <b>＋</b>} {c.label}
              </button>
            ))}
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setOn(new Set(DEFAULT_ON));
                try { localStorage.setItem(COL_KEY, JSON.stringify(DEFAULT_ON)); } catch { /* 무시 */ }
              }}
            >
              처음 상태로
            </button>
          </div>
        </div>
      )}

      {sel.size > 0 && (
        <div className="bulkbar">
          <b>{sel.size}권 선택</b>
          <select className="input input-sm" style={{ width: 110 }} defaultValue=""
            onChange={(e) => { run(() => updateTextbooksStatus([...sel], e.target.value)); e.target.value = ""; }}
            disabled={pending}>
            <option value="">상태 변경…</option>
            {Object.entries(TB_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select className="input input-sm" style={{ width: 100 }} defaultValue=""
            onChange={(e) => { run(() => updateTextbooksArea([...sel], e.target.value)); e.target.value = ""; }}
            disabled={pending}>
            <option value="">영역 변경…</option>
            {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <button className="btn btn-ghost btn-sm" onClick={runDelete} disabled={pending}>삭제</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setSel(new Set())}>선택 해제</button>
        </div>
      )}

      <div className="splitview splitview-wide">
        <div className="tblwrap">
          {/* 폰에서는 열을 다 보여줄 수가 없다. **교재명과 상태만 남기고**
              나머지는 접는다 — 어차피 교재를 누르면 오른쪽(폰에서는 위) 판이
              열려서 거기서 다 보고 고친다. */}
          <table className="tbl tbl-tight stutbl">
            <thead>
              <tr>
                <th style={{ width: 32 }}>
                  <input type="checkbox" checked={allChecked}
                    ref={(el) => el && (el.indeterminate = someChecked)} onChange={toggleAll} />
                </th>
                <th style={{ width: 62 }}>{sortableTh("units", "단원")}</th>
                {cols.map((c) => (
                  <th
                    key={c.key}
                    className={c.key === "name" || c.key === "status" ? "stu-keep" : "stu-drop"}
                    style={{ minWidth: c.w }}
                  >
                    {/* 구매링크·비고·학생은 늘어세울 기준이 못 된다 */}
                    {["purchase_url", "feature", "word_range", "students"].includes(c.key)
                      ? c.label
                      : sortableTh(c.key, c.label)}
                  </th>
                ))}
                <th style={{ width: 66 }}></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((t) => {
                const dim = (t.status || "active") !== "active";
                return (
                  <tr
                    key={t.id}
                    className={t.id === selectedId ? "rowopen" : undefined}
                    style={dim ? { opacity: 0.55 } : undefined}
                  >
                    <td>
                      <input type="checkbox" checked={sel.has(t.id)} onChange={() => toggleOne(t.id)} />
                    </td>
                    <td>
                      {unitCount[t.id] ? (
                        <span className="tag tag-mint">{unitCount[t.id]}</span>
                      ) : (
                        <span className="tag tag-muted">없음</span>
                      )}
                    </td>
                    {cols.map((c) => (
                      <td
                        key={c.key}
                        className={c.key === "name" || c.key === "status" ? "stu-keep" : "stu-drop"}
                        style={c.strong ? { fontWeight: 700 } : undefined}
                      >
                        {/* 교재명을 누르면 그 교재 한 판이 열린다 */}
                        {c.key === "name" ? (
                          <>
                            <button className="namebtn" onClick={() => open(t)}>{t.name}</button>
                            {missingIn(t, need).length > 0 && (
                              <span
                                className="tag tag-amber"
                                style={{ marginLeft: 4 }}
                                title={`${missingIn(t, need).join(" · ")} 가 비어 있습니다`}
                              >
                                {missingIn(t, need).join("·")} 없음
                              </span>
                            )}
                          </>
                        ) : (
                          cell(t, c)
                        )}
                      </td>
                    ))}
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => open(t)}>
                        {t.id === selectedId ? "보는 중" : "열기"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {shown.length === 0 && (
            <p className="muted" style={{ padding: 16, margin: 0, fontSize: 15 }}>
              조건에 맞는 교재가 없어요.
              {studentFilter && " 이 학생에게 배정된 교재가 없습니다."}
            </p>
          )}
        </div>
        {panel()}
      </div>
    </>
  );
}

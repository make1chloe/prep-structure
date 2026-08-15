"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateHomeworkItem,
  setHomeworkItemsActive,
  setHomeworkItemsCategory,
  deleteHomeworkItems,
} from "./actions";

import { CATEGORIES, CAT_CLS, toolList, toolBadge } from "./categories";
import { sortRows } from "@/lib/listSort";
import { missingIn, hasMissing, countMissing } from "@/lib/listMissing";
import MissingPicker from "@/components/MissingPicker";
export { CAT_CLS };

/**
 * 늘어세울 기준. **기본은 「순서」** — 원장님이 손으로 매겨둔 차례이고,
 * 오늘 수업에서 숙제를 고를 때 이 차례로 나온다. 화면마다 차례가 다르면
 * 손이 기억한 자리가 어긋난다.
 */
const SORTS = [
  ["sort", "순서"],
  ["name", "이름"],
  ["category", "분류"],
  ["tool", "준비물"],
];

/**
 * **빠진 것** — 이 항목이 제구실을 하려면 있어야 하는 칸.
 *
 * 분류가 없으면 숙제검사에서 어디로 묶일지 모르고, 순서가 없으면 고르는
 * 목록 맨 뒤로 밀린다. 준비물이 없으면 아이 화면에 「뭘 펴요」 가 안 뜬다.
 */
const NEED = [
  { key: "category", label: "분류" },
  { key: "sort", label: "순서" },
  { key: "tool", label: "준비물" },
];

export default function HomeworkList({ items = [], missKeys = null }) {
  // 「빠진 것」 은 원장님이 고른 칸만 센다 (11-11). 안 정했으면 후보 전부.
  const need = missKeys === null ? NEED : NEED.filter((d) => missKeys.includes(d.key));
  const [sel, setSel] = useState(() => new Set());
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState({});
  const [q, setQ] = useState("");
  const [catFilter, setCatFilter] = useState("전체");
  const [showOff, setShowOff] = useState(false);
  const [sort, setSort] = useState({ key: "sort", dir: "asc" });
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const kw = q.trim().toLowerCase();
  const shown = sortRows(
    items.filter((i) => {
      if (!showOff && !i.active) return false;
      if (catFilter !== "전체" && (i.category || "기타") !== catFilter) return false;
      if (onlyMissing && !hasMissing(i, need)) return false;
      if (kw && !i.name.toLowerCase().includes(kw)) return false;
      return true;
    }),
    sort
  );
  // 세는 것은 **지금 보이는 갈래 안에서** — 분류를 걸러둔 채로 전체 개수를
  // 보여주면 「3개라는데 하나도 안 보인다」 가 된다
  const missingCount = countMissing(
    items.filter((i) => (showOff || i.active) && (catFilter === "전체" || (i.category || "기타") === catFilter)),
    need
  );

  const allChecked = shown.length > 0 && shown.every((i) => sel.has(i.id));
  const someChecked = sel.size > 0 && !allChecked;

  function toggleAll() {
    if (allChecked) {
      const n = new Set(sel);
      shown.forEach((i) => n.delete(i.id));
      setSel(n);
    } else {
      setSel(new Set([...sel, ...shown.map((i) => i.id)]));
    }
  }
  function toggleOne(id) {
    const n = new Set(sel);
    n.has(id) ? n.delete(id) : n.add(id);
    setSel(n);
  }

  function run(fn) {
    startTransition(async () => {
      const res = await fn();
      if (res?.error) alert(res.error);
      router.refresh();
    });
  }

  function startEdit(i) {
    setEditId(i.id);
    setDraft({
      name: i.name,
      category: i.category || "",
      tool: i.tool || "",
      sort: i.sort ?? "",
      method: i.method || "",
      checklist: i.checklist || "",
      home_item_id: i.home_item_id || "",
      prep_task: i.prep_task || "",
      no_timer: !!i.no_timer,
      in_person: !!i.in_person,
      unit_test: !!i.unit_test,
    });
  }
  function saveEdit() {
    const id = editId;
    run(async () => {
      const r = await updateHomeworkItem(id, draft);
      setEditId(null);
      return r;
    });
  }

  function runDelete() {
    const ids = [...sel];
    if (ids.length === 0) return;
    if (!confirm(
      `선택한 항목 ${ids.length}개를 삭제할까요?\n` +
      `이미 기록에 쓰인 항목이면 삭제 대신 '숨김'을 권합니다.`
    )) return;
    run(async () => {
      const r = await deleteHomeworkItems(ids);
      setSel(new Set());
      return r;
    });
  }

  return (
    <>
      <div className="row" style={{ gap: 6, padding: "12px 16px 0", alignItems: "center" }}>
        <input
          className="input input-sm"
          style={{ width: 200 }}
          placeholder="항목 검색"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {["전체", ...CATEGORIES].map((c) => {
          const n = c === "전체"
            ? items.filter((i) => showOff || i.active).length
            : items.filter((i) => (showOff || i.active) && (i.category || "기타") === c).length;
          return (
            <button
              key={c}
              className={`btn btn-sm ${catFilter === c ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setCatFilter(c)}
            >
              {c} {n}
            </button>
          );
        })}
        <span className="spacer" />
        <span className="hint">{shown.length}개</span>
        <select
          className="input input-sm"
          style={{ width: 96 }}
          value={sort.key}
          onChange={(e) => setSort({ key: e.target.value, dir: "asc" })}
          title="목록 정렬"
        >
          {SORTS.map(([k, l]) => <option key={k} value={k}>{l}순</option>)}
        </select>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setSort((v) => ({ ...v, dir: v.dir === "asc" ? "desc" : "asc" }))}
          title={sort.dir === "asc" ? "오름차순 (누르면 뒤집기)" : "내림차순 (누르면 뒤집기)"}
        >
          {sort.dir === "asc" ? "▲" : "▼"}
        </button>
        {/* **빠진 칸은 조용하다** — 준비물이 없으면 아이 화면에 「뭘 펴요」 가
            안 뜨는데, 목록을 훑어서는 안 보인다 */}
        {missingCount > 0 && (
          <label className="hint" style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={onlyMissing}
              onChange={(e) => setOnlyMissing(e.target.checked)}
            />
            빠진 것만 ({missingCount})
          </label>
        )}
        <MissingPicker listKey="homework" defs={NEED} chosen={missKeys} />
        <label className="hint" style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
          <input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} />
          숨긴 항목도 보기
        </label>
      </div>

      {sel.size > 0 && (
        <div className="bulkbar">
          <b>{sel.size}개 선택</b>
          <select
            className="input input-sm"
            style={{ width: 120 }}
            defaultValue=""
            onChange={(e) => {
              const v = e.target.value;
              e.target.value = "";
              if (!v) return;
              run(async () => {
                const r = await setHomeworkItemsCategory([...sel], v);
                setSel(new Set());
                return r;
              });
            }}
            disabled={pending}
          >
            <option value="">분류 변경…</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => run(async () => {
              const r = await setHomeworkItemsActive([...sel], false);
              setSel(new Set());
              return r;
            })}
            disabled={pending}
          >
            숨기기
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => run(async () => {
              const r = await setHomeworkItemsActive([...sel], true);
              setSel(new Set());
              return r;
            })}
            disabled={pending}
          >
            다시 쓰기
          </button>
          <button className="btn btn-ghost btn-sm" onClick={runDelete} disabled={pending}>삭제</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setSel(new Set())}>선택 해제</button>
        </div>
      )}

      {/* 준비물 고르기 목록 — 자주 쓰는 것 + 이미 항목들에 적어 둔 것 (0116) */}
      <datalist id="tool-options-edit">
        {toolList(items.map((i) => i.tool)).map((t) => <option key={t} value={t} />)}
      </datalist>

      <div className="tblwrap">
        <table className="tbl tbl-tight">
          <thead>
            <tr>
              <th style={{ width: 32 }}>
                <input
                  type="checkbox"
                  checked={allChecked}
                  ref={(el) => el && (el.indeterminate = someChecked)}
                  onChange={toggleAll}
                />
              </th>
              <th style={{ minWidth: 180 }}>항목명</th>
              <th style={{ width: 90 }}>분류</th>
              <th style={{ width: 70 }}>순서</th>
              <th style={{ width: 70 }}>사용</th>
              <th style={{ minWidth: 220 }}>학습 방법 (학생에게 보여줄 설명)</th>
              <th style={{ minWidth: 150 }} title="쓸 수 있는 자리: {학생} {단원} {교재} {숙제}">내 할일 자동 생성</th>
              <th style={{ width: 96 }} title="선생님을 붙잡고 해야 하는 것(구두테스트·숙제 검사)만 끄세요. 혼자 하는 것은 켜 두면 시간이 쌓입니다">타이머</th>
              <th style={{ width: 92 }} title="공책처럼 앱에 낼 것이 없는 숙제만 켜세요. 켜면 '안 냈다'고 미제출로 세지 않습니다">검사 방법</th>
              <th style={{ width: 86 }}></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((i) => {
              const editing = editId === i.id;
              const cat = i.category || "기타";
              return (
                <tr key={i.id} style={!i.active ? { opacity: 0.5 } : undefined}>
                  <td>
                    <input type="checkbox" checked={sel.has(i.id)} onChange={() => toggleOne(i.id)} />
                  </td>
                  {editing ? (
                    <>
                      <td>
                        <input
                          className="input input-sm"
                          value={draft.name}
                          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                        />
                      </td>
                      <td>
                        <select
                          className="input input-sm"
                          value={draft.category}
                          onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                        >
                          <option value="">—</option>
                          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                        {/* 준비물 — 아이 화면 숙제 이름 옆에 붙는다 (0116).
                            고를 수도, 직접 적을 수도. 비우면 표시 안 함 */}
                        <input
                          className="input input-sm"
                          style={{ marginTop: 6 }}
                          list="tool-options-edit"
                          placeholder="준비물 (비우면 표시 안 함)"
                          title="아이가 무엇을 펴야 하는지 — 아이 화면 숙제 옆에 붙습니다"
                          value={draft.tool}
                          onChange={(e) => setDraft({ ...draft, tool: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          className="input input-sm"
                          style={{ width: 56 }}
                          value={draft.sort}
                          onChange={(e) => setDraft({ ...draft, sort: e.target.value })}
                        />
                      </td>
                      <td />
                      <td>
                        <textarea
                          className="input input-sm"
                          rows={3}
                          style={{ minWidth: 260, whiteSpace: "pre-wrap" }}
                          placeholder={"학생이 숙제를 눌렀을 때 볼 설명\n예) 1. 단어를 3번 쓰고 2. 뜻을 가리고 셀프테스트"}
                          value={draft.method}
                          onChange={(e) => setDraft({ ...draft, method: e.target.value })}
                        />
                        {/* 체크리스트 — 학생이 집에서 하나씩 짚고 낸다 */}
                        <textarea
                          className="input input-sm"
                          rows={3}
                          style={{ minWidth: 260, marginTop: 6, whiteSpace: "pre-wrap" }}
                          placeholder={"체크리스트 (한 줄에 하나)\n예) 단어 3번 쓰기\n뜻 가리고 셀프테스트\n틀린 것 다시 쓰기"}
                          title="비우면 학생 화면에 체크리스트 버튼이 안 나옵니다"
                          value={draft.checklist}
                          onChange={(e) => setDraft({ ...draft, checklist: e.target.value })}
                        />
                        {/* 집에서는 못 하는 학습 — 숙제로 낼 때 대신 쓸 것
                            (구두테스트 → 셀프녹음테스트) */}
                        <div className="row" style={{ gap: 6, alignItems: "center", marginTop: 6 }}>
                          <span className="hint" style={{ fontSize: 13 }}>숙제로 낼 때</span>
                          <select
                            className="input input-sm"
                            style={{ minWidth: 170 }}
                            title="집에서는 못 하는 학습이면, 숙제로 낼 때 대신 나갈 것을 고르세요"
                            value={draft.home_item_id}
                            onChange={(e) => setDraft({ ...draft, home_item_id: e.target.value })}
                          >
                            <option value="">그대로</option>
                            {items
                              .filter((x) => x.id !== i.id)
                              .map((x) => (
                                <option key={x.id} value={x.id}>{x.name}</option>
                              ))}
                          </select>
                        </div>
                      </td>
                      <td>
                        <input
                          className="input input-sm"
                          style={{ minWidth: 150 }}
                          placeholder="{학생}-단원평가-{단원}"
                          title="이 숙제를 배정하면 이 제목으로 내 할일이 생깁니다. 쓸 수 있는 자리: {학생} {단원} {교재} {숙제}. 비우면 안 만듭니다"
                          value={draft.prep_task}
                          onChange={(e) => setDraft({ ...draft, prep_task: e.target.value })}
                        />
                      </td>
                      <td>
                        <label className="row" style={{ gap: 5, alignItems: "center", cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={!draft.no_timer}
                            onChange={(e) => setDraft({ ...draft, no_timer: !e.target.checked })}
                          />
                          <span style={{ fontSize: 13 }}>씀</span>
                        </label>
                      </td>
                      <td>
                        {/* 기본은 **내는 것**이다. 공책으로 보는 숙제만 켠다 */}
                        <label className="row" style={{ gap: 5, alignItems: "center", cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={!!draft.in_person}
                            onChange={(e) => setDraft({ ...draft, in_person: e.target.checked })}
                          />
                          <span style={{ fontSize: 13 }}>직접검사</span>
                        </label>
                        {/* **단원평가** (0106) — 이 표시가 붙은 항목으로
                            배정하면, 아이가 다음 시간에 와서 맞은 개수만
                            적어 낸다. 단원 이름은 배정에 붙어 있으니 아이가
                            적을 일이 없다 (원장님, 2026-08-07) */}
                        <label className="row" style={{ gap: 5, alignItems: "center", cursor: "pointer", marginTop: 4 }}>
                          <input
                            type="checkbox"
                            checked={!!draft.unit_test}
                            onChange={(e) => setDraft({ ...draft, unit_test: e.target.checked })}
                          />
                          <span style={{ fontSize: 13 }}>단원평가</span>
                        </label>
                      </td>
                      <td>
                        <div className="row" style={{ gap: 3, flexWrap: "nowrap" }}>
                          <button className="btn btn-primary btn-sm" onClick={saveEdit} disabled={pending}>저장</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setEditId(null)}>취소</button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={{ fontWeight: 600 }}>{i.name}</td>
                      <td>
                        <span className={`tag ${CAT_CLS[cat] || "tag-muted"}`}>{cat}</span>
                        {i.tool && (
                          <span className="tag tag-sky" style={{ marginLeft: 4 }}>{toolBadge(i.tool)}</span>
                        )}
                      </td>
                      <td className="muted">{i.sort}</td>
                      <td>
                        {i.active ? (
                          <span className="tag tag-mint">사용</span>
                        ) : (
                          <span className="tag tag-muted">숨김</span>
                        )}
                      </td>
                      <td style={{ whiteSpace: "normal", maxWidth: 420 }}>
                        {i.method ? (
                          <span className="muted" style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>
                            {i.method}
                          </span>
                        ) : (
                          <span className="hint">— 아직 없음</span>
                        )}
                      </td>
                      <td>
                        {i.prep_task ? (
                          <span className="tag tag-sky" title="배정하면 이 할일이 생깁니다">
                            {i.prep_task}
                          </span>
                        ) : (
                          <span className="hint">—</span>
                        )}
                      </td>
                      <td>
                        {i.no_timer ? (
                          <span className="tag tag-muted" title="선생님을 기다려도 되는 항목">
                            선생님과
                          </span>
                        ) : (
                          <span className="tag tag-mint">씀</span>
                        )}
                      </td>
                      <td>
                        {i.unit_test ? (
                          <span className="tag tag-lav" style={{ marginRight: 4 }}>단원평가</span>
                        ) : null}
                        {i.in_person ? (
                          <span className="tag tag-lav" title="공책 등 — 앱에 낼 것이 없습니다">
                            직접검사
                          </span>
                        ) : (
                          <span className="tag tag-muted" title="사진·녹음을 올려야 합니다">
                            제출
                          </span>
                        )}
                      </td>
                      <td>
                        {/* **무엇이 빠졌는지 적어준다** — 「빠진 것 3」 이라고만
                            하면 줄마다 눌러서 찾아야 한다 (원칙 A5) */}
                        {missingIn(i, need).length > 0 && (
                          <span
                            className="tag tag-amber"
                            style={{ marginRight: 4 }}
                            title={`${missingIn(i, need).join(" · ")} 가 비어 있습니다`}
                          >
                            {missingIn(i, need).join("·")} 없음
                          </span>
                        )}
                        <button className="btn btn-ghost btn-sm" onClick={() => startEdit(i)}>수정</button>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {shown.length === 0 && (
          <p className="muted" style={{ padding: 16, margin: 0, fontSize: 15 }}>
            조건에 맞는 항목이 없어요.
          </p>
        )}
      </div>
    </>
  );
}

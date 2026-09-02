"use client";
/**
 * 교재 화면에서 **누르는 것**들. 여기에도 판단은 없다 — 서버 동작을 부르고 답을 그대로 보인다.
 *
 * ⚠️ **누른 그 줄만 바뀐다** (§속도 5). 화면 전체를 다시 조회하지 않는다 —
 *    이 화면은 한 번 여는 데 조회가 여러 번이라, 한 번 누를 때마다 다시 돌면
 *    루틴 열 줄 차례를 바꾸는 데 그 값을 열 번 치른다.
 * ⚠️ **되돌릴 수 없는 것만 서버 답을 기다린다** — 엑셀 저장이 그것이다.
 *    나머지(상태 바꾸기·차례)는 눌린 자리가 먼저 바뀌고 실패하면 **그 줄만** 되돌린다.
 * ⚠️ `alert`/`confirm` 을 안 쓴다. 브라우저 알림창이 뜨면 자동화가 그 자리에서 멈춘다.
 * ⚠️ `position:fixed` · `history.pushState` · `createPortal` 도 안 쓴다 —
 *    고치는 자리는 `<details>` 로 편다. **닫는 길이 언제나 화면 안에 있다** (대전제 10).
 * ⚠️ **투명도로 흐리게 하지 않는다** (㉑). 「내림」은 회색 알약(`.pilloff`)으로 말한다.
 * ⚠️ 고르는 칸의 값은 **서버가 DB 에서 읽어 준 `picks` 뿐**이다. 여기서 값을 지어내지 않는다.
 */
import { useState, useRef, useTransition } from "react";
import { nameOf } from "./labels.js";
import {
  saveBook, setUnitState, addItem, saveItem, setItemState,
  addAreaRoutine, saveAreaRoutine, moveAreaRoutine,
  addMaterialType, setMaterialTypeState, addVideo, saveVideo,
  excelPreview, excelCompare, excelApply, excelUndo,
} from "./actions.js";

/* ── 작은 조각 ────────────────────────────────────────────────────── */

function Msg({ text, bad = true }) {
  if (!text) return null;
  return <span className={"pill " + (bad ? "pillbad" : "pillok")}>{text}</span>;
}

/** 못 쓰는 자리 — **「할 수 있는 척」 하지 않는다.** 까닭을 그대로 적는다 */
function NoWrite({ table }) {
  return (
    <p className="bk-why">
      ⚠️ <code className="mono">v2.{table}</code> 에 쓸 권한(GRANT)이 없어 여기서는 **못 고칩니다.**
      접근 규칙(RLS)은 열려 있는데 표 권한이 없는 자리입니다 — 마이그레이션 한 줄로 고칩니다.
    </p>
  );
}

const canWrite = (can, t) => Boolean(can?.[t]?.ins || can?.[t]?.upd);

/* ══════════════════════════════════════════════════════════════════════
 * ① 고른 교재의 설정 — 영역 · 배정 겹 · 대단원 기준/소단원 기준 · 단원평가 · 상태
 * ══════════════════════════════════════════════════════════════════════ */

export function BookForm({ book, picks, can }) {
  const [v, setV] = useState({
    area: book.area ?? "", chunkDepth: book.chunk_depth, orderBasis: book.order_basis,
    unitTest: book.unit_test === true, state: book.state,
  });
  const [msg, setMsg] = useState(null);
  const [ok, setOk] = useState(false);
  const [busy, start] = useTransition();
  const may = canWrite(can, "books");
  const noWb = Number(book.units_wb ?? 0) === 0;

  function save() {
    setMsg(null); setOk(false);
    start(async () => {
      const r = await saveBook({
        bookId: book.id, area: v.area === "" ? null : v.area,
        chunkDepth: v.chunkDepth, orderBasis: v.orderBasis,
        unitTest: v.unitTest, state: v.state,
      });
      if (r?.ok) setOk(true); else setMsg(r?.msg ?? "저장 못 했습니다");
    });
  }

  if (!may) return <NoWrite table="books" />;
  return (
    <div className="bk-form">
      <div className="bk-grid">
        <label>
          <span className="lbl">영역 — 루틴이 여기에 붙는다 (㉚)</span>
          <select className="fld" value={v.area} onChange={(e) => setV({ ...v, area: e.target.value })}>
            <option value="">— 아직 안 정함 —</option>
            {(picks.books?.area ?? []).map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label>
          <span className="lbl">배정 겹 — 한 번에 내는 최소 덩어리</span>
          <select className="fld" value={v.chunkDepth} onChange={(e) => setV({ ...v, chunkDepth: e.target.value })}>
            {(picks.books?.chunk_depth ?? []).map((x) => (
              <option key={x} value={x}>{nameOf("chunk_depth", x)}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="lbl">도는 차례 (㉙)</span>
          <select className="fld" value={v.orderBasis} onChange={(e) => setV({ ...v, orderBasis: e.target.value })}>
            {(picks.books?.order_basis ?? []).map((x) => (
              <option key={x} value={x}>{nameOf("order_basis", x)}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="lbl">교재 상태</span>
          <select className="fld" value={v.state} onChange={(e) => setV({ ...v, state: e.target.value })}>
            {(picks.books?.state ?? []).map((x) => (
              <option key={x} value={x}>{nameOf("books_state", x)}</option>
            ))}
          </select>
        </label>
      </div>

      {/* ⚠️ ㉙ — 워크북이 없는 책에서는 무엇을 골라도 배정이 같다. **감추지 말고 밝힌다** */}
      {noWb ? (
        <p className="bk-why">
          이 교재는 워크북 줄이 <b>0줄</b>이라 「대단원 기준 / 소단원 기준」이 <b>뜻이 없습니다</b> —
          무엇을 골라도 배정이 같습니다. 이 칸이 갈리는 것은 워크북이 있는 11권뿐입니다 (㉙).
        </p>
      ) : (
        <p className="bk-why">
          워크북 <b>{book.units_wb}줄</b>이 있어 이 칸이 <b>실제로 갈립니다</b>.
          「대단원 기준」이면 <b>본책을 다 하고 → 워크북을 다 합니다</b>.
          ⚠️ 워크북은 <b>대단원 전체를 한 번에</b> 냅니다 (0062) — 소단원마다 쪼개면 열 배로 잘게 나갑니다.
        </p>
      )}

      <label className="row">
        <input type="checkbox" checked={v.unitTest} onChange={(e) => setV({ ...v, unitTest: e.target.checked })} />
        <span>단원평가를 이 교재에 붙인다</span>
      </label>
      <p className="bk-why">
        ⚠️ ㉙ — 원장님 확정은 <b>단원평가를 교재 설정에서 뺀다</b>였습니다 (문법 교재를 둘 쓰는 경우가 있고
        영작 교재는 아예 없습니다). <b>볼지 말지도, 어느 단위로 볼지도 「학생 루틴」에서 정합니다.</b>
        이 칸은 DB(<code className="mono">v2.books.unit_test</code>)에 아직 남아 있어 그대로 보여 드리는 것입니다.
      </p>

      <div className="row">
        <button type="button" className="btn btnmain" onClick={save} disabled={busy}>저장</button>
        {busy ? <span className="chip">보내는 중</span> : null}
        {ok ? <Msg text="저장했습니다" bad={false} /> : null}
        <Msg text={msg} />
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
 * ② 단원 나무 — 대 › 중 › 소 **세 겹 고정**. 내리고 되살린다 (지우지 않는다)
 * ══════════════════════════════════════════════════════════════════════ */

export function Tree({ tree, can }) {
  const [now, setNow] = useState({});          // { [단원id]: 상태 } — 누른 줄만 덮는다
  const [msg, setMsg] = useState({});
  const [, start] = useTransition();
  const may = canWrite(can, "units");
  const stateOf = (u) => now[u.id] ?? u.state;

  function flip(u) {
    const to = stateOf(u) === "active" ? "hidden" : "active";
    const before = stateOf(u);
    setNow((s) => ({ ...s, [u.id]: to }));     // ⚠️ 먼저 바뀐다
    setMsg((m) => ({ ...m, [u.id]: null }));
    start(async () => {
      const r = await setUnitState({ unitId: u.id, state: to });
      if (!r?.ok) {                            // 실패하면 **그 줄만** 되돌린다
        setNow((s) => ({ ...s, [u.id]: before }));
        setMsg((m) => ({ ...m, [u.id]: r?.msg ?? "못 바꿨습니다" }));
      }
    });
  }

  if (!tree.length) return null;
  return (
    <div className="bk-tree">
      {!may ? <NoWrite table="units" /> : null}
      {tree.map((ch, i) => (
        <details key={`${ch.name}:${i}`} className="bk-ch">
          <summary className="bk-foldhd">
            <span className="bk-unit">{ch.name}</span>
            <span className="num muted">{ch.n}줄</span>
            {ch.wb ? <span className="chip">워크북 {ch.wb}</span> : null}
            {ch.hidden ? <span className="pill pilloff">내림 {ch.hidden}</span> : null}
          </summary>
          <div className="bk-foldbd">
            {ch.mids.map((mid, j) => (
              <div key={`${mid.name}:${j}`} className="bk-mid">
                {/* ⚠️ 세 겹 고정 — 중단원이 비어도 **겹을 없애지 않는다** */}
                <div className="bk-sub">
                  <span className="bk-unit">
                    {mid.empty ? <span className="muted">중단원 없음</span> : mid.name}
                  </span>
                  <span className="num muted">{mid.subs.length}줄</span>
                </div>
                {mid.subs.map((u) => (
                  <div key={u.id} className="bk-sub">
                    {/* ⚠️ 이름은 `v2.unit_label` 이 지은 것 그대로다. 줄이지 않는다 */}
                    <span className="bk-unit">{u.label || u.activity}</span>
                    {u.is_workbook ? <span className="chip">워크북</span> : null}
                    <span className="num muted">
                      {u.page_start ? `p.${u.page_start}${u.page_end && u.page_end !== u.page_start ? `-${u.page_end}` : ""}` : "쪽 없음"}
                      {u.q_count ? ` · ${u.q_count}문항` : ""}
                    </span>
                    {stateOf(u) === "hidden" ? <span className="pill pilloff">내림</span> : null}
                    <span className="bk-ops">
                      <button type="button" className="bk-op" disabled={!may} onClick={() => flip(u)}
                              title={stateOf(u) === "active" ? "안 씀으로 내린다 (지우지 않는다)" : "되살린다"}>
                        {stateOf(u) === "active" ? "🗑" : "↩"}
                      </button>
                    </span>
                    <Msg text={msg[u.id]} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
 * ③ 기본루틴 — **모든 항목.** 차례가 없다 (㉒)
 * ══════════════════════════════════════════════════════════════════════ */

export function Items({ rows, picks, can }) {
  const [list, setList] = useState(rows);
  const [msg, setMsg] = useState({});
  const [add, setAdd] = useState({ name: "", method: "", tool: "", checks: "" });
  const [addMsg, setAddMsg] = useState(null);
  const [, start] = useTransition();
  const may = canWrite(can, "learn_items");
  const states = picks.learn_items?.state ?? [];
  const down = states.find((s) => s !== "active") ?? null;

  const put = (row) => setList((l) => l.map((x) => (x.id === row.id ? { ...x, ...row } : x)));

  function flip(it) {
    if (!down) { setMsg((m) => ({ ...m, [it.id]: "DB 에 「내림」 값이 없습니다" })); return; }
    const to = it.state === "active" ? down : "active";
    setMsg((m) => ({ ...m, [it.id]: null }));
    start(async () => {
      const r = await setItemState({ itemId: it.id, state: to });
      if (r?.ok) { put({ id: it.id, state: to }); setMsg((m) => ({ ...m, [it.id]: r.msg })); }
      else setMsg((m) => ({ ...m, [it.id]: r?.msg ?? "못 바꿨습니다" }));
    });
  }

  function save(it, form) {
    setMsg((m) => ({ ...m, [it.id]: null }));
    start(async () => {
      const r = await saveItem({ itemId: it.id, ...form });
      if (r?.ok) { put(r.row); setMsg((m) => ({ ...m, [it.id]: "고쳤습니다" })); }
      else setMsg((m) => ({ ...m, [it.id]: r?.msg ?? "못 고쳤습니다" }));
    });
  }

  function make() {
    setAddMsg(null);
    start(async () => {
      const r = await addItem(add);
      if (r?.ok) { setList((l) => [...l, r.row]); setAdd({ name: "", method: "", tool: "", checks: "" }); }
      else setAddMsg(r?.msg ?? "못 만들었습니다");
    });
  }

  const live = list.filter((x) => x.state === "active");
  const gone = list.filter((x) => x.state !== "active");

  return (
    <div className="stack">
      <p className="bk-why">
        <b>기본루틴은 「모든 항목」입니다 — 차례가 없습니다</b> (㉒). 차례는 아래 <b>영역 루틴</b>과
        <b> 학생 루틴</b>에서 짭니다. 그래서 이 목록에는 ▲▼ 가 없습니다.
        <br />
        ⚠️ 🗑 는 <b>지우는 것이 아니라 「안 씀」으로 내리는 것</b>입니다 (㊷ · 대전제 6).
        지난 기록이 그 항목을 가리키고 있어서, 진짜로 지우면 「그때 뭘 했더라」가 빈칸이 됩니다.
        내린 항목은 <b>새 루틴에 안 뜨고</b> 지난 기록에는 그대로 남으며, <b>되살릴 수 있습니다</b>.
      </p>

      {may ? (
        <details className="bk-fold">
          <summary className="bk-foldhd">+ 항목</summary>
          <div className="bk-foldbd bk-form">
            <div className="bk-grid">
              <label><span className="lbl">항목 이름</span>
                <input className="fld" value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} /></label>
              <label><span className="lbl">준비물</span>
                <input className="fld" value={add.tool} onChange={(e) => setAdd({ ...add, tool: e.target.value })} /></label>
            </div>
            <label><span className="lbl">하는 법</span>
              <textarea className="fld" rows={2} value={add.method}
                        onChange={(e) => setAdd({ ...add, method: e.target.value })} /></label>
            <label><span className="lbl">체크리스트 — 가운뎃점 · 으로 나눕니다</span>
              <input className="fld" value={add.checks} onChange={(e) => setAdd({ ...add, checks: e.target.value })} /></label>
            <div className="row">
              <button type="button" className="btn btnmain" onClick={make}>만들기</button>
              <Msg text={addMsg} />
            </div>
          </div>
        </details>
      ) : <NoWrite table="learn_items" />}

      <div className="stack">
        {live.map((it) => (
          <ItemRow key={it.id} it={it} may={may} msg={msg[it.id]} onFlip={() => flip(it)} onSave={(f) => save(it, f)} />
        ))}
      </div>

      <details className="bk-fold">
        <summary className="bk-foldhd">
          <span>내려둔 항목</span><span className="num">{gone.length}개</span>
          <span className="muted">되살릴 수 있습니다</span>
        </summary>
        <div className="bk-foldbd stack">
          {gone.length === 0 ? <p className="muted">없습니다.</p> : null}
          {gone.map((it) => (
            <ItemRow key={it.id} it={it} may={may} msg={msg[it.id]} onFlip={() => flip(it)} onSave={(f) => save(it, f)} />
          ))}
        </div>
      </details>
    </div>
  );
}

function ItemRow({ it, may, msg, onFlip, onSave }) {
  const [f, setF] = useState({
    name: it.name ?? "", method: it.method ?? "", tool: it.tool ?? "",
    checks: (it.checks ?? []).join(" · "),
  });
  return (
    <div className="stack">
      <div className="bk-line">
        <span className="grow">{it.name}</span>
        {it.state !== "active" ? <span className="pill pilloff">{nameOf("learn_items_state", it.state)}</span> : null}
        {it.in_area ? <span className="chip">영역 루틴 {it.in_area}</span> : null}
        {it.in_student ? <span className="chip">학생 루틴 {it.in_student}</span> : null}
        <span className="num muted" title="지난 기록이 이 항목을 가리키는 줄 수">지난 기록 {it.used}줄</span>
        <span className="bk-ops">
          <button type="button" className="bk-op" disabled={!may} onClick={onFlip}
                  title={it.state === "active" ? "안 씀으로 내린다 (지우지 않는다)" : "되살린다"}>
            {it.state === "active" ? "🗑" : "↩"}
          </button>
        </span>
      </div>
      <details className="bk-fold">
        <summary className="bk-foldhd">✎ 고치기</summary>
        <div className="bk-foldbd bk-form">
          <div className="bk-grid">
            <label><span className="lbl">이름</span>
              <input className="fld" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
            <label><span className="lbl">준비물</span>
              <input className="fld" value={f.tool} onChange={(e) => setF({ ...f, tool: e.target.value })} /></label>
          </div>
          <label><span className="lbl">하는 법</span>
            <textarea className="fld" rows={2} value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })} /></label>
          <label><span className="lbl">체크리스트 — 가운뎃점 · 으로 나눕니다</span>
            <input className="fld" value={f.checks} onChange={(e) => setF({ ...f, checks: e.target.value })} /></label>
          <div className="row">
            <button type="button" className="btn" disabled={!may} onClick={() => onSave(f)}>저장</button>
            <Msg text={msg} />
          </div>
        </div>
      </details>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
 * ④ 영역 루틴 — ▲▼ 차례 · ✎ 자리 · + 항목 (㊷)
 * ══════════════════════════════════════════════════════════════════════ */

export function AreaRoutine({ rows, items, picks, can }) {
  const [list, setList] = useState(rows);
  const [msg, setMsg] = useState({});
  const [add, setAdd] = useState({ area: "", itemId: "", place: "", required: false });
  const [addMsg, setAddMsg] = useState(null);
  const [, start] = useTransition();
  const may = canWrite(can, "area_routine");
  const areas = picks.area_routine?.area ?? [];
  const places = picks.area_routine?.place ?? [];

  function move(row, dir) {
    setMsg((m) => ({ ...m, [row.id]: null }));
    start(async () => {
      const r = await moveAreaRoutine({ rowId: row.id, dir });
      if (r?.ok) {
        const by = new Map(r.moved.map((x) => [x.id, x.sort]));
        setList((l) => l.map((x) => (by.has(x.id) ? { ...x, sort: by.get(x.id) } : x)));
      } else setMsg((m) => ({ ...m, [row.id]: r?.msg ?? "못 옮겼습니다" }));
    });
  }

  function save(row, place, required) {
    setMsg((m) => ({ ...m, [row.id]: null }));
    start(async () => {
      const r = await saveAreaRoutine({ rowId: row.id, place, required });
      if (r?.ok) setList((l) => l.map((x) => (x.id === row.id ? { ...x, ...r.row } : x)));
      else setMsg((m) => ({ ...m, [row.id]: r?.msg ?? "못 고쳤습니다" }));
    });
  }

  function make() {
    setAddMsg(null);
    start(async () => {
      const r = await addAreaRoutine(add);
      if (r?.ok) { setList((l) => [...l, r.row]); setAdd({ ...add, itemId: "" }); }
      else setAddMsg(r?.msg ?? "못 만들었습니다");
    });
  }

  const groups = [...new Set(list.map((r) => r.area))].sort();
  const sorted = (a) => list.filter((r) => r.area === a).sort((x, y) => (x.sort ?? 0) - (y.sort ?? 0));

  return (
    <div className="stack">
      <p className="bk-why">
        <b>영역 루틴이 기본입니다</b> (㉚). 교재가 수십 권이어도 <b>루틴은 영역 대여섯 벌</b>입니다 —
        교재마다 짜려니 끝이 안 보였던 것이고, 영역마다 짜면 한나절이면 끝납니다.
        <br />
        줄 오른쪽이 <b>▲▼(차례) · ✎(고치기)</b>입니다. 🗑 는 여기 없습니다 —
        <code className="mono">v2.area_routine</code> 에 <b>상태 칸이 없어서</b> 내릴 자리가 없습니다.
        항목 자체를 내리면(위 🗑) 이 줄도 오늘부터 안 뜹니다.
      </p>

      {may ? (
        <details className="bk-fold">
          <summary className="bk-foldhd">+ 항목</summary>
          <div className="bk-foldbd bk-form">
            <div className="bk-grid">
              <label><span className="lbl">영역</span>
                <select className="fld" value={add.area} onChange={(e) => setAdd({ ...add, area: e.target.value })}>
                  <option value="">— 고르세요 —</option>
                  {areas.map((a) => <option key={a} value={a}>{a}</option>)}
                </select></label>
              <label><span className="lbl">항목</span>
                <select className="fld" value={add.itemId} onChange={(e) => setAdd({ ...add, itemId: e.target.value })}>
                  <option value="">— 고르세요 —</option>
                  {items.filter((i) => i.state === "active").map((i) => (
                    <option key={i.id} value={i.id}>{i.name}</option>
                  ))}
                </select></label>
              <label><span className="lbl">자리</span>
                <select className="fld" value={add.place} onChange={(e) => setAdd({ ...add, place: e.target.value })}>
                  <option value="">— 고르세요 —</option>
                  {places.map((p) => <option key={p} value={p}>{nameOf("place", p)}</option>)}
                </select></label>
            </div>
            <label className="row">
              <input type="checkbox" checked={add.required}
                     onChange={(e) => setAdd({ ...add, required: e.target.checked })} />
              <span>꼭 해야 하는 줄</span>
            </label>
            <div className="row">
              <button type="button" className="btn btnmain" onClick={make}>만들기</button>
              <Msg text={addMsg} />
            </div>
          </div>
        </details>
      ) : <NoWrite table="area_routine" />}

      {groups.map((a) => (
        <details key={a} className="bk-fold">
          <summary className="bk-foldhd">
            <span>{a}</span><span className="num">{sorted(a).length}줄</span>
          </summary>
          <div className="bk-foldbd stack">
            {sorted(a).map((r) => (
              <ARow key={r.id} r={r} may={may} places={places} msg={msg[r.id]}
                    onMove={(d) => move(r, d)} onSave={(p, q) => save(r, p, q)} />
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}

function ARow({ r, may, places, msg, onMove, onSave }) {
  const [place, setPlace] = useState(r.place);
  const [req, setReq] = useState(r.required === true);
  return (
    <div className="stack">
      <div className="bk-line">
        <span className="num muted">{r.sort}</span>
        <span className="grow">{r.name}</span>
        <span className="chip">{nameOf("place", r.place)}</span>
        {r.required ? <span className="pill pillinfo">꼭</span> : null}
        {r.item_state !== "active"
          ? <span className="pill pilloff">항목이 내려져 있어 이 줄은 안 뜹니다</span> : null}
        <span className="bk-ops">
          <button type="button" className="bk-op" disabled={!may} onClick={() => onMove("up")} title="위로">▲</button>
          <button type="button" className="bk-op" disabled={!may} onClick={() => onMove("down")} title="아래로">▼</button>
        </span>
      </div>
      <details className="bk-fold">
        <summary className="bk-foldhd">✎ 고치기</summary>
        <div className="bk-foldbd bk-form">
          <div className="bk-grid">
            <label><span className="lbl">자리</span>
              <select className="fld" value={place} onChange={(e) => setPlace(e.target.value)}>
                {places.map((p) => <option key={p} value={p}>{nameOf("place", p)}</option>)}
              </select></label>
          </div>
          <label className="row">
            <input type="checkbox" checked={req} onChange={(e) => setReq(e.target.checked)} />
            <span>꼭 해야 하는 줄</span>
          </label>
          <div className="row">
            <button type="button" className="btn" disabled={!may} onClick={() => onSave(place, req)}>저장</button>
            <Msg text={msg} />
          </div>
        </div>
      </details>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
 * ⑤ 내신 대비 — 자료 종류
 * ══════════════════════════════════════════════════════════════════════ */

export function MaterialTypes({ rows, steps, stepNames, picks, can }) {
  const [list, setList] = useState(rows);
  const [add, setAdd] = useState({ name: "", steps: steps.join(" · ") });
  const [msg, setMsg] = useState({});
  const [addMsg, setAddMsg] = useState(null);
  const [, start] = useTransition();
  const may = canWrite(can, "material_type");
  const down = (picks.material_type?.state ?? []).find((s) => s !== "active") ?? null;

  function make() {
    setAddMsg(null);
    start(async () => {
      const r = await addMaterialType(add);
      if (r?.ok) { setList((l) => [...l, r.row]); setAdd({ ...add, name: "" }); }
      else setAddMsg(r?.msg ?? "못 만들었습니다");
    });
  }
  function flip(t) {
    if (!down) return;
    const to = t.state === "active" ? down : "active";
    start(async () => {
      const r = await setMaterialTypeState({ typeId: t.id, state: to });
      if (r?.ok) setList((l) => l.map((x) => (x.id === t.id ? { ...x, state: to } : x)));
      else setMsg((m) => ({ ...m, [t.id]: r?.msg ?? "못 바꿨습니다" }));
    });
  }

  return (
    <div className="stack">
      <p className="bk-why">
        <b>루틴은 교재가 아니라 「자료 종류」에 붙습니다</b> (2026-08-19 확정) —
        교재가 100권이어도 종류는 대여섯입니다. 정규 교재의 「영역 루틴」과 <b>같은 구조</b>입니다.
        {list.length === 0 ? (
          <> <br />⚠️ 지금 <b>자료 종류가 0개</b>라 내신 대비가 통째로 비어 있습니다.
          계획도 실측으로 그렇게 적어 두었습니다(「자료 종류 현재 0개」). 종류를 먼저 세워야 돕니다.</>
        ) : null}
      </p>
      {may ? (
        <details className="bk-fold">
          <summary className="bk-foldhd">+ 자료 종류</summary>
          <div className="bk-foldbd bk-form">
            <div className="bk-grid">
              <label><span className="lbl">이름</span>
                <input className="fld" value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} /></label>
              <label><span className="lbl">걸음 — 가운뎃점 · 으로 나눕니다</span>
                <input className="fld" value={add.steps} onChange={(e) => setAdd({ ...add, steps: e.target.value })} /></label>
            </div>
            <p className="bk-why">
              ⚠️ 걸음을 비우면 만들지 않습니다 — <code className="mono">lib/todo.js</code> 가
              「자료 종류에 걸음이 안 적혀 있습니다」로 세우고 <b>다섯 걸음을 지어내지 않습니다</b>.
              클래스카드는 인쇄가 없어 <b>네 걸음</b>입니다 (㉟).
            </p>
            <div className="row">
              <button type="button" className="btn btnmain" onClick={make}>만들기</button>
              <Msg text={addMsg} />
            </div>
          </div>
        </details>
      ) : <NoWrite table="material_type" />}

      {list.map((t) => (
        <div key={t.id} className="bk-line">
          <span className="grow">{t.name}</span>
          {/* ⚠️ **모르는 걸음도 안 버린다** — `lib/todo.js` 가 그렇게 한다. 이름이 없으면 값 그대로 */}
          <span className="chip">{(t.steps ?? []).map((x) => stepNames[x] ?? x).join(" › ")}</span>
          <span className="num muted">만든 자료 {t.made}장</span>
          {t.state !== "active" ? <span className="pill pilloff">{nameOf("material_type_state", t.state)}</span> : null}
          <span className="bk-ops">
            <button type="button" className="bk-op" disabled={!may || !down} onClick={() => flip(t)}
                    title={t.state === "active" ? "안 씀으로 내린다" : "되살린다"}>
              {t.state === "active" ? "🗑" : "↩"}
            </button>
          </span>
          <Msg text={msg[t.id]} />
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
 * ⑥ 영상
 * ══════════════════════════════════════════════════════════════════════ */

export function Videos({ rows, picks, can }) {
  const [list, setList] = useState(rows);
  const [add, setAdd] = useState({ title: "", url: "", folder: "", seconds: "" });
  const [msg, setMsg] = useState({});
  const [addMsg, setAddMsg] = useState(null);
  const [, start] = useTransition();
  const may = canWrite(can, "video");
  const down = (picks.video?.state ?? []).find((s) => s !== "active") ?? null;

  function make() {
    setAddMsg(null);
    start(async () => {
      const r = await addVideo(add);
      if (r?.ok) { setList((l) => [...l, r.row]); setAdd({ title: "", url: "", folder: "", seconds: "" }); }
      else setAddMsg(r?.msg ?? "못 만들었습니다");
    });
  }
  function flip(v) {
    if (!down) return;
    const to = v.state === "active" ? down : "active";
    start(async () => {
      const r = await saveVideo({ videoId: v.id, state: to });
      if (r?.ok) setList((l) => l.map((x) => (x.id === v.id ? { ...x, state: to } : x)));
      else setMsg((m) => ({ ...m, [v.id]: r?.msg ?? "못 바꿨습니다" }));
    });
  }

  return (
    <div className="stack">
      <p className="bk-why">
        영상은 <b>앱 안에서 봅니다 — 유튜브로 튕겨 나가지 않습니다.</b> 그리고
        「열었다 / 다 봤다고 눌렀다」가 아니라 <b>실제로 지나간 구간</b>을 셉니다 —
        끝까지 끌어다 놓고 「다 봤다」를 누르는 길을 막기 위해서입니다.
        <br />
        ⚠️ <b>그 셈이 아직 없습니다.</b> 지나간 구간(<code className="mono">v2.video_view.spans</code>)을
        합쳐 「몇 %」로 만드는 판단이 <code className="mono">lib/</code> 에 한 벌도 없습니다.
        화면에서 세면 그날부터 규칙이 두 벌이 되므로(원칙 1) <b>여기서는 안 셉니다.</b>
        지금 셀 수 있는 것은 <b>줄 수</b>뿐이라 그것만 보여 드립니다.
        <br />
        ⚠️ 그리고 이 숫자는 <b>대략치이지 아이를 판단할 숫자가 아닙니다.</b>
        <br />
        ⚠️ <b>배정(영상 × 학생 + 마감일) 표가 없습니다.</b> 그래서 「배정 대비 다 봄 / 보다 말았음 / 안 봄」의
        <b> 분모를 못 셉니다</b> — 지금 세는 것은 「본 적 있는 아이 수」뿐입니다.
        {list.length === 0 ? (
          <> <br />⚠️ 지금 <b>영상이 0줄</b>입니다. 아이가 넣어야 채워지는 것이 아니라
          <b> 원장님이 영상을 넣어야</b> 시작합니다.</>
        ) : null}
      </p>

      {may ? (
        <details className="bk-fold">
          <summary className="bk-foldhd">+ 영상</summary>
          <div className="bk-foldbd bk-form">
            <div className="bk-grid">
              <label><span className="lbl">제목</span>
                <input className="fld" value={add.title} onChange={(e) => setAdd({ ...add, title: e.target.value })} /></label>
              <label><span className="lbl">폴더</span>
                <input className="fld" value={add.folder} onChange={(e) => setAdd({ ...add, folder: e.target.value })} /></label>
              <label><span className="lbl">길이(초)</span>
                <input className="fld" inputMode="numeric" value={add.seconds}
                       onChange={(e) => setAdd({ ...add, seconds: e.target.value })} /></label>
            </div>
            <label><span className="lbl">주소</span>
              <input className="fld" value={add.url} onChange={(e) => setAdd({ ...add, url: e.target.value })} /></label>
            <div className="row">
              <button type="button" className="btn btnmain" onClick={make}>만들기</button>
              <Msg text={addMsg} />
            </div>
          </div>
        </details>
      ) : <NoWrite table="video" />}

      {list.map((v) => (
        <div key={v.id} className="bk-line">
          <span className="grow">{v.title}</span>
          {v.folder ? <span className="chip">{v.folder}</span> : null}
          <span className="num muted">{v.seconds ? `${v.seconds}초` : "길이 모름"}</span>
          <span className="num muted">본 아이 {v.viewers}명 · 다 봄 {v.done_n} · 보다 맒 {v.partial_n}</span>
          {v.state !== "active" ? <span className="pill pilloff">{nameOf("video_state", v.state)}</span> : null}
          <span className="bk-ops">
            <button type="button" className="bk-op" disabled={!may || !down} onClick={() => flip(v)}
                    title={v.state === "active" ? "안 씀으로 내린다" : "되살린다"}>
              {v.state === "active" ? "🗑" : "↩"}
            </button>
          </span>
          <Msg text={msg[v.id]} />
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
 * ⑦ 엑셀 왕복 — **미리보기가 핵심이다.** 바로 저장하지 않는다
 * ══════════════════════════════════════════════════════════════════════ */

export function Excel({ sheets, bookId }) {
  const [sheet, setSheet] = useState(sheets[0]?.key ?? "");
  const [pre, setPre] = useState(null);       // 미리보기 결과
  const [cmp, setCmp] = useState(null);       // 대조 결과
  const [done, setDone] = useState(null);     // 저장 결과
  const [msg, setMsg] = useState(null);
  const [create, setCreate] = useState(false);
  const [ownerOk, setOwnerOk] = useState(false);
  const [busy, start] = useTransition();
  const fileRef = useRef(null);

  const spec = sheets.find((s) => s.key === sheet) ?? null;

  function form(extra = {}) {
    const f = fileRef.current?.files?.[0];
    if (!f) return null;
    const fd = new FormData();
    fd.set("file", f);
    fd.set("sheet", sheet);
    for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    return fd;
  }

  function go(fn, set, extra = {}) {
    const fd = form(extra);
    setMsg(null);
    if (!fd) { setMsg("파일을 먼저 고르세요"); return; }
    set(null);
    start(async () => {
      const r = await fn(fd);
      if (r?.ok) set(r); else setMsg(r?.msg ?? "못 했습니다");
    });
  }

  function apply() {
    if (!pre) { setMsg("먼저 미리보기를 보세요 — 바로 저장하지 않습니다"); return; }
    go(excelApply, setDone, {
      create: create ? "1" : "0", ownerOk: ownerOk ? "1" : "0",
      seenAdd: String(pre.counts.add), seenChange: String(pre.counts.change),
      seenHold: String(pre.counts.hold), seenMissing: String(pre.missing),
    });
  }

  function undoRun(runId) {
    setMsg(null);
    start(async () => {
      const r = await excelUndo({ runId });
      if (r?.ok) setDone({ ...done, undone: r }); else setMsg(r?.msg ?? "못 되돌렸습니다");
    });
  }

  const dlUrl = `/books/excel?sheet=${encodeURIComponent(sheet)}${sheet === "units" && bookId ? `&b=${bookId}` : ""}`;

  return (
    <div className="bk-form">
      <div className="bk-grid">
        <label><span className="lbl">표</span>
          <select className="fld" value={sheet} onChange={(e) => { setSheet(e.target.value); setPre(null); setCmp(null); setDone(null); }}>
            {sheets.map((s) => <option key={s.key} value={s.key}>{s.title} — 주인 {s.owner}</option>)}
          </select></label>
        <label><span className="lbl">파일 (.xlsx)</span>
          <input className="fld" type="file" accept=".xlsx,.xls" ref={fileRef}
                 onChange={() => { setPre(null); setCmp(null); setDone(null); setMsg(null); }} /></label>
      </div>

      <div className="row">
        <a className="btn btnghost" href={dlUrl}>내려받기</a>
        <button type="button" className="btn" onClick={() => go(excelPreview, setPre)} disabled={busy}>미리보기</button>
        <button type="button" className="btn btnghost" onClick={() => go(excelCompare, setCmp)} disabled={busy}>대조만</button>
        <button type="button" className="btn btnmain" onClick={apply} disabled={busy || !pre}>이대로 저장</button>
        {busy ? <span className="chip">보내는 중</span> : null}
        <Msg text={msg} />
      </div>
      <p className="bk-why">
        <b>내려받은 파일을 고쳐서 그대로 올릴 수 있습니다</b> (규칙 1). 첫 칸이 <b>번호</b>이고,
        번호가 있으면 고치기 · 없으면 새로 만들기입니다 (규칙 2).
        <br />
        ⚠️ <b>빈 칸은 「지우라」가 아니라 「손대지 말라」입니다</b> (규칙 5). 값을 지우려면
        <b> 「(비움)」</b> 이라고 적어야 합니다.
        {spec?.owner !== "엑셀" ? (
          <> <br />⚠️ 이 표의 주인은 <b>「{spec?.owner}」</b>입니다 (확정 ⑤) — 엑셀은
          <b> 처음 채우기와 대량 수정</b>용입니다. 평소 한두 줄 고치는 일은 위 화면에서 합니다.
          {sheet === "units" ? <> 그리고 <b>한 교재의 단원은 한 곳에서만</b> 들어옵니다 —
          옛 앱에 그 교재 단원이 하나라도 있으면 이 파일은 <b>적재가 아니라 대조 기준</b>입니다.
          그래서 「대조만」이 있습니다.</> : null}</>
        ) : null}
      </p>

      {cmp ? (
        <div className="bk-pre">
          {`■ 대조만 — 앱 ${cmp.appRows}줄 · 파일 ${cmp.fileRows}줄\n` +
           `   파일에만 있는 줄 ${cmp.onlyInFile.length}개\n` +
           cmp.onlyInFile.slice(0, 20).map((x) => `     · ${x.at}줄 — ${x.what}`).join("\n") +
           (cmp.onlyInFile.length > 20 ? `\n     · … 그리고 ${cmp.onlyInFile.length - 20}줄 더` : "") +
           `\n   앱에만 있는 줄 ${cmp.onlyInApp.length}개\n` +
           cmp.onlyInApp.slice(0, 20).map((x) => `     · ${x}`).join("\n") +
           (cmp.onlyInApp.length > 20 ? `\n     · … 그리고 ${cmp.onlyInApp.length - 20}줄 더` : "") +
           `\n   ${cmp.note}`}
        </div>
      ) : null}

      {pre ? (
        <div className="stack">
          {/* ⚠️ 「몇 줄 생김 · 몇 줄 바뀜 · 몇 줄 손 안 댐 · 몇 줄 보류」와
              「파일에 없는 기존 줄 N개 — 손대지 않음」을 `lib/excel.js` 가 만든 줄 그대로 띄운다.
              여기서 다시 세면 두 벌이 된다 (원칙 1) */}
          <div className="bk-pre">{pre.lines.join("\n")}</div>
          {pre.counts.add > 0 ? (
            <label className="row">
              <input type="checkbox" checked={create} onChange={(e) => setCreate(e.target.checked)} />
              <span>새로 생길 {pre.counts.add}줄을 <b>만들자</b> — 안 누르면 안 만듭니다 (규칙 3)</span>
            </label>
          ) : null}
          {pre.ask ? (
            <label className="row">
              <input type="checkbox" checked={ownerOk} onChange={(e) => setOwnerOk(e.target.checked)} />
              <span>{pre.ask}</span>
            </label>
          ) : null}
        </div>
      ) : null}

      {done ? (
        <div className="stack">
          <div className="bk-pre">
            {`■ 저장했습니다 — 묶음 번호 ${done.runId}\n` +
             `   새로 만듦 ${done.added}줄 · 고침 ${done.changed}줄\n` +
             `   보류 ${done.held}줄 · 손 안 댐 ${done.untouched}줄\n` +
             `   파일에 없는 기존 줄 ${done.missing}개 — 손대지 않음\n` +
             (done.skipped?.length ? `   건너뜀: ${done.skipped.join(" · ")}\n` : "") +
             (done.undone ? `■ 되돌렸습니다 — 되돌린 줄 ${done.undone.back} · 내린 줄 ${done.undone.downed}` +
                            (done.undone.cannot?.length ? ` · 못 내린 줄 ${done.undone.cannot.length}` : "") +
                            (done.undone.note ? `\n   ${done.undone.note}` : "") : "")}
          </div>
          {!done.undone ? (
            <div className="row">
              <button type="button" className="btn btnghost" onClick={() => undoRun(done.runId)} disabled={busy}>
                이 묶음 되돌리기
              </button>
              <span className="muted">⚠️ 되돌리기도 <b>지우지 않습니다</b> — 새로 만든 줄은 상태로 내립니다</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { PRIORITY } from "@/app/todo/priority";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { updateTask, setTaskStatus, moveTasks, deleteTasks, applyTaskDelivery } from "./actions";
import { audienceLabel } from "@/lib/taskAudience";
import { addDays, dayLabel as fmtDay, todaySeoul } from "@/lib/day";
import { cleanNote, cleanTitle } from "@/lib/note";
import { CATEGORIES } from "./categories";

const CAT_CLS = {
  학사일정: "tag-sky",
  수업: "tag-lav",
  행정: "tag-muted",
  상담: "tag-amber",
  교재: "tag-mint",
  기타: "tag-muted",
};

function today() {
  return todaySeoul();
}
const dayLabel = fmtDay;

export default function TaskBoard({ tasks = [], classes = [], unavailable = false, linked = [] }) {
  const [sel, setSel] = useState(() => new Set());
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState({});
  const [filter, setFilter] = useState("open");
  const [cat, setCat] = useState("전체");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // 낙관 오버레이 (원장님 2026-08-21 「버튼이 작동이 너무 늦어」) — 서버 답 +
  // router.refresh 를 기다리면 태그·체크가 한 박자 늦게 바뀌었다. 방금 누른
  // 것만 덮어 그리고, 실패하면 되돌리고 alert.
  const [local, setLocal] = useState(() => new Map());   // id → 덮어 그릴 값들
  const putLocal = (ids, patch) =>
    setLocal((prev) => {
      const n = new Map(prev);
      ids.forEach((id) => n.set(id, { ...(n.get(id) || {}), ...patch }));
      return n;
    });
  const delLocal = (ids) =>
    setLocal((prev) => { const n = new Map(prev); ids.forEach((id) => n.delete(id)); return n; });

  const now = today();
  const week = addDays(now, 7);

  const view = tasks.map((t) => (local.has(t.id) ? { ...t, ...local.get(t.id) } : t));

  const shown = view.filter((t) => {
    if (cat !== "전체" && (t.category || "기타") !== cat) return false;
    if (filter === "open") return t.status === "open";
    if (filter === "today") return t.status === "open" && t.due_on <= now;
    if (filter === "week") return t.status === "open" && t.due_on > now && t.due_on <= week;
    if (filter === "late") return t.status === "open" && t.due_on < now;
    if (filter === "done") return t.status === "done";
    return true;
  });

  const counts = {
    open: view.filter((t) => t.status === "open").length,
    today: view.filter((t) => t.status === "open" && t.due_on <= now).length,
    late: view.filter((t) => t.status === "open" && t.due_on < now).length,
    done: view.filter((t) => t.status === "done").length,
  };

  const allChecked = shown.length > 0 && shown.every((t) => sel.has(t.id));
  function toggleAll() {
    if (allChecked) {
      const n = new Set(sel);
      shown.forEach((t) => n.delete(t.id));
      setSel(n);
    } else {
      setSel(new Set([...sel, ...shown.map((t) => t.id)]));
    }
  }
  function toggleOne(id) {
    const n = new Set(sel);
    n.has(id) ? n.delete(id) : n.add(id);
    setSel(n);
  }

  function run(fn, undo) {
    startTransition(async () => {
      const res = await fn();
      if (res?.error) {
        if (undo) undo();   // 실패 — 먼저 바꾼 화면을 되돌린다
        alert(res.error);
        return;
      }
      router.refresh();
    });
  }

  function startEdit(t) {
    setEditId(t.id);
    setDraft({
      title: t.title,
      kind: t.kind || "todo",
      category: t.category || "",
      due_on: t.due_on || now,
      start_time: (t.start_time || "").slice(0, 5),
      end_on: t.end_on || "",
      note: t.note || "",
      deliver_body: t.deliver_body || "",
      deliver_scope: t.deliver_scope || "",
      private: !!t.private,
      deliver_class_id: t.deliver_class_id || "",
      priority: t.priority ?? 0,
    });
  }

  const className = (id) => classes.find((c) => c.id === id)?.name || "";

  if (unavailable) {
    return (
      <div className="card" style={{ marginTop: 12 }}>
        <div className="notice">
          할일·일정을 쓰려면 Supabase에서 <b>0014 SQL</b>을 먼저 실행해주세요.
        </div>
      </div>
    );
  }

  return (
    <>
      {linked.length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <h2 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 800 }}>
            다른 화면에서 온 일정
          </h2>
          <p className="muted" style={{ margin: "0 0 10px", fontSize: 14 }}>
            시험 일정은 <b>학교 · 시험</b>, 휴강은 <b>회차 관리</b> 에서 관리합니다.
            여기서는 같이 보이기만 하고, 고치는 건 그쪽에서 합니다.
          </p>
          <div className="stack" style={{ gap: 4 }}>
            {linked.map((x) => (
              <div className="unitrow" key={x.key}>
                <span className={`tag ${x.source === "시험" ? "tag-amber" : "tag-muted"}`}>
                  {x.source}
                </span>
                <span className="hint" style={{ minWidth: 96 }}>
                  {x.from.slice(5)}
                  {x.to !== x.from ? ` ~ ${x.to.slice(5)}` : ""}
                </span>
                <b style={{ fontSize: 14, flex: 1 }}>{cleanTitle(x.title)}</b>
                <span className="hint">{x.extra}</span>
                <Link className="btn btn-ghost btn-sm" href={x.href}>바로가기</Link>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="row" style={{ gap: 4, marginTop: 12, alignItems: "center" }}>
        {[
          ["open", `할 것 ${counts.open}`],
          ["today", `오늘까지 ${counts.today}`],
          ["late", `지남 ${counts.late}`],
          ["week", "이번 주"],
          ["done", `끝냄 ${counts.done}`],
          ["all", `전체 ${tasks.length}`],
        ].map(([k, label]) => (
          <button
            key={k}
            className={`btn btn-sm ${filter === k ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setFilter(k)}
          >
            {label}
          </button>
        ))}
        <span className="spacer" />
        {["전체", ...CATEGORIES].map((c) => (
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

      {sel.size > 0 && (
        <div className="bulkbar">
          <b>{sel.size}개 선택</b>
          {/* 누르는 순간 줄이 바뀌고 선택이 풀린다 — 저장은 뒤에서 (2026-08-21) */}
          <button className="btn btn-ghost btn-sm" onClick={() => {
            const ids = [...sel];
            putLocal(ids, { status: "done" }); setSel(new Set());
            run(() => setTaskStatus(ids, "done"), () => delLocal(ids));
          }} disabled={pending}>끝냄</button>
          <button className="btn btn-ghost btn-sm" onClick={() => {
            const ids = [...sel];
            putLocal(ids, { status: "open" }); setSel(new Set());
            run(() => setTaskStatus(ids, "open"), () => delLocal(ids));
          }} disabled={pending}>다시 할 것</button>
          <button className="btn btn-ghost btn-sm" onClick={() => {
            const ids = [...sel];
            putLocal(ids, { due_on: now }); setSel(new Set());
            run(() => moveTasks(ids, now), () => delLocal(ids));
          }} disabled={pending}>오늘로</button>
          <button className="btn btn-ghost btn-sm" onClick={() => {
            const ids = [...sel];
            putLocal(ids, { due_on: addDays(now, 1) }); setSel(new Set());
            run(() => moveTasks(ids, addDays(now, 1)), () => delLocal(ids));
          }} disabled={pending}>내일로</button>
          <input
            className="input input-sm"
            type="date"
            style={{ width: 140 }}
            onChange={(e) => e.target.value && run(async () => {
              const r = await moveTasks([...sel], e.target.value);
              setSel(new Set());
              return r;
            })}
          />
          <button className="btn btn-ghost btn-sm" onClick={() => {
            if (!confirm(`${sel.size}개를 삭제할까요?`)) return;
            run(async () => {
              const r = await deleteTasks([...sel]);
              setSel(new Set());
              return r;
            });
          }} disabled={pending}>삭제</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setSel(new Set())}>선택 해제</button>
        </div>
      )}

      <div className="card" style={{ marginTop: 12, padding: 0, overflow: "hidden" }}>
        <div className="row" style={{ gap: 8, alignItems: "center", padding: "12px 16px" }}>
          <input type="checkbox" checked={allChecked} onChange={toggleAll} />
          <span className="hint">보이는 {shown.length}개 전체 선택</span>
        </div>

        {shown.length === 0 ? (
          <p className="muted" style={{ padding: "0 16px 16px", margin: 0, fontSize: 15 }}>
            해당하는 일이 없어요.
          </p>
        ) : (
          shown.map((t) => {
            const editing = editId === t.id;
            const late = t.status === "open" && t.due_on < now;
            return (
              <div className="stuRow" key={t.id}>
                <div className="row" style={{ gap: 8, alignItems: "center", padding: "10px 16px" }}>
                  <input type="checkbox" checked={sel.has(t.id)} onChange={() => toggleOne(t.id)} />
                  <input
                    type="checkbox"
                    checked={t.status === "done"}
                    title="끝냄"
                    onChange={(e) => {
                      // 누르는 순간 체크부터 — 서버 답을 기다리면 체크가 한 박자 늦는다 (2026-08-21)
                      const to = e.target.checked ? "done" : "open";
                      putLocal([t.id], { status: to });
                      run(() => setTaskStatus([t.id], to), () => delLocal([t.id]));
                    }}
                  />
                  <span className={`tag ${late ? "tag-amber" : "tag-muted"}`} style={{ minWidth: 66, textAlign: "center" }}>
                    {dayLabel(t.due_on)}
                  </span>
                  {/* 방학·시험기간처럼 여러 날 이어지는 것은 한 줄이다. 언제까지인지 같이 적는다 */}
                  {t.end_on && t.end_on !== t.due_on && (
                    <span className="tag tag-sky" style={{ minWidth: 66, textAlign: "center" }}>
                      ~ {dayLabel(t.end_on)}
                    </span>
                  )}
                  {t.start_time && <span className="hint">{t.start_time.slice(0, 5)}</span>}
                  <b
                    style={{
                      fontSize: 15,
                      textDecoration: t.status === "done" ? "line-through" : "none",
                      opacity: t.status === "done" ? 0.6 : 1,
                    }}
                  >
                    {cleanTitle(t.title)}
                  </b>
                  {t.category && (
                    <span className={`tag ${CAT_CLS[t.category] || "tag-muted"}`}>{t.category}</span>
                  )}
                  {t.kind === "schedule" && <span className="tag tag-sky">일정</span>}
                  {/* **누가 보나** — 규칙이 뒤집혀서(안 적으면 안 보임) 이것이
                      한눈에 보여야 한다. 안 그러면 「올렸는데 왜 모르지」 가 된다.
                      나만 보기(0066)는 그 위에 덮는 자물쇠다 — 켜면 무조건 안 보인다. */}
                  {/* **누가 보나** — 규칙이 뒤집혀서(안 고르면 안 보임) 이것이
                      한눈에 보여야 한다. 비공개도 여기 같이 뜬다 — 자물쇠를
                      따로 두지 않는다 (원장님: 「비공개는 따로 만들지마」).
                      누르면 전체 ↔ 비공개 로 바로 바뀐다. 그 둘이 제일 잦다. */}
                  {t.kind === "schedule" && (() => {
                    const a = audienceLabel(t);
                    const hidden = a.text === "비공개";
                    return (
                      <button
                        className={`tag ${a.tone}`}
                        style={{ border: 0, cursor: "pointer" }}
                        title={
                          hidden
                            ? "비공개입니다 — 선생님만 봅니다. 누르면 전체에 보입니다"
                            : `${a.text} 의 달력에 뜹니다. 누르면 비공개로 바뀝니다`
                        }
                        disabled={pending}
                        onClick={() => {
                          // 누르는 순간 태그가 바뀐다 — 저장은 뒤에서 (2026-08-21)
                          const patch = hidden
                            ? { private: false, deliver_scope: "all" }
                            : { private: true, deliver_scope: "" };
                          putLocal([t.id], patch);
                          run(() => updateTask(t.id, patch), () => delLocal([t.id]));
                        }}
                      >
                        {a.text}
                      </button>
                    );
                  })()}
                  {t.class_id && <span className="tag tag-muted">{className(t.class_id)}</span>}
                  <span className="spacer" />
                  {t.deliver_body && (
                    <>
                      <span className={`tag ${t.deliveredOn ? "tag-mint" : "tag-lav"}`}>
                        {t.deliveredOn ? "전달사항 만듦" : "전달사항 있음"}
                      </span>
                      {!t.deliveredOn && (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => {
                            // 누르는 순간 「전달사항 만듦」 으로 — 저장은 뒤에서 (2026-08-21)
                            putLocal([t.id], { deliveredOn: t.due_on });
                            run(() => applyTaskDelivery(t.id, t.due_on), () => delLocal([t.id]));
                          }}
                          disabled={pending}
                        >
                          전달사항 만들기
                        </button>
                      )}
                    </>
                  )}
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => (editing ? setEditId(null) : startEdit(t))}
                  >
                    {editing ? "닫기" : "수정"}
                  </button>
                </div>

                {!editing && (cleanNote(t.note) || t.deliver_body) && (
                  <div style={{ padding: "0 16px 10px 62px" }}>
                    {cleanNote(t.note) && <div className="hint">{cleanNote(t.note)}</div>}
                    {t.deliver_body && (
                      <div className="hint">
                        <b>학생 전달:</b> {t.deliver_body}
                      </div>
                    )}
                  </div>
                )}

                {editing && (
                  <div className="stuPanel">
                    <div className="editgrid">
                      <div className="field" style={{ gridColumn: "span 2" }}>
                        <label className="label">이름</label>
                        <input className="input input-sm" value={draft.title}
                          onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
                      </div>
                      <div className="field">
                        <label className="label">종류</label>
                        <select className="input input-sm" value={draft.kind}
                          onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
                          <option value="todo">할일</option>
                          <option value="schedule">일정</option>
                        </select>
                      </div>
                      <div className="field">
                        <label className="label">분류</label>
                        <select className="input input-sm" value={draft.category}
                          onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
                          <option value="">—</option>
                          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div className="field">
                        <label className="label">날짜</label>
                        <input className="input input-sm" type="date" value={draft.due_on}
                          onChange={(e) => setDraft({ ...draft, due_on: e.target.value })} />
                      </div>
                      <div className="field">
                        <label className="label">시간</label>
                        <input className="input input-sm" type="time" value={draft.start_time}
                          onChange={(e) => setDraft({ ...draft, start_time: e.target.value })} />
                      </div>
                      <div className="field">
                        <label className="label">중요도</label>
                        {/* 달력 점·막대 색 — 급함 빨강 · 중요 노랑 (2026-08-15) */}
                        <select className="input input-sm" value={draft.priority}
                          onChange={(e) => setDraft({ ...draft, priority: e.target.value })}>
                          {PRIORITY.map((p2) => <option key={p2.v} value={p2.v}>{p2.label}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="field" style={{ marginTop: 8 }}>
                      <label className="label">메모</label>
                      <input className="input input-sm" value={draft.note}
                        onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
                    </div>
                    <div className="field" style={{ marginTop: 8 }}>
                      <label className="label">학생에게 전달할 내용 (비우면 만들지 않아요)</label>
                      <input className="input input-sm" value={draft.deliver_body}
                        placeholder="예) 다음 주 월요일은 학교 행사로 6시 시작"
                        onChange={(e) => setDraft({ ...draft, deliver_body: e.target.value })} />
                    </div>
                    {/* **누가 보나** — 안 고르면 아무에게도 안 보인다 (2026-08-06).
                        전에는 전달할 내용을 적어야만 이 칸이 나왔다. 그래서
                        달력에 보일지와 전달사항을 보낼지가 뒤엉켜 있었다. */}
                    <div className="row" style={{ gap: 6, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <b style={{ fontSize: 14 }}>누가 보나</b>
                        <select className="input input-sm" style={{ width: 170 }}
                          value={draft.private ? "" : draft.deliver_scope}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              deliver_scope: e.target.value,
                              // 비공개를 고르면 자물쇠가 켜진다 — 따로 누를 것이 없다
                              private: e.target.value === "",
                            })
                          }>
                          <option value="">비공개 — 나만 봄</option>
                          <option value="all">전체 — 재원생·학부모 모두</option>
                          <option value="class">반별</option>
                          <option value="grade">학교·학년별</option>
                          <option value="student">학생 고르기</option>
                        </select>
                        {draft.deliver_scope === "class" && (
                          <select className="input input-sm" style={{ width: 170 }} value={draft.deliver_class_id}
                            onChange={(e) => setDraft({ ...draft, deliver_class_id: e.target.value })}>
                            <option value="">반 선택</option>
                            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        )}
                        <span className="hint">
                          {draft.private || !draft.deliver_scope
                            ? "선생님만 봅니다"
                            : "고른 사람의 달력에 뜹니다"}
                        </span>
                        {draft.deliver_scope === "student" && (
                          <span className="hint">
                            학생 고르기는 <b>재원생 정보 → 일정</b> 에서 합니다
                          </span>
                        )}
                      </div>
                    <div className="row" style={{ gap: 6, marginTop: 10 }}>
                      <button className="btn btn-primary btn-sm" disabled={pending}
                        onClick={() => run(async () => {
                          const r = await updateTask(t.id, draft);
                          setEditId(null);
                          return r;
                        })}>저장</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditId(null)}>취소</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

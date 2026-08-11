"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setTodoStatus, setTodoStarted, moveTodos } from "./actions";
import { addDays, dayLabel as fmtDay, todaySeoul } from "@/lib/day";
// 칸 나누기와 차례는 lib 에 있다 — 화면 안에 두면 검사를 못 한다
import { split } from "@/lib/kanban";
// 중요도 이름·빛깔은 목록 화면과 한 벌이어야 한다
import { PRIORITY } from "./priority";

/**
 * **할일 칸반** — 할 것 · 하는 중 · 끝냄.
 *
 * 원장님 (2026-08-09) — academy-video 벤치마킹
 *   「할일 / 진행중 / 완료 3컬럼 드래그 + 체크박스 완료」
 *
 * ── 그대로 베끼면 안 되는 까닭 ──────────────────────────
 *
 * 저쪽 앱은 할일을 **손으로만** 넣는다. 우리는 다르다 —
 *   · 할일이 스무 개가 넘는다 (원장님 확인, 2026-08-09)
 *   · **반복 루틴이 매일 자동으로 만들어 넣는다** (RoutineBox)
 *
 * 그래서 3컬럼을 곧이곧대로 세우면 「할 것」 칸이 스무 장 넘게 쌓이고,
 * 칸 안에 스크롤이 생긴다. **스크롤 생긴 칸반은 목록보다 나쁘다** —
 * 목록은 적어도 한눈에 훑기라도 되는데, 칸반은 좁은 칸에 갇힌 목록이다.
 *
 * 칸반이 값을 하는 건 **한 화면에 다 보일 때**다. 그래서 「할 것」 칸에는
 * 마감이 코앞인 것만 올리고, 나머지는 아래에 접어둔다. 접힌 것은 숨긴
 * 것이 아니라 **몇 개인지 늘 적어둔다** — 숨긴 줄 모르면 그게 제일 나쁘다.
 *
 * ── 옮기는 법이 둘인 까닭 ──────────────────────────────
 *
 * 끌어놓기(drag)는 폰에서 안 된다. 브라우저의 끌어놓기는 마우스 것이라
 * 손가락으로는 화면만 스크롤된다. 원장님은 폰으로 더 자주 보신다.
 * 그래서 카드마다 **단추도 같이** 둔다 — PC 는 끌어서, 폰은 눌러서.
 *
 * ── 「하는 중」 은 status 가 아니다 ─────────────────────
 *
 * 0113 참고. 하는 중도 status 는 `open` 이라 메뉴 배지도 달력도 계속 센다.
 * 시작했다고 일이 없어지지는 않는다.
 */


export default function TodoKanban({
  todos = [],
  categories = [],
  catId = "",
  started = true,   // 0113 이 돌았는가 — 아니면 두 칸으로 선다
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const [openLater, setOpenLater] = useState(false);
  const [over, setOver] = useState("");     // 지금 끌어다 댄 칸
  const catById = new Map(categories.map((c) => [c.id, c]));

  const now = todaySeoul();
  const week = addDays(now, 7);

  const { doing, todo, later, doneToday, doneAll } =
    split({ todos, catId, now, week, started });
  const mine = todos.filter((t) => !catId || t.todo_category_id === catId);

  const run = (fn) => {
    setMsg("");
    start(async () => {
      const r = await fn();
      if (r?.error) return setMsg(r.error);
      router.refresh();
    });
  };

  /** 어느 칸으로 옮기든 여기 한 곳을 지난다 — 끌어놓기와 단추가 같은 길을 쓴다 */
  const moveTo = (t, col) => {
    if (col === "todo") {
      if (t.status === "done") return run(() => setTodoStatus([t.id], "open"));
      if (t.started_at) return run(() => setTodoStarted([t.id], false));
      return;
    }
    if (col === "doing") {
      if (t.status === "done") {
        return run(async () => {
          const a = await setTodoStatus([t.id], "open");
          if (a?.error) return a;
          return setTodoStarted([t.id], true);
        });
      }
      if (!t.started_at) return run(() => setTodoStarted([t.id], true));
      return;
    }
    if (col === "done" && t.status !== "done") return run(() => setTodoStatus([t.id], "done"));
  };

  const onDrop = (e, col) => {
    e.preventDefault();
    setOver("");
    const id = e.dataTransfer.getData("text/plain");
    const t = mine.find((x) => x.id === id);
    if (t) moveTo(t, col);
  };

  function Card({ t, col }) {
    const late = t.status === "open" && !t.no_due && t.due_on < now;
    const cat = catById.get(t.todo_category_id);
    const pr = PRIORITY.find((p) => p.v === t.priority) || PRIORITY[0];
    return (
      <div
        className="kbcard"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", t.id);
          e.dataTransfer.effectAllowed = "move";
        }}
      >
        <div className="row" style={{ gap: 5, alignItems: "baseline", flexWrap: "wrap" }}>
          {t.no_due ? (
            <span className="tag tag-muted">마감 없음</span>
          ) : (
            <span className={`tag ${late ? "tag-amber" : "tag-muted"}`}>{fmtDay(t.due_on)}</span>
          )}
          {t.priority > 0 && <span className={`tag ${pr.cls}`}>{pr.label}</span>}
          {cat && <span className={`tag tag-${cat.color || "muted"}`}>{cat.name}</span>}
          {/* 루틴이 만든 것 — 저쪽 앱에는 없는 갈래라 티를 내야 한다 */}
          {t.auto_key && <span className="tag tag-muted" title="앱이 만든 할일입니다">자동</span>}
          {/* 하위목록 진행 — 체크는 목록 화면에서 (칸반은 카드가 작아 자리가 없다) */}
          {t.checklist && (() => {
            const n = t.checklist.split("\n").filter(Boolean).length;
            const doneN = (t.checklist_done || []).length;
            return <span className="tag tag-muted">{doneN}/{n}</span>;
          })()}
        </div>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            marginTop: 4,
            textDecoration: col === "done" ? "line-through" : "none",
            opacity: col === "done" ? 0.6 : 1,
          }}
        >
          {t.title}
        </div>
        {t.note && <div className="hint" style={{ fontSize: 11.5, marginTop: 2 }}>{t.note}</div>}

        {/* **폰에서는 끌어놓기가 안 된다** — 그래서 단추도 같이 둔다 */}
        <div className="row" style={{ gap: 4, marginTop: 6 }}>
          {col !== "todo" && (
            <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => moveTo(t, "todo")}>
              ← 할 것
            </button>
          )}
          {started && col !== "doing" && (
            <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => moveTo(t, "doing")}>
              {col === "done" ? "← 하는 중" : "하는 중 →"}
            </button>
          )}
          {col !== "done" && (
            <button className="btn btn-sm" disabled={pending} onClick={() => moveTo(t, "done")}>
              끝냄 →
            </button>
          )}
          {col === "todo" && !t.no_due && t.due_on <= now && (
            // 오늘 못 하겠다 — 제일 자주 하는 일이라 한 번에 되어야 한다
            <button
              className="btn btn-ghost btn-sm"
              disabled={pending}
              title="마감을 내일로 미룹니다"
              onClick={() => run(() => moveTodos([t.id], addDays(now, 1)))}
            >
              내일로
            </button>
          )}
        </div>
      </div>
    );
  }

  function Col({ id, title, count, children, foot }) {
    return (
      <div
        className={`kbcol${over === id ? " over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setOver(id); }}
        onDragLeave={() => setOver((v) => (v === id ? "" : v))}
        onDrop={(e) => onDrop(e, id)}
      >
        <div className="kbhead">
          <b style={{ fontSize: 12.5 }}>{title}</b>
          <span className="tag tag-muted">{count}</span>
        </div>
        <div className="kbbody">{children}</div>
        {foot}
      </div>
    );
  }

  return (
    <div style={{ marginTop: 10 }}>
      {msg && <div className="notice" style={{ marginBottom: 8 }}>{msg}</div>}
      {!started && (
        <div className="notice" style={{ marginBottom: 8 }}>
          설정 → 관리자 → Supabase SQL 에서 <b>0113</b> 을 실행하시면 <b>하는 중</b> 칸이 생깁니다.
        </div>
      )}

      <div className="kanban">
        <Col
          id="todo"
          title="할 것"
          /**
           * **머릿수는 보이는 것을 센다.** 「17」 이라 적어놓고 아홉 장만
           * 보이면 여덟 장이 어디 갔는지 알 수가 없다. 접힌 것은 아래
           * 「나중 것 N개」 에 따로 적는다 — 세는 자리와 보이는 자리가
           * 다르면 그건 늘 틀린 화면이다.
           */
          count={openLater ? todo.length + later.length : todo.length}
          foot={
            later.length > 0 && (
              <button
                className="btn btn-ghost btn-sm"
                style={{ margin: "0 8px 8px" }}
                onClick={() => setOpenLater((v) => !v)}
              >
                {openLater ? "나중 것 접기" : `나중 것 ${later.length}개 펴기`}
              </button>
            )
          }
        >
          {todo.length === 0 && later.length === 0 && (
            <p className="muted" style={{ fontSize: 12.5, padding: 8, margin: 0 }}>비었습니다.</p>
          )}
          {todo.map((t) => <Card key={t.id} t={t} col="todo" />)}
          {openLater && later.map((t) => <Card key={t.id} t={t} col="todo" />)}
        </Col>

        {started && (
          <Col id="doing" title="하는 중" count={doing.length}>
            {doing.length === 0 && (
              <p className="muted" style={{ fontSize: 12.5, padding: 8, margin: 0 }}>
                손댄 일을 여기로 옮기세요.
              </p>
            )}
            {doing.map((t) => <Card key={t.id} t={t} col="doing" />)}
          </Col>
        )}

        <Col
          id="done"
          title="끝냄 (오늘)"
          count={doneToday.length}
          foot={
            doneAll > doneToday.length && (
              <p className="hint" style={{ fontSize: 11.5, padding: "0 8px 8px", margin: 0 }}>
                그전에 끝낸 {doneAll - doneToday.length}개는 목록의 「끝냄」 에 있습니다.
              </p>
            )
          }
        >
          {doneToday.length === 0 && (
            <p className="muted" style={{ fontSize: 12.5, padding: 8, margin: 0 }}>아직 없습니다.</p>
          )}
          {doneToday.map((t) => <Card key={t.id} t={t} col="done" />)}
        </Col>
      </div>
    </div>
  );
}

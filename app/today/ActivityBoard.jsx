"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { STATES, PICKABLE, stateOf, canTalk, agoLabel, isStale } from "@/lib/activity";

/**
 * **지금 누가 뭘 하고 있나** — 새로고침 없이 바로 바뀐다.
 *
 * 원장님 (2026-08-05) — 「시험 볼 때 얘기하려고 했더니, 다른 학생 설명 중일 때
 * 끼어들어서 말해」. 한 반에 여럿이 각자 다른 것을 하고 있으니, 말 걸기 전에
 * 한 번 보고 가시라는 자리다.
 *
 * 실시간은 **Postgres 의 변경 알림**을 그대로 받는다. 몇 초마다 물어보는
 * 방식은 안 쓴다 — 수업 내내 도는 것이라 배터리와 통신을 계속 먹는다.
 * 태블릿과 폰을 같이 쓰셔도 둘 다 같은 순간에 바뀐다.
 *
 * @param students [{ id, name }] 오늘 오는 학생
 * @param initial  [{ student_id, state, note, updated_at }] 서버가 읽어둔 지금 상태
 */
export default function ActivityBoard({ students = [], initial = [], date, unavailable = false }) {
  const [rows, setRows] = useState(() => {
    const m = new Map();
    initial.forEach((r) => m.set(r.student_id, r));
    return m;
  });
  const [now, setNow] = useState(() => Date.now());
  const [live, setLive] = useState(unavailable ? "off" : "…");
  const [pick, setPick] = useState(null);      // 상태를 고르는 중인 학생

  // 「3분 전」 이 저절로 늘어나게 — 화면을 안 건드려도 시간은 간다
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (unavailable) return;
    const supabase = createClient();
    const ch = supabase
      .channel("student-activity")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "student_activity" },
        (payload) => {
          const r = payload.new?.student_id ? payload.new : payload.old;
          if (!r?.student_id) return;
          setRows((prev) => {
            const next = new Map(prev);
            if (payload.eventType === "DELETE") next.delete(r.student_id);
            else next.set(r.student_id, r);
            return next;
          });
        }
      )
      .subscribe((status) => {
        // **연결됐는지 보여준다.** 조용히 안 오면 「안 바뀐다」 로만 보인다
        setLive(status === "SUBSCRIBED" ? "on" : status === "CLOSED" ? "off" : "…");
      });
    return () => { supabase.removeChannel(ch); };
  }, [unavailable]);

  async function setState(studentId, state) {
    setPick(null);
    // 먼저 화면부터 바꾼다 — 누르고 나서 기다리게 하면 두 번 누르시게 된다
    setRows((prev) => {
      const next = new Map(prev);
      if (state === "idle") next.delete(studentId);
      else next.set(studentId, { student_id: studentId, state, updated_at: new Date().toISOString() });
      return next;
    });
    const supabase = createClient();
    if (state === "idle") {
      await supabase.from("student_activity").delete().eq("student_id", studentId);
      return;
    }
    await supabase.from("student_activity").upsert(
      { student_id: studentId, date, state, updated_at: new Date().toISOString() },
      { onConflict: "student_id" }
    );
  }

  if (students.length === 0) return null;

  // 말 걸어도 되는 아이를 앞에 — 지금 궁금한 것은 그것이다
  const list = students.map((s) => {
    const r = rows.get(s.id);
    const st = stateOf(r?.state);
    return { ...s, row: r, st, ok: canTalk(r?.state), stale: isStale(r?.updated_at, 40, now) };
  });
  const busy = list.filter((x) => !x.ok && !x.stale);

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="row" style={{ gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        <b style={{ fontSize: 14 }}>지금 뭐 하는 중</b>
        {busy.length > 0
          ? <span className="tag tag-amber">말 걸지 말 것 {busy.length}명</span>
          : <span className="tag tag-mint">지금은 다 괜찮아요</span>}
        <span className="spacer" />
        {/* 실시간이 붙었나 — 안 붙었으면 그것부터 알아야 한다 */}
        <span className="hint" style={{ fontSize: 11.5 }}>
          {unavailable ? "0084 SQL 을 먼저 실행해주세요"
            : live === "on" ? "● 실시간"
            : live === "off" ? "○ 실시간 끊김 — 새로고침 해주세요"
            : "○ 연결 중…"}
        </span>
      </div>
      <p className="hint" style={{ margin: "4px 0 8px" }}>
        누르면 바꿉니다. 다른 기기에서도 <b>새로고침 없이</b> 같이 바뀝니다.
      </p>

      <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
        {list.map((x) => (
          <div key={x.id} style={{ position: "relative" }}>
            <button
              className={`btn btn-sm ${x.ok ? "btn-ghost" : ""}`}
              style={
                x.ok
                  ? undefined
                  : { borderColor: "var(--red)", color: "var(--red)", fontWeight: 700 }
              }
              onClick={() => setPick(pick === x.id ? null : x.id)}
              disabled={unavailable}
            >
              {x.name}
              {x.row && (
                <>
                  {" "}
                  <span className={`tag ${x.st.cls}`} style={{ fontSize: 10.5, opacity: x.stale ? 0.5 : 1 }}>
                    {x.st.short}
                  </span>{" "}
                  <span className="muted" style={{ fontSize: 10.5 }}>
                    {agoLabel(x.row.updated_at, now)}
                    {x.stale && " · 오래됨"}
                  </span>
                </>
              )}
            </button>

            {pick === x.id && (
              <div
                className="card card-tight"
                style={{ position: "absolute", zIndex: 30, top: "100%", left: 0, marginTop: 4, minWidth: 148 }}
              >
                <div className="stack" style={{ gap: 3 }}>
                  {PICKABLE.map((s) => (
                    <button
                      key={s.key}
                      className={`btn btn-sm ${x.row?.state === s.key ? "btn-primary" : "btn-ghost"}`}
                      onClick={() => setState(x.id, s.key)}
                    >
                      {s.label}
                    </button>
                  ))}
                  <button className="btn btn-ghost btn-sm" onClick={() => setState(x.id, "idle")}>
                    지우기
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

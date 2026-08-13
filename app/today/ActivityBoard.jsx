"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { agoLabel, isCalling } from "@/lib/activity";
import PushToggle from "@/app/me/PushToggle";
import { resolveCall, resolveAllCalls } from "./callActions";

/**
 * **지금 누가 어디까지 했나** — 새로고침 없이 바로 바뀐다.
 *
 * 원장님 (2026-08-05)
 *   「시험 볼 때 얘기하려고 했더니, 다른 학생 설명 중일 때 끼어들어서 말해」
 *   「내가 바꾸는 게 아니고, 학생이 자기가 뭘 다 했는지 누르면 나한테 보이는 걸」
 *
 * 그래서 **아이가 이미 누르고 있는 것**만 읽는다. 손으로 상태를 골라 넣는
 * 자리를 만들면 그것부터 일이 된다.
 *   · 학습을 시작하면 타이머가 돈다  → 「○○ 하는 중」
 *   · 다 하면 「다 했어요」 를 누른다 → 3/5
 *   · 도움이 필요하면 부른다          → 맨 위로
 *
 * 세는 일은 **서버가 늘 세던 대로** 한다. 실시간 알림이 오면 다시 세게만
 * 한다(router.refresh) — 여기서 또 세면 두 군데가 되고, 두 군데는 어긋난다.
 */
export default function ActivityBoard({ rows = [], calls = [], unavailable = false }) {
  const [now, setNow] = useState(() => Date.now());
  const [live, setLive] = useState(unavailable ? "off" : "…");
  const [busy, setBusy] = useState("");
  const router = useRouter();
  const timer = useRef(null);

  /** 가봤다 — 부르는 중을 지운다. 하나든 여럿이든 */
  async function done(idOrIds) {
    const many = Array.isArray(idOrIds);
    setBusy(many ? "all" : idOrIds);
    const res = many ? await resolveAllCalls(idOrIds) : await resolveCall(idOrIds);
    setBusy("");
    if (res?.error) { alert(res.error); return; }
    // 실시간 알림도 오지만, 안 오는 자리(끊김)에서도 바로 사라져야 한다
    router.refresh();
  }

  // 「3분 전」 이 저절로 늘어나게 — 화면을 안 건드려도 시간은 간다
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (unavailable) return;
    const supabase = createClient();
    // 여러 아이가 한꺼번에 누르면 알림도 한꺼번에 온다. 그때마다 다시 그리면
    // 화면이 떨린다 — 잠깐 모아서 한 번만 다시 센다
    const bump = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 400);
    };
    const ch = supabase
      .channel("today-activity")
      .on("postgres_changes", { event: "*", schema: "public", table: "daily_report_items" }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "study_sessions" }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "student_activity" }, bump)
      .subscribe((status) => {
        // **연결됐는지 보여준다.** 조용히 안 오면 「안 바뀐다」 로만 보인다
        setLive(status === "SUBSCRIBED" ? "on" : status === "CLOSED" ? "off" : "…");
      });
    return () => { clearTimeout(timer.current); supabase.removeChannel(ch); };
  }, [unavailable, router]);

  if (rows.length === 0) return null;

  const callMap = new Map(calls.map((c) => [c.student_id, c]));
  const calling = rows
    .filter((r) => isCalling(callMap.get(r.id)?.state))
    .map((r) => ({ ...r, at: callMap.get(r.id)?.updated_at }))
    // 오래 기다린 아이가 먼저다
    .sort((a, b) => (a.at || "").localeCompare(b.at || ""));

  const doing = rows.filter((r) => r.doing);
  const finished = rows.filter((r) => r.total > 0 && r.done >= r.total);

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="row" style={{ gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        <b style={{ fontSize: 15 }}>현황판</b>
        {calling.length > 0 && (
          <span className="tag tag-red" style={{ fontWeight: 800 }}>🙋 부르는 중 {calling.length}</span>
        )}
        {doing.length > 0 && <span className="tag tag-sky">하는 중 {doing.length}</span>}
        {finished.length > 0 && <span className="tag tag-mint">끝 {finished.length}</span>}
        <span className="spacer" />
        <span className="hint" style={{ fontSize: 12.5 }}>
          {unavailable ? "0034 SQL 을 먼저 실행해주세요"
            : live === "on" ? "● 실시간"
            : live === "off" ? "○ 실시간 끊김 — 새로고침 해주세요"
            : "○ 연결 중…"}
        </span>
      </div>
      <p className="hint" style={{ margin: "4px 0 8px" }}>
        학생이 자기 화면에서 <b>「다 했어요」</b>를 누르면 여기 바로 반영됩니다.
        선생님이 따로 누르실 것은 없습니다.
      </p>

      {/* **알림 받기 — 워치까지 가려면 여기서 켜야 한다.**
          워치는 따로 붙이는 것이 없다. 폰에 온 알림을 워치가 그대로 보여준다.
          그래서 폰(홈 화면에 담아둔 앱)에서 이걸 켜두는 것이 전부다.
          이 자리에 두는 까닭 — 알림을 켜고 싶어지는 순간이 바로 여기다. */}
      <details style={{ marginBottom: 8 }}>
        <summary className="hint" style={{ cursor: "pointer", fontSize: 13 }}>
          이 기기로 알림 받기 (워치에도 같이 뜹니다)
        </summary>
        <div style={{ marginTop: 6 }}>
          <PushToggle />
          <p className="hint" style={{ margin: "6px 0 0", fontSize: 12.5 }}>
            아이가 <b>부르면</b>, 그리고 <b>등원 학습을 끝내면</b> 알립니다.
            <b> 숙제는 안 보냅니다</b> — 집에서 하는 것이라 밤에 울립니다.
            <br />
            아이폰은 <b>홈 화면에 담아둔 앱</b>에서 켜야 알림이 옵니다 (사파리 탭에서는 안 옵니다).
          </p>
        </div>
      </details>

      {/**
        * 부른 아이는 위에 따로 — 스무 명 사이에서 찾게 하면 안 된다.
        *
        * **가봤으면 지운다** (원장님, 2026-08-07 — 「부르는 중을 해결했을 때
        * 완료 처리해서 없애고 싶어」). 아이는 선생님이 오시면 그걸로 끝난
        * 것이라 폰을 다시 안 본다. 그러면 다음에 정말 부른 아이가 그 사이에
        * 묻히고, 기다리는 사람 수도 거짓말이 된다.
        *
        * 이름 옆에 바로 둔다 — 누구 것을 지우는지 헷갈릴 자리가 없다.
        */}
      {calling.length > 0 && (
        <div className="notice" style={{ marginBottom: 8 }}>
          <div className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <b>도움이 필요하대요</b>
            {calling.map((x) => (
              <span key={x.id} className="row" style={{ gap: 4, alignItems: "center" }}>
                <b>{x.name}</b>
                <span className="muted">({agoLabel(x.at, now)})</span>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => done(x.id)}
                  disabled={busy === x.id}
                  title={`${x.name} 학생 — 가봤으면 누르세요`}
                >
                  {busy === x.id ? "…" : "완료"}
                </button>
              </span>
            ))}
            {calling.length > 1 && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => done(calling.map((x) => x.id))}
                disabled={busy === "all"}
              >
                {busy === "all" ? "…" : "전부 완료"}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
        {rows.map((r) => {
          const call = isCalling(callMap.get(r.id)?.state);
          const allDone = r.total > 0 && r.done >= r.total;
          return (
            <span
              key={r.id}
              className={`tag ${call ? "tag-red" : allDone ? "tag-mint" : r.doing ? "tag-sky" : "tag-muted"}`}
              style={{ fontSize: 13, padding: "5px 9px", ...(call ? { fontWeight: 800 } : {}) }}
              title={r.doing ? `${r.doing.item} 하는 중` : ""}
            >
              {call && "🙋 "}
              <b>{r.name}</b>
              {r.total > 0 && ` ${r.done}/${r.total}`}
              {/* **지금 뭘 하고 있나** — 타이머가 도는 것이 그것이다 */}
              {r.doing && (
                <span style={{ opacity: 0.8 }}>
                  {" · "}
                  {r.doing.item || "학습"} 하는 중 {agoLabel(r.doing.at, now)}
                </span>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}

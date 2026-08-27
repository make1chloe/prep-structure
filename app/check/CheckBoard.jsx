"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLazyRefresh } from "@/components/useLazyRefresh";
import { checkOne, seenSubmission, autoAssign, markMissing } from "./actions";
import Link from "next/link";
import { viewUrl } from "@/app/me/submitActions";
import PhotoView from "@/components/PhotoView";
import { addDays } from "@/lib/day";

// 색은 오늘 수업 화면과 같은 것을 쓴다 — 같은 뜻이 화면마다 다른 색이면 안 된다
const MARK = [
  { key: "done", sym: "○", label: "완료", cls: "hw-done" },
  { key: "weak", sym: "△", label: "미흡", cls: "hw-weak" },
  { key: "missing", sym: "✕", label: "미제출", cls: "hw-missing" },
];
const KIND = { audio: "녹음", checklist: "체크", photo: "사진", text: "글" };

/** 체크리스트는 글자로 담겨 온다 — 못 읽으면 조용히 빈 것으로 본다 */
function parseList(body) {
  try {
    const v = JSON.parse(body || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/**
 * 숙제 검사 — 낸 것을 펼쳐놓고 그 자리에서 찍는다.
 *
 * **처리하면 목록에서 빠진다.** 남은 것만 보여야 어디까지 했는지 알 수 있다.
 */
export default function CheckBoard({ date, rows = [], items = [], classes = [], help = false }) {
  const [klass, setKlass] = useState("");        // 반 고르기
  const [q, setQ] = useState("");                 // 학생 이름 찾기
  const [open, setOpen] = useState({});           // 펼친 학생
  const [url, setUrl] = useState({});             // 낸 것 보기 링크
  const [save, setSave] = useState({});           // 받기 링크 (여는 것과 다르다)
  const [note, setNote] = useState({});           // 아직 저장 안 한 한 줄
  const [showDone, setShowDone] = useState(false);
  const [mode, setMode] = useState("student");   // student | item
  const [pickItem, setPickItem] = useState("");   // 몰아 찍기에서 고른 숙제
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  /**
   * **찍는 순간 바뀐다** (2026-08-14 「0.1초 반응」 — 출결·진도 칩과 같은
   * 규칙). 숙제 검사는 하루에 수십 번 누르는 자리라, 저장 → 재계산을
   * 기다리면 그 수십 번이 전부 기다림이 된다. 화면을 먼저 칠하고 저장은
   * 뒤에서. 실패하면 되돌리고 알린다.
   */
  const [optMark, setOptMark] = useState({});     // `${sid}:${itemId}` → status
  const markOf = (r, itemId) => {
    const k = `${r.student.id}:${itemId}`;
    return k in optMark ? optMark[k] : r.marks[itemId] || null;
  };
  // 「봤어요/안 봄으로」 도 optMark 와 같은 규칙 — 누르는 순간 바뀐다
  // (원장님 2026-08-21 「버튼이 작동이 너무 늦어」). 실패하면 되돌리고 알린다.
  const [optSeen, setOptSeen] = useState({});     // sub.id → 봤는지 (true/false)
  const seenOf = (s) => (s.id in optSeen ? optSeen[s.id] : !!s.checked_at);

  const nameOf = (id) => items.find((i) => i.id === id)?.name || "숙제";

  // 아직 안 찍은 숙제가 있으면 '남은 학생'
  const left = (r) => r.toCheck.filter((c) => !markOf(r, c.id));
  const unseen = (r) => r.subs.filter((s) => !seenOf(s));

  const shown = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (klass && r.klass?.id !== klass) return false;
      if (kw && !r.student.name.toLowerCase().includes(kw)) return false;
      // 검사할 것도 없고 낸 것도 없으면 아예 안 보여준다
      if (r.toCheck.length === 0 && r.subs.length === 0) return false;
      if (!showDone && left(r).length === 0 && unseen(r).length === 0) return false;
      return true;
    });
  }, [rows, klass, q, showDone]);

  const totalLeft = rows.reduce((a, r) => a + left(r).length, 0);
  const totalUnseen = rows.reduce((a, r) => a + unseen(r).length, 0);

  /**
   * **적는 중에 목록을 새로 그리지 않는다** (원장님 2026-08-23 — 「내용
   * 수정하다가 목록이 새로고침되는 문제가 굉장히 불편해」).
   * 화면은 누르는 순간 이미 바뀌어 있으므로, 서버 왕복은 주변 배지·요약을
   * 맞추는 일일 뿐이라 늦어도 된다.
   */
  const { lazy } = useLazyRefresh();
  function run(fn) {
    startTransition(async () => {
      const res = await fn();
      if (res?.error) { alert(res.error); return; }
      lazy();
    });
  }

  /**
   * 볼 주소와 **받을 주소는 다르다** (2026-08-07). 같은 파일이지만 받는
   * 쪽은 브라우저에게 「열지 말고 받아라」 를 같이 일러줘야 한다.
   */
  function show(s) {
    if (url[s.id]) { setUrl((u) => ({ ...u, [s.id]: null })); return; }
    startTransition(async () => {
      const res = await viewUrl(s.path);
      if (res?.error) { alert(res.error); return; }
      setUrl((u) => ({ ...u, [s.id]: res.url }));
      const dl = await viewUrl(s.path, true);
      if (dl?.url) setSave((m) => ({ ...m, [s.id]: dl.url }));
    });
  }

  /** 한 항목을 찍는다 — 그 항목에 딸린 제출물도 같이 '봤다' 로 */
  function mark(r, itemId, status) {
    const key = `${r.student.id}:${itemId}`;
    setOptMark((m) => ({ ...m, [key]: status }));      // 먼저 칠한다
    const mySubs = r.subs
      .filter((s) => !s.checked_at && (!s.homework_item_id || s.homework_item_id === itemId))
      .map((s) => s.id);
    run(async () => {
      const res = await checkOne(r.student.id, date, itemId, status, note[key] ?? r.notes[itemId] ?? "", mySubs);
      if (res?.error) {
        setOptMark((m) => { const n2 = { ...m }; delete n2[key]; return n2; });   // 실패 — 되돌린다
      }
      if (!res?.error) setNote((n) => ({ ...n, [key]: undefined }));
      return res;
    });
  }

  return (
    <>
      <div className="row" style={{ gap: 6, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
        <a className="btn btn-ghost btn-sm" href={`/check?d=${addDays(date, -1)}`}>◂ 어제</a>
        <input
          className="input input-sm"
          type="date"
          style={{ width: 150 }}
          defaultValue={date}
          onChange={(e) => e.target.value && router.push(`/check?d=${e.target.value}`)}
        />
        <a className="btn btn-ghost btn-sm" href={`/check?d=${addDays(date, 1)}`}>내일 ▸</a>
        <span className="spacer" />
        <span className={`tag ${totalLeft ? "tag-amber" : "tag-mint"}`}>검사할 것 {totalLeft}</span>
        {totalUnseen > 0 && <span className="tag tag-sky">안 본 제출물 {totalUnseen}</span>}
      </div>

      <div className="row" style={{ gap: 6, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button
          className={`btn btn-sm ${klass === "" ? "btn-on" : "btn-ghost"}`}
          onClick={() => setKlass("")}
        >
          전체
        </button>
        {classes.map((c) => (
          <button
            key={c.id}
            className={`btn btn-sm ${klass === c.id ? "btn-on" : "btn-ghost"}`}
            onClick={() => setKlass(klass === c.id ? "" : c.id)}
          >
            {c.name}
          </button>
        ))}
        <input
          className="input input-sm"
          style={{ width: 150 }}
          placeholder="학생 이름"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <span className="spacer" />
        {/* 클래스카드처럼 **한 항목을 반 전체가 세로로** 늘어선 화면이 필요할 때가 있다.
            옆 탭에 띄워놓고 위에서 아래로 훑으며 탭만 하면 되게 */}
        <button
          className={`btn btn-sm ${mode === "item" ? "btn-on" : "btn-ghost"}`}
          onClick={() => setMode(mode === "item" ? "student" : "item")}
          title="숙제 하나를 골라 반 전체를 한 줄씩 봅니다 (클래스카드 보면서 찍기 좋습니다)"
        >
          몰아 찍기
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => setShowDone(!showDone)}>
          {showDone ? "끝낸 학생 숨기기" : "끝낸 학생도 보기"}
        </button>
      </div>

      {mode === "item" ? (
        <ItemMode
          date={date}
          rows={rows}
          items={items}
          classes={classes}
          help={help}
          klass={klass}
          setKlass={setKlass}
          pickItem={pickItem}
          setPickItem={setPickItem}
          markOf={markOf}
          nameOf={nameOf}
          mark={mark}
          pending={pending}
        />
      ) : shown.length === 0 ? (
        <div className="card" style={{ marginTop: 12 }}>
          <p className="muted" style={{ margin: 0, fontSize: 15 }}>
            {totalLeft === 0 && totalUnseen === 0
              ? "검사할 것이 없어요 👏"
              : "조건에 맞는 학생이 없어요."}
          </p>
        </div>
      ) : (
        <div className="stack" style={{ gap: 8, marginTop: 12 }}>
          {shown.map((r) => {
            const isOpen = open[r.student.id] !== false;   // 기본은 펼침
            const myLeft = left(r);
            const myUnseen = unseen(r);
            return (
              <div className="card" key={r.student.id} style={{ padding: 0, overflow: "hidden" }}>
                <button
                  className="stuLine"
                  style={{ width: "100%" }}
                  onClick={() => setOpen((o) => ({ ...o, [r.student.id]: !isOpen }))}
                >
                  <span className="stuWho">
                    <span className="stuName">{r.student.name}</span>
                    <span className="stuSub">
                      {[r.student.school, r.student.grade].filter(Boolean).join(" ")}
                    </span>
                  </span>
                  <span className="stuTags">
                  {r.klass && <span className="tag tag-muted">{r.klass.name}</span>}
                  {myLeft.length > 0 && <span className="tag tag-amber">검사 {myLeft.length}</span>}
                  {myUnseen.length > 0 && <span className="tag tag-sky">낸 것 {myUnseen.length}</span>}
                  {myLeft.filter((c) => c.noSub).length > 0 && (
                    <span className="tag tag-red" title="낸 것이 없는 숙제">
                      안 냄 {myLeft.filter((c) => c.noSub).length}
                    </span>
                  )}
                  {myLeft.length === 0 && myUnseen.length === 0 && (
                    <span className="tag tag-mint">끝</span>
                  )}
                  </span>
                  <span className="stuEnd">
                    <span className="stuOpen">{isOpen ? "▾" : "▸"}</span>
                  </span>
                </button>

                {isOpen && (
                  <div className="stuPanel">
                    {!r.hasReport && (
                      <div className="notice" style={{ fontSize: 14, marginBottom: 8 }}>
                        오늘 기록이 아직 없어요. <b>오늘 수업</b> 에서 출결을 먼저 찍어야 검사가 저장됩니다.
                      </div>
                    )}

                    {/**
                      * **어느 숙제에도 안 붙는 것만 위에 남긴다** (2026-08-07).
                      *
                      * 숙제에 붙는 것은 그 숙제 줄에서 본다. 그런데 배정이
                      * 지워졌거나 항목 없이 올린 것은 **어디에도 안 붙는다** —
                      * 그것까지 감추면 아이가 낸 것이 조용히 사라진다.
                      */}
                    {(() => {
                      const inRow = new Set(r.toCheck.map((c) => c.id));
                      const loose = (r.subs || []).filter((s) => !inRow.has(s.homework_item_id));
                      if (loose.length === 0) return null;
                      return (
                      <div className="stack" style={{ gap: 6, marginBottom: 10 }}>
                        {loose.map((s) => (
                          <div key={s.id} className="stack" style={{ gap: 4 }}>
                            <div className="unitrow">
                              <span className={`tag ${seenOf(s) ? "tag-muted" : "tag-amber"}`}>
                                {KIND[s.kind] || "사진"}
                              </span>
                              <b style={{ fontSize: 14 }}>{nameOf(s.homework_item_id)}</b>
                              <span className="hint" style={{ fontSize: 12.5 }}>
                                {s.kind === "audio" && s.seconds ? `${s.seconds}초 · ` : ""}
                                {new Date(s.created_at).toLocaleString("ko-KR", {
                                  timeZone: "Asia/Seoul", month: "numeric", day: "numeric",
                                  hour: "2-digit", minute: "2-digit",
                                })}
                              </span>
                              <span className="spacer" />
                              {s.kind !== "checklist" && !s.path && (
                                <span className="hint" style={{ fontSize: 12.5 }}>보관 기간 지남</span>
                              )}
                              {s.kind !== "checklist" && s.path && (
                                <button className="btn btn-sm" disabled={pending} onClick={() => show(s)}>
                                  {url[s.id] ? "닫기" : s.kind === "audio" ? "들어보기" : "보기"}
                                </button>
                              )}
                              <button
                                className="btn btn-ghost btn-sm"
                                disabled={pending}
                                onClick={() => {
                                  const next = !seenOf(s);
                                  setOptSeen((m) => ({ ...m, [s.id]: next }));   // 먼저 칠한다
                                  run(async () => {
                                    const res = await seenSubmission(s.id, next);
                                    if (res?.error) {
                                      setOptSeen((m) => { const n2 = { ...m }; delete n2[s.id]; return n2; });   // 실패 — 되돌린다
                                    }
                                    return res;
                                  });
                                }}
                              >
                                {seenOf(s) ? "안 봄으로" : "봤어요"}
                              </button>
                            </div>

                            {s.kind === "checklist" && (
                              <div className="stack" style={{ gap: 2, paddingLeft: 8 }}>
                                {parseList(s.body).map((x, i) => (
                                  <span key={i} className="hint" style={{ fontSize: 14 }}>
                                    <b style={{ color: x.state === "doing" ? "var(--amber)" : x.done ? "var(--mint)" : "var(--red)" }}>
                                      {x.done ? "○" : x.state === "doing" ? "△" : "✕"}
                                    </b>{" "}
                                    {x.text}
                                  </span>
                                ))}
                              </div>
                            )}
                            {url[s.id] && s.kind === "audio" && (
                              <audio controls src={url[s.id]} style={{ width: "100%" }} />
                            )}
                            {/* 아이들은 공책을 아무 방향으로나 찍는다 —
                                돌리고 키우고 받는 것을 여기서 한다 (2026-08-07) */}
                            {url[s.id] && s.kind === "photo" && (
                              <PhotoView url={url[s.id]} save={save[s.id]} alt="낸 숙제" />
                            )}
                          </div>
                        ))}
                      </div>
                      );
                    })()}

                    {/* 검사 — 3주 안에 배정했는데 아직 안 본 것 */}
                    {r.toCheck.length === 0 ? (
                      <p className="hint" style={{ margin: 0 }}>
                        지난 수업에 배정한 숙제가 없어요.
                      </p>
                    ) : (
                      <div className="stack" style={{ gap: 6 }}>
                        {r.assignedOn && (
                          <span className="hint" style={{ fontSize: 12.5 }}>
                            {r.assignedOn.slice(5).replace("-", "/")} 부터 아직 안 본 숙제입니다
                          </span>
                        )}
                        {r.toCheck.map((c) => {
                          const key = `${r.student.id}:${c.id}`;
                          const cur = markOf(r, c.id);
                          // 이 숙제로 낸 것 (사진·녹음) — 위 목록과 같은 것이지만
                          // 여기 붙여야 눈이 위아래로 안 오간다
                          const mine = (r.subs || []).filter((x) => x.homework_item_id === c.id);
                          return (
                            <div className="stack" key={c.id} style={{ gap: 3 }}>
                              <div className="unitrow">
                                <b style={{ fontSize: 14.5, minWidth: 110 }}>{nameOf(c.id)}</b>
                                {/* 오래 밀린 것은 눈에 걸려야 한다 — 시험 기간에 넘어간 숙제가 여기 있다 */}
                                {c.on && c.on !== r.assignedOn && (
                                  <span className="tag tag-muted" style={{ fontSize: 12 }}>
                                    {c.on.slice(5).replace("-", "/")}
                                  </span>
                                )}
                                {c.range && (
                                  <span className="hint" style={{ fontSize: 12.5, flex: 1 }}>{c.range}</span>
                                )}
                                {r.doneAt[c.id] && (
                                  <span className="tag tag-sky" title="학생이 다 했다고 눌렀습니다">
                                    학생 완료
                                  </span>
                                )}
                                {/* 공책처럼 앱에 낼 것이 없는 숙제 */}
                                {c.inPerson && (
                                  <span className="tag tag-lav" title="공책 등 — 보시고 찍어주세요">
                                    직접검사
                                  </span>
                                )}
                                {/* 낼 숙제인데 안 냈다 */}
                                {c.noSub && !markOf(r, c.id) && (
                                  <span className="tag tag-red" title="내야 하는 숙제인데 올라온 것이 없습니다">
                                    안 냄
                                  </span>
                                )}
                                <span className="spacer" />
                                <span className="markset">
                                  {MARK.map((m) => (
                                    <button
                                      key={m.key}
                                      className={`markbtn ${cur === m.key ? `on ${m.cls}` : ""}`}
                                      disabled={pending}
                                      title={m.label}
                                      onClick={() => mark(r, c.id, cur === m.key ? null : m.key)}
                                    >
                                      {m.sym}
                                    </button>
                                  ))}
                                </span>
                              </div>
                              {/**
                                * **낸 것을 이 줄에서 바로 본다** (원장님,
                                * 2026-08-07 — 「그 사진을 보면서 숙제 체크할
                                * 수 있어?」).
                                *
                                * 위쪽에 「낸 것」 목록이 따로 있어서, **이
                                * 사진이 어느 숙제 것인지 이름으로 눈을
                                * 맞춰야** 했다. 항목이 다섯이면 다섯 번 위아래를
                                * 오간다. 낸 것은 그 숙제에 딸린 것이니 그 줄에 붙인다.
                                */}
                              {mine.length > 0 && (
                                <div className="stack" style={{ gap: 4, marginLeft: 8 }}>
                                  {mine.map((s) => (
                                    <div key={s.id} className="stack" style={{ gap: 4 }}>
                                      <div className="row" style={{ gap: 6, alignItems: "center" }}>
                                        <span className="tag tag-sky" style={{ fontSize: 12 }}>
                                          {KIND[s.kind] || "사진"}
                                        </span>
                                        {s.path ? (
                                          <button
                                            className="btn btn-ghost btn-sm"
                                            style={{ padding: "2px 8px" }}
                                            disabled={pending}
                                            onClick={() => show(s)}
                                          >
                                            {url[s.id] ? "닫기" : s.kind === "audio" ? "들어보기" : "보기"}
                                          </button>
                                        ) : (
                                          <span className="hint" style={{ fontSize: 12 }}>보관 기간 지남</span>
                                        )}
                                      </div>
                                      {url[s.id] && s.kind === "audio" && (
                                        <audio controls src={url[s.id]} style={{ width: "100%" }} />
                                      )}
                                      {url[s.id] && s.kind === "photo" && (
                                        <PhotoView url={url[s.id]} save={save[s.id]} alt="낸 숙제" max={320} />
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                              {/* 한 줄 — ○△✕ 만으로는 나중에 아무것도 기억나지 않는다 */}
                              <input
                                className="input input-sm"
                                style={{ marginLeft: 8 }}
                                placeholder="한 줄 (리포트에 그대로 나갑니다)"
                                value={note[key] ?? r.notes[c.id] ?? ""}
                                onChange={(e) => setNote((n) => ({ ...n, [key]: e.target.value }))}
                                onBlur={() => {
                                  const v = note[key];
                                  if (v === undefined || !cur) return;
                                  if (v === (r.notes[c.id] || "")) return;
                                  mark(r, c.id, cur);
                                }}
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* 안 낸 것 한 번에 — 자동으로 찍지 않는 대신 한 번 누르면 끝난다 */}
                    {(() => {
                      const none = myLeft.filter((c) => c.noSub);
                      if (none.length === 0) return null;
                      return (
                        <div className="row" style={{ gap: 6, marginTop: 10, alignItems: "center" }}>
                          <button
                            className="btn btn-sm"
                            disabled={pending || !r.hasReport}
                            onClick={() => {
                              const names = none.map((c) => nameOf(c.id)).join(", ");
                              if (!confirm(`낸 것이 없는 숙제를 미제출(✕)로 찍을까요?\n\n${names}`)) return;
                              run(() => markMissing(r.student.id, date, none.map((c) => c.id)));
                            }}
                          >
                            안 낸 것 {none.length}개 미제출로
                          </button>
                          <span className="hint" style={{ fontSize: 12.5 }}>
                            직접검사 숙제는 여기 안 들어갑니다
                          </span>
                        </div>
                      );
                    })()}

                    {/* 다음 숙제는 루틴에 이미 정해져 있다 — 매번 고를 일이 아니다 */}
                    <div className="row" style={{ gap: 6, marginTop: 10, alignItems: "center" }}>
                      <button
                        className="btn btn-sm"
                        disabled={pending || !r.hasReport}
                        title={
                          r.hasReport
                            ? "교재 진도루틴의 다음 차례를 오늘 숙제로 냅니다"
                            : "먼저 오늘 수업에서 출결을 찍어주세요"
                        }
                        onClick={() =>
                          run(async () => {
                            const res = await autoAssign(r.student.id, date);
                            if (!res?.error) {
                              alert(
                                res.already
                                  ? "오늘은 이미 배정돼 있어요."
                                  : `다음 숙제 ${res.added}개를 냈어요.` +
                                    (res.steps?.length
                                      ? `\n${res.steps.map((x) => `${x.book} ${x.no}/${x.total}${x.label ? ` ${x.label}` : ""}`).join("\n")}`
                                      : "")
                              );
                            }
                            return res;
                          })
                        }
                      >
                        다음 숙제 자동배정
                      </button>
                      <span className="hint" style={{ fontSize: 12.5 }}>
                        교재 루틴의 다음 차례가 나갑니다
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 검사가 끝나면 결국 오늘 수업으로 간다 — 맨 밑에 길을 둔다 */}
      <div className="row" style={{ gap: 8, marginTop: 16, alignItems: "center" }}>
        <Link className="btn btn-primary" href={`/today?d=${date}`}>
          오늘 수업으로
        </Link>
        <span className="hint" style={{ fontSize: 13 }}>
          출결 · 단어시험 · 공지는 오늘 수업 화면에서 합니다.
        </span>
      </div>
    </>
  );
}

/**
 * 몰아 찍기 — **한 숙제를 반 전체가 세로로.**
 *
 * 클래스카드는 한 세트를 반 학생이 세로로 늘어선 모양으로 보여준다. 그런데
 * 학생별 칸을 하나씩 열어 찍으면 눈이 왔다 갔다 한다. 같은 모양으로 세워두면
 * 옆 탭에 띄워놓고 위에서 아래로 훑으며 탭만 하면 된다.
 *
 * 순서는 **이름순** — 학생 목록이 이미 이름순으로 온다.
 */
function ItemMode({
  date, rows, items, classes, klass, setKlass, pickItem, setPickItem,
  nameOf, mark, markOf, pending, help = false,
}) {
  // 반을 안 고르면 첫 반으로 — 몰아 찍기는 한 반을 보는 화면이다
  const cid = klass || classes[0]?.id || "";
  const mine = rows.filter((r) => r.klass?.id === cid);

  // 이 반에 배정돼 있는 숙제만 고르게 한다 (없는 숙제를 고르면 빈 화면이 된다)
  const itemIds = [...new Set(mine.flatMap((r) => r.toCheck.map((c) => c.id)))];
  const choices = items.filter((i) => itemIds.includes(i.id));
  const item = pickItem && itemIds.includes(pickItem) ? pickItem : choices[0]?.id || "";

  const left = mine.filter((r) => r.toCheck.some((c) => c.id === item) && !markOf(r, item)).length;

  return (
    <>
      <div className="row" style={{ gap: 6, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
        <select
          className="input input-sm"
          style={{ width: 150 }}
          value={cid}
          onChange={(e) => setKlass(e.target.value)}
        >
          {classes.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          className="input input-sm"
          style={{ minWidth: 180 }}
          value={item}
          onChange={(e) => setPickItem(e.target.value)}
        >
          {choices.length === 0 && <option value="">배정된 숙제가 없어요</option>}
          {choices.map((i) => (
            <option key={i.id} value={i.id}>{i.name}</option>
          ))}
        </select>
        <span className="spacer" />
        <span className={`tag ${left ? "tag-amber" : "tag-mint"}`}>남은 {left}명</span>
      </div>

      {mine.length === 0 || !item ? (
        <div className="card" style={{ marginTop: 12 }}>
          <p className="muted" style={{ margin: 0, fontSize: 15 }}>
            {mine.length === 0
              ? "이 반에 검사할 학생이 없어요."
              : "이 반에 배정된 숙제가 없어요. 먼저 숙제를 배정해주세요."}
          </p>
        </div>
      ) : (
        <div className="card" style={{ marginTop: 12, padding: 0, overflow: "hidden" }}>
          {mine.map((r) => {
            const c = r.toCheck.find((x) => x.id === item);
            const cur = markOf(r, item);
            return (
              <div className="unitrow" key={r.student.id} style={{ padding: "9px 14px" }}>
                <b style={{ fontSize: 15, minWidth: 76 }}>{r.student.name}</b>
                {c?.range && (
                  <span className="hint" style={{ fontSize: 12.5 }}>{c.range}</span>
                )}
                {c && r.doneAt[item] && <span className="tag tag-sky">학생 완료</span>}
                {c?.inPerson && <span className="tag tag-lav">직접검사</span>}
                {c?.noSub && !cur && <span className="tag tag-red">안 냄</span>}
                <span className="spacer" />
                {!c ? (
                  // 그 반이어도 이 숙제를 안 받은 학생이 있다. 빈칸으로 두지 않고 적어준다
                  <span className="hint" style={{ fontSize: 12.5 }}>배정 안 됨</span>
                ) : !r.hasReport ? (
                  <span className="hint" style={{ fontSize: 12.5 }}>출결 먼저</span>
                ) : (
                  <span className="markset">
                    {MARK.map((m) => (
                      <button
                        key={m.key}
                        className={`markbtn ${cur === m.key ? `on ${m.cls}` : ""}`}
                        disabled={pending}
                        title={m.label}
                        onClick={() => mark(r, item, cur === m.key ? null : m.key)}
                      >
                        {m.sym}
                      </button>
                    ))}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 1회성 조작법 — 설명 스위치(help 쿠키)를 켠 사람에게만 (계획서 v2 §3 B3) */}
      {help && (
        <p className="hint" style={{ marginTop: 8, fontSize: 13 }}>
          클래스카드를 옆 탭에 띄워놓고 위에서 아래로 훑으며 찍으시면 됩니다.
          찍은 것은 <b>학생별 화면과 리포트에 그대로</b> 들어갑니다.
        </p>
      )}
    </>
  );
}

"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { checkOne, seenSubmission, autoAssign, markMissing } from "./actions";
import Link from "next/link";
import { viewUrl } from "@/app/me/submitActions";
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
export default function CheckBoard({ date, rows = [], items = [], classes = [] }) {
  const [klass, setKlass] = useState("");        // 반 고르기
  const [q, setQ] = useState("");                 // 학생 이름 찾기
  const [open, setOpen] = useState({});           // 펼친 학생
  const [url, setUrl] = useState({});             // 낸 것 보기 링크
  const [note, setNote] = useState({});           // 아직 저장 안 한 한 줄
  const [showDone, setShowDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const nameOf = (id) => items.find((i) => i.id === id)?.name || "숙제";

  // 아직 안 찍은 숙제가 있으면 '남은 학생'
  const left = (r) => r.toCheck.filter((c) => !r.marks[c.id]);
  const unseen = (r) => r.subs.filter((s) => !s.checked_at);

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

  function run(fn) {
    startTransition(async () => {
      const res = await fn();
      if (res?.error) { alert(res.error); return; }
      router.refresh();
    });
  }

  function show(s) {
    if (url[s.id]) { setUrl((u) => ({ ...u, [s.id]: null })); return; }
    startTransition(async () => {
      const res = await viewUrl(s.path);
      if (res?.error) { alert(res.error); return; }
      setUrl((u) => ({ ...u, [s.id]: res.url }));
    });
  }

  /** 한 항목을 찍는다 — 그 항목에 딸린 제출물도 같이 '봤다' 로 */
  function mark(r, itemId, status) {
    const key = `${r.student.id}:${itemId}`;
    const mySubs = r.subs
      .filter((s) => !s.checked_at && (!s.homework_item_id || s.homework_item_id === itemId))
      .map((s) => s.id);
    run(async () => {
      const res = await checkOne(r.student.id, date, itemId, status, note[key] ?? r.notes[itemId] ?? "", mySubs);
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
          className={`btn btn-sm ${klass === "" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setKlass("")}
        >
          전체
        </button>
        {classes.map((c) => (
          <button
            key={c.id}
            className={`btn btn-sm ${klass === c.id ? "btn-primary" : "btn-ghost"}`}
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
        <button className="btn btn-ghost btn-sm" onClick={() => setShowDone(!showDone)}>
          {showDone ? "끝낸 학생 숨기기" : "끝낸 학생도 보기"}
        </button>
      </div>

      {shown.length === 0 ? (
        <div className="card" style={{ marginTop: 12 }}>
          <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
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
                  <span style={{ fontWeight: 700 }}>{r.student.name}</span>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {[r.student.school, r.student.grade].filter(Boolean).join(" ")}
                  </span>
                  {r.klass && <span className="tag tag-muted">{r.klass.name}</span>}
                  <span className="spacer" />
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
                </button>

                {isOpen && (
                  <div className="stuPanel">
                    {!r.hasReport && (
                      <div className="notice" style={{ fontSize: 12.5, marginBottom: 8 }}>
                        오늘 기록이 아직 없어요. <b>오늘 수업</b> 에서 출결을 먼저 찍어야 검사가 저장됩니다.
                      </div>
                    )}

                    {/* 낸 것 — 열어보고 찍는다 */}
                    {r.subs.length > 0 && (
                      <div className="stack" style={{ gap: 6, marginBottom: 10 }}>
                        {r.subs.map((s) => (
                          <div key={s.id} className="stack" style={{ gap: 4 }}>
                            <div className="unitrow">
                              <span className={`tag ${s.checked_at ? "tag-muted" : "tag-amber"}`}>
                                {KIND[s.kind] || "사진"}
                              </span>
                              <b style={{ fontSize: 12.5 }}>{nameOf(s.homework_item_id)}</b>
                              <span className="hint" style={{ fontSize: 11.5 }}>
                                {s.kind === "audio" && s.seconds ? `${s.seconds}초 · ` : ""}
                                {new Date(s.created_at).toLocaleString("ko-KR", {
                                  timeZone: "Asia/Seoul", month: "numeric", day: "numeric",
                                  hour: "2-digit", minute: "2-digit",
                                })}
                              </span>
                              <span className="spacer" />
                              {s.kind !== "checklist" && !s.path && (
                                <span className="hint" style={{ fontSize: 11.5 }}>보관 기간 지남</span>
                              )}
                              {s.kind !== "checklist" && s.path && (
                                <button className="btn btn-sm" disabled={pending} onClick={() => show(s)}>
                                  {url[s.id] ? "닫기" : s.kind === "audio" ? "들어보기" : "보기"}
                                </button>
                              )}
                              <button
                                className="btn btn-ghost btn-sm"
                                disabled={pending}
                                onClick={() => run(() => seenSubmission(s.id, !s.checked_at))}
                              >
                                {s.checked_at ? "안 봄으로" : "봤어요"}
                              </button>
                            </div>

                            {s.kind === "checklist" && (
                              <div className="stack" style={{ gap: 2, paddingLeft: 8 }}>
                                {parseList(s.body).map((x, i) => (
                                  <span key={i} className="hint" style={{ fontSize: 12.5 }}>
                                    {x.done ? "☑" : "☐"} {x.text}
                                  </span>
                                ))}
                              </div>
                            )}
                            {url[s.id] && s.kind === "audio" && (
                              <audio controls src={url[s.id]} style={{ width: "100%" }} />
                            )}
                            {url[s.id] && s.kind === "photo" && (
                              <a href={url[s.id]} target="_blank" rel="noreferrer">
                                <img
                                  src={url[s.id]}
                                  alt=""
                                  style={{ maxWidth: "100%", borderRadius: 8, display: "block" }}
                                />
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 검사 — 3주 안에 배정했는데 아직 안 본 것 */}
                    {r.toCheck.length === 0 ? (
                      <p className="hint" style={{ margin: 0 }}>
                        지난 수업에 배정한 숙제가 없어요.
                      </p>
                    ) : (
                      <div className="stack" style={{ gap: 6 }}>
                        {r.assignedOn && (
                          <span className="hint" style={{ fontSize: 11.5 }}>
                            {r.assignedOn.slice(5).replace("-", "/")} 부터 아직 안 본 숙제입니다
                          </span>
                        )}
                        {r.toCheck.map((c) => {
                          const key = `${r.student.id}:${c.id}`;
                          const cur = r.marks[c.id] || null;
                          return (
                            <div className="stack" key={c.id} style={{ gap: 3 }}>
                              <div className="unitrow">
                                <b style={{ fontSize: 13, minWidth: 110 }}>{nameOf(c.id)}</b>
                                {/* 오래 밀린 것은 눈에 걸려야 한다 — 시험 기간에 넘어간 숙제가 여기 있다 */}
                                {c.on && c.on !== r.assignedOn && (
                                  <span className="tag tag-muted" style={{ fontSize: 10.5 }}>
                                    {c.on.slice(5).replace("-", "/")}
                                  </span>
                                )}
                                {c.range && (
                                  <span className="hint" style={{ fontSize: 11.5, flex: 1 }}>{c.range}</span>
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
                                {c.noSub && !r.marks[c.id] && (
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
                          <span className="hint" style={{ fontSize: 11.5 }}>
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
                            ? "교재 루틴의 다음 차례를 오늘 숙제로 냅니다"
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
                      <span className="hint" style={{ fontSize: 11.5 }}>
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
        <span className="hint" style={{ fontSize: 12 }}>
          출결 · 단어시험 · 공지는 오늘 수업 화면에서 합니다.
        </span>
      </div>
    </>
  );
}

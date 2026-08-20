"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { dayLabel } from "@/lib/day";
import { sendReports } from "./actions";
import { sendNotices, assignAnnouncedBooks } from "./noticeActions";
import { scheduleSend, cancelScheduled } from "./scheduleActions";

/**
 * **보낼 것 모아보기 — 발송의 첫 화면** (원장님, 2026-08-16 — 「전체
 * 미발송목록 한번에 보는 페이지」 · 「기본정보와 체크박스로 선택해서
 * 보내는 기능, 예약기능 만들어줘」).
 *
 * 남은 것이 기본정보(리포트는 수업일, 교재는 사용 예정일)와 함께 서고,
 * 체크해서 **지금 보내기** 또는 **예약**을 누른다. 예약된 것은 시각이
 * 지난 뒤 이 화면(또는 대시보드)이 열릴 때 나간다 — 서버에 따로 시계가
 * 없어서, 몇 분 늦을 수는 있어도 잊히지는 않는다.
 *
 * 결석 안내도 리포트에 실려 나간다 — 결석 찍고 리포트를 쓰면
 * 「데일리리포트」 줄에 선다.
 */
export default function SendTodo({
  unsentByDate = [],
  bookWait = [],
  monthlyLeft = 0,
  ym = "",
  bookTemplateId = null,
  hasBookTpl = false,
  scheduled = [],
  mode = "copy",
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // 처음에 전부 체크 — 확인하고 빼는 쪽이, 하나하나 켜는 것보다 손이 덜 간다
  const [repSel, setRepSel] = useState(
    () => new Set(unsentByDate.flatMap((d) => d.items.map((x) => x.id)))
  );
  const [bookSel, setBookSel] = useState(() => new Set(bookWait.map((w) => w.studentId)));
  const [when, setWhen] = useState("");   // 예약 시각 (datetime-local)

  const repCount = unsentByDate.flatMap((d) => d.items).filter((x) => repSel.has(x.id)).length;
  const pickedBooks = bookWait.filter((w) => bookSel.has(w.studentId));
  const total =
    unsentByDate.reduce((a, d) => a + d.items.length, 0) + bookWait.length + monthlyLeft;
  const waiting = scheduled.filter((s) => !s.sent_at);
  const done = scheduled.filter((s) => s.sent_at).slice(-5);

  function run(fn, okMsg) {
    startTransition(async () => {
      const res = await fn();
      if (res?.error) { alert(res.error); return; }
      if (res?.failed?.length) {
        alert(`보냈지만 ${res.failed.length}건은 실패했어요.\n` +
          res.failed.map((f) => `· ${f.name}: ${f.detail}`).join("\n"));
      } else if (okMsg) {
        alert(okMsg);
      }
      router.refresh();
    });
  }

  /** 고른 리포트 지금 보내기 — 앱 공지·알림 (리포트 발송과 같은 길) */
  function sendReportsNow() {
    if (repCount === 0) return;
    if (!confirm(`리포트 ${repCount}건을 지금 보낼까요?\n앱 공지에 올라가고 알림이 갑니다.`)) return;
    const items = unsentByDate.flatMap((d) => d.items).filter((x) => repSel.has(x.id))
      .map((x) => ({ id: x.id }));
    run(() => sendReports(items), `${repCount}건 보냈어요.`);
  }

  /** 고른 교재 안내 지금 보내기 — 학생마다 제 교재로 채운 본문 */
  function sendBooksNow() {
    if (pickedBooks.length === 0) return;
    const smsN = pickedBooks.filter((w) => w.firstComing).length;
    if (!confirm(
      `교재 안내 ${pickedBooks.length}명에게 지금 보낼까요?` +
      (smsN > 0 ? `\n첫 등원 전 ${smsN}명에게는 학부모 번호로 문자가 갑니다.` : "\n앱 공지·알림으로 갑니다.")
    )) return;
    run(async () => {
      const res = await sendNotices(
        pickedBooks.map((w) => ({ id: w.id, name: w.name, phone: w.phone, body: w.body })),
        "book",
        bookTemplateId
      );
      if (!res?.error) {
        // 안내 나간 날을 새긴다 — 이 목록에서 빠진다 (0125)
        const ids = pickedBooks.map((w) => w.id);
        const bookIds = [...new Set(pickedBooks.flatMap((w) => w.books.map((b) => b.id)))];
        const startOn = pickedBooks.flatMap((w) => w.books.map((b) => b.from)).sort()[0];
        if (startOn) await assignAnnouncedBooks(ids, bookIds, startOn);
      }
      return res;
    }, `${pickedBooks.length}명에게 보냈어요.`);
  }

  /** 예약 — 고른 것을 정한 시각 뒤에 (열릴 때 나간다) */
  function schedule() {
    if (!when) { alert("예약 시각을 먼저 골라주세요."); return; }
    if (new Date(when) <= new Date()) { alert("지금보다 뒤의 시각으로 골라주세요."); return; }
    if (repCount === 0 && pickedBooks.length === 0) { alert("보낼 것을 하나 이상 체크해주세요."); return; }
    if (!confirm(
      `${dayLabel(when.slice(0, 10))} ${when.slice(11, 16)} 이후로 예약할까요?\n` +
      [repCount > 0 && `리포트 ${repCount}건`, pickedBooks.length > 0 && `교재 안내 ${pickedBooks.length}명`]
        .filter(Boolean).join(" · ") +
      "\n(시각이 지난 뒤 앱을 열면 나갑니다)"
    )) return;
    startTransition(async () => {
      let err = null;
      if (repCount > 0) {
        const items = unsentByDate.flatMap((d) => d.items).filter((x) => repSel.has(x.id));
        const r = await scheduleSend("report", when, { reportIds: items.map((x) => x.id) },
          `리포트 ${items.length}건 — ${items.slice(0, 4).map((x) => x.name).join("·")}${items.length > 4 ? " 외" : ""}`);
        err = r?.error || err;
      }
      if (!err && pickedBooks.length > 0) {
        const ids = pickedBooks.map((w) => w.id);
        const bookIds = [...new Set(pickedBooks.flatMap((w) => w.books.map((b) => b.id)))];
        const startOn = pickedBooks.flatMap((w) => w.books.map((b) => b.from)).sort()[0] || null;
        const r = await scheduleSend("book", when, {
          items: pickedBooks.map((w) => ({ id: w.id, name: w.name, phone: w.phone, body: w.body })),
          templateId: bookTemplateId, ids, bookIds, startOn,
        }, `교재 안내 ${pickedBooks.length}명 — ${pickedBooks.map((w) => w.name).join("·")}`);
        err = r?.error || err;
      }
      if (err) { alert(err); return; }
      setWhen("");
      router.refresh();
    });
  }

  return (
    <div className="stack" style={{ gap: 10, marginTop: 12 }}>
      {/* 보내기 · 예약 — 한 줄에 (체크한 것 전체에 적용) */}
      {(unsentByDate.length > 0 || bookWait.length > 0) && (
        <div className="card card-tight">
          <div className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <b style={{ fontSize: 14.5 }}>
              체크한 것 — 리포트 {repCount}건 · 교재 안내 {pickedBooks.length}명
            </b>
            <span className="spacer" />
            <button className="btn btn-primary btn-sm" disabled={pending || (repCount === 0 && pickedBooks.length === 0)}
              onClick={() => { if (repCount > 0) sendReportsNow(); if (pickedBooks.length > 0) sendBooksNow(); }}>
              지금 보내기
            </button>
            <input
              className="input input-sm"
              type="datetime-local"
              style={{ width: 200 }}
              value={when}
              onChange={(e) => setWhen(e.target.value)}
            />
            <button className="btn btn-sm" disabled={pending} onClick={schedule}>
              이 시각에 예약
            </button>
          </div>
          <p className="hint" style={{ margin: "4px 0 0" }}>
            예약은 그 시각이 지난 뒤 <b>앱을 열 때</b>, 또는 바깥 시계가 한 시간마다
            서버를 두드릴 때 나갑니다 (설정해두면 앱을 안 열어도 나가요).
          </p>
        </div>
      )}

      {total === 0 && waiting.length === 0 && (
        <div className="card">
          <p className="muted" style={{ margin: 0, fontSize: 15 }}>
            보낼 것이 없어요 👏 리포트를 쓰면 여기에 자동으로 섭니다.
          </p>
        </div>
      )}

      {/* 예약된 발송 */}
      {waiting.length > 0 && (
        <div className="card">
          <h2 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 800 }}>
            예약된 발송 <span className="tag tag-sky">{waiting.length}건</span>
          </h2>
          <div className="stack" style={{ gap: 4 }}>
            {waiting.map((s) => (
              <div className="unitrow" key={s.id}>
                <span className="tag tag-lav">
                  {new Date(s.due_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
                {/* 배치 규칙(2026-08-21) — 자동 앱 알림은 다음 정각까지 여기 선다.
                    취소를 누르면 그 알림은 안 나간다 */}
                {s.kind === "push" && <span className="tag tag-mint">앱 알림</span>}
                <span style={{ fontSize: 14, flex: 1 }}>{s.note || (s.kind === "report" ? "리포트" : s.kind === "push" ? "앱 알림" : "교재 안내")}</span>
                <button className="btn btn-ghost btn-sm" disabled={pending}
                  onClick={() => { if (confirm("이 예약을 취소할까요?")) run(() => cancelScheduled(s.id)); }}>
                  취소
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {unsentByDate.length > 0 && (
        <div className="card">
          <h2 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 800 }}>
            데일리리포트 미발송{" "}
            <span className="tag tag-amber">{unsentByDate.reduce((a, d) => a + d.items.length, 0)}건</span>
          </h2>
          <div className="stack" style={{ gap: 4 }}>
            {unsentByDate.map((d) => (
              <div key={d.date}>
                {/* 수업일 — 이 줄의 기본정보다 */}
                <div className="row" style={{ gap: 6, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={d.items.every((x) => repSel.has(x.id))}
                    onChange={() => {
                      const every = d.items.every((x) => repSel.has(x.id));
                      const n = new Set(repSel);
                      d.items.forEach((x) => (every ? n.delete(x.id) : n.add(x.id)));
                      setRepSel(n);
                    }}
                  />
                  <b style={{ fontSize: 14 }}>수업일 {dayLabel(d.date)}</b>
                  <Link className="btn btn-ghost btn-sm" href={`/report?t=report&d=${d.date}`}>
                    내용 보기·고치기
                  </Link>
                </div>
                <div className="row" style={{ gap: 4, flexWrap: "wrap", margin: "3px 0 6px 24px" }}>
                  {d.items.map((x) => (
                    <label key={x.id} className="hwchip" style={{ cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={repSel.has(x.id)}
                        onChange={() => {
                          const n = new Set(repSel);
                          n.has(x.id) ? n.delete(x.id) : n.add(x.id);
                          setRepSel(n);
                        }}
                        style={{ marginRight: 4 }}
                      />
                      {x.name}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {bookWait.length > 0 && (
        <div className="card">
          <h2 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 800 }}>
            교재 안내 미발송 <span className="tag tag-amber">{bookWait.length}명</span>
          </h2>
          {!hasBookTpl && (
            <p className="hint" style={{ margin: "0 0 6px" }}>
              교재 분류의 문구가 없어 여기서 바로 못 보냅니다 —{" "}
              <Link href="/report?t=notice">안내 문자</Link> 에서 문구를 만들어주세요.
            </p>
          )}
          <div className="stack" style={{ gap: 4 }}>
            {bookWait.map((w) => (
              <div className="unitrow" key={w.studentId} style={{ alignItems: "flex-start" }}>
                <input
                  type="checkbox"
                  checked={bookSel.has(w.studentId)}
                  onChange={() => {
                    const n = new Set(bookSel);
                    n.has(w.studentId) ? n.delete(w.studentId) : n.add(w.studentId);
                    setBookSel(n);
                  }}
                />
                <b style={{ fontSize: 14, minWidth: 64 }}>{w.name}</b>
                <span style={{ fontSize: 13.5, flex: 1 }}>
                  {/* 교재 사용 예정일 — 이 줄의 기본정보다 */}
                  {w.books.map((b) => (
                    <span key={b.id} className="tag tag-sky" style={{ margin: "0 3px 3px 0" }}>
                      {b.name} · {b.from ? `${Number(b.from.slice(5, 7))}/${Number(b.from.slice(8, 10))}부터` : "날짜 미정"}
                    </span>
                  ))}
                </span>
                {w.firstComing && (
                  <span className="tag tag-lav" title="아직 첫 등원 전이라 학부모 번호로 문자가 갑니다">
                    문자로
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <Link className="btn btn-ghost btn-sm" href="/report?t=notice">
              문구 고치거나 다르게 보내려면 → 안내 문자
            </Link>
          </div>
        </div>
      )}

      {monthlyLeft > 0 && (
        <div className="card">
          <h2 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 800 }}>
            {Number(ym.slice(5, 7))}월 월간리포트{" "}
            <span className="tag tag-amber">미작성 {monthlyLeft}명</span>
          </h2>
          <div className="row">
            <Link className="btn btn-sm" href="/monthly">월간리포트로</Link>
          </div>
        </div>
      )}

      {done.length > 0 && (
        <div className="card card-tight" style={{ opacity: 0.8 }}>
          <b style={{ fontSize: 13.5 }}>최근 나간 예약</b>
          <div className="stack" style={{ gap: 2, marginTop: 4 }}>
            {done.map((s) => (
              <div key={s.id} className="hint" style={{ fontSize: 12.5 }}>
                {new Date(s.sent_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}{" "}
                — {s.note || s.kind}
                {s.result?.error ? <b style={{ color: "var(--red)" }}> · 실패: {s.result.error}</b> : " · 나감"}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

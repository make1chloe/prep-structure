"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveMonthly, sendMonthly, unsendMonthly } from "./actions";
import { addMonths } from "@/lib/day";

/**
 * 월말 리포트.
 *
 * 그 달 데일리리포트를 다시 세서 만든다. 새로 입력할 것은 없다.
 * 학생마다 한마디를 덧붙일 수 있고, 문구 자체를 고칠 수도 있다.
 */
export default function MonthlyBoard({ ym, rows = [], ready = true, mode = "copy" }) {
  const [sel, setSel] = useState(() => new Set());
  const [openId, setOpenId] = useState(null);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");
  const [filter, setFilter] = useState("todo");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const shown = rows.filter((r) =>
    filter === "todo" ? !r.sentAt : filter === "sent" ? !!r.sentAt : true
  );
  const todo = rows.filter((r) => !r.sentAt);

  function toggle(id) {
    const n = new Set(sel);
    n.has(id) ? n.delete(id) : n.add(id);
    setSel(n);
  }

  function send(list) {
    if (list.length === 0) return;
    if (mode !== "copy" && !confirm(`${list.length}명에게 월말 리포트를 보낼까요?`)) return;
    startTransition(async () => {
      const res = await sendMonthly(
        list.map((r) => ({ studentId: r.studentId, name: r.name, phone: r.phone, body: r.text })),
        ym
      );
      if (res?.error) {
        alert(res.error);
        return;
      }
      const f = res.failed || [];
      alert(
        f.length === 0
          ? `${res.count}명에게 보냈어요.`
          : `${res.count}명 보냈고, ${f.length}명 실패했어요.\n` +
              f.map((x) => `· ${x.name} — ${x.detail}`).join("\n")
      );
      setSel(new Set());
      router.refresh();
    });
  }

  const go = (n) => router.push(`/monthly?m=${addMonths(ym, n)}`);

  return (
    <>
      <div className="row" style={{ gap: 6, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn btn-ghost btn-sm" onClick={() => go(-1)}>◂ 지난달</button>
        <b style={{ fontSize: 15 }}>{ym.replace("-", "년 ")}월</b>
        <button className="btn btn-ghost btn-sm" onClick={() => go(1)}>다음달 ▸</button>
        <span className="spacer" />
        {[["todo", `보낼 것 ${todo.length}`], ["sent", `보냄 ${rows.length - todo.length}`], ["all", `전체 ${rows.length}`]].map(
          ([k, label]) => (
            <button
              key={k}
              className={`btn btn-sm ${filter === k ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setFilter(k)}
            >
              {label}
            </button>
          )
        )}
      </div>

      {!ready && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="notice">
            월말 리포트를 저장하려면 <b>0031 SQL</b> 을 먼저 실행해주세요.{" "}
            <a href="/settings/sql">설정 → Supabase SQL</a>
          </div>
        </div>
      )}

      {rows.length === 0 && (
        <p className="hint" style={{ marginTop: 16 }}>
          이 달에는 수업 기록이 없습니다.
        </p>
      )}

      {shown.length > 0 && (
        <div className="row" style={{ gap: 8, alignItems: "center", margin: "14px 0 8px" }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              const every = shown.every((r) => sel.has(r.studentId));
              const n = new Set(sel);
              shown.forEach((r) => (every ? n.delete(r.studentId) : n.add(r.studentId)));
              setSel(n);
            }}
          >
            보이는 학생 전체 선택
          </button>
          <span className="tag tag-sky">{sel.size}명</span>
          <span className="spacer" />
          <button
            className="btn btn-primary btn-sm"
            disabled={pending || sel.size === 0}
            onClick={() => send(shown.filter((r) => sel.has(r.studentId)))}
          >
            고른 {sel.size}명에게 보내기
          </button>
        </div>
      )}

      {shown.map((r) => {
        const isOpen = openId === r.studentId;
        const hw = r.sum.homework;
        return (
          <div className="card card-tight" key={r.studentId} style={{ marginBottom: 6 }}>
            <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {!r.sentAt && (
                <input
                  type="checkbox"
                  checked={sel.has(r.studentId)}
                  onChange={() => toggle(r.studentId)}
                />
              )}
              <b style={{ fontSize: 13.5 }}>{r.name}</b>
              <span className="hint">{r.who}</span>
              <span className="tag tag-muted">{r.sum.days}회</span>
              {hw.rate !== null && (
                <span
                  className={`tag ${hw.rate >= 85 ? "tag-mint" : hw.rate >= 70 ? "tag-sky" : "tag-amber"}`}
                  title={`완료 ${hw.done} / 보충 ${hw.weak} / 미완료 ${hw.missing}`}
                >
                  숙제 {hw.rate}%
                </span>
              )}
              {r.sum.word.count > 0 && (
                <span className="tag tag-muted">단어 {r.sum.word.rate}%</span>
              )}
              {r.sum.exams.length > 0 && (
                <span className="tag tag-lav">단원평가 {r.sum.exams.length}</span>
              )}
              {!r.phone && <span className="tag tag-red">번호 없음</span>}
              <span className="spacer" />
              {r.sentAt ? (
                <>
                  <span className="tag tag-mint">보냄</span>
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        await unsendMonthly(r.studentId, ym);
                        router.refresh();
                      })
                    }
                  >
                    되돌리기
                  </button>
                </>
              ) : (
                <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => send([r])}>
                  보내기
                </button>
              )}
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setOpenId(isOpen ? null : r.studentId);
                  setDraft(r.text);
                  setNote(r.note);
                }}
              >
                {isOpen ? "접기" : "문구"}
              </button>
            </div>

            {isOpen && (
              <div style={{ marginTop: 10 }}>
                <div className="field">
                  <label className="label">이 학생에게 덧붙일 한마디 (선택)</label>
                  <p className="hint" style={{ margin: "0 0 4px", fontSize: 11.5 }}>
                    비워두면 그 달 숫자를 보고 <b>한 줄 평이 자동으로</b> 붙습니다.
                    여기에 적으시면 적으신 말이 대신 나갑니다.
                  </p>
                  <textarea
                    className="input input-sm"
                    rows={2}
                    placeholder="예) 이번 달 문법 단원평가에서 특히 좋아졌습니다."
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    onBlur={() =>
                      startTransition(async () => {
                        await saveMonthly(r.studentId, ym, { note });
                        router.refresh();
                      })
                    }
                  />
                </div>
                <textarea
                  className="input"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  style={{ width: "100%", height: 260, fontSize: 12.5, marginTop: 8 }}
                />
                <div className="row" style={{ gap: 6, marginTop: 6, justifyContent: "flex-end" }}>
                  {r.edited && (
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          await saveMonthly(r.studentId, ym, { text: "" });
                          setOpenId(null);
                          router.refresh();
                        })
                      }
                    >
                      자동 문구로 되돌리기
                    </button>
                  )}
                  <button
                    className="btn btn-sm"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const res = await saveMonthly(r.studentId, ym, { text: draft });
                        if (res?.error) {
                          alert(res.error);
                          return;
                        }
                        setOpenId(null);
                        router.refresh();
                      })
                    }
                  >
                    문구 저장
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

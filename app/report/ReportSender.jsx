"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveReportText, resetReportText, sendReports, unsend } from "./actions";

function shiftDate(date, days) {
  const d = new Date(`${date}T00:00:00+09:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function ReportSender({ date, rows = [], sendReady = true, mode = "copy" }) {
  const [sel, setSel] = useState(() => new Set());
  const [openId, setOpenId] = useState(null);
  const [draft, setDraft] = useState("");
  const [filter, setFilter] = useState("todo");
  const [copied, setCopied] = useState(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const counts = {
    todo: rows.filter((r) => r.written && !r.sentAt).length,
    sent: rows.filter((r) => r.sentAt).length,
    draft: rows.filter((r) => !r.written).length,
  };

  const shown = rows.filter((r) => {
    if (filter === "todo") return r.written && !r.sentAt;
    if (filter === "sent") return !!r.sentAt;
    if (filter === "draft") return !r.written;
    return true;
  });

  const allChecked = shown.length > 0 && shown.every((r) => sel.has(r.id));
  function toggleAll() {
    if (allChecked) {
      const n = new Set(sel);
      shown.forEach((r) => n.delete(r.id));
      setSel(n);
    } else {
      setSel(new Set([...sel, ...shown.map((r) => r.id)]));
    }
  }
  function toggleOne(id) {
    const n = new Set(sel);
    n.has(id) ? n.delete(id) : n.add(id);
    setSel(n);
  }

  async function copy(text, key) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      alert("복사가 안 되면 문구를 직접 선택해서 복사해주세요.");
    }
  }

  function copySelected() {
    const picked = rows.filter((r) => sel.has(r.id));
    if (picked.length === 0) return;
    const text = picked
      .map((r) => `${r.phone ? `[${r.phone}] ` : ""}${r.name}\n${r.text}`)
      .join("\n\n──────────\n\n");
    copy(text, "bulk");
  }

  const sendsForReal = mode !== "copy";

  function send(list) {
    if (list.length === 0) return;
    if (sendsForReal) {
      const who = list.length === 1 ? `${list[0].name} 학생 학부모` : `${list.length}명`;
      if (!confirm(`${who}에게 지금 문자를 보낼까요?`)) return;
    }
    startTransition(async () => {
      const res = await sendReports(
        list.map((r) => ({ id: r.id, phone: r.phone, name: r.name, body: r.text }))
      );
      if (res?.error) {
        alert(res.error);
        return;
      }
      if (res?.failed?.length) {
        alert(
          `${res.count}건 보냈고, ${res.failed.length}건 실패했어요.\n\n` +
            res.failed.map((f) => `· ${f.name}: ${f.detail}`).join("\n")
        );
      }
      setSel(new Set());
      router.refresh();
    });
  }

  function cancelSend(ids) {
    startTransition(async () => {
      const res = await unsend(ids);
      if (res?.error) alert(res.error);
      setSel(new Set());
      router.refresh();
    });
  }

  function startEdit(r) {
    setOpenId(r.id);
    setDraft(r.text);
  }
  function saveEdit(r) {
    startTransition(async () => {
      const res = await saveReportText(r.id, draft);
      if (res?.error) {
        alert(res.error);
        return;
      }
      setOpenId(null);
      router.refresh();
    });
  }
  function resetEdit(r) {
    startTransition(async () => {
      const res = await resetReportText(r.id);
      if (res?.error) alert(res.error);
      setDraft(r.auto);
      router.refresh();
    });
  }

  return (
    <>
      <div className="row" style={{ gap: 6, alignItems: "center", marginTop: 12 }}>
        <a className="btn btn-ghost btn-sm" href={`/report?d=${shiftDate(date, -1)}`}>◂ 어제</a>
        <input
          className="input input-sm"
          type="date"
          style={{ width: 150 }}
          defaultValue={date}
          onChange={(e) => e.target.value && router.push(`/report?d=${e.target.value}`)}
        />
        <a className="btn btn-ghost btn-sm" href={`/report?d=${shiftDate(date, 1)}`}>내일 ▸</a>
        <span className="spacer" />
        {[
          ["todo", `보낼 것 ${counts.todo}`],
          ["sent", `보냄 ${counts.sent}`],
          ["draft", `기록 전 ${counts.draft}`],
          ["all", `전체 ${rows.length}`],
        ].map(([k, label]) => (
          <button
            key={k}
            className={`btn btn-sm ${filter === k ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setFilter(k)}
          >
            {label}
          </button>
        ))}
      </div>

      {!sendReady && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="notice">
            발송 기록을 남기려면 Supabase에서 <b>0012 SQL</b>을 먼저 실행해주세요.
            (지금도 문구 확인과 복사는 됩니다)
          </div>
        </div>
      )}

      {sel.size > 0 && (
        <div className="bulkbar">
          <b>{sel.size}명 선택</b>
          <button className="btn btn-primary btn-sm" onClick={copySelected} disabled={pending}>
            {copied === "bulk" ? "복사됨 ✓" : "문구 한 번에 복사"}
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => send(rows.filter((r) => sel.has(r.id)))}
            disabled={pending}
          >
            {sendsForReal ? "선택한 학생에게 보내기" : "보냄으로 표시"}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => cancelSend([...sel])} disabled={pending}>
            발송 취소
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setSel(new Set())}>선택 해제</button>
        </div>
      )}

      <div className="card" style={{ marginTop: 12, padding: 0, overflow: "hidden" }}>
        <div className="row" style={{ gap: 8, alignItems: "center", padding: "12px 16px" }}>
          <input type="checkbox" checked={allChecked} onChange={toggleAll} />
          <span className="hint">보이는 {shown.length}명 전체 선택</span>
        </div>

        {shown.length === 0 ? (
          <p className="muted" style={{ padding: "0 16px 16px", margin: 0, fontSize: 13.5 }}>
            {filter === "todo"
              ? "보낼 리포트가 없어요. 오늘 수업에서 기록을 완료하면 여기에 나타납니다."
              : "해당하는 학생이 없어요."}
          </p>
        ) : (
          shown.map((r) => {
            const editing = openId === r.id;
            return (
              <div className="stuRow" key={r.id}>
                <div className="row" style={{ gap: 8, alignItems: "center", padding: "10px 16px" }}>
                  <input type="checkbox" checked={sel.has(r.id)} onChange={() => toggleOne(r.id)} />
                  <b style={{ fontSize: 13.5 }}>{r.name}</b>
                  <span className="muted" style={{ fontSize: 12 }}>{r.who}</span>
                  {r.phone ? (
                    <span className="hint mono">{r.phone}</span>
                  ) : (
                    <span className="tag tag-amber">학부모 번호 없음</span>
                  )}
                  {r.edited && <span className="tag tag-lav">수정함</span>}
                  <span className="spacer" />
                  {r.sentAt ? (
                    <span className="tag tag-mint">보냄</span>
                  ) : r.written ? (
                    <span className="tag tag-sky">보낼 것</span>
                  ) : (
                    <span className="tag tag-amber">기록 전</span>
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={() => copy(r.text, r.id)}>
                    {copied === r.id ? "복사됨 ✓" : "복사"}
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => (editing ? setOpenId(null) : startEdit(r))}
                  >
                    {editing ? "닫기" : "고치기"}
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => (r.sentAt ? cancelSend([r.id]) : send([r]))}
                    disabled={pending}
                  >
                    {r.sentAt ? "발송 취소" : sendsForReal ? "보내기" : "보냄"}
                  </button>
                </div>

                {editing ? (
                  <div className="stuPanel">
                    <textarea
                      className="input"
                      rows={Math.max(8, draft.split("\n").length + 1)}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      style={{ fontSize: 13.5, lineHeight: 1.6 }}
                    />
                    <div className="row" style={{ gap: 6, marginTop: 8 }}>
                      <button className="btn btn-primary btn-sm" onClick={() => saveEdit(r)} disabled={pending}>
                        저장
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => copy(draft, r.id)}>
                        복사
                      </button>
                      {r.edited && (
                        <button className="btn btn-ghost btn-sm" onClick={() => resetEdit(r)} disabled={pending}>
                          자동 문구로 되돌리기
                        </button>
                      )}
                      <span className="hint" style={{ alignSelf: "center" }}>
                        저장하면 이후로는 이 문구가 쓰입니다 (재발송 포함)
                      </span>
                    </div>
                  </div>
                ) : (
                  <pre className="reportbox">{r.text}</pre>
                )}
              </div>
            );
          })
        )}
      </div>

      <p className="hint" style={{ marginTop: 10 }}>
        {sendsForReal ? (
          <>
            <b>보내기</b>를 누르면 설정한 방식으로 바로 발송됩니다. 방식은{" "}
            <a className="sky" href="/settings">설정 · 발송</a> 에서 바꿀 수 있어요.
          </>
        ) : (
          <>
            지금은 <b>직접 발송</b> 방식이에요. <b>복사 → 문자 앱에서 붙여넣기</b> 로 보내고
            <b> 보냄</b>을 눌러 기록해주세요.{" "}
            <a className="sky" href="/settings">설정 · 발송</a> 에서 문자 자동 발송으로 바꿀 수 있습니다.
          </>
        )}
      </p>
    </>
  );
}

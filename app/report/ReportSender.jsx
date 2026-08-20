"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  saveReportText, resetReportText, sendReports, unsend, skipSend, removeReports,
} from "./actions";
import { addDays } from "@/lib/day";

const shiftDate = addDays;

// 문구에 '내용'이 몇 줄이나 있는지 — 제목·인삿말·맺음말은 빼고 센다
// 출결 한 줄만 있는 문구를 그대로 보내면 학부모에게는 빈 문자처럼 보인다
function contentLines(text = "") {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("[") && (l.startsWith("·") || l.startsWith("▶")))
    .filter((l) => !/^· 출결:/.test(l)).length;
}

export default function ReportSender({ date, rows = [], sendReady = true, mode = "copy", chans = {} }) {
  const [sel, setSel] = useState(() => new Set());
  const [openId, setOpenId] = useState(null);
  const [draft, setDraft] = useState("");
  const [savedAt, setSavedAt] = useState(null);   // 문구 저장 시각 (2026-08-21)
  const [filter, setFilter] = useState("todo");
  const [copied, setCopied] = useState(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // 안 보내기로 한 것은 '보낼 것' 에서 빠진다 (처리하면 목록에서 사라진다)
  const skipped = (r) => (r.skip || []).includes("report");

  const counts = {
    todo: rows.filter((r) => r.written && !r.sentAt && !skipped(r)).length,
    sent: rows.filter((r) => r.sentAt).length,
    draft: rows.filter((r) => !r.written && !skipped(r)).length,
    skip: rows.filter((r) => skipped(r) && !r.sentAt).length,
  };

  const shown = rows.filter((r) => {
    if (filter === "todo") return r.written && !r.sentAt && !skipped(r);
    if (filter === "sent") return !!r.sentAt;
    if (filter === "draft") return !r.written && !skipped(r);
    if (filter === "skip") return skipped(r) && !r.sentAt;
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

  /**
   * **데일리리포트는 앱으로 나간다** (원장님, 2026-08-06).
   *
   * 재원생 학부모께 가던 것이라 문자·알림톡을 쓰지 않는다. 내용은 이미
   * 학부모 화면의 「최근 수업」에 그대로 있고, 보내기를 누르면 그 집 폰으로
   * 알림이 간다. 그래서 발송 방식(mode)과 상관없이 **언제나 실제로 나간다** —
   * 「직접 발송이라 기록만」 이 없다.
   */
  const sendsForReal = true;

  function send(list) {
    if (list.length === 0) return;
    // 출결 말고 적힌 게 없는 문구는 실수로 보내기 쉬우므로 한 번 더 물어본다
    const empty = list.filter((r) => contentLines(r.text) === 0);
    if (empty.length > 0) {
      const who = empty.map((r) => r.name).join(", ");
      if (
        !confirm(
          `${who} — 출결 말고 적힌 내용이 없어요.\n` +
            "이대로 보내면 학부모가 거의 빈 문자를 받습니다.\n\n그래도 보낼까요?"
        )
      ) {
        return;
      }
    }
    if (sendsForReal) {
      const who = list.length === 1 ? `${list[0].name} 학생 학부모` : `${list.length}명`;
      if (!confirm(`${who}에게 앱으로 보낼까요?\n학부모 화면에 올라가고 폰으로 알림이 갑니다.`)) return;
    }
    startTransition(async () => {
      const res = await sendReports(
        list.map((r) => ({ id: r.id, phone: r.phone, name: r.name, body: r.text, date, parts: r.parts }))
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

  function skip(ids, on) {
    startTransition(async () => {
      const res = await skipSend(ids, "report", on);
      if (res?.error) { alert(res.error); return; }
      setSel(new Set());
      router.refresh();
    });
  }

  /** 리포트를 아예 지운다 — 그날 수업 기록이 통째로 사라진다 */
  function remove(list) {
    if (list.length === 0) return;
    const who = list.length === 1 ? list[0].name : `${list.length}명`;
    if (
      !confirm(
        `${who} 의 오늘 리포트를 지울까요?\n\n` +
          "문자만 안 나가는 게 아니라 그날 수업 기록이 통째로 사라집니다 — " +
          "숙제 검사 결과와 학생이 낸 것도 함께 지워집니다. 되돌릴 수 없습니다.\n\n" +
          "문자만 안 보내려면 「안 보내기」 를 쓰세요."
      )
    ) return;
    startTransition(async () => {
      const res = await removeReports(list.map((r) => r.id));
      if (res?.error) { alert(res.error); return; }
      setSel(new Set());
      router.refresh();
    });
  }

  function startEdit(r) {
    setOpenId(r.id);
    setSavedAt(null);
    setDraft(r.text);
  }
  function saveEdit(r) {
    startTransition(async () => {
      const res = await saveReportText(r.id, draft);
      if (res?.error) {
        alert(res.error);
        return;
      }
      // 저장해도 안 닫는다 (2026-08-21) — 저장=닫기면 두 번 고칠 때
      // 「고치기」 를 다시 눌러 그 줄을 다시 찾아야 했다
      setSavedAt(new Date());
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
          ["skip", `안 보냄 ${counts.skip}`],
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
          <span className="tag tag-mint" title="학부모 화면에 올라가고, 그 집 폰으로 알림이 갑니다. 문자는 나가지 않습니다">
            앱으로 나감
          </span>
          <button className="btn btn-primary btn-sm" onClick={copySelected} disabled={pending}>
            {copied === "bulk" ? "복사됨 ✓" : "문구 한 번에 복사"}
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => send(rows.filter((r) => sel.has(r.id)))}
            disabled={pending}
          >
            선택한 학생에게 보내기
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => cancelSend([...sel])} disabled={pending}>
            발송 취소
          </button>
          {filter === "skip" ? (
            <button className="btn btn-ghost btn-sm" onClick={() => skip([...sel], false)} disabled={pending}>
              다시 보낼 것으로
            </button>
          ) : (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => skip([...sel], true)}
              disabled={pending}
              title="이 학생들에게는 오늘 리포트를 안 보냅니다. 기록으로 남고 되돌릴 수 있습니다"
            >
              안 보내기
            </button>
          )}
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => remove(rows.filter((r) => sel.has(r.id)))}
            disabled={pending}
            title="그날 수업 기록까지 지웁니다"
          >
            삭제
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
          <p className="muted" style={{ padding: "0 16px 16px", margin: 0, fontSize: 15 }}>
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
                  <b style={{ fontSize: 15 }}>{r.name}</b>
                  <span className="muted" style={{ fontSize: 13 }}>{r.who}</span>
                  {r.phone ? (
                    <span className="hint mono">{r.phone}</span>
                  ) : (
                    <span className="tag tag-amber">학부모 번호 없음</span>
                  )}
                  {r.edited && <span className="tag tag-lav">수정함</span>}
                  {!r.sentAt && contentLines(r.text) === 0 && (
                    <span className="tag tag-red" title="출결 말고는 적힌 게 없어요. 이대로 보내면 학부모가 빈 문자로 받습니다">
                      내용 없음
                    </span>
                  )}
                  <span className="spacer" />
                  {r.sentAt ? (
                    <span className="tag tag-mint">보냄</span>
                  ) : skipped(r) ? (
                    <span className="tag tag-muted">안 보냄</span>
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
                  {!r.sentAt && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => skip([r.id], !skipped(r))}
                      disabled={pending}
                      title={
                        skipped(r)
                          ? "다시 보낼 것으로 되돌립니다"
                          : "오늘은 이 학생에게 안 보냅니다 (기록으로 남습니다)"
                      }
                    >
                      {skipped(r) ? "되돌리기" : "안 보내기"}
                    </button>
                  )}
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => (r.sentAt ? cancelSend([r.id]) : send([r]))}
                    disabled={pending}
                  >
                    {r.sentAt ? "발송 취소" : "보내기"}
                  </button>
                </div>

                {editing ? (
                  <div className="stuPanel">
                    <textarea
                      className="input"
                      rows={Math.max(8, draft.split("\n").length + 1)}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      style={{ fontSize: 15, lineHeight: 1.6 }}
                    />
                    <div className="row" style={{ gap: 6, marginTop: 8 }}>
                      {savedAt && (
                        <span className="hint" style={{ fontSize: 12.5, alignSelf: "center" }}>
                          {savedAt.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 저장됨 ✓
                        </span>
                      )}
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
        <>
          <b>보내기</b>를 누르면 <b>학부모 화면</b>에 올라가고 그 집 폰으로 알림이 갑니다.
          문자·알림톡은 나가지 않습니다 — 밖으로 나가는 것은 아직 계정이 없는
          <b> 신규 상담</b>뿐이에요.
        </>
      </p>
    </>
  );
}

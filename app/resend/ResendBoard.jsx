"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveText, resetText, resend, listSends } from "./actions";
import { addDays } from "@/lib/day";

const shiftDate = addDays;

// 재발송은 발송 화면의 '다시 보내기' 탭이다 (따로 있던 /resend 를 합쳤다).
// 날짜를 옮겨도 탭이 풀리지 않게 여기로 돌아온다.
const HERE = "/report?t=resend";
function timeLabel(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}

const KINDS = [
  { key: "homework", label: "숙제 문자", hint: "다음 수업 숙제만 담은 짧은 문자예요." },
  { key: "report", label: "데일리리포트", hint: "수업 내용 전체가 담긴 문구예요." },
];

export default function ResendBoard({ date, rows = [], ready = true, mode = "copy", chans = {} }) {
  const [kind, setKind] = useState("homework");
  const [sel, setSel] = useState(() => new Set());
  const [openId, setOpenId] = useState(null);
  const [draft, setDraft] = useState("");
  const [filter, setFilter] = useState("all");
  const [copied, setCopied] = useState(null);
  const [history, setHistory] = useState({});
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const isHw = kind === "homework";
  const textOf = (r) => (isHw ? r.hwText : r.text);
  const autoOf = (r) => (isHw ? r.hwAuto : r.auto);
  const editedOf = (r) => (isHw ? r.hwEdited : r.edited);
  const sentOf = (r) => (isHw ? r.hwSentAt : r.sentAt);
  const countOf = (r) => (isHw ? r.sendCount?.homework : r.sendCount?.report) || 0;

  const shown = rows.filter((r) => {
    if (filter === "sent") return !!sentOf(r);
    if (filter === "unsent") return !sentOf(r);
    if (filter === "edited") return editedOf(r);
    if (filter === "hw") return r.nextCount > 0;
    return true;
  });

  const counts = {
    all: rows.length,
    sent: rows.filter((r) => sentOf(r)).length,
    unsent: rows.filter((r) => !sentOf(r)).length,
    edited: rows.filter((r) => editedOf(r)).length,
  };

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
    copy(
      picked
        .map((r) => `${r.phone ? `[${r.phone}] ` : ""}${r.name}\n${textOf(r)}`)
        .join("\n\n──────────\n\n"),
      "bulk"
    );
  }

  const sendsForReal = mode !== "copy";

  function doResend(list) {
    if (list.length === 0) return;
    const label = list.length === 1 ? `${list[0].name} 학생에게` : `${list.length}명에게`;
    const what = isHw ? "숙제 문자" : "데일리리포트";
    const q = sendsForReal
      ? `${label} ${what}를 지금 다시 보낼까요?`
      : `${label} ${what}를 다시 보낸 것으로 기록할까요?`;
    if (!confirm(q)) return;
    startTransition(async () => {
      const res = await resend(
        list.map((r) => ({ id: r.id, phone: r.phone, name: r.name, body: textOf(r), date, parts: r.parts })),
        kind
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

  function startEdit(r) {
    setOpenId(r.id);
    setDraft(textOf(r));
  }
  function saveEdit(r) {
    startTransition(async () => {
      const res = await saveText(r.id, kind, draft);
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
      const res = await resetText(r.id, kind);
      if (res?.error) alert(res.error);
      setDraft(autoOf(r));
      router.refresh();
    });
  }

  function loadHistory(r) {
    if (history[r.id]) {
      setHistory({ ...history, [r.id]: null });
      return;
    }
    startTransition(async () => {
      const res = await listSends(r.id);
      setHistory({ ...history, [r.id]: res.sends || [] });
      if (res.error) alert(res.error);
    });
  }

  return (
    <>
      <div className="row" style={{ gap: 6, alignItems: "center", marginTop: 12 }}>
        <a className="btn btn-ghost btn-sm" href={`${HERE}&d=${shiftDate(date, -1)}`}>◂ 어제</a>
        <input
          className="input input-sm"
          type="date"
          style={{ width: 150 }}
          defaultValue={date}
          onChange={(e) => e.target.value && router.push(`${HERE}&d=${e.target.value}`)}
        />
        <a className="btn btn-ghost btn-sm" href={`${HERE}&d=${shiftDate(date, 1)}`}>내일 ▸</a>
        <span className="spacer" />
        {KINDS.map((k) => (
          <button
            key={k.key}
            className={`btn btn-sm ${kind === k.key ? "btn-primary" : "btn-ghost"}`}
            onClick={() => { setKind(k.key); setOpenId(null); setSel(new Set()); }}
          >
            {k.label}
          </button>
        ))}
      </div>
      <p className="hint" style={{ margin: "6px 0 0" }}>
        {KINDS.find((k) => k.key === kind)?.hint} 고친 문구는 저장되어 다음에도 그대로 쓰입니다.
        {/* 종류마다 나가는 길이 다르다 — 고른 종류의 것을 바로 옆에 */}
        {mode === "sms" && (
          <>
            {" "}이 문자는{" "}
            <b>{chans[kind] === "alimtalk" ? "알림톡" : "문자"}</b>로 나갑니다.
          </>
        )}
      </p>

      {!ready && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="notice">
            재발송 기록을 남기려면 Supabase에서 <b>0013 SQL</b>을 먼저 실행해주세요.
            (지금도 문구 확인과 복사는 됩니다)
          </div>
        </div>
      )}

      <div className="row" style={{ gap: 4, marginTop: 10 }}>
        {[
          ["all", `전체 ${counts.all}`],
          ["unsent", `안 보냄 ${counts.unsent}`],
          ["sent", `보냄 ${counts.sent}`],
          ["edited", `수정함 ${counts.edited}`],
          ["hw", "숙제 있는 학생"],
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

      {sel.size > 0 && (
        <div className="bulkbar">
          <b>{sel.size}명 선택</b>
          <button className="btn btn-primary btn-sm" onClick={copySelected} disabled={pending}>
            {copied === "bulk" ? "복사됨 ✓" : "문구 한 번에 복사"}
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => doResend(rows.filter((r) => sel.has(r.id)))}
            disabled={pending}
          >
            {sendsForReal ? "선택한 학생에게 다시 보내기" : "다시 보냄으로 기록"}
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
            이 날짜에 해당하는 학생이 없어요.
          </p>
        ) : (
          shown.map((r) => {
            const editing = openId === r.id;
            const sent = sentOf(r);
            const n = countOf(r);
            const hist = history[r.id];
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
                  {isHw && r.nextCount === 0 && <span className="tag tag-muted">숙제 없음</span>}
                  {editedOf(r) && <span className="tag tag-lav">수정함</span>}
                  <span className="spacer" />
                  {sent ? (
                    <span className="tag tag-mint">{timeLabel(sent)} 보냄{n > 1 ? ` · ${n}회` : ""}</span>
                  ) : (
                    <span className="tag tag-amber">안 보냄</span>
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={() => copy(textOf(r), r.id)}>
                    {copied === r.id ? "복사됨 ✓" : "복사"}
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => (editing ? setOpenId(null) : startEdit(r))}
                  >
                    {editing ? "닫기" : "고치기"}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => loadHistory(r)} disabled={pending}>
                    이력
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => doResend([r])}
                    disabled={pending}
                  >
                    {sendsForReal ? "다시 보내기" : "다시 보냄"}
                  </button>
                </div>

                {hist && (
                  <div className="stuPanel" style={{ paddingTop: 10 }}>
                    {hist.length === 0 ? (
                      <span className="hint">아직 보낸 기록이 없어요.</span>
                    ) : (
                      <div className="stack" style={{ gap: 4 }}>
                        {hist.map((h) => (
                          <div className="unitrow" key={h.id} style={{ alignItems: "flex-start" }}>
                            <span className={`tag ${h.kind === "homework" ? "tag-sky" : "tag-lav"}`}>
                              {h.kind === "homework" ? "숙제" : "리포트"}
                            </span>
                            <span className="hint" style={{ minWidth: 84 }}>{timeLabel(h.sent_at)}</span>
                            <span style={{ flex: 1, fontSize: 12.5, whiteSpace: "pre-wrap" }}>
                              {h.body.split("\n").slice(0, 3).join("\n")}
                              {h.body.split("\n").length > 3 ? " …" : ""}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {editing ? (
                  <div className="stuPanel">
                    <textarea
                      className="input"
                      rows={Math.max(6, draft.split("\n").length + 1)}
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
                      {editedOf(r) && (
                        <button className="btn btn-ghost btn-sm" onClick={() => resetEdit(r)} disabled={pending}>
                          자동 문구로 되돌리기
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <pre className="reportbox">{textOf(r)}</pre>
                )}
              </div>
            );
          })
        )}
      </div>

      <p className="hint" style={{ marginTop: 10 }}>
        {sendsForReal
          ? "다시 보내기를 누르면 설정한 방식으로 바로 발송됩니다."
          : "지금은 직접 발송 방식이에요. 복사 → 문자 앱에서 붙여넣기 → 다시 보냄 순서로 쓰시면 됩니다."}{" "}
        보낸 이력은 학생별 <b>이력</b> 버튼에서 볼 수 있어요.{" "}
        <a className="sky" href="/settings">설정 · 발송</a>
      </p>
    </>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveText, resetText, resend, listSends } from "./actions";
import { addDays } from "@/lib/day";

const shiftDate = addDays;

// 재발송은 발송 화면의 '다시 보내기' 탭이다 (따로 있던 /resend 를 합쳤다).
// 날짜를 옮겨도 탭이 풀리지 않게 여기로 돌아온다.
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

/**
 * @param only "homework" 처럼 한 종류만 다루는 화면으로 쓸 때. 종류 고르는 단추를
 *             숨기고 「다시 보내기」 대신 그냥 「보내기」 로 말한다.
 */
export default function ResendBoard({ date, rows = [], ready = true, mode = "copy", chans = {}, only = null }) {
  const [kind, setKind] = useState(only || "homework");
  const HERE = `/report?t=${only === "homework" ? "hw" : "resend"}`;
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

  /**
   * **앱으로 나간다** (원장님, 2026-08-06). 데일리리포트·숙제 안내는 재원생
   * 학부모께 가던 것이라 문자·알림톡을 쓰지 않는다. 발송 방식과 상관없이
   * 언제나 실제로 나간다 — 앱에 올라가고 그 집 폰으로 알림이 간다.
   */
  const sendsForReal = true;

  function doResend(list) {
    if (list.length === 0) return;
    const label = list.length === 1 ? `${list[0].name} 학생에게` : `${list.length}명에게`;
    const what = isHw ? "숙제 안내" : "데일리리포트";
    const again = only ? "" : "다시 ";
    // 재원생·학부모께는 **앱으로** 간다 (2026-08-06). 발송 방식과 상관없다
    const q = `${label} ${what}를 ${again}앱으로 보낼까요?\n앱에 올라가고 폰으로 알림이 갑니다. 문자는 나가지 않습니다.`;
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
        {!only &&
          KINDS.map((k) => (
            <button
              key={k.key}
              className={`btn btn-sm ${kind === k.key ? "btn-on" : "btn-ghost"}`}
              onClick={() => { setKind(k.key); setOpenId(null); setSel(new Set()); }}
            >
              {k.label}
            </button>
          ))}
      </div>
      <p className="hint" style={{ margin: "6px 0 0" }}>
        {KINDS.find((k) => k.key === kind)?.hint} 고친 문구는 저장되어 다음에도 그대로 쓰입니다.
        {/* 어디로 나가는지 — 헷갈릴 자리라 바로 옆에 적어둔다 */}
        {" "}이것은 <b>앱</b>으로 나갑니다 (문자·알림톡 아님).
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
            className={`btn btn-sm ${filter === k ? "btn-on" : "btn-ghost"}`}
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
            {`선택한 학생에게 ${only ? "" : "다시 "}앱으로 보내기`}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setSel(new Set())}>선택 해제</button>
        </div>
      )}

      {/* PC(≥1100px)는 좌 대상 목록 / 우 열린 문구 판 (B2, 원장 승인 2026-08-27).
          줄마다 전문이 서면 한 화면에 두어 명뿐이라, 문구는 오른쪽에 붙여 세운다.
          좁으면 세로 그대로 — 미디어쿼리는 .splitview 가 처리한다. */}
      <div className="splitview" style={{ marginTop: 12 }}>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="row" style={{ gap: 8, alignItems: "center", padding: "12px 16px" }}>
          <input type="checkbox" checked={allChecked} onChange={toggleAll} />
          <span className="hint">보이는 {shown.length}명 전체 선택</span>
        </div>

        {shown.length === 0 ? (
          <p className="muted" style={{ padding: "0 16px 16px", margin: 0, fontSize: 15 }}>
            {rows.length === 0
              ? "이 날짜에 수업 기록이 없어요. 숙제 문자는 오늘 수업에 적은 내용으로 만들어지니, 먼저 오늘 수업에서 기록을 저장해주세요."
              : "고른 조건에 맞는 학생이 없어요. 위에서 「전체」를 눌러보세요."}
          </p>
        ) : (
          shown.map((r) => {
            const editing = openId === r.id;
            const sent = sentOf(r);
            const n = countOf(r);
            const hist = history[r.id];
            return (
              <div className="stuRow" key={r.id}>
                <div className="stuLine" style={{ cursor: "default" }}>
                  <span className="stuWho">
                    <input type="checkbox" checked={sel.has(r.id)} onChange={() => toggleOne(r.id)} />
                    <span className="stuName">{r.name}</span>
                    <span className="stuSub">{r.who}</span>
                  </span>
                  <span className="stuTags">
                  {r.phone ? (
                    <span className="hint mono">{r.phone}</span>
                  ) : (
                    <span className="tag tag-amber">학부모 번호 없음</span>
                  )}
                  {isHw && r.nextCount === 0 && <span className="tag tag-muted">숙제 없음</span>}
                  {editedOf(r) && <span className="tag tag-lav">수정함</span>}
                  {sent ? (
                    <span className="tag tag-mint">{timeLabel(sent)} 보냄{n > 1 ? ` · ${n}회` : ""}</span>
                  ) : (
                    <span className="tag tag-amber">안 보냄</span>
                  )}
                  </span>
                  <span className="stuEnd">
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
                    다시 보내기
                  </button>
                  </span>
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
                            <span style={{ flex: 1, fontSize: 14, whiteSpace: "pre-wrap" }}>
                              {h.body.split("\n").slice(0, 3).join("\n")}
                              {h.body.split("\n").length > 3 ? " …" : ""}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 좁은 화면에서는 줄 아래에서 그대로 읽는다. 넓은 화면에서는
                    오른쪽 판이 대신 보여주므로 접힌다 (.split-hide-wide) */}
                {!editing && <pre className="reportbox split-hide-wide">{textOf(r)}</pre>}
              </div>
            );
          })
        )}
      </div>

      {/* 오른쪽(폰은 위) — 열린 학생의 문구. 미리보기이자 편집 칸이다 */}
      {(() => {
        const r = rows.find((x) => x.id === openId);
        if (!r) return null;
        return (
          <aside className="card split-panel">
            <div className="row split-head" style={{ gap: 6, alignItems: "center" }}>
              <b style={{ fontSize: 15 }}>{r.name}</b>
              <span className="hint">{r.who}</span>
              <span className="spacer" />
              <button className="btn btn-ghost btn-sm" onClick={() => setOpenId(null)}>닫기</button>
            </div>
            <div className="split-body">
              <textarea
                className="input"
                rows={Math.max(6, draft.split("\n").length + 1)}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                style={{ fontSize: 16, lineHeight: 1.6 }}
              />
              <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: "wrap" }}>
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
          </aside>
        );
      })()}
      </div>

      <p className="hint" style={{ marginTop: 10 }}>
        보내기를 누르면 <b>앱에 올라가고</b> 그 집 폰으로 알림이 갑니다 — 문자는 나가지 않습니다.{" "}
        보낸 이력은 학생별 <b>이력</b> 버튼에서 볼 수 있어요.
      </p>
    </>
  );
}

"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  listTemplates,
  listRecipients,
  saveTemplate,
  deleteTemplate,
  sendNotices,
} from "./noticeActions";
import { longLabel, todaySeoul } from "@/lib/day";

// 자동으로 채울 수 있는 변수 — 학생 정보에서 나온다
function autoMap(r, academy, msg) {
  const today = longLabel(todaySeoul());
  return {
    학원명: academy,
    학생명: r.name || "",
    날짜: r.testOn || today,
    교재목록: (r.books || []).map((b) => `· ${b}`).join("\n") || "(배정된 교재 없음)",
    교재비: r.bookPrice ? `${r.bookPrice.toLocaleString()}원` : "(미정)",
    구매링크: (r.bookUrls || [])[0] || "(링크 없음)",
    테스트결과: r.testResult || "",
    학원주소: msg?.address || "",
    학원전화: msg?.phone || "",
  };
}

/** 본문에서 자동으로 못 채우는 변수 이름들 — 보내기 전에 입력칸으로 뜬다 */
export function askedVars(body, r, academy, msg) {
  const auto = autoMap(r || {}, academy, msg);
  const out = [];
  (body || "").replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, k) => {
    const key = k.trim();
    if (!(key in auto) && !out.includes(key)) out.push(key);
    return "";
  });
  return out;
}

// {{변수}} 를 실제 값으로 바꾼다. extra 는 내가 직접 채운 값
function fill(body, r, academy, msg, extra = {}) {
  const map = { ...autoMap(r, academy, msg), ...extra };
  return body.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, k) => {
    const key = k.trim();
    const v = map[key];
    return v === undefined || v === "" ? `{{${key}}}` : v;
  });
}

export default function NoticeSender({ academy = "클로이영어", mode = "copy", msg = {} }) {
  const [templates, setTemplates] = useState(null);
  const [tplId, setTplId] = useState("");
  const [body, setBody] = useState("");
  const [students, setStudents] = useState([]);
  const [inquiries, setInquiries] = useState([]);
  const [who, setWho] = useState("student"); // student | inquiry
  const [sel, setSel] = useState(() => new Set());
  const [q, setQ] = useState("");
  const [err, setErr] = useState(null);
  const [copied, setCopied] = useState(null);
  const [editing, setEditing] = useState(false);
  const [extra, setExtra] = useState({});   // 직접 채우는 변수
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const t = await listTemplates();
      if (t.error) setErr(t.error);
      // 데일리리포트처럼 앱이 본문을 만드는 문자는 여기서 보내지 않는다
      const list = (t.templates || []).filter((x) => !x.key);
      setTemplates(list);
      const first = list[0];
      if (first) {
        setTplId(first.id);
        setBody(first.body);
        setWho(["book", "makeup", "exam", "late_in"].includes(first.kind) ? "student" : "inquiry");
      }
      const r = await listRecipients();
      if (r.error) setErr(r.error);
      setStudents(r.students || []);
      setInquiries(r.inquiries || []);
    })();
  }, []);

  const rows = who === "student" ? students : inquiries;
  const kw = q.trim().toLowerCase();
  const shown = rows.filter(
    (r) => !kw || [r.name, r.who, r.phone].filter(Boolean).some((v) => v.toLowerCase().includes(kw))
  );
  const picked = rows.filter((r) => sel.has(r.id));

  function pickTemplate(id) {
    setTplId(id);
    setEditing(false);
    const t = (templates || []).find((x) => x.id === id);
    if (t) {
      setBody(t.body);
      setWho(["book", "makeup", "exam", "late_in"].includes(t.kind) ? "student" : "inquiry");
      setSel(new Set());
      setExtra({});
    }
  }

  function toggle(id) {
    const n = new Set(sel);
    n.has(id) ? n.delete(id) : n.add(id);
    setSel(n);
  }
  function toggleAll() {
    const every = shown.length > 0 && shown.every((r) => sel.has(r.id));
    const n = new Set(sel);
    shown.forEach((r) => (every ? n.delete(r.id) : n.add(r.id)));
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

  const sendsForReal = mode !== "copy";
  // 자동으로 못 채우는 변수 — 보내기 전에 입력칸으로 띄운다
  const ask = askedVars(body, picked[0], academy, msg);
  const blank = ask.filter((k) => !(extra[k] || "").trim());

  function send() {
    if (picked.length === 0) return;
    if (blank.length > 0) {
      if (!confirm(`아직 안 채운 것이 있습니다: ${blank.join(", ")}\n그대로 보낼까요?`)) return;
    }
    if (sendsForReal && !confirm(`${picked.length}명에게 지금 문자를 보낼까요?`)) return;
    startTransition(async () => {
      const res = await sendNotices(
        picked.map((r) => ({
          id: r.id,
          name: r.name,
          phone: r.phone,
          body: fill(body, r, academy, msg, extra),
          // 알림톡 변수 연결에서 쓸 수 있게, 내가 채운 값도 같이 넘긴다
          vars: Object.fromEntries(
            Object.entries(extra).map(([k, v]) => [`{{${k}}}`, v])
          ),
        })),
        (templates || []).find((t) => t.id === tplId)?.kind || "notice",
        tplId
      );
      if (res?.error) {
        alert(res.error);
        return;
      }
      const msg = sendsForReal
        ? `${res.count}명에게 보냈어요.`
        : `${res.count}명 처리했어요. (직접 발송 방식이라 실제 발송은 안 됩니다)`;
      alert(
        res.failed?.length
          ? `${msg}\n\n실패 ${res.failed.length}건\n` +
              res.failed.map((f) => `· ${f.name}: ${f.detail}`).join("\n")
          : msg
      );
      setSel(new Set());
      router.refresh();
    });
  }

  if (templates === null) {
    return <p className="hint" style={{ marginTop: 14 }}>불러오는 중…</p>;
  }

  return (
    <>
      {err && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="notice">{err}</div>
        </div>
      )}

      <div className="row" style={{ gap: 4, marginTop: 12, alignItems: "center" }}>
        {templates.map((t) => (
          <button
            key={t.id}
            className={`btn btn-sm ${tplId === t.id ? "btn-primary" : "btn-ghost"}`}
            onClick={() => pickTemplate(t.id)}
          >
            {t.name}
          </button>
        ))}
        <span className="spacer" />
        <button
          className="btn btn-ghost btn-sm"
          onClick={() =>
            startTransition(async () => {
              const res = await saveTemplate(null, { name: "새 안내 문자", body: "[{{학원명}}] ", kind: "general" });
              if (res?.error) alert(res.error);
              const t = await listTemplates();
              setTemplates((t.templates || []).filter((x) => !x.key));
            })
          }
          disabled={pending}
        >
          ＋ 문자 종류 추가
        </button>
      </div>

      <div className="grid-side" style={{ marginTop: 12 }}>
        {/* 받는 사람 */}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="row" style={{ gap: 6, padding: "12px 16px", alignItems: "center" }}>
            {[
              ["student", `재원생 ${students.length}`],
              ["inquiry", `상담·테스트 ${inquiries.length}`],
            ].map(([k, label]) => (
              <button
                key={k}
                className={`btn btn-sm ${who === k ? "btn-primary" : "btn-ghost"}`}
                onClick={() => { setWho(k); setSel(new Set()); }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="row" style={{ gap: 6, padding: "0 16px 10px", alignItems: "center" }}>
            <input
              className="input input-sm"
              style={{ width: 150 }}
              placeholder="이름 검색"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <button className="btn btn-ghost btn-sm" onClick={toggleAll}>
              보이는 사람 전체 선택
            </button>
            <span className="tag tag-sky">{sel.size}명</span>
          </div>
          <div style={{ maxHeight: 420, overflowY: "auto" }}>
            <table className="tbl tbl-tight">
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id}>
                    <td style={{ width: 30 }}>
                      <input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} />
                    </td>
                    <td style={{ fontWeight: 600 }}>{r.name}</td>
                    <td className="muted">{r.who}</td>
                    <td>
                      {r.phone ? (
                        <span className="hint mono">{r.phone}</span>
                      ) : (
                        <span className="tag tag-amber">번호 없음</span>
                      )}
                    </td>
                    <td>
                      {who === "student" && r.books.length > 0 && (
                        <span className="hint">교재 {r.books.length}권</span>
                      )}
                      {who === "inquiry" && r.testOn && (
                        <span className="tag tag-sky">테스트 {r.testOn.slice(5)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {shown.length === 0 && (
              <p className="muted" style={{ padding: 16, margin: 0, fontSize: 13 }}>
                해당하는 사람이 없어요.
              </p>
            )}
          </div>
        </div>

        {/* 문구 · 미리보기 */}
        <div className="card">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>문구</h2>
            <div className="row" style={{ gap: 4 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(!editing)}>
                {editing ? "미리보기" : "문구 고치기"}
              </button>
              {editing && (
                <>
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={pending || !tplId}
                    onClick={() =>
                      startTransition(async () => {
                        const t = templates.find((x) => x.id === tplId);
                        const res = await saveTemplate(tplId, { ...t, body });
                        if (res?.error) alert(res.error);
                        const next = await listTemplates();
                        setTemplates(next.templates || []);
                        setEditing(false);
                      })
                    }
                  >
                    저장
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={pending || !tplId}
                    onClick={() => {
                      if (!confirm("이 문자 종류를 목록에서 숨길까요?")) return;
                      startTransition(async () => {
                        await deleteTemplate(tplId);
                        const next = await listTemplates();
                        setTemplates(next.templates || []);
                        const first = (next.templates || [])[0];
                        setTplId(first?.id || "");
                        setBody(first?.body || "");
                        setEditing(false);
                      });
                    }}
                  >
                    삭제
                  </button>
                </>
              )}
            </div>
          </div>

          {editing ? (
            <>
              <p className="hint" style={{ margin: "8px 0" }}>
                자동으로 채워지는 변수:{" "}
                <b>{"{{학원명}} {{학생명}} {{날짜}} {{교재목록}} {{교재비}} {{구매링크}} {{테스트결과}} {{학원주소}} {{학원전화}}"}</b>
                <br />
                그 밖의 <b>{"{{이름}}"}</b> 은 무엇이든 쓸 수 있고, 보내기 전에 입력칸이 뜹니다
                (예: {"{{시간}} {{내용}}"}).
              </p>
              <textarea
                className="input"
                rows={12}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                style={{ fontSize: 13.5, lineHeight: 1.6 }}
              />
            </>
          ) : (
            <>
              <p className="hint" style={{ margin: "8px 0" }}>
                {picked.length > 0
                  ? `${picked[0].name} 학생에게 갈 내용 (선택한 ${picked.length}명 각각의 값으로 채워집니다)`
                  : "왼쪽에서 받는 사람을 고르면 실제 값이 채워진 문구가 보입니다."}
              </p>
              {ask.length > 0 && (
                <div className="card card-tight" style={{ marginBottom: 10 }}>
                  <b style={{ fontSize: 13 }}>보내기 전에 채울 것</b>
                  <p className="hint" style={{ margin: "3px 0 8px" }}>
                    여기 넣은 값은 고른 사람 <b>모두에게 똑같이</b> 들어갑니다. 학생마다 달라야 하면
                    한 명씩 보내주세요.
                  </p>
                  <div className="editgrid">
                    {ask.map((k) => (
                      <div className="field" key={k}>
                        <label className="label">{k}</label>
                        <input
                          className="input input-sm"
                          value={extra[k] || ""}
                          onChange={(e) => setExtra({ ...extra, [k]: e.target.value })}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <pre className="reportbox" style={{ borderRadius: 10, borderTop: 0 }}>
                {picked.length > 0 ? fill(body, picked[0], academy, msg, extra) : body}
              </pre>
            </>
          )}

          <div className="row" style={{ gap: 6, marginTop: 12 }}>
            <button className="btn btn-primary" onClick={send} disabled={pending || picked.length === 0}>
              {pending
                ? "처리 중…"
                : sendsForReal
                ? `${picked.length}명에게 보내기`
                : `${picked.length}명 문구 만들기`}
            </button>
            <button
              className="btn btn-ghost"
              disabled={picked.length === 0}
              onClick={() =>
                copy(
                  picked
                    .map((r) => `${r.phone ? `[${r.phone}] ` : ""}${r.name}\n${fill(body, r, academy)}`)
                    .join("\n\n──────────\n\n"),
                  "bulk"
                )
              }
            >
              {copied === "bulk" ? "복사됨 ✓" : "문구 한 번에 복사"}
            </button>
          </div>
          {!sendsForReal && (
            <p className="hint" style={{ marginTop: 8 }}>
              지금은 <b>직접 발송</b> 방식이에요. 복사해서 문자 앱으로 보내시면 됩니다.{" "}
              <a className="sky" href="/settings">설정 · 발송</a> 에서 자동 발송으로 바꿀 수 있어요.
            </p>
          )}
        </div>
      </div>
    </>
  );
}

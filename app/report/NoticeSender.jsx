"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  listTemplates,
  listRecipients,
  saveTemplate,
  deleteTemplate,
  sendNotices,
  assignAnnouncedBooks,
} from "./noticeActions";
import { longLabel, todaySeoul } from "@/lib/day";
import { fromLabel } from "@/lib/bookUse";

// 자동으로 채울 수 있는 변수 — 학생 정보에서 나온다
//
// **교재는 학생에게 배정된 것이 아니라 「이번에 안내할 것」이다.**
// 교재 안내는 아직 안 산 책을 사달라고 보내는 문자라, 이미 배정된 것을
// 넣으면 갖고 있는 책을 또 사라고 보내게 된다. 그래서 위에서 고른 책
// (books) 을 그대로 받아서 목록·교재비·링크를 **한 곳에서 셈한다.**
// 셋이 따로 놀면 안 된다 — 세 권 적어놓고 값은 다섯 권 값이면 사고다.
function autoMap(r, academy, msg, books = []) {
  const today = longLabel(todaySeoul());
  const price = books.reduce((a, b) => a + (Number(b.price) || 0), 0);
  return {
    학원명: academy,
    학생명: r.name || "",
    날짜: r.testOn || today,
    교재목록: books.map((b) => `· ${b.name}`).join("\n") || "(배정된 교재 없음)",
    교재비: price ? `${price.toLocaleString()}원` : "(미정)",
    구매링크: books.map((b) => b.url).filter(Boolean)[0] || "(링크 없음)",
    테스트결과: r.testResult || "",
    학원주소: msg?.address || "",
    학원전화: msg?.phone || "",
  };
}

/** 본문에서 자동으로 못 채우는 변수 이름들 — 보내기 전에 입력칸으로 뜬다 */
export function askedVars(body, r, academy, msg) {
  const auto = autoMap(r || {}, academy, msg, []);
  const out = [];
  (body || "").replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, k) => {
    const key = k.trim();
    if (!(key in auto) && !out.includes(key)) out.push(key);
    return "";
  });
  return out;
}

// {{변수}} 를 실제 값으로 바꾼다. extra 는 내가 직접 채운 값
function fill(body, r, academy, msg, extra = {}, books = []) {
  const map = { ...autoMap(r, academy, msg, books), ...extra };
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
  // 이번에 **안내할** 교재 (학원 교재 전체에서 고른다) · 언제부터 쓸 것인가
  const [catalog, setCatalog] = useState([]);
  const [pickBooks, setPickBooks] = useState(() => new Set());
  const [bookQ, setBookQ] = useState("");
  const [startOn, setStartOn] = useState(todaySeoul());
  const [assign, setAssign] = useState(true);
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
      setCatalog(r.catalog || []);
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
      setPickBooks(new Set());
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
  /**
   * **재원생에게는 앱으로 간다** (원장님, 2026-08-06).
   *
   * 교재 · 보강 · 늦은 귀가 … 알림톡으로 보내던 것을 전부 앱 안에서 해결하기로
   * 했다. 그래서 재원생 쪽은 발송 방식(문자/직접)과 상관없이 **언제나 실제로
   * 나간다** — 앱 공지로 올라가고 집으로 알림이 간다. 문자는 한 통도 안 나간다.
   * 밖으로 나가는 것은 **아직 계정이 없는 신규 상담**뿐이다.
   */
  const toApp = who === "student";
  const realSend = toApp || sendsForReal;

  // 교재를 말하는 문구인가 — 그러면 **어느 책을 안내할지 고르게 한다.**
  const usesBooks = /\{\{\s*교재(목록|비)\s*\}\}/.test(body || "");
  const bookKw = bookQ.trim().toLowerCase();
  const bookRows = catalog.filter(
    (b) => !bookKw || `${b.name} ${b.area}`.toLowerCase().includes(bookKw)
  );
  // 고른 책 — 문구의 {{교재목록}}·{{교재비}}·{{구매링크}} 가 전부 여기서 나온다
  const chosen = catalog.filter((b) => pickBooks.has(b.id));
  // 이미 갖고 있는 사람이 있으면 알려준다 (또 사라고 보내면 안 된다)
  const alreadyOf = (id) => picked.filter((r) => (r.has || []).includes(id)).length;
  function toggleBook(id) {
    const n = new Set(pickBooks);
    n.has(id) ? n.delete(id) : n.add(id);
    setPickBooks(n);
  }

  // 자동으로 못 채우는 변수 — 보내기 전에 입력칸으로 띄운다
  const ask = askedVars(body, picked[0], academy, msg);
  const blank = ask.filter((k) => !(extra[k] || "").trim());

  function send() {
    if (picked.length === 0) return;
    if (blank.length > 0) {
      if (!confirm(`아직 안 채운 것이 있습니다: ${blank.join(", ")}\n그대로 보낼까요?`)) return;
    }
    // 교재를 말하는 문구인데 한 권도 안 골랐으면 빈 목록이 나간다 — 먼저 잡는다
    if (usesBooks && chosen.length === 0) {
      alert("안내할 교재를 한 권 이상 골라주세요.");
      return;
    }
    if (
      realSend &&
      !confirm(
        toApp
          ? `${picked.length}명에게 앱으로 안내를 보낼까요?\n앱 공지에 올라가고 아이·어머니 폰으로 알림이 갑니다. 문자는 나가지 않습니다.`
          : `${picked.length}명에게 지금 문자를 보낼까요?`
      )
    ) return;
    startTransition(async () => {
      const res = await sendNotices(
        picked.map((r) => ({
          id: r.id,
          name: r.name,
          phone: r.phone,
          body: fill(body, r, academy, msg, extra, chosen),
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
      // 이 이름을 `msg` 로 두면 안 된다 — 바깥의 msg(문구 설정) 를 가려서,
      // 위 fill() 이 아직 만들어지지도 않은 이것을 보게 된다 (TDZ 오류).
      /**
       * **올린 것과 알림이 간 것은 다르다** (원장님, 2026-08-07 —
       * 「학생 학부모 어플에서 전달사항은 알림이 안 와」).
       *
       * 지금까지는 켠 기기가 하나도 없어도 「알림이 갑니다」 라고만 나왔다.
       * 몇 대에 갔는지 그대로 적는다 — 0 이면 그 집이 아직 안 켠 것이다.
       */
      let done = toApp
        ? `${res.count}명에게 앱으로 보냈어요. 앱 공지에 올라갔습니다.` +
          (res.pushed > 0
            ? ` 폰 알림은 ${res.pushed}대로 갔어요.`
            : " 다만 폰 알림은 한 대도 못 갔어요 — 아직 아무도 「알림 받기」를 안 켜신 것 같습니다. 앱을 홈 화면에 담고 그 아이콘으로 열어서 켜셔야 합니다.")
        : sendsForReal
        ? `${res.count}명에게 보냈어요.`
        : `${res.count}명 처리했어요. (직접 발송 방식이라 실제 발송은 안 됩니다)`;

      // 안내한 교재를 **사용 예정일부터** 재원생 정보에 꽂아둔다.
      // 보낸 뒤에 한다 — 문자가 안 나갔는데 배정만 되어 있으면 안 된다.
      if (usesBooks && assign && chosen.length > 0) {
        const a = await assignAnnouncedBooks(
          picked.map((r) => r.id),
          chosen.map((b) => b.id),
          startOn
        );
        if (a?.error) done += `\n\n교재 배정은 실패했어요: ${a.error}`;
        else if (a.added > 0) done += `\n교재 ${a.added}건을 ${startOn} 부터 쓰는 것으로 배정했어요.`;
        else done += "\n고른 교재는 이미 다 배정되어 있어서 그대로 뒀어요.";
      }

      alert(
        res.failed?.length
          ? `${done}\n\n실패 ${res.failed.length}건\n` +
              res.failed.map((f) => `· ${f.name}: ${f.detail}`).join("\n")
          : done
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
              {usesBooks && (
                <div className="card card-tight" style={{ marginBottom: 10 }}>
                  <div className="row" style={{ alignItems: "center", gap: 6 }}>
                    <b style={{ fontSize: 13 }}>이번에 안내할 교재</b>
                    <span className="tag tag-sky">{pickBooks.size}권</span>
                    <span className="spacer" />
                    <input
                      className="input input-sm"
                      style={{ width: 130 }}
                      placeholder="교재 검색"
                      value={bookQ}
                      onChange={(e) => setBookQ(e.target.value)}
                    />
                    {pickBooks.size > 0 && (
                      <button className="btn btn-ghost btn-sm" onClick={() => setPickBooks(new Set())}>
                        고른 것 지우기
                      </button>
                    )}
                  </div>
                  <p className="hint" style={{ margin: "3px 0 8px" }}>
                    <b>아직 안 산 책</b>을 고르는 자리입니다 (학원 교재 전체에서 고릅니다).
                    고른 책으로 <b>교재목록·교재비·구매링크</b>가 함께 채워집니다.
                  </p>

                  {catalog.length === 0 ? (
                    <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                      등록된 교재가 없어요. <a className="sky" href="/textbooks">교재</a> 에서 먼저 넣어주세요.
                    </p>
                  ) : (
                    <div style={{ maxHeight: 220, overflowY: "auto" }}>
                      <table className="tbl tbl-tight">
                        <tbody>
                          {bookRows.map((b) => {
                            const dup = alreadyOf(b.id);
                            return (
                              <tr key={b.id}>
                                <td style={{ width: 30 }}>
                                  <input
                                    type="checkbox"
                                    checked={pickBooks.has(b.id)}
                                    onChange={() => toggleBook(b.id)}
                                  />
                                </td>
                                <td style={{ fontWeight: 600 }}>{b.name}</td>
                                <td className="muted">{b.area}</td>
                                <td className="muted">
                                  {b.price ? `${b.price.toLocaleString()}원` : "가격 없음"}
                                </td>
                                <td>
                                  {/* 이미 갖고 있는 책을 또 사라고 보내면 안 된다 */}
                                  {dup > 0 && (
                                    <span className="tag tag-amber" style={{ fontSize: 10.5 }}>
                                      {picked.length > 1 ? `${dup}명 이미 있음` : "이미 있음"}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {bookRows.length === 0 && (
                        <p className="muted" style={{ padding: "8px 0 0", margin: 0, fontSize: 13 }}>
                          찾는 교재가 없어요.
                        </p>
                      )}
                    </div>
                  )}

                  {/* **사용 예정일.** 보내는 순간 배정하면 책도 없는데 오늘 수업
                      진도에 뜬다. 그렇다고 안 해두면 책 온 날 손으로 배정해야 하고,
                      그러면 빠뜨린다. 그래서 지금 꽂아두고 날짜로 연다. */}
                  <div className="row" style={{ gap: 8, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
                    <label className="row" style={{ gap: 6, alignItems: "center", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={assign}
                        onChange={(e) => setAssign(e.target.checked)}
                      />
                      <span style={{ fontSize: 13 }}>재원생 정보에 배정하기</span>
                    </label>
                    <span className="hint">사용 예정일</span>
                    <input
                      className="input input-sm"
                      type="date"
                      style={{ width: 150 }}
                      value={startOn}
                      disabled={!assign}
                      onChange={(e) => setStartOn(e.target.value)}
                    />
                  </div>
                  {assign && (
                    <p className="hint" style={{ margin: "6px 0 0" }}>
                      이 날부터 오늘 수업 · 수업준비 · 진도에 나옵니다. 그 전까지는 재원생
                      정보에만 <b>「{fromLabel(startOn) || "사용 예정"}」</b> 으로 보입니다.
                      이미 갖고 있는 교재는 건드리지 않습니다.
                    </p>
                  )}
                </div>
              )}

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
                {picked.length > 0 ? fill(body, picked[0], academy, msg, extra, chosen) : body}
              </pre>
            </>
          )}

          <div className="row" style={{ gap: 6, marginTop: 12 }}>
            <button className="btn btn-primary" onClick={send} disabled={pending || picked.length === 0}>
              {pending
                ? "처리 중…"
                : toApp
                ? `${picked.length}명에게 앱으로 보내기`
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
                    .map((r) => `${r.phone ? `[${r.phone}] ` : ""}${r.name}\n${fill(body, r, academy, msg, extra, chosen)}`)
                    .join("\n\n──────────\n\n"),
                  "bulk"
                )
              }
            >
              {copied === "bulk" ? "복사됨 ✓" : "문구 한 번에 복사"}
            </button>
          </div>
          {toApp ? (
            <p className="hint" style={{ marginTop: 8 }}>
              재원생·학부모께는 <b>앱 안 공지</b>로 나갑니다 — 문자·알림톡은 쓰지 않습니다.
              어머니 폰에는 앱 알림으로 뜹니다 (앱을 홈 화면에 담고 알림 받기를 켜두셔야 합니다).
              문자로 나가는 것은 <b>아직 계정이 없는 신규 상담</b>뿐이에요.
            </p>
          ) : (
            !sendsForReal && (
              <p className="hint" style={{ marginTop: 8 }}>
                지금은 <b>직접 발송</b> 방식이에요. 복사해서 문자 앱으로 보내시면 됩니다.{" "}
                <a className="sky" href="/settings">설정 · 발송</a> 에서 자동 발송으로 바꿀 수 있어요.
              </p>
            )
          )}
        </div>
      </div>
    </>
  );
}

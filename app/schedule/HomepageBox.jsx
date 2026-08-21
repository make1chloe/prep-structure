"use client";

/**
 * **학교 홈페이지에서 가져오기** (원장님, 2026-08-10 — 「나이스 말고 학교
 * 홈페이지에 등록된 내용으로 기록할 수 없을까? 학교 홈페이지랑 다르다
 * 나이스가」 · 「학교 홈페이지를 넣어놓고 확인해서 긁어오게 할 수는 없어?」).
 *
 * 학교는 일정을 **두 군데에 따로 적는다** — 나이스와 학교 홈페이지. 같은
 * 사람이 같은 날 채우지 않아서 시험 날짜가 홈페이지엔 있는데 나이스엔 없는
 * 일이 실제로 생겼다 (박문중). 나이스에 없으면 우리 앱에는 회차가 안 생기고,
 * 그 학교 아이들은 대비 자료도 · 결석 예상도 · 성적 자리도 없이 시험을 본다.
 *
 * **자동으로 넣지 않는다.** 남의 홈페이지 모양은 언제든 바뀌고, 잘못 읽은
 * 것을 조용히 회차로 만들면 나이스만 볼 때보다 더 나쁘다. 읽은 것을 그대로
 * 보여드리고, **나이스에 없는 것**을 짚어드리고, 고르신 것만 넣는다.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { shortName } from "@/lib/schoolName";
import { splitUrls } from "@/lib/schoolSite";
import { peekSchoolSite, peekSchoolText, addFromSite, saveHomepage } from "./neisActions";

const KIND = {
  school: { label: "내신 시험", cls: "tag-amber" },
  mock: { label: "모의고사", cls: "tag-lav" },
  suneung: { label: "대수능", cls: "tag-lav" },
  assess: { label: "수행평가류", cls: "tag-muted" },
  "": { label: "그 밖", cls: "tag-muted" },
};

export default function HomepageBox({ schools = [], from, to }) {
  const [open, setOpen] = useState(false);
  const [id, setId] = useState("");
  const [url, setUrl] = useState("");
  /**
   * **붙여넣기를 기본으로 둔다** (원장님, 2026-08-11 — 「이 방식은 오류가 많을
   * 거 같음」). 주소로 긁는 길은 어긋날 곳이 많다 — 학기마다 주소가 다르고,
   * 단추가 자바스크립트고, 우리 서버가 그 학교를 못 부를 수도 있다.
   * 눈에 보이는 것을 복사해 붙이면 그 모두가 사라진다.
   */
  const [way, setWay] = useState("paste");
  const [text, setText] = useState("");
  const [res, setRes] = useState(null);
  const [pick, setPick] = useState(() => new Set());
  const [err, setErr] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const school = schools.find((s) => s.id === id);

  function choose(v) {
    setId(v);
    setRes(null);
    setErr("");
    setText("");
    setUrl((schools.find((s) => s.id === v)?.homepage) || "");
  }

  /**
   * 읽은 것을 화면에 올린다. **처음부터 골라두는 것은 「나이스에 없는 내신
   * 시험」뿐** — 그것이 이 화면을 여신 까닭이다. 나머지까지 켜두면 하나하나
   * 꺼야 한다.
   */
  function show(r) {
    setRes(r);
    setPick(new Set(
      (r.rows || [])
        // 나이스를 못 물어봤으면 inNeis 가 없다 — 그때는 「회차가 없는 내신
        // 시험」 을 골라둔다 (아무것도 안 골라두면 하나하나 켜야 한다)
        .map((x, i) => (x.kind === "school" && x.inNeis !== true && !x.hasExam ? i : -1))
        .filter((i) => i >= 0)
    ));
  }

  function look() {
    setErr("");
    startTransition(async () => {
      if (way === "paste") {
        const r = await peekSchoolText(id, from, to, text);
        if (r?.error) { setErr(r.error); setRes(null); return; }
        show(r);
        return;
      }
      // 주소를 고쳤으면 적어둔다 (다음에 또 안 적으시게). 적어두기가 안 돼도
      // **읽기는 되어야 한다** — 그래서 화면에 적힌 주소를 그대로 넘긴다.
      if (splitUrls(url).join("\n") !== splitUrls(school?.homepage).join("\n")) {
        const w = await saveHomepage(id, url);
        if (w?.error) setErr(w.error);
      }
      const r = await peekSchoolSite(id, from, to, url);
      if (r?.error) { setErr(r.error); setRes(null); return; }
      show(r);
    });
  }

  function save() {
    const rows = (res?.rows || []).filter((_r, i) => pick.has(i));
    if (rows.length === 0) return;
    startTransition(async () => {
      const r = await addFromSite(res.school, rows);
      if (r?.error) { setErr(r.error); return; }
      const lines = [`시험 ${r.added}개를 넣었어요.`];
      if (r.skipped?.length) {
        lines.push("", `${r.skipped.length}개는 이미 그 날짜에 회차가 있어 넘어갔습니다 —`);
        r.skipped.slice(0, 8).forEach((x) => lines.push(`  · ${x}`));
      }
      alert(lines.join("\n"));
      setRes(null);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
          학교 홈페이지에서 가져오기
        </button>
      </div>
    );
  }

  const gaps = (res?.rows || []).filter((r) => r.kind === "school" && r.inNeis === false).length;

  return (
    <div className="card card-tight" style={{ marginTop: 10, background: "var(--surface-2)" }}>
      <div className="row" style={{ gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        <b style={{ fontSize: 14.5 }}>학교 홈페이지에서 가져오기</b>
        <span className="spacer" />
        <button className="btn btn-ghost btn-sm" onClick={() => { setOpen(false); setRes(null); }}>
          닫기
        </button>
      </div>
      <p className="hint" style={{ margin: "6px 0 8px", fontSize: 12.5, lineHeight: 1.7 }}>
        학교는 일정을 <b>나이스와 홈페이지 두 군데에 따로</b> 적습니다. 그래서 시험 날짜가
        홈페이지엔 있는데 나이스엔 없는 일이 생깁니다. 여기서 <b>나이스에 없는 것</b>을 찾아
        회차로 만듭니다. <b>읽은 것을 보여드리고, 고르신 것만 넣습니다.</b>
        <br />
        가장 확실한 방법은 <b>붙여넣기</b>입니다 — 홈페이지에서 보이는 표를 그대로
        복사해 붙이면 됩니다.
      </p>

      <div className="row" style={{ gap: 6, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div className="field" style={{ width: 150 }}>
          <label className="label">학교</label>
          <select className="input input-sm" value={id} onChange={(e) => choose(e.target.value)}>
            <option value="">고르세요</option>
            {schools.map((s) => (
              <option key={s.id} value={s.id}>{shortName(s.name)}</option>
            ))}
          </select>
        </div>
        {/**
          * **어느 길로 읽을지.** 붙여넣기가 기본이다 — 주소로 긁는 길은
          * 학기·단추·로그인·서버 차단으로 어긋날 곳이 많다.
          */}
        <div className="field">
          <label className="label">읽는 방법</label>
          <div className="row" style={{ gap: 4 }}>
            {[["paste", "붙여넣기"], ["url", "주소로 읽기"]].map(([v, label]) => (
              <button
                key={v}
                className={`btn btn-sm ${way === v ? "btn-primary" : "btn-ghost"}`}
                onClick={() => { setWay(v); setRes(null); setErr(""); }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {way === "paste" ? (
        <div style={{ marginTop: 8 }}>
          <div className="field">
            <label className="label">학교 홈페이지 학사일정을 그대로 붙여넣으세요</label>
            <textarea
              className="input input-sm"
              rows={5}
              placeholder={"2026-10-13 ~ 2026-10-16   2학기 중간고사\n2026-12-08 ~ 2026-12-10   2학기 기말고사"}
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={!id}
              style={{ resize: "vertical", lineHeight: 1.6 }}
            />
          </div>
          <p className="hint" style={{ margin: "6px 0 0", fontSize: 12.5, lineHeight: 1.7 }}>
            {/* 원장님, 2026-08-11 — 「이 방식은 오류가 많을 거 같음」 (맞는 말입니다) */}
            학교 홈페이지에서 <b>2학기를 눌러 화면을 띄운 뒤</b>, 일정 표를 드래그해
            복사(Ctrl+C)하고 여기에 붙여넣으세요(Ctrl+V). <b>보이는 것이 그대로
            들어옵니다</b> — 주소·단추·로그인 때문에 어긋날 일이 없습니다.
            표를 통째로, 여러 번에 나눠 붙여넣으셔도 됩니다.
          </p>
          <button
            className="btn btn-primary btn-block"
            style={{ marginTop: 8 }}
            disabled={pending || !id || !text.trim()}
            onClick={look}
          >
            {pending ? "읽는 중…" : "붙여넣은 글에서 읽기"}
          </button>
        </div>
      ) : (
        <div style={{ marginTop: 8 }}>
          <div className="row" style={{ gap: 6, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div className="field" style={{ flex: 1, minWidth: 240 }}>
              <label className="label">홈페이지 학사일정 주소 (여러 개면 줄을 나눠서)</label>
              <textarea
                className="input input-sm"
                rows={2}
                placeholder={"https://bakmun.icems.kr/schdList.do?...\nhttps://bakmun.icems.kr/schdList.do?... (2학기 화면)"}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={!id}
                style={{ resize: "vertical", lineHeight: 1.5 }}
              />
            </div>
            <button
              className="btn btn-primary btn-sm"
              disabled={pending || !id || !url.trim()}
              onClick={look}
            >
              {pending ? "읽는 중…" : "읽어보기"}
            </button>
          </div>
          <p className="hint" style={{ margin: "6px 0 0", fontSize: 12.5, lineHeight: 1.7 }}>
            <b>주소로 읽는 것은 잘 안 될 수 있습니다.</b> 학기마다 주소가 다르거나,
            단추가 자바스크립트거나, 우리 서버가 그 학교를 못 부르면 빈 화면이 됩니다.
            안 되면 <b>붙여넣기</b>로 하세요 — 그건 늘 됩니다.
            <br />
            {/* 원장님, 2026-08-11 — 「페이지에서 2학기를 눌러야 할 수도 있는데」 */}
            「2학기」 단추가 주소로 되어 있으면 따라가서 같이 읽고,{" "}
            <b>못 따라가면 아래에 알려드립니다</b>.
          </p>
        </div>
      )}
      {err && <div className="err" style={{ marginTop: 8 }}>{err}</div>}

      {res && (
        <div style={{ marginTop: 10 }}>
          <div className="row" style={{ gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
            <b style={{ fontSize: 14 }}>{shortName(res.school)} — 읽은 것 {res.rows.length}줄</b>
            {/**
              * **「비교 안 함」 을 「다 있습니다」 로 보이면 안 된다.** 나이스를
              * 못 물어봤을 때도 초록 딱지가 떠서, 안 물어본 것이 「다 있다」 로
              * 읽혔다 (2026-08-11 에 화면을 찍어보고 알았다).
              */}
            {!res.comparedToNeis ? (
              <span className="tag tag-muted">나이스와 비교 안 함 (인증키·학교코드 없음)</span>
            ) : gaps > 0 ? (
              <span className="tag tag-amber">나이스에 없는 내신 시험 {gaps}개</span>
            ) : (
              <span className="tag tag-mint">나이스에 다 있습니다</span>
            )}
          </div>

          {/**
            * **무엇을 읽었는지 그대로 보여드린다.** 「2학기가 없는 학교」 와
            * 「2학기 화면을 못 읽은 것」 은 다르다 — 이것이 없으면 구별할 수 없다.
            */}
          {res.read?.length > 0 && (
            <div className="hint" style={{ marginTop: 6, fontSize: 12.5, lineHeight: 1.7 }}>
              읽은 화면 {res.read.length}개 —{" "}
              {res.read.map((p, i) => (
                <span key={i}>
                  {i > 0 && " · "}
                  <b>{p.label}</b>{" "}
                  {p.error ? (
                    <span style={{ color: "var(--danger)" }}>못 읽음 ({p.error})</span>
                  ) : (
                    `${p.count}줄`
                  )}
                </span>
              ))}
            </div>
          )}

          {/* 자바스크립트 단추는 서버가 따라갈 수 없다 — 숨기지 않고 말씀드린다 */}
          {res.blocked?.length > 0 && (
            <p className="hint" style={{ marginTop: 4, fontSize: 12.5, color: "var(--amber)" }}>
              따라갈 수 없는 단추 {res.blocked.join(" · ")} — 그 화면을 직접 띄우신 뒤
              <b> 주소를 한 줄 더</b> 넣어주세요.
            </p>
          )}
          {res.truncated && (
            <p className="hint" style={{ marginTop: 4, fontSize: 12.5, color: "var(--amber)" }}>
              화면이 너무 많아 8개까지만 읽었습니다.
            </p>
          )}

          {res.rows.length === 0 ? (
            <div className="err" style={{ marginTop: 8 }}>
              {way === "paste" ? (
                <>
                  붙여넣은 글에서 <b>날짜가 붙은 줄</b>을 못 찾았어요. 날짜가 같이 복사됐는지
                  봐주세요 (「10.13 2학기 중간고사」 처럼 날짜와 이름이 함께 있어야 합니다).
                  받아오기 기간({from} ~ {to}) 밖의 날짜도 빠집니다.
                </>
              ) : (
                <>
                  이 주소에서 이 기간에 해당하는 줄을 못 찾았어요. <b>붙여넣기</b>로 해보세요 —
                  화면을 띄워 표를 복사해 붙이시면 됩니다.
                </>
              )}
            </div>
          ) : (
            <>
              <div style={{ overflowX: "auto", marginTop: 8 }}>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th style={{ width: 34 }}>넣기</th>
                      <th>날짜</th>
                      <th>홈페이지에 적힌 이름</th>
                      <th>갈래</th>
                      <th>나이스</th>
                    </tr>
                  </thead>
                  <tbody>
                    {res.rows.map((r, i) => (
                      <tr key={i}>
                        <td>
                          <input
                            type="checkbox"
                            checked={pick.has(i)}
                            onChange={(e) => {
                              const n = new Set(pick);
                              if (e.target.checked) n.add(i); else n.delete(i);
                              setPick(n);
                            }}
                          />
                        </td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          {r.date}
                          {r.endDate && <span className="hint"> ~ {r.endDate.slice(5)}</span>}
                        </td>
                        <td><b>{r.title}</b></td>
                        <td>
                          <span className={`tag ${(KIND[r.kind] || KIND[""]).cls}`}>
                            {(KIND[r.kind] || KIND[""]).label}
                          </span>
                        </td>
                        <td>
                          {/* **나이스에 없는 것이 이 화면의 존재 이유다** */}
                          {r.inNeis === false ? (
                            <span className="tag tag-amber">없음</span>
                          ) : r.inNeis === true ? (
                            <span className="hint">있음</span>
                          ) : (
                            <span className="hint">—</span>
                          )}
                          {r.hasExam && <span className="hint"> · 회차 있음</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* **못 읽은 줄은 숨기지 않는다** — 「없다」 와 「못 읽었다」 는 다르다 */}
              {res.unread?.length > 0 && (
                <p className="hint" style={{ marginTop: 6, fontSize: 12.5, color: "var(--amber)" }}>
                  날짜는 있는데 이름을 못 읽은 줄 {res.unread.length}개 —{" "}
                  {res.unread.slice(0, 4).join(" · ")}
                </p>
              )}

              <button
                className="btn btn-primary btn-block"
                style={{ marginTop: 10 }}
                disabled={pending || pick.size === 0}
                onClick={save}
              >
                {pending ? "넣는 중…" : `고른 ${pick.size}개를 시험으로 넣기`}
              </button>
              <p className="hint" style={{ marginTop: 6, fontSize: 12.5 }}>
                여기서 넣은 회차는 <b>학사일정 받아오기로 지워지지 않습니다</b> —
                나이스에 없는 일정이라서요.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

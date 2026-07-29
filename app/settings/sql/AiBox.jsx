"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveIntegration, clearIntegration } from "@/app/settings/actions";
import { previewFromReports, addSamples, listSamples, removeSample } from "@/app/ai/sampleActions";

/**
 * AI 키 · 본보기 문장.
 *
 * 본보기 문장은 **원장님이 예전에 쓰신 것**이어야 한다. 제가 지어낸 문장을
 * 주면 제 말투가 나오고, 학부모가 "글이 달라졌네" 를 먼저 느낀다.
 * 노션에서 가져온 데일리리포트 공지에 원장님 글이 그대로 있으니 그걸 쓴다.
 */
export default function AiBox({ saved = false }) {
  const [key, setKey] = useState("");
  const [openKey, setOpenKey] = useState(false);
  const [pick, setPick] = useState(null);        // 지난 공지 미리보기
  const [chosen, setChosen] = useState(() => new Set());
  const [mine, setMine] = useState(null);
  const [typed, setTyped] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => { listSamples().then(setMine); }, []);
  const reload = () => listSamples().then(setMine);

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="row" style={{ alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>AI 초안</h2>
        <span className={`tag ${saved ? "tag-mint" : "tag-amber"}`}>
          {saved ? "키 넣어둠" : "키 없음"}
        </span>
        <span className="tag tag-muted">본보기 {mine?.rows?.length ?? "…"}문장</span>
        <span className="spacer" />
        <button className="btn btn-ghost btn-sm" onClick={() => setOpenKey(!openKey)}>
          {openKey ? "닫기" : saved ? "키 바꾸기" : "키 넣기"}
        </button>
        {saved && (
          <button
            className="btn btn-ghost btn-sm"
            disabled={pending}
            onClick={() => {
              if (!confirm("AI 키를 지울까요? 상담 정리와 코멘트 초안이 멈춥니다.")) return;
              startTransition(async () => {
                await clearIntegration("anthropic");
                router.refresh();
              });
            }}
          >
            지우기
          </button>
        )}
      </div>
      <p className="hint" style={{ margin: "6px 0 0" }}>
        상담일지 정리와 학부모 코멘트 초안에 씁니다. 키는 저장한 뒤 화면에 다시
        나오지 않고 서버에서만 읽힙니다.
      </p>

      {openKey && (
        <div className="stack" style={{ gap: 8, marginTop: 10 }}>
          <input
            className="input"
            type="password"
            placeholder="Anthropic API 키 (sk-ant-…)"
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          <div className="notice" style={{ fontSize: 12.5 }}>
            console.anthropic.com → API Keys 에서 만드신 키를 여기에만 넣으세요.
            메신저·메모·대화창에는 붙여넣지 마세요.
          </div>
          <button
            className="btn btn-primary btn-sm"
            style={{ alignSelf: "flex-start" }}
            disabled={pending || key.trim().length < 20}
            onClick={() =>
              startTransition(async () => {
                const r = await saveIntegration("anthropic", {
                  enabled: true,
                  config: { key: key.trim() },
                });
                if (r?.error) { alert(r.error); return; }
                setKey("");
                setOpenKey(false);
                router.refresh();
              })
            }
          >
            저장
          </button>
        </div>
      )}

      {/* ── 본보기 문장 ───────────────────────────── */}
      <div style={{ marginTop: 14, borderTop: "1px solid var(--line, #2a2a2a)", paddingTop: 12 }}>
        <b style={{ fontSize: 13.5 }}>본보기 문장</b>
        <p className="hint" style={{ margin: "4px 0 8px" }}>
          <b>원장님이 예전에 쓰신 문장</b>이어야 합니다. AI 가 이 말투를 따라 씁니다.
          노션에서 가져온 데일리리포트 공지가 이미 들어와 있으니 거기서 뽑으면 됩니다.
        </p>

        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          <button
            className="btn btn-sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await previewFromReports();
                if (r?.error) { alert(r.error); return; }
                setPick(r);
                setChosen(new Set(r.rows.map((_, i) => i)));
              })
            }
          >
            지난 공지에서 가져오기
          </button>
        </div>

        {pick && (
          <div className="stack" style={{ gap: 6, marginTop: 10 }}>
            <div className="row" style={{ gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
              <b style={{ fontSize: 13 }}>{pick.rows.length}개 찾음</b>
              <span className="hint" style={{ fontSize: 12 }}>{chosen.size}개 선택</span>
              <span className="spacer" />
              <button className="btn btn-ghost btn-sm" onClick={() => setChosen(new Set())}>
                전부 해제
              </button>
              <button
                className="btn btn-primary btn-sm"
                disabled={pending || chosen.size === 0}
                onClick={() =>
                  startTransition(async () => {
                    const bodies = [...chosen].map((i) => pick.rows[i].body);
                    const r = await addSamples(bodies);
                    if (r?.error) { alert(r.error); return; }
                    alert(`${r.added}개 넣었어요.${r.skipped ? ` (${r.skipped}개는 이미 있음)` : ""}`);
                    setPick(null);
                    reload();
                  })
                }
              >
                {chosen.size}개 넣기
              </button>
            </div>
            <div className="stack" style={{ gap: 3, maxHeight: 320, overflowY: "auto" }}>
              {pick.rows.map((r, i) => (
                <label key={i} className="unitrow" style={{ cursor: "pointer", alignItems: "flex-start" }}>
                  <input
                    type="checkbox"
                    checked={chosen.has(i)}
                    onChange={() => {
                      const n = new Set(chosen);
                      n.has(i) ? n.delete(i) : n.add(i);
                      setChosen(n);
                    }}
                  />
                  <span className="hint" style={{ fontSize: 11.5, minWidth: 76 }}>{r.date}</span>
                  <span style={{ fontSize: 12.5, flex: 1 }}>{r.body}</span>
                </label>
              ))}
              {pick.rows.length === 0 && (
                <p className="hint" style={{ margin: 0 }}>
                  쓸 만한 공지를 못 찾았어요. 아래에 직접 붙여넣으셔도 됩니다.
                </p>
              )}
            </div>
          </div>
        )}

        <div className="stack" style={{ gap: 6, marginTop: 12 }}>
          <span className="hint" style={{ fontSize: 12 }}>직접 붙여넣기 (한 줄에 하나)</span>
          <textarea
            className="input"
            rows={4}
            placeholder={"오늘은 단어가 조금 흔들려서 다시 한 번 짚었습니다.\n스스로 모르는 것을 물어보는 모습이 좋았습니다."}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
          <button
            className="btn btn-sm"
            style={{ alignSelf: "flex-start" }}
            disabled={pending || !typed.trim()}
            onClick={() =>
              startTransition(async () => {
                const r = await addSamples(typed.split("\n"));
                if (r?.error) { alert(r.error); return; }
                alert(`${r.added}개 넣었어요.${r.skipped ? ` (${r.skipped}개는 이미 있음)` : ""}`);
                setTyped("");
                reload();
              })
            }
          >
            넣기
          </button>
        </div>

        {mine?.rows?.length > 0 && (
          <div className="stack" style={{ gap: 3, marginTop: 12, maxHeight: 240, overflowY: "auto" }}>
            {mine.rows.map((s) => (
              <div className="unitrow" key={s.id} style={{ alignItems: "flex-start" }}>
                <span style={{ fontSize: 12.5, flex: 1 }}>{s.body}</span>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={pending}
                  onClick={() => startTransition(async () => { await removeSample(s.id); reload(); })}
                >
                  빼기
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

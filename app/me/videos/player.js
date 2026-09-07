"use client";
/** 앱 안 재생기(목업 19 왼쪽) — 유튜브 IFrame API 로 앱 안에서 튼다. 1초마다 자리를 읽어 **지나간 구간만** 잇는다(lib/video-plan stepSpan — 뛰면 새 구간) · 20초마다·멈출 때·떠날 때 서버에 찍는다(video_mark) · 길이를 모르는 영상은 처음 알려 준다.
 *  임베드가 막혔거나 유튜브에 못 닿으면 6초 안에 「유튜브에서 보기」로 정직하게 말한다(대전제-0) */
import { useEffect, useRef, useState } from "react";
import { span as spanAct, duration as durationAct } from "../actions.js";
import { stepSpan, mmss, segments } from "@/lib/video-plan";
export default function Player({ row }) {
  const [ready, setReady] = useState(false); const [fail, setFail] = useState(false); const [pos, setPos] = useState(row.lastPos || 0); const [dur, setDur] = useState(row.video?.seconds || 0); const [pct, setPct] = useState(row.pct); const [secs, setSecs] = useState(row.secs || 0); const [spans, setSpans] = useState(row.spans ?? []);
  const st = useRef({ from: null, to: null }); const yt = useRef(null); const el = useRef(null); const readyRef = useRef(false);
  const flush = async (s, t) => { const r = await spanAct(row.video_id, s.from, s.to, t); if (r.ok && r.r) { setPct(r.r.pct); setSecs(r.r.secs); if (Array.isArray(r.r.spans)) setSpans(r.r.spans); } };
  const bar = segments(spans, dur, pos);
  useEffect(() => {
    let gone = false;
    const boot = () => { if (gone || !el.current) return; try {
      yt.current = new window.YT.Player(el.current, { videoId: row.yt, playerVars: { rel: 0, modestbranding: 1, playsinline: 1, start: row.status?.key === "done" ? 0 : Math.max(0, (row.lastPos || 0) - 2) },
        events: { onReady: (e) => { readyRef.current = true; setReady(true); const d = Math.round(e.target.getDuration?.() || 0); if (d > 0 && !(row.video?.seconds > 0)) { setDur(d); durationAct(row.video_id, d); } }, onError: () => setFail(true) } });
    } catch { setFail(true); } };
    if (window.YT?.Player) boot();
    else { const prev = window.onYouTubeIframeAPIReady; window.onYouTubeIframeAPIReady = () => { prev?.(); boot(); };
      if (!document.querySelector("script[data-yt]")) { const s = document.createElement("script"); s.src = "https://www.youtube.com/iframe_api"; s.async = true; s.dataset.yt = "1"; s.onerror = () => setFail(true); document.head.appendChild(s); } }
    const failTimer = setTimeout(() => { if (!readyRef.current) setFail(true); }, 6000);
    const timer = setInterval(() => { const p = yt.current; if (!p?.getPlayerState) return; const playing = p.getPlayerState() === 1; const t = p.getCurrentTime?.() || 0; if (playing) setPos(t); const r = stepSpan(st.current, t, playing); st.current = r.state; if (r.flush) flush(r.flush, t); }, 1000);
    return () => { gone = true; clearInterval(timer); clearTimeout(failTimer); const s = st.current; if (s.from != null && s.to - s.from >= 1) spanAct(row.video_id, s.from, s.to, s.to); try { yt.current?.destroy?.(); } catch {} };
  }, [row.video_id]);   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="task" data-card="player" data-video={row.video_id} style={{ borderColor: "var(--navy)" }}>
      <div className="h"><b>{row.video?.title}</b><span className="spacer" /><span className={"pill" + (pct != null && pct >= 95 ? " hw" : " warn")} data-g="pct">{pct != null ? `${pct}% 봄` : secs ? `${mmss(secs)} 봄` : "아직"}</span></div>
      <div data-g="player" data-state={fail ? "fail" : ready ? "ready" : "loading"} style={{ marginTop: 8, aspectRatio: "16 / 9", background: "var(--sunk)", borderRadius: "var(--r-2, 8px)", overflow: "hidden", position: "relative" }}>
        {!fail && <div ref={el} style={{ width: "100%", height: "100%" }} />}
        {fail && <div className="lf warn" data-g="player-fail" style={{ margin: 8 }}><span className="ln">!</span><div><b>앱 안에서 못 틀어요</b><small>임베드가 막혔거나 유튜브에 못 닿았어요 — 이 영상은 유튜브로 나가는 수밖에 없어요(그러면 본 구간은 안 세요)</small></div><a className="btn sm pri" href={row.video?.url} target="_blank" rel="noreferrer">유튜브에서 보기 ↗</a></div>}
      </div>
      <div className="vbar" data-g="vbar" style={{ marginTop: 10 }}>{bar.parts.map((x, i) => <div className="vseen" key={i} style={{ left: `${x.left}%`, width: `${x.width}%` }} />)}{bar.head != null && <div className="vhead" style={{ left: `${bar.head}%` }} />}</div>
      <div className="vinfo" style={{ marginTop: 6 }}><span data-g="pstate">{fail ? "밖에서 봐요" : ready ? "▶︎ 재생 준비" : "불러오는 중…"}</span><span className="spacer" /><span className="mono" data-g="clock">{mmss(pos)} / {dur ? mmss(dur) : "?:??"}</span></div>
      <p className="note k" style={{ margin: "4px 0 0" }}>건너뛴 구간은 <b>안 센 구간</b>이에요 · 화면을 끄거나 앱을 바꾸면 재생이 멎어요 · 「몇 %」는 대략이에요</p>
    </div>
  );
}

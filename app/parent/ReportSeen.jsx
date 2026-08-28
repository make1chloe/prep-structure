"use client";

import { useEffect, useRef } from "react";
import { markReportSeen } from "./seenActions";

/**
 * **언제 「봤다」 고 할 것인가** (0180).
 *
 * 원장님이 이 아이콘으로 하시려는 판단은 「전화를 한 번 드려야 하나」 다.
 * 그러니 도장은 **어머니가 그 내용을 실제로 보신 때**여야 한다.
 * 후보를 셋 놓고 골랐다:
 *
 *   ① 어머니 화면을 열면 찍는다
 *      → 거짓이다. /parent 는 한 장짜리 화면이고 리포트(「최근 수업」)는
 *        한참 아래에 있다. 위만 보고 나가셔도 「봤다」 가 된다.
 *   ② 「이 날 리포트 전문 보기」 를 펴면 찍는다
 *      → 너무 좁다. 그 접힘 안에는 report_text 만 있고, 출결·점수·진도·
 *        선생님 말씀은 **접기 밖에 이미 펼쳐져 있다.** 글을 안 쓴 날은
 *        접힘 자체가 없어서 영영 안 찍힌다.
 *   ③ **그 날 리포트 카드가 화면 안에 들어와 잠시 머무르면 찍는다** ← 이것
 *      → 스크롤하다 스쳐 지나가는 것과 읽는 것을 머문 시간으로 가른다.
 *
 * 그래서 **화면 안에 절반 이상 · 2초** 다. 스쳐 지나가면 안 찍힌다.
 * 잠깐 다른 앱으로 나가 있는 동안에도 안 센다 (visibilitychange).
 *
 * 도장을 찍는 대상은 **펼쳐져 있는 가장 최근 판 하나**뿐이다. 아래 접어둔
 * 지난 수업들은 내용이 안 보이므로 「봤다」 고 할 수 없다.
 *
 * **안 보낸 판에는 안 찍는다** — 발송 전 판을 어머니가 보실 일은 없지만,
 * 혹 찍히면 나중에 보냈을 때 「보내기 전에 이미 봤다」 는 거짓이 남는다.
 */
const NEED_MS = 2000;

export default function ReportSeen({ reportId, sent = false }) {
  const box = useRef(null);
  const done = useRef(false);

  useEffect(() => {
    if (!reportId || !sent) return;
    // **제 부모 칸을 본다** — 이 컴포넌트 자체는 안 보이는 빈 칸이다.
    // 감싸는 <div> 를 하나 더 두면 카드 사이 간격(gap)이 달라진다.
    const el = box.current?.parentElement;
    if (!el || typeof IntersectionObserver === "undefined") return;

    let timer = null;
    const stop = () => { if (timer) { clearTimeout(timer); timer = null; } };
    const start = () => {
      if (done.current || timer || document.visibilityState === "hidden") return;
      timer = setTimeout(() => {
        done.current = true;
        stop();
        // 실패는 조용히 (seenActions) — 어머니 화면은 아무것도 안 바뀐다
        markReportSeen(reportId);
      }, NEED_MS);
    };

    const io = new IntersectionObserver(
      ([e]) => {
        // 카드가 화면보다 길면 비율이 영영 0.5 를 못 넘는다 —
        // 그때는 「화면의 40% 이상을 차지하고 있나」 로 본다
        const big = e.intersectionRect.height >= window.innerHeight * 0.4;
        if (e.isIntersecting && (e.intersectionRatio >= 0.5 || big)) start();
        else stop();
      },
      { threshold: [0, 0.5, 1] }
    );
    io.observe(el);

    const onHide = () => { if (document.visibilityState === "hidden") stop(); };
    document.addEventListener("visibilitychange", onHide);
    return () => { io.disconnect(); stop(); document.removeEventListener("visibilitychange", onHide); };
  }, [reportId, sent]);

  return <span ref={box} style={{ display: "none" }} aria-hidden="true" />;
}

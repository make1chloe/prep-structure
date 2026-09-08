"use client";
/** 누른 즉시 표시(다) — 원장님 9/8 「아직 클릭과 동시에 바뀌는 느낌은 아님」. 화면 이동은 <Link>·go() 로 부분 전환이라 흰 화면은 없지만, 서버가 답할 때까지(도쿄↔서울 왕복 + 판) 아무것도 안 바뀌어 「눌렸나?」 싶다.
 *  그래서 ① 상단바 아래 2px 띠가 누르자마자 켜지고 새 화면이 붙으면(주소가 바뀌면) 꺼진다 — 어느 화면·어느 링크든, 문서 click 하나로 듣는다(86곳을 손대지 않는다) ② 판 화면의 router.push 는 go() 로 — 같은 띠를 켠다 ③ 누른 줄은 서버 답 전에 켜진다(useGo 의 pressed — 판(d)이 바뀌면 지운다).
 *  표를 안 읽는다(속도-2). LIMIT_MS 안에 답이 없으면 내린다(끊긴 망에서 영원히 켜져 있지 않게). 루트 loading.js 는 못 쓴다(검사-71 · 게이트 61 — Suspense 안의 redirect() 가 흔들린다) — 이 띠가 그 자리다. */
import { useCallback, useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
export const GOING = "chloe:going";   /* go() 가 띄우는 사건 — 띠가 듣는다 */
export const DONE = "chloe:done";     /* go() 의 전환이 끝났다(같은 주소로 다시 갈 때는 주소가 안 바뀌므로 이것으로 끈다) */
export const LIMIT_MS = 8000;         /* 이 안에 새 화면이 안 붙으면 「누른」 표시를 내린다(띠 · 탭 · 줄 같은 값) */
const internal = (a) => { const h = a?.getAttribute("href") ?? ""; return h.startsWith("/") && !h.startsWith("/api/") && !a.target && !a.hasAttribute("download"); };
export default function Going() {
  const pathname = usePathname(), search = useSearchParams().toString(); const [on, setOn] = useState(false);
  useEffect(() => { setOn(false); }, [pathname, search]);   /* 새 화면이 붙었다 */
  useEffect(() => {
    const start = () => setOn(true);
    const click = (e) => { if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; const a = e.target?.closest?.("a[href]"); if (!a || !internal(a)) return; if (a.getAttribute("href") === location.pathname + location.search) return; start(); };
    const stop = () => setOn(false);
    document.addEventListener("click", click); window.addEventListener(GOING, start); window.addEventListener(DONE, stop);
    return () => { document.removeEventListener("click", click); window.removeEventListener(GOING, start); window.removeEventListener(DONE, stop); };
  }, []);
  useEffect(() => { if (!on) return; const t = setTimeout(() => setOn(false), LIMIT_MS); return () => clearTimeout(t); }, [on]);
  return <span data-g="going" data-on={on ? "1" : "0"} aria-hidden="true" style={{ position: "absolute", left: 0, bottom: -1, height: 2, width: on ? "80%" : 0, background: "var(--navy)", transition: on ? "width 1.5s cubic-bezier(.2,.6,.3,1)" : "none", pointerEvents: "none" }} />;
}
/** 판 화면의 이동 — router.push 대신 이것으로(검사-71). href 로 가며 띠를 켠다. id 를 주면 그 줄이 「누른 줄」(pressed)로 서버 답 전에 켜진다 — reset(보통 판 d)이 바뀌면 지운다 */
export function useGo(reset) {
  const router = useRouter(); const [pressed, setPressed] = useState(null); const [moving, start] = useTransition();   /* moving: 전환이 아직 진행 중(useTransition 이 router.push 를 따라간다) */
  useEffect(() => { setPressed(null); }, [reset]);
  useEffect(() => { if (pressed == null) return; const t = setTimeout(() => setPressed(null), LIMIT_MS); return () => clearTimeout(t); }, [pressed]);
  useEffect(() => { if (!moving) { setPressed(null); window.dispatchEvent(new Event(DONE)); } }, [moving]);   /* 끝나면 띠·누른 줄을 내린다 — 주소가 안 바뀌는 같은 줄 다시 누르기도 */
  const go = useCallback((href, id = null) => { setPressed(id); window.dispatchEvent(new Event(GOING)); start(() => { router.push(href); }); }, [router]);
  return { go, pressed };
}

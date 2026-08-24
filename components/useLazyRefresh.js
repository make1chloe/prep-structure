"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * **미뤄 두는 새로고침 한 벌** (원장님 2026-08-23 — 「내용 수정하다가 목록이
 * 새로고침되는 문제가 굉장히 불편해」).
 *
 * 같은 처방을 이미 네 번 따로 만들었다 — 진도판(2026-08-19), 하원 안내,
 * 나이스 검색, 월간 메모. 그때마다 그 화면만 나았고 나머지는 그대로였다.
 * 그래서 한 벌로 뺀다.
 *
 * 규칙:
 *   · `lazy()`  — 마지막 호출로부터 12초 뒤 **한 번만**. 연달아 눌러도 한 번
 *   · `flush()` — 지금 바로 (판을 접거나 화면을 떠날 때)
 *   · 글자를 치는 중이면 5초 뒤에 다시 묻는다 — 적는 도중에 끼어들지 않는다
 *   · 떠날 때 미뤄둔 것이 있으면 돌리고 간다 (그냥 지우면 목록이 낡은 채 남는다)
 *
 * 낙관 UI 와 짝이다 (원칙 6-3): 화면은 누르는 순간 이미 바뀌어 있으므로,
 * 서버 왕복은 주변 요약·배지를 맞추는 일일 뿐이라 늦어도 된다.
 */
export function useLazyRefresh(delay = 12000) {
  const router = useRouter();
  const timer = useRef(null);
  const armed = useRef(false);

  /**
   * **적는 중이면 기다린다** — 글자를 치는 도중이거나, **판이 열려 있으면.**
   *
   * 판이 열려 있는 동안 화면을 새로 그리면 그 판이 다시 서면서 **아직 저장
   * 안 한 것이 사라진다** (원장님 2026-08-24 — 「숙제 적다가 늦귀가 보내기
   * 누르니까 일부 날아갔어, 숙제 단원」). 서버에 이미 담긴 것만 남고 방금
   * 고른 것이 없어지니, 「일부만」 날아간 것처럼 보인다.
   *
   * 판이 열렸다는 표시(data-editing)는 useSheet 이 붙인다. 닫을 때
   * flush() 가 밀린 것을 한 번에 돌린다 — 낡은 채로 두지 않는다.
   */
  const typing = () => {
    if (typeof document === "undefined") return false;
    if (document.documentElement.dataset.editing) return true;   // 판이 열려 있다
    const el = document.activeElement;
    return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
  };

  const lazy = useCallback(() => {
    armed.current = true;
    clearTimeout(timer.current);
    const tick = () => {
      if (typing()) { timer.current = setTimeout(tick, 5000); return; }
      armed.current = false;
      router.refresh();
    };
    timer.current = setTimeout(tick, delay);
  }, [router, delay]);

  const flush = useCallback(() => {
    if (!armed.current) return;
    clearTimeout(timer.current);
    armed.current = false;
    router.refresh();
  }, [router]);

  /** 미룰 것 없이 지금 (줄이 생기거나 사라지는 조작) */
  const now = useCallback(() => {
    clearTimeout(timer.current);
    armed.current = false;
    router.refresh();
  }, [router]);

  useEffect(() => () => {
    if (!timer.current) return;
    clearTimeout(timer.current);
    if (armed.current) router.refresh();   // 떠나면서 한 번은 돌리고 간다
  }, [router]);

  return { lazy, flush, now };
}

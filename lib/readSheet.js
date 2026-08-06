/**
 * 올리신 파일을 **적힌 그대로** 읽는다.
 *
 * ── 왜 따로 만들었나 (2026-08-06) ────────────────────────────
 *
 * 상담일지 CSV 를 올려봤더니 **193줄 중 52줄이 조용히 사라졌다.**
 * 오류도 없고 화면에는 「141줄 옮길 수 있음」 이라고 멀쩡히 떴다.
 *
 * 까닭이 둘이었다.
 *
 * 1. **엑셀 라이브러리가 날짜를 제 마음대로 고쳐 쓴다.**
 *    파일에 `2025/03/14` 라고 적힌 것을 날짜로 알아보고 `3/14/25` 로 바꿔서
 *    돌려준다 (미국식 월/일/년). 우리 코드는 네 자리 연도를 먼저 찾으므로
 *    그 줄은 「날짜 없음」 이 되어 버려진다. 시각까지 붙은 줄
 *    (`2025/03/14 오후 1:53`)은 날짜로 안 보여서 글자 그대로 살아남았다 —
 *    **그래서 절반만 사라졌고, 그래서 더 알아채기 어려웠다.**
 *
 * 2. **`codepage: 65001` 이 한글을 깨뜨린다.** UTF-8 로 잘 읽히던 파일을
 *    억지로 다시 풀어서 머리줄이 통째로 깨졌다.
 *
 * 그래서 읽는 방법을 한 곳에 모은다.
 *   · CSV 는 **글자로** 읽는다 (UTF-8). 깨지면 그때만 EUC-KR 로 다시 본다
 *   · `raw: true` — **아무것도 고쳐 쓰지 않는다.** 날짜든 숫자든 파일에 적힌
 *     글자 그대로 받는다. 해석은 우리 파서가 한다
 *
 * 「조용히 사라지는 것」이 제일 나쁘다. 안 들어간 줄은 화면에 뜨기라도 해야
 * 하는데, 이건 애초에 없던 것처럼 지나갔다.
 */

/** 글자가 깨졌나 — UTF-8 이 아닌 것을 UTF-8 로 풀면 U+FFFD 가 박힌다 */
function garbled(text) {
  return (text.match(/�/g) || []).length > 3;
}

/**
 * File → 배열의 배열 (첫 줄이 머리줄).
 *
 * @param file  <input type="file"> 로 고른 것
 * @returns {Promise<string[][]>}
 */
export async function readSheet(file) {
  const XLSX = await import("xlsx");
  const isCsv = /\.csv$/i.test(file.name || "");

  let wb;
  if (isCsv) {
    // 브라우저의 file.text() 는 **언제나 UTF-8** 로 푼다. 노션·결제선생 내보내기가
    // 전부 UTF-8 이라 이것이 맞고, 아니면 아래에서 한 번 더 본다
    const text = (await file.text()).replace(/^﻿/, "");
    if (garbled(text)) {
      // 옛 엑셀에서 내린 CSV 는 EUC-KR 일 수 있다 (949)
      const buf = await file.arrayBuffer();
      wb = XLSX.read(buf, { type: "array", codepage: 949, raw: true });
    } else {
      wb = XLSX.read(text, { type: "string", raw: true });
    }
  } else {
    wb = XLSX.read(await file.arrayBuffer(), { type: "array", raw: true, cellDates: false });
  }

  const ws = wb.Sheets[wb.SheetNames[0]];
  // raw: true — 라이브러리가 만들어준 「보기 좋은 글자」 말고 **원래 값**을 받는다
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" }).map((row) =>
    (row || []).map((c) => (c === null || c === undefined ? "" : String(c)))
  );
}

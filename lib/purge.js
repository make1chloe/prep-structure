// 오래된 제출물 정리
//
// 사진과 녹음은 쌓인다. 한 학생이 하루에 두세 개씩 내면 한 달에 수백 개다.
// 무료 용량은 금방 찬다.
//
// 그런데 **기록까지 지우면 안 된다.** 언제 뭘 냈고 뭐라고 봐줬는지는 남아야
// 나중에 상담할 때 말할 수 있다. 그래서 **파일만** 지우고 줄은 남긴다.
// 학생 화면에도 "보관 기간이 지나 파일은 지웠습니다" 로 뜬다.
//
// 체크리스트는 파일이 없으니 손대지 않는다.

export const KEEP_DAYS = 30;

/** 이 날짜보다 앞선 것이 정리 대상 */
export function cutoff(today, days = KEEP_DAYS) {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** 오늘 이미 돌렸나 */
export function ranToday(last, today) {
  return (last || "") === today;
}

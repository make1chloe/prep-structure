/** 🎧 음성 듣기 한 벌 — 원장님 2026-09-17 「음성 녹음숙제 검사할 때 단순히 재생만 해 보는 게 아니고 재생 위치를 이동해서 아무데서나 확인할 수 있게도 해 줘」.
 *  막대를 끄는 일은 브라우저가 이미 잘한다(<audio controls>) — 우리가 다시 짓지 않는다(원칙-1).
 *  ⚠️ 끌리려면 **서버가 구간 요청(Range)에 206 으로 답해야 한다** — app/api/files/[id]/route.js 가 답한다.
 *  누르는 조각이 아니라 서버 화면도 그대로 쓴다(상태가 없다) */
export default function Play({ id, name = "음성", size = 220 }) {
  return <audio data-g="play" data-file={id} controls preload="metadata" aria-label={name} src={`/api/files/${id}`} style={{ height: 32, maxWidth: size, width: "100%", flex: "1 1 140px" }} />;
}

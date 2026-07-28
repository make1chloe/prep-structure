// 요청이 어디서 왔나
//
// 브라우저는 이 값을 못 속인다. 서버(Vercel)가 붙여주는 것이라
// 자바스크립트로 바꿔 보낼 수 없다.

/** 여러 개가 쉼표로 오면 맨 앞이 진짜 클라이언트다 */
export function pickIp(headers) {
  const raw =
    headers.get("x-forwarded-for") ||
    headers.get("x-real-ip") ||
    headers.get("cf-connecting-ip") ||
    "";
  const first = raw.split(",")[0].trim();
  return first || null;
}

/**
 * 학원에서 온 요청인가.
 *
 * IPv6 는 기기마다 뒷자리가 바뀌므로 **앞 네 덩어리(/64)** 까지만 본다.
 * 같은 공유기를 쓰면 거기까지는 같다.
 */
export function sameNet(ip, allowed = []) {
  if (!ip || allowed.length === 0) return true;   // 등록이 없으면 안 막는다
  const norm = (v) => (v || "").trim().toLowerCase().replace(/^::ffff:/, "");
  const a = norm(ip);
  return allowed.some((x) => {
    const b = norm(x);
    if (!b) return false;
    if (a === b) return true;
    if (a.includes(":") && b.includes(":")) {
      const head = (v) => v.split(":").slice(0, 4).join(":");
      return head(a) === head(b);
    }
    return false;
  });
}

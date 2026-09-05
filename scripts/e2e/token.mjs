/**
 * 검사용 JWT 만들기.
 *
 * PostgREST 는 이 열쇠로 서명을 확인하고, 안에 든 `sub` 를 auth.uid() 로
 * 내어준다 — 진짜 Supabase 와 같은 자리라 **RLS 규칙을 하나도 안 고치고**
 * 그대로 쓸 수 있다.
 *
 * 쓰는 법:  node scripts/e2e/token.mjs anon
 *          node scripts/e2e/token.mjs <uuid>          (그 사람으로)
 */
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
export const SECRET = readFileSync(join(here, "jwt-secret.txt"), "utf8").trim();

const b64 = (o) =>
  Buffer.from(JSON.stringify(o)).toString("base64url");

export function sign(claims, secret = SECRET) {
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64({
    iss: "supabase",
    // 한 해 — 검사가 도는 동안 안 만료되면 된다
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
    ...claims,
  });
  const sig = createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

export function verify(token, secret = SECRET) {
  const [h, b, s] = (token || "").split(".");
  if (!h || !b || !s) return null;
  const want = createHmac("sha256", secret).update(`${h}.${b}`).digest("base64url");
  if (want !== s) return null;
  try {
    const claims = JSON.parse(Buffer.from(b, "base64url").toString());
    if (claims.exp && claims.exp * 1000 < Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}

if (process.argv[2]) {
  const who = process.argv[2];
  process.stdout.write(
    who === "anon" || who === "service_role"
      ? sign({ role: who })
      : sign({ role: "authenticated", sub: who, aud: "authenticated" })
  );
}

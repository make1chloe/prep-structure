/**
 * **인증 흉내 + 앞단** — 앱이 붙는 자리 (2026-08-07).
 *
 * 앱은 `NEXT_PUBLIC_SUPABASE_URL` 하나만 보고 거기에 붙는다. 진짜 Supabase 는
 * 그 뒤에 여러 조각이 있는데, 여기서는 —
 *
 *   /auth/v1/*      이 파일이 흉내 낸다 (로그인 · 나 누구야 · 로그아웃)
 *   /rest/v1/*      PostgREST 로 넘긴다 (표 · RPC)
 *   /storage/v1/*   없다 — 사진은 이 검사 밖이다. 501 로 정직하게 답한다
 *
 * **앱 코드에는 손대지 않는다.** 앱은 자기가 진짜 Supabase 에 붙는 줄 알고
 * 그대로 돈다 — 그래야 검사한 것이 실제로 도는 것과 같다.
 *
 * 흉내인 만큼 **다른 점을 적어둔다** —
 *   · 비밀번호를 그대로 견준다 (진짜는 bcrypt). 검사용 계정만 있는 DB 다
 *   · 새로고침 토큰을 안 돌린다 (한 해짜리 토큰 하나로 끝낸다)
 *   · 메일 확인·소셜 로그인은 없다
 */
import http from "node:http";
import { execFileSync } from "node:child_process";
import { sign, verify } from "./token.mjs";

const PG_PORT = process.env.E2E_PG_PORT || "55440";
const PGRST = process.env.E2E_PGRST || "55441";
const PORT = Number(process.env.E2E_PORT || "55442");
const PGBIN = "/usr/lib/postgresql/16/bin";

/**
 * psql 로 묻는다 — `pg` 꾸러미를 안 쓴다.
 *
 * 검사 하나 때문에 앱의 꾸러미 목록에 줄을 늘리고 싶지 않다. 다른 검사들도
 * 다 psql 로 말한다 (scripts/live-month.mjs).
 */
const db = {
  query(sql, params = []) {
    // 값은 따옴표로 감싸 넣는다 — 검사용 값만 들어온다
    const filled = sql.replace(/\$(\d+)/g, (_, n) => {
      const v = params[Number(n) - 1];
      if (v === null || v === undefined) return "null";
      return `'${String(v).replace(/'/g, "''")}'`;
    });
    const out = execFileSync(
      `${PGBIN}/psql`,
      ["-h", "/var/tmp", "-p", String(PG_PORT), "-U", "postgres", "-d", "chloe", "-q", "-tA", "-c",
       `select coalesce(json_agg(t), '[]')::text from (${filled}) t;`],
      { encoding: "utf8" }
    );
    try { return { rows: JSON.parse(out.trim() || "[]") }; } catch { return { rows: [] }; }
  },
  exec(sql, params = []) {
    const filled = sql.replace(/\$(\d+)/g, (_, n) => {
      const v = params[Number(n) - 1];
      if (v === null || v === undefined) return "null";
      return `'${String(v).replace(/'/g, "''")}'`;
    });
    execFileSync(`${PGBIN}/psql`,
      ["-h", "/var/tmp", "-p", String(PG_PORT), "-U", "postgres", "-d", "chloe", "-q", "-c", filled],
      { encoding: "utf8" });
  },
};

const json = (res, code, body) => {
  const s = JSON.stringify(body);
  res.writeHead(code, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-expose-headers": "*",
  });
  res.end(s);
};

const readBody = (req) =>
  new Promise((ok) => {
    let s = "";
    req.on("data", (c) => (s += c));
    req.on("end", () => {
      try { ok(s ? JSON.parse(s) : {}); } catch { ok({}); }
    });
  });

function userRow(id) {
  const r = db.query("select id, email, raw_user_meta_data from auth.users where id = $1", [id]);
  return r.rows[0] || null;
}

/** supabase-js 가 기대하는 모양 그대로 */
function shape(u) {
  return {
    id: u.id,
    aud: "authenticated",
    role: "authenticated",
    email: u.email,
    email_confirmed_at: new Date().toISOString(),
    phone: "",
    confirmed_at: new Date().toISOString(),
    last_sign_in_at: new Date().toISOString(),
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: u.raw_user_meta_data || {},
    identities: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function session(u) {
  return {
    access_token: sign({ role: "authenticated", sub: u.id, aud: "authenticated", email: u.email }),
    token_type: "bearer",
    expires_in: 60 * 60 * 24 * 365,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
    refresh_token: `r-${u.id}`,
    user: shape(u),
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const path = url.pathname;

  if (req.method === "OPTIONS") return json(res, 204, {});
  if (path === "/health") return json(res, 200, { ok: true });

  // ── 인증 ────────────────────────────────────────────────
  if (path.startsWith("/auth/v1/")) {
    const who = () => {
      const h = req.headers.authorization || "";
      return verify(h.replace(/^Bearer /, ""));
    };

    if (path === "/auth/v1/token") {
      const body = await readBody(req);
      const grant = url.searchParams.get("grant_type");
      if (grant === "refresh_token") {
        const id = (body.refresh_token || "").replace(/^r-/, "");
        const u = userRow(id);
        if (!u) return json(res, 400, { error: "invalid_grant", error_description: "Invalid Refresh Token" });
        return json(res, 200, session(u));
      }
      const r = db.query(
        "select id, email, raw_user_meta_data, encrypted_password from auth.users where lower(email) = lower($1)",
        [body.email || ""]
      );
      const u = r.rows[0];
      // 진짜는 bcrypt 로 견준다. 검사용 DB 라 그대로 견준다
      if (!u || u.encrypted_password !== (body.password || "")) {
        return json(res, 400, { error: "invalid_grant", error_description: "Invalid login credentials" });
      }
      return json(res, 200, session(u));
    }

    if (path === "/auth/v1/user") {
      const c = who();
      if (!c?.sub) return json(res, 401, { message: "invalid claim: missing sub claim" });
      const u = userRow(c.sub);
      if (!u) return json(res, 401, { message: "user not found" });
      if (req.method === "PUT") {
        // 비밀번호 바꾸기 — 학생이 처음 들어와 0000 을 바꾸는 자리
        const body = await readBody(req);
        if (body.password) {
          db.exec("update auth.users set encrypted_password = $1 where id = $2", [body.password, u.id]);
        }
        return json(res, 200, shape(u));
      }
      return json(res, 200, shape(u));
    }

    if (path === "/auth/v1/logout") return json(res, 204, {});
    if (path === "/auth/v1/settings") {
      return json(res, 200, { external: {}, disable_signup: false, mailer_autoconfirm: true, autoconfirm: true });
    }
    if (path === "/auth/v1/signup") {
      const body = await readBody(req);
      db.exec("insert into auth.users (email, encrypted_password) values ($1, $2)", [body.email, body.password]);
      const r = db.query("select id, email, raw_user_meta_data from auth.users where email = $1", [body.email]);
      return json(res, 200, session(r.rows[0]));
    }
    return json(res, 404, { message: "e2e: 흉내 내지 않는 인증 길입니다 — " + path });
  }

  // ── 표 · RPC ────────────────────────────────────────────
  if (path.startsWith("/rest/v1")) {
    const target = `http://127.0.0.1:${PGRST}${path.replace("/rest/v1", "")}${url.search}`;
    const headers = { ...req.headers };
    delete headers.host;
    delete headers["content-length"];
    // apikey 만 있고 Authorization 이 없으면 익명이다 (진짜와 같다)
    if (!headers.authorization && headers.apikey) headers.authorization = `Bearer ${headers.apikey}`;
    const body = ["GET", "HEAD"].includes(req.method) ? undefined : await readBody(req);
    let up;
    try {
      up = await fetch(target, {
        method: req.method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      return json(res, 502, { message: `e2e: PostgREST 에 못 닿았어요 — ${e.message}` });
    }
    const text = await up.text();
    const out = { "access-control-allow-origin": "*", "access-control-expose-headers": "*" };
    up.headers.forEach((v, k) => {
      if (!["content-encoding", "transfer-encoding", "connection"].includes(k)) out[k] = v;
    });
    res.writeHead(up.status, out);
    res.end(text);
    return;
  }

  // ── 사진 — 없다. 조용히 빈 답을 주면 「왜 안 보이지」 가 된다 ──
  if (path.startsWith("/storage/v1")) {
    return json(res, 501, { message: "e2e: 사진 보관함은 이 검사에 없습니다" });
  }

  return json(res, 404, { message: `e2e: 모르는 길 — ${path}` });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`e2e supabase 흉내: http://127.0.0.1:${PORT}`);
});

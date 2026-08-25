"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { SUPABASE_URL } from "@/lib/supabase/env";
import { loadSteps } from "./steps";
import { checkSchema } from "./status";
import { requirePrincipal } from "@/lib/guard";

const API = "https://api.supabase.com/v1";

/** 이 앱이 붙어 있는 프로젝트 이름 (SQL 도 여기에 넣어야 한다) */
function urlRef() {
  try {
    return new URL(SUPABASE_URL).host.split(".")[0];
  } catch {
    return "";
  }
}

/**
 * 실제로 쓸 프로젝트 이름.
 * 주소에서 뽑은 것이 기본이지만, 직접 넣어둔 값이 있으면 그것을 쓴다
 * (자체 도메인을 쓰면 주소에서 못 뽑는다).
 */
async function projectRefOf(supabase) {
  const { data } = await supabase
    .from("integrations")
    .select("config")
    .eq("id", "supabase_admin")
    .maybeSingle();
  return (data?.config?.ref || "").trim() || urlRef();
}

/** Supabase 가 뭐라고 했는지 그대로 옮긴다 — 짐작해서 뭉개지 않는다 */
async function detailOf(res) {
  try {
    const t = await res.text();
    try {
      const j = JSON.parse(t);
      return j.message || j.error || j.msg || t;
    } catch {
      return t;
    }
  } catch {
    return "";
  }
}

/**
 * 액세스 토큰 저장.
 *
 * Supabase 계정 설정에서 만드는 **Personal Access Token** 이다.
 * 이걸로 앱이 SQL 을 직접 실행할 수 있어서, 복사·붙여넣기를 안 해도 된다.
 *
 * 힘이 센 열쇠라 조심해서 다룬다.
 *   · integrations 에 넣고 **원장 계정만** 읽는다 (RLS)
 *   · 화면에는 가려서만 보여준다
 *   · 언제든 Supabase 계정 설정에서 폐기(revoke)할 수 있다
 */
export async function saveAdminToken(token, ref) {
  const t = (token || "").trim();
  const supabase = await createClient();
  const guard = await requirePrincipal(supabase);
  if (guard.error) return { error: guard.error };
  if (!t) return { error: "토큰을 넣어주세요." };

  const useRef = (ref || "").trim() || urlRef();

  // 토큰이 어떤 프로젝트를 볼 수 있는지 먼저 물어본다.
  // 이러면 "권한이 없다" 대신 **무엇이 어긋났는지** 를 말해줄 수 있다.
  const list = await fetch(`${API}/projects`, {
    headers: { Authorization: `Bearer ${t}` },
  }).catch((e) => ({ ok: false, status: 0, text: async () => e.message }));

  if (!list.ok) {
    const d = await detailOf(list);
    if (list.status === 401) {
      return { error: `토큰이 맞지 않습니다. (401) ${d.slice(0, 200)}` };
    }
    return { error: `Supabase 가 거절했습니다. (${list.status}) ${d.slice(0, 300)}` };
  }

  let projects = [];
  try {
    projects = await list.json();
  } catch {
    projects = [];
  }
  const refs = (projects || []).map((p) => p.id || p.ref).filter(Boolean);
  if (refs.length > 0 && !refs.includes(useRef)) {
    return {
      error:
        `이 토큰으로는 '${useRef}' 프로젝트를 못 봅니다.\n\n` +
        `토큰이 볼 수 있는 프로젝트: ${refs.join(", ")}\n\n` +
        `앱이 붙어 있는 프로젝트가 '${urlRef()}' 입니다. ` +
        `둘이 다르면 프로젝트 이름 칸에 맞는 것을 넣어주세요.`,
    };
  }

  // 실제로 SQL 이 되는지까지 확인하고 저장한다
  const probe = await fetch(`${API}/projects/${useRef}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: "select 1 as ok;" }),
  }).catch((e) => ({ ok: false, status: 0, text: async () => e.message }));

  if (!probe.ok) {
    const d = await detailOf(probe);
    return {
      error:
        `SQL 을 실행해보니 거절당했습니다. (${probe.status})\n` +
        `프로젝트: ${useRef}\n${d.slice(0, 300)}`,
    };
  }

  const { error } = await supabase.from("integrations").upsert({
    id: "supabase_admin",
    enabled: true,
    config: { token: t, ref: useRef },
    updated_at: new Date().toISOString(),
    updated_by: guard.user.id,
  });
  if (error) return { error: error.message };

  revalidatePath("/settings/sql");
  return { error: null, ref: useRef };
}

export async function clearAdminToken() {
  const supabase = await createClient();
  const guard = await requirePrincipal(supabase);
  if (guard.error) return { error: guard.error };
  const { error } = await supabase.from("integrations").delete().eq("id", "supabase_admin");
  revalidatePath("/settings/sql");
  return { error: error ? error.message : null };
}

/**
 * 안 들어간 것을 **앱이 직접** 실행한다.
 *
 * 하나씩 따로 보낸다. 그래야 실패했을 때 어느 파일인지 바로 알 수 있다.
 * 하나가 실패하면 거기서 멈춘다 — 순서가 있어서 뒤엣것만 넣어봐야 소용없다.
 */
export async function applyMissing() {
  const supabase = await createClient();
  const guard = await requirePrincipal(supabase);
  if (guard.error) return { error: guard.error };

  const { data: row } = await supabase
    .from("integrations")
    .select("config")
    .eq("id", "supabase_admin")
    .maybeSingle();
  const token = row?.config?.token;
  if (!token) return { error: "먼저 액세스 토큰을 넣어주세요." };

  const checks = await checkSchema();
  const missing = new Set(checks.filter((c) => !c.ok).map((c) => c.id));
  if (missing.size === 0) return { error: null, results: [], done: true };

  const steps = (await loadSteps()).filter((s) => missing.has(s.id));
  const ref = await projectRefOf(supabase);
  const results = [];

  for (const s of steps) {
    const res = await fetch(`${API}/projects/${ref}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: s.body }),
    }).catch((e) => ({ ok: false, status: 0, text: async () => e.message }));

    if (res.ok) {
      results.push({ name: s.name, ok: true });
      continue;
    }
    const detail = await detailOf(res);
    results.push({
      name: s.name,
      ok: false,
      detail: `(${res.status}) ${(detail || "").slice(0, 400)}`,
    });
    break; // 순서가 있으니 여기서 멈춘다
  }

  // PostgREST 가 바뀐 표를 바로 읽도록
  await fetch(`${API}/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: "notify pgrst, 'reload schema';" }),
  }).catch(() => {});

  revalidatePath("/settings/sql");
  revalidatePath("/settings/messages");
  revalidatePath("/today");
  return { error: null, results, done: results.every((r) => r.ok) };
}

"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { SUPABASE_URL } from "@/lib/supabase/env";
import { loadSteps } from "./steps";
import { checkSchema } from "./status";

const API = "https://api.supabase.com/v1";

async function requirePrincipal(supabase) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요해요." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "principal") {
    return { error: "이건 원장 계정에서만 할 수 있어요." };
  }
  return { user };
}

/** 이 앱이 붙어 있는 프로젝트 이름 (SQL 도 여기에 넣어야 한다) */
function projectRef() {
  try {
    return new URL(SUPABASE_URL).host.split(".")[0];
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
export async function saveAdminToken(token) {
  const t = (token || "").trim();
  const supabase = createClient();
  const guard = await requirePrincipal(supabase);
  if (guard.error) return { error: guard.error };
  if (!t) return { error: "토큰을 넣어주세요." };

  // 진짜 되는 토큰인지 먼저 확인하고 저장한다
  const probe = await fetch(`${API}/projects/${projectRef()}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: "select 1 as ok;" }),
  }).catch((e) => ({ ok: false, status: 0, text: async () => e.message }));

  if (!probe.ok) {
    const detail = await probe.text?.().catch(() => "");
    return {
      error:
        probe.status === 401 || probe.status === 403
          ? "토큰이 맞지 않거나 이 프로젝트에 권한이 없어요."
          : `Supabase 가 거절했어요 (${probe.status}). ${detail?.slice(0, 200) || ""}`,
    };
  }

  const { error } = await supabase.from("integrations").upsert({
    id: "supabase_admin",
    enabled: true,
    config: { token: t },
    updated_at: new Date().toISOString(),
    updated_by: guard.user.id,
  });
  if (error) return { error: error.message };

  revalidatePath("/settings/sql");
  return { error: null };
}

export async function clearAdminToken() {
  const supabase = createClient();
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
  const supabase = createClient();
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
  const ref = projectRef();
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
    let detail = "";
    try {
      const t = await res.text();
      try {
        const j = JSON.parse(t);
        detail = j.message || j.error || t;
      } catch {
        detail = t;
      }
    } catch {
      detail = `HTTP ${res.status}`;
    }
    results.push({ name: s.name, ok: false, detail: (detail || "").slice(0, 400) });
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

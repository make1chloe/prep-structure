/** 나가는 길 — 어느 화면에서든 상단바에 있다(0-10). POST 만 받는다(링크 미리보기가 로그아웃시키지 않게) */
import { redirect } from "next/navigation";
import { supabase } from "@/lib/supabase";
export async function POST() { const sb = await supabase(); await sb.auth.signOut(); redirect("/login"); }

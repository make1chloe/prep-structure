"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { PANEL3_COOKIE } from "./panelFlag";

const YEAR = 60 * 60 * 24 * 365;

/** 새 판(3때 시트)을 켜고 끈다 — helpActions 와 같은 형 (선례 규율) */
export async function setPanel3(on) {
  (await cookies()).set(PANEL3_COOKIE, on ? "on" : "off", {
    path: "/",
    maxAge: YEAR,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
  return { error: null, on: !!on };
}

"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

const NAME = "help";
const YEAR = 60 * 60 * 24 * 365;

/**
 * 화면 설명 문구를 켜고 끈다 (2026-08-07).
 *
 * 계정이 아니라 이 브라우저에 담는다 — 새 칸을 만들면 SQL 을 또 돌리셔야
 * 하고, 글씨를 보이고 감추는 일에 그럴 것까지는 없다.
 */
export async function setHelp(on) {
  cookies().set(NAME, on ? "on" : "off", {
    path: "/",
    maxAge: YEAR,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
  return { error: null, on: !!on };
}

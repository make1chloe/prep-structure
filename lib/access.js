/** 「누가 무엇을 보나」를 읽는 자리 **한 곳**(원칙-1) — 화면과 판이 role_access 를 제각기 읽으면
 *  한 군데를 고칠 때 나머지가 남아 **켠 대로 안 보이는 화면**이 생긴다((서2) 가 그렇게 새고 있었다).
 *  조회가 아니라 **조회 약속**을 돌려준다 — 부르는 쪽이 제 파도(Promise.all)에 태운다(속도-1: 층을 안 늘린다). */
import { db } from "./supabase.js";
export const accessQuery = (sb, role) => db(sb).from("role_access").select("role,key,allowed").eq("role", role);
/** 표 전체(역할 넷) — 「누가 무엇을 보나」 화면과 대시보드 배지가 쓴다. 같은 자리에서 읽는다 */
export const accessAllQuery = (sb) => db(sb).from("role_access").select("role,key,allowed");

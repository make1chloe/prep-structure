"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function addStudent(formData) {
  const name = (formData.get("name") || "").toString().trim();
  if (!name) return;

  const school = (formData.get("school") || "").toString().trim() || null;
  const grade = (formData.get("grade") || "").toString().trim() || null;
  const parent_phone = (formData.get("parent_phone") || "").toString().trim() || null;
  const note = (formData.get("note") || "").toString().trim() || null;

  const supabase = createClient();
  await supabase.from("students").insert({ name, school, grade, parent_phone, note });
  revalidatePath("/students");
}

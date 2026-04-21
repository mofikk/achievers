import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "./supabase";

export async function requireAuthenticatedUser(req: NextRequest) {
  const authHeader = req.headers.get("authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.replace("Bearer ", "");

  const supabase = createSupabaseServerClient(token);

  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user) return null;

  return data.user;
}

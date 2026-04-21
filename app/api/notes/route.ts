import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { failure, success } from "../_lib/response";
import { getActorContext, logActivity } from "../_lib/activity";
import { requirePermission } from "../_lib/permissions";

function createSupabaseFromRequest(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    }
  );

  return supabase;
}

function mapNote(row: any) {
  return {
    id: row.id,
    text: row.body || "",
    pinned: row.pinned === true,
    tag: row.tag || "",
    created_by: row.created_by || null,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export async function GET(req: NextRequest) {
  try {
    const supabase = createSupabaseFromRequest(req);
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return failure("Unauthorized", 401);
    }

    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q")?.trim().toLowerCase();

    const { data, error } = await supabase
      .from("notes")
      .select("id, body, pinned, tag, created_by, created_at, updated_at")
      .order("created_at", { ascending: false });

    if (error) return failure(error.message, 400);

    const notes = (data ?? []).map(mapNote);
    if (!query) return success(notes);

    const filtered = notes.filter((note) => {
      const text = String(note.text || "").toLowerCase();
      const tag = String(note.tag || "").toLowerCase();
      return text.includes(query) || tag.includes(query);
    });

    return success(filtered);
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Failed to fetch notes.", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const check = await requirePermission(req, "manage_notes");
    if (!check.ok || !check.auth) return check.response;
    const { supabase, user } = check.auth;

    const body = await req.json();
    const text = String(body?.text || "").trim();
    if (!text) return failure("Note text is required.", 400);

    const payload = {
      body: text,
      pinned: Boolean(body?.pinned),
      tag: body?.tag ? String(body.tag).trim() : null,
      created_by: user.id
    };

    const { data, error } = await supabase
      .from("notes")
      .insert(payload)
      .select("id, body, pinned, tag, created_by, created_at, updated_at")
      .single();

    if (error) return failure(error.message, 400);

    const actor = await getActorContext(supabase, user.id);
    await logActivity(supabase, {
      type: "note_added",
      message: `${actor.name || "Someone"} added a note`,
      actorUserId: user.id,
      metadata: {
        action: "create_note",
        note_id: data.id,
        tag: data.tag || null,
        pinned: data.pinned === true
      }
    });

    return success(mapNote(data), 201);
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Failed to create note.", 500);
  }
}

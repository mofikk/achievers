import { NextRequest } from "next/server";
import { failure, success } from "../http/response";
import { getActorContext, logActivity } from "./activity.service";
import { requirePermission } from "../auth/permissions";
import { createServerClient } from "../supabase/server";
import { getTokenFromRequest } from "../auth/getToken";

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

export async function getNotes(req: NextRequest) {
  try {
    const supabase = createServerClient(getTokenFromRequest(req) || undefined);
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

export async function createNote(req: NextRequest) {
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

export async function patchNote(request: NextRequest, id: string) {
  try {
    const check = await requirePermission(request, "manage_notes");
    if (!check.ok || !check.auth) return check.response;
    const { user, supabase } = check.auth;

    const body = await request.json();
    if (!body || typeof body !== "object") {
      return failure("Invalid request body.", 400);
    }

    const updatePayload: Record<string, unknown> = {};
    if ((body as any).text !== undefined) {
      const text = String((body as any).text || "").trim();
      if (!text) return failure("Note text is required.", 400);
      updatePayload.body = text;
    }
    if ((body as any).pinned !== undefined) updatePayload.pinned = Boolean((body as any).pinned);
    if ((body as any).tag !== undefined) updatePayload.tag = (body as any).tag ? String((body as any).tag).trim() : null;

    const { data, error } = await supabase
      .from("notes")
      .update(updatePayload)
      .eq("id", id)
      .select("id, body, pinned, tag, created_by, created_at, updated_at")
      .single();

    if (error) {
      return failure(error.message, 400);
    }

    const actor = await getActorContext(supabase, user.id);
    await logActivity(supabase, {
      type: "note_updated",
      message: `${actor.name || "Someone"} updated a note`,
      actorUserId: user.id,
      metadata: {
        action: "update_note",
        note_id: data.id,
        tag: data.tag || null,
        pinned: data.pinned === true
      }
    });

    return success(mapNote(data));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update note.";
    return failure(message, 500);
  }
}

export async function deleteNote(request: NextRequest, id: string) {
  try {
    const check = await requirePermission(request, "manage_notes");
    if (!check.ok || !check.auth) return check.response;
    const { user, supabase } = check.auth;

    const { data: noteBeforeDelete } = await supabase
      .from("notes")
      .select("id, tag, pinned")
      .eq("id", id)
      .maybeSingle();
    const { error } = await supabase.from("notes").delete().eq("id", id);
    if (error) {
      return failure(error.message, 400);
    }

    const actor = await getActorContext(supabase, user.id);
    await logActivity(supabase, {
      type: "note_deleted",
      message: `${actor.name || "Someone"} deleted a note`,
      actorUserId: user.id,
      metadata: {
        action: "delete_note",
        note_id: id,
        tag: noteBeforeDelete?.tag || null,
        pinned: noteBeforeDelete?.pinned === true
      }
    });

    return success({ id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete note.";
    return failure(message, 500);
  }
}



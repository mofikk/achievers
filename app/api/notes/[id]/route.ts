import { failure, success } from "../../_lib/response";
import { NextRequest } from "next/server";
import { getActorContext, logActivity } from "../../_lib/activity";
import { requirePermission } from "../../_lib/permissions";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

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

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const check = await requirePermission(request, "manage_notes");
    if (!check.ok || !check.auth) return check.response;
    const { user, supabase } = check.auth;

    const body = await request.json();
    if (!body || typeof body !== "object") {
      return failure("Invalid request body.", 400);
    }

    const updatePayload: Record<string, unknown> = {};
    if (body.text !== undefined) {
      const text = String(body.text || "").trim();
      if (!text) return failure("Note text is required.", 400);
      updatePayload.body = text;
    }
    if (body.pinned !== undefined) updatePayload.pinned = Boolean(body.pinned);
    if (body.tag !== undefined) updatePayload.tag = body.tag ? String(body.tag).trim() : null;

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

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
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

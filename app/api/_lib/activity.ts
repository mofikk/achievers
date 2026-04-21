export async function getActorContext(supabase: any, userId?: string | null) {
  if (!userId) {
    return { name: null as string | null, email: null as string | null };
  }
  const { data: actorProfile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();
  return {
    name: actorProfile?.full_name || actorProfile?.email || null,
    email: actorProfile?.email || null
  };
}

export async function logActivity(supabase: any, input: {
  type: string;
  message: string;
  actorUserId?: string | null;
  relatedPlayerId?: string | null;
  relatedVisitorId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    const actor = await getActorContext(supabase, input.actorUserId);

    const metadata = {
      ...(input.metadata || {}),
      actor_id: input.actorUserId || null,
      actor_name: actor.name,
      actor_email: actor.email
    };

    const basePayload = {
      type: input.type,
      message: input.message,
      actor_user_id: input.actorUserId || null,
      related_player_id: input.relatedPlayerId || null,
      related_visitor_id: input.relatedVisitorId || null,
      metadata
    };

    const { error } = await supabase.from("activity_logs").insert(basePayload);
    if (error) {
      // Retry with foreign keys nulled out (common when profile/player FK does not resolve).
      const { error: fallbackError } = await supabase.from("activity_logs").insert({
        ...basePayload,
        actor_user_id: null,
        related_player_id: null,
        related_visitor_id: null
      });
      if (fallbackError) {
        console.error("Activity log insert failed:", fallbackError.message);
      }
    }
  } catch (error) {
    // Swallow activity logging failures to avoid breaking primary flows.
    console.error("Activity log insert exception:", error);
  }
}

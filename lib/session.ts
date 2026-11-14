import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * The signed-in user, their profile and their team, resolved once per
 * request.
 *
 * `cache()` is scoped to a single server render, so a layout and the
 * page inside it share one `auth.getUser()` round-trip instead of each
 * calling Supabase separately. The middleware still validates the
 * session at the edge; this is the render-tree copy.
 */
export const getSessionContext = cache(async () => {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return { supabase, user: null, profile: null, team: null };
    }

    const { data: profile } = await supabase
        .from("profiles")
        .select("id, user_id, team_id, name, role, is_admin")
        .eq("user_id", user.id)
        .single();

    const teamResult = profile?.team_id
        ? await supabase
              .from("teams")
              .select(
                  "id, name, owner_id, invite_code, logo_url, primary_color, secondary_color",
              )
              .eq("id", profile.team_id)
              .single()
        : null;

    return { supabase, user, profile, team: teamResult?.data ?? null };
});

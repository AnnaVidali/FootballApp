import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { readFile } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("team_id")
      .eq("user_id", user.id)
      .single();

    if (profile?.team_id) {
      const { data: team } = await supabase
        .from("teams")
        .select("logo_url")
        .eq("id", profile.team_id)
        .single();

      if (team?.logo_url) {
        try {
          const res = await fetch(team.logo_url);
          if (res.ok) {
            const blob = await res.arrayBuffer();
            return new NextResponse(blob, {
              headers: {
                "Content-Type": res.headers.get("Content-Type") || "image/png",
                "Cache-Control": "no-cache",
              },
            });
          }
        } catch {
          // fall through to default
        }
      }
    }
  }

  const filePath = path.join(process.cwd(), "public", "soccerballimage.png");
  const buffer = await readFile(filePath);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=3600",
    },
  });
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isOwnTeamLogoUrl } from "@/lib/logo-url";
import { readFile } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

const LOGO_FETCH_TIMEOUT_MS = 5000;
const LOGO_MAX_BYTES = 2 * 1024 * 1024;

export async function GET() {
  const supabase = await createClient();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
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

      if (team?.logo_url && isOwnTeamLogoUrl(team.logo_url, profile.team_id, supabaseUrl)) {
        try {
          const res = await fetch(team.logo_url, {
            signal: AbortSignal.timeout(LOGO_FETCH_TIMEOUT_MS),
            redirect: "error",
          });
          const contentType = res.headers.get("Content-Type") || "";
          const declaredLength = Number(res.headers.get("Content-Length") || "0");
          if (res.ok && contentType.startsWith("image/") && declaredLength <= LOGO_MAX_BYTES) {
            const blob = await res.arrayBuffer();
            if (blob.byteLength <= LOGO_MAX_BYTES) {
              return new NextResponse(blob, {
                headers: {
                  "Content-Type": contentType,
                  "Cache-Control": "no-cache",
                },
              });
            }
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

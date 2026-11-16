import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isOwnTeamLogoUrl } from "@/lib/logo-url";
import { createHash } from "crypto";
import { readFile } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

const LOGO_FETCH_TIMEOUT_MS = 5000;
const LOGO_MAX_BYTES = 2 * 1024 * 1024;

function weakEtag(value: string | Buffer): string {
  return `W/"${createHash("sha1").update(value).digest("hex")}"`;
}

/**
 * The bundled fallback icon, read from disk once and reused. Its content
 * cannot change while the process is running, so both the bytes and their
 * ETag are cached. A failed read is not cached, so a transient error can be
 * retried on the next request.
 */
let fallbackLogo: Promise<{ body: Uint8Array<ArrayBuffer>; etag: string }> | null = null;

function loadFallbackLogo(): Promise<{ body: Uint8Array<ArrayBuffer>; etag: string }> {
  if (!fallbackLogo) {
    fallbackLogo = readFile(path.join(process.cwd(), "public", "soccerballimage.png"))
      .then((buffer) => ({ body: Uint8Array.from(buffer), etag: weakEtag(buffer) }))
      .catch((err) => {
        fallbackLogo = null;
        throw err;
      });
  }
  return fallbackLogo;
}

function notModified(request: Request, etag: string): NextResponse | null {
  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: { ETag: etag, "Cache-Control": "private, no-cache" },
    });
  }
  return null;
}

export async function GET(request: Request) {
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
        // The storage path changes whenever a new logo is uploaded, so the
        // URL itself is a valid cache validator. Revalidating with it keeps
        // the icon fresh without re-downloading an unchanged logo.
        const etag = weakEtag(team.logo_url);
        const cached = notModified(request, etag);
        if (cached) return cached;

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
                  "Cache-Control": "private, no-cache",
                  ETag: etag,
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

  const { body, etag } = await loadFallbackLogo();
  const cached = notModified(request, etag);
  if (cached) return cached;

  return new NextResponse(body, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, no-cache",
      ETag: etag,
    },
  });
}

#!/usr/bin/env node
/**
 * End-to-end test for the two service-role account routes:
 *
 *   POST /api/account/update-email
 *   POST /api/account/delete
 *
 * It also checks that the app is serving the CSP header, since that is
 * the other thing only a running deployment can prove.
 *
 * Usage:
 *   npm run build && npm start          # in one terminal
 *   node scripts/e2e-account.mjs        # in another
 *
 * The target defaults to http://localhost:3000; override with
 * E2E_BASE_URL. The script creates one throwaway auth user, drives it
 * through an email change and an account deletion, verifies the rows
 * are gone, and deletes the user again if anything fails halfway. It
 * needs the service-role key, so it reads .env.local and must not be
 * pointed at a database whose users you care about.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const ROOT = resolve(import.meta.dirname, "..");
const BASE_URL = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

function loadEnv() {
    const raw = readFileSync(resolve(ROOT, ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
        if (match && process.env[match[1]] === undefined) {
            process.env[match[1]] = match[2].trim();
        }
    }
}

let passed = 0;
let failed = 0;

function check(name, ok, detail = "") {
    if (ok) {
        passed += 1;
        console.log(`PASS  ${name}`);
    } else {
        failed += 1;
        console.error(`FAIL  ${name}${detail ? ` -- ${detail}` : ""}`);
    }
}

async function post(path, body, cookie, extraHeaders = {}) {
    const response = await fetch(`${BASE_URL}${path}`, {
        method: "POST",
        headers: {
            ...(body === undefined ? {} : { "content-type": "application/json" }),
            ...(cookie ? { cookie } : {}),
            ...extraHeaders,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: "manual",
    });
    const text = await response.text();
    let data;
    try {
        data = JSON.parse(text);
    } catch {
        data = { raw: text.slice(0, 200) };
    }
    return { status: response.status, data };
}

/**
 * Sign in with @supabase/ssr's server client so the session is written
 * to the same cookie names the app's route handlers read. A plain
 * supabase-js client keeps the session in memory and sends nothing.
 */
async function signIn(email, password) {
    const jar = new Map();
    const client = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        {
            cookies: {
                getAll() {
                    return [...jar].map(([name, value]) => ({ name, value }));
                },
                setAll(cookies) {
                    cookies.forEach(({ name, value }) => jar.set(name, value));
                },
            },
        },
    );
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(2);
}

const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
});

const runId = Date.now();
const password = `E2e-${randomUUID()}`;
const email = `squadhq-e2e-${runId}@example.com`;
const newEmail = `squadhq-e2e-${runId}-new@example.com`;
let userId = null;

try {
    const landing = await fetch(`${BASE_URL}/login`, { redirect: "manual" });
    const csp = landing.headers.get("content-security-policy") ?? "";
    check("app is reachable", landing.status < 400, `status ${landing.status}`);
    check("CSP header is served", csp.includes("default-src 'self'") && csp.includes("nonce-"));
    check("X-Powered-By is not advertised", !landing.headers.has("x-powered-by"));
    check("HSTS header is served", (landing.headers.get("strict-transport-security") ?? "").includes("max-age="));

    const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
    });
    if (createError) throw new Error(`createUser: ${createError.message}`);
    userId = created.user.id;
    check("throwaway user created", Boolean(userId));

    const unauthorized = await post("/api/account/update-email", { newEmail, currentPassword: password });
    check(
        "server has the service-role key (401, not 500)",
        unauthorized.status === 401,
        `status ${unauthorized.status}: ${JSON.stringify(unauthorized.data)}`,
    );

    const cookie = await signIn(email, password);
    check("signed in and captured session cookies", cookie.length > 0);

    const wrongPassword = await post(
        "/api/account/update-email",
        { newEmail, currentPassword: "not-the-password" },
        cookie,
    );
    check(
        "update-email rejects a wrong current password",
        wrongPassword.status === 401 && wrongPassword.data.code === "invalid_password",
        `status ${wrongPassword.status}: ${JSON.stringify(wrongPassword.data)}`,
    );

    const crossOrigin = await post(
        "/api/account/update-email",
        { newEmail, currentPassword: password },
        cookie,
        { origin: "https://evil.example" },
    );
    check(
        "state-changing route rejects a cross-origin request",
        crossOrigin.status === 403,
        `status ${crossOrigin.status}: ${JSON.stringify(crossOrigin.data)}`,
    );

    const changed = await post(
        "/api/account/update-email",
        { newEmail, currentPassword: password },
        cookie,
    );
    check("update-email returns success", changed.status === 200 && changed.data.success === true,
        `status ${changed.status}: ${JSON.stringify(changed.data)}`);

    const newCookie = await signIn(newEmail, password);
    check("can sign in with the new email", newCookie.length > 0);

    const wrongDelete = await post("/api/account/delete", { currentPassword: "not-the-password" }, newCookie);
    check(
        "delete rejects a wrong current password",
        wrongDelete.status === 401 && wrongDelete.data.code === "invalid_password",
        `status ${wrongDelete.status}: ${JSON.stringify(wrongDelete.data)}`,
    );

    const deleted = await post("/api/account/delete", { currentPassword: password }, newCookie);
    check("delete returns success", deleted.status === 200 && deleted.data.success === true,
        `status ${deleted.status}: ${JSON.stringify(deleted.data)}`);

    let deletedSignIn = false;
    try {
        await signIn(newEmail, password);
        deletedSignIn = true;
    } catch {
        // expected
    }
    check("the deleted account can no longer sign in", !deletedSignIn);

    const { data: goneUser } = await admin.auth.admin.getUserById(userId);
    check("auth.users row deleted", !goneUser.user);
    userId = null;

    const { data: goneProfile } = await admin
        .from("profiles")
        .select("id")
        .eq("user_id", created.user.id)
        .maybeSingle();
    check("profiles row cascaded away", goneProfile === null);
} catch (error) {
    check("test completes", false, error instanceof Error ? error.message : String(error));
} finally {
    if (userId) {
        const { error } = await admin.auth.admin.deleteUser(userId);
        console.log(error ? `cleanup failed: ${error.message}` : "cleanup: removed the throwaway user");
    }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);

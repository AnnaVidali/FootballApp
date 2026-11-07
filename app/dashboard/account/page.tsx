"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLocaleContext } from "@/lib/i18n-context";
import AlertModal from "@/components/AlertModal";
import ConfirmModal from "@/components/ConfirmModal";

/**
 * Read a JSON body from a fetch response without ever throwing.
 *
 * A misrouted request (for example a proxy answering with an HTML redirect
 * page) would make `res.json()` throw, which used to leave the form stuck
 * in its loading state with no error shown. Anything that is not JSON is
 * reported as an error instead.
 */
async function readJsonResponse(res: Response): Promise<{ error?: string; code?: string; success?: boolean }> {
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
        throw new Error(`Unexpected response (${res.status} ${res.statusText || "no status"}).`);
    }
    try {
        return await res.json();
    } catch {
        throw new Error(`Unexpected response (${res.status}): the body was not valid JSON.`);
    }
}

export default function AccountPage() {
    const router = useRouter();
    const supabase = createClient();
    const { t } = useLocaleContext();

    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [newEmail, setNewEmail] = useState("");
    const [emailPassword, setEmailPassword] = useState("");
    const [deletePassword, setDeletePassword] = useState("");
    const [loading, setLoading] = useState(false);

    const [alertOpen, setAlertOpen] = useState(false);
    const [alertTitle, setAlertTitle] = useState("");
    const [alertMsg, setAlertMsg] = useState("");
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [disbandConfirmOpen, setDisbandConfirmOpen] = useState(false);
    const [isOwner, setIsOwner] = useState(false);

    function showAlert(title: string, msg: string) {
        setAlertTitle(title);
        setAlertMsg(msg);
        setAlertOpen(true);
    }

    useEffect(() => {
        async function fetchOwnership() {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const { data: profile } = await supabase
                .from("profiles")
                .select("team_id")
                .eq("user_id", user.id)
                .single();
            if (!profile?.team_id) return;
            const { data: team } = await supabase
                .from("teams")
                .select("owner_id")
                .eq("id", profile.team_id)
                .single();
            if (team?.owner_id === user.id) setIsOwner(true);
        }
        fetchOwnership();
        // `supabase` is a module level singleton, so it does not belong in
        // the dependency array.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function handleChangePassword(e: React.FormEvent) {
        e.preventDefault();
        if (!currentPassword) {
            showAlert(t("common.error"), t("account.passwordRequired"));
            return;
        }
        if (newPassword.length < 6) {
            showAlert(t("common.error"), t("account.passwordMinLength"));
            return;
        }
        if (newPassword !== confirmPassword) {
            showAlert(t("common.error"), t("account.passwordsNoMatch"));
            return;
        }
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user?.email) {
                showAlert(t("common.error"), t("auth.notLoggedIn"));
                return;
            }
            // Re-authenticate first so a stolen session cannot silently
            // change the password.
            const { error: verifyError } = await supabase.auth.signInWithPassword({
                email: user.email,
                password: currentPassword,
            });
            if (verifyError) {
                showAlert(t("common.error"), t("account.invalidPassword"));
                return;
            }
            const { error } = await supabase.auth.updateUser({ password: newPassword });
            if (error) {
                showAlert(t("common.error"), error.message);
                return;
            }
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
            showAlert(t("common.notice"), t("account.passwordUpdated"));
        } finally {
            setLoading(false);
        }
    }

    async function handleChangeEmail(e: React.FormEvent) {
        e.preventDefault();
        if (!newEmail || !newEmail.includes("@")) {
            showAlert(t("common.error"), t("account.enterValidEmail"));
            return;
        }
        if (!emailPassword) {
            showAlert(t("common.error"), t("account.passwordRequired"));
            return;
        }
        setLoading(true);
        try {
            const res = await fetch("/api/account/update-email", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ newEmail, currentPassword: emailPassword }),
            });
            const data = await readJsonResponse(res);
            if (!res.ok) {
                const message =
                    data.code === "invalid_password"
                        ? t("account.invalidPassword")
                        : data.code === "email_unchanged"
                          ? t("account.emailUnchanged")
                          : data.error || t("common.error");
                showAlert(t("common.error"), message);
                return;
            }
            setNewEmail("");
            setEmailPassword("");
            showAlert(t("common.notice"), t("account.emailUpdated"));
        } catch (err) {
            showAlert(t("common.error"), err instanceof Error ? err.message : t("common.error"));
        } finally {
            setLoading(false);
        }
    }

    async function handleDeleteAccount() {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            showAlert(t("common.error"), t("auth.notLoggedIn"));
            setLoading(false);
            return;
        }

        const { data: profile } = await supabase
            .from("profiles")
            .select("team_id")
            .eq("user_id", user.id)
            .single();

        if (profile?.team_id) {
            const { data: team } = await supabase
                .from("teams")
                .select("owner_id")
                .eq("id", profile.team_id)
                .single();

            if (team?.owner_id === user.id) {
                showAlert(t("common.error"), t("account.ownerTransferFirst"));
                setLoading(false);
                return;
            }
        }

        const { data: isAdmin } = await supabase
            .from("profiles")
            .select("is_admin")
            .eq("user_id", user.id)
            .single();

        if (isAdmin?.is_admin) {
            const { data: canLeave } = await supabase.rpc("can_leave_team");
            if (canLeave === false) {
                showAlert(t("common.error"), t("account.soleAdminFirst"));
                setLoading(false);
                return;
            }
        }

        try {
            const deleteRes = await fetch("/api/account/delete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ currentPassword: deletePassword }),
            });
            const data = await readJsonResponse(deleteRes);
            if (!deleteRes.ok) {
                const message =
                    data.code === "invalid_password"
                        ? t("account.invalidPassword")
                        : t("account.failedDelete") + (data.error || t("common.error"));
                showAlert(t("common.error"), message);
                return;
            }
        } catch (err) {
            showAlert(t("common.error"), t("account.failedDelete") + (err instanceof Error ? err.message : t("common.error")));
            return;
        } finally {
            setLoading(false);
        }

        setDeletePassword("");
        await supabase.auth.signOut();
        router.push("/");
        router.refresh();
    }

    async function handleDisbandTeam() {
        setLoading(true);
        try {
            const res = await fetch("/api/team/disband", { method: "POST" });
            const data = await readJsonResponse(res);
            if (!res.ok) {
                showAlert(t("common.error"), data.error || "Unknown error");
                return;
            }
        } catch (err) {
            showAlert(t("common.error"), err instanceof Error ? err.message : "Unknown error");
            return;
        } finally {
            setLoading(false);
        }
        router.push("/dashboard");
        router.refresh();
    }

    return (
        <div className="max-w-md mx-auto space-y-8">
            <h1 className="text-2xl font-bold text-black">{t("account.title")}</h1>

            <AlertModal open={alertOpen} title={alertTitle} message={alertMsg} onClose={() => setAlertOpen(false)} />
            <ConfirmModal
                open={confirmOpen}
                title={t("account.deleteAccount")}
                message={t("account.deleteDesc")}
                confirmLabel={t("account.deleteAccount")}
                danger
                confirmDisabled={!deletePassword}
                onConfirm={() => { setConfirmOpen(false); handleDeleteAccount(); }}
                onCancel={() => { setConfirmOpen(false); setDeletePassword(""); }}
            >
                <div className="mb-4">
                    <label htmlFor="delete-password" className="block text-sm font-medium text-gray-700 mb-1">
                        {t("account.currentPassword")}
                    </label>
                    <input
                        id="delete-password"
                        type="password"
                        value={deletePassword}
                        onChange={(e) => setDeletePassword(e.target.value)}
                        autoComplete="current-password"
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-black"
                    />
                    <p className="mt-1 text-xs text-gray-500">{t("account.deletePasswordHint")}</p>
                </div>
            </ConfirmModal>
            <ConfirmModal
                open={disbandConfirmOpen}
                title={t("account.disbandTeam")}
                message={t("account.disbandDesc")}
                confirmLabel={t("account.disbandTeam")}
                danger
                onConfirm={() => { setDisbandConfirmOpen(false); handleDisbandTeam(); }}
                onCancel={() => setDisbandConfirmOpen(false)}
            />

            {/* Change Password */}
            <div className="rounded-lg bg-white p-4 shadow-sm">
                <h2 className="font-bold text-black mb-3">{t("account.changePassword")}</h2>
                <p className="text-sm text-gray-500 mb-3">{t("account.currentPasswordHint")}</p>
                <form onSubmit={handleChangePassword} className="space-y-3">
                    <div>
                        <label htmlFor="current-password" className="block text-sm font-medium text-gray-700 mb-1">
                            {t("account.currentPassword")}
                        </label>
                        <input
                            id="current-password"
                            type="password"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            required
                            autoComplete="current-password"
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-black"
                        />
                    </div>
                    <div>
                        <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 mb-1">
                            {t("account.newPassword")}
                        </label>
                        <input
                            id="new-password"
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            required
                            minLength={6}
                            autoComplete="new-password"
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-black"
                        />
                    </div>
                    <div>
                        <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 mb-1">
                            {t("account.confirmPassword")}
                        </label>
                        <input
                            id="confirm-password"
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                            minLength={6}
                            autoComplete="new-password"
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-black"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        aria-busy={loading}
                        className="w-full rounded-md px-4 py-2 font-medium disabled:opacity-50"
                        style={{ backgroundColor: "var(--primary)", color: "var(--primary-text)" }}
                    >
                        {loading ? t("common.saving") : t("account.updatePassword")}
                    </button>
                </form>
            </div>

            {/* Change Email */}
            <div className="rounded-lg bg-white p-4 shadow-sm">
                <h2 className="font-bold text-black mb-3">{t("account.changeEmail")}</h2>
                <form onSubmit={handleChangeEmail} className="space-y-3">
                    <div>
                        <label htmlFor="new-email" className="block text-sm font-medium text-gray-700 mb-1">
                            {t("account.newEmail")}
                        </label>
                        <input
                            id="new-email"
                            type="email"
                            value={newEmail}
                            onChange={(e) => setNewEmail(e.target.value)}
                            required
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-black"
                        />
                    </div>
                    <div>
                        <label htmlFor="email-password" className="block text-sm font-medium text-gray-700 mb-1">
                            {t("account.currentPassword")}
                        </label>
                        <input
                            id="email-password"
                            type="password"
                            value={emailPassword}
                            onChange={(e) => setEmailPassword(e.target.value)}
                            required
                            autoComplete="current-password"
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-black"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        aria-busy={loading}
                        className="w-full rounded-md px-4 py-2 font-medium disabled:opacity-50"
                        style={{ backgroundColor: "var(--primary)", color: "var(--primary-text)" }}
                    >
                        {loading ? t("common.saving") : t("account.updateEmail")}
                    </button>
                </form>
            </div>

            {/* Danger Zone */}
            <div className="rounded-lg bg-white p-4 shadow-sm border border-red-200">
                <h2 className="font-bold text-red-600 mb-2">{t("account.dangerZone")}</h2>
                {isOwner && (
                    <>
                        <p className="text-sm text-gray-500 mb-3">
                            {t("account.disbandDesc")}
                        </p>
                        <button
                            onClick={() => setDisbandConfirmOpen(true)}
                            disabled={loading}
                            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 mb-3"
                        >
                            {t("account.disbandTeam")}
                        </button>
                        <hr className="border-red-200 my-3" />
                    </>
                )}
                <p className="text-sm text-gray-500 mb-3">
                    {t("account.deleteDesc")}
                </p>
                <button
                    onClick={() => setConfirmOpen(true)}
                    disabled={loading}
                    className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                    {t("account.deleteAccount")}
                </button>
            </div>
        </div>
    );
}

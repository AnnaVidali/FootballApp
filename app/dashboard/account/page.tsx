"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AlertModal from "@/components/AlertModal";
import ConfirmModal from "@/components/ConfirmModal";

export default function AccountPage() {
    const router = useRouter();
    const supabase = createClient();

    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [newEmail, setNewEmail] = useState("");
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
    }, []);

    async function handleChangePassword(e: React.FormEvent) {
        e.preventDefault();
        if (newPassword.length < 6) {
            showAlert("Error", "Password must be at least 6 characters.");
            return;
        }
        if (newPassword !== confirmPassword) {
            showAlert("Error", "Passwords do not match.");
            return;
        }
        setLoading(true);
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        setLoading(false);
        if (error) {
            showAlert("Error", error.message);
        } else {
            setNewPassword("");
            setConfirmPassword("");
            showAlert("Success", "Password updated successfully.");
        }
    }

    async function handleChangeEmail(e: React.FormEvent) {
        e.preventDefault();
        if (!newEmail || !newEmail.includes("@")) {
            showAlert("Error", "Please enter a valid email address.");
            return;
        }
        setLoading(true);
        const res = await fetch("/api/account/update-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ newEmail }),
        });
        const data = await res.json();
        setLoading(false);
        if (!res.ok) {
            showAlert("Error", data.error || "Failed to update email.");
        } else {
            setNewEmail("");
            showAlert("Success", "Email updated successfully.");
        }
    }

    async function handleDeleteAccount() {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            showAlert("Error", "Not logged in.");
            setLoading(false);
            return;
        }

        // Check if user is the team owner or sole admin
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
                showAlert("Can't Delete", "You're the team owner. Transfer ownership to another member before deleting your account.");
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
                showAlert("Can't Delete", "You're the only admin on this team. Promote another player to admin before deleting your account.");
                setLoading(false);
                return;
            }
        }

        // Delete the Supabase auth user first (profile is cascade-deleted)
        const deleteRes = await fetch("/api/account/delete", { method: "POST" });
        if (!deleteRes.ok) {
            const data = await deleteRes.json();
            showAlert("Error", "Failed to delete account: " + (data.error || "Unknown error"));
            setLoading(false);
            return;
        }

        // Sign out after successful deletion
        await supabase.auth.signOut();
        setLoading(false);
        router.push("/");
        router.refresh();
    }

    async function handleDisbandTeam() {
        setLoading(true);
        const { error } = await supabase.rpc("disband_team");
        setLoading(false);
        if (error) {
            showAlert("Error", error.message);
        } else {
            router.push("/dashboard");
            router.refresh();
        }
    }

    return (
        <div className="max-w-md mx-auto space-y-8">
            <h1 className="text-2xl font-bold text-black">Account</h1>

            <AlertModal open={alertOpen} title={alertTitle} message={alertMsg} onClose={() => setAlertOpen(false)} />
            <ConfirmModal
                open={confirmOpen}
                title="Delete Account"
                message="This will remove you from your team and sign you out. You'll need to rejoin with an invite code if you want to come back. This action cannot be undone."
                confirmLabel="Delete"
                danger
                onConfirm={() => { setConfirmOpen(false); handleDeleteAccount(); }}
                onCancel={() => setConfirmOpen(false)}
            />
            <ConfirmModal
                open={disbandConfirmOpen}
                title="Disband Team"
                message="This will permanently delete your team and all its data (events, lineups, set pieces). Every member will be removed from the team and lose their admin/coach roles. This action cannot be undone."
                confirmLabel="Disband"
                danger
                onConfirm={() => { setDisbandConfirmOpen(false); handleDisbandTeam(); }}
                onCancel={() => setDisbandConfirmOpen(false)}
            />

            {/* Change Password */}
            <div className="rounded-lg bg-white p-4 shadow-sm">
                <h2 className="font-bold text-black mb-3">Change Password</h2>
                <form onSubmit={handleChangePassword} className="space-y-3">
                    <div>
                        <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 mb-1">
                            New Password
                        </label>
                        <input
                            id="new-password"
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            required
                            minLength={6}
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-black"
                        />
                    </div>
                    <div>
                        <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 mb-1">
                            Confirm Password
                        </label>
                        <input
                            id="confirm-password"
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                            minLength={6}
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
                        {loading ? "Saving..." : "Update Password"}
                    </button>
                </form>
            </div>

            {/* Change Email */}
            <div className="rounded-lg bg-white p-4 shadow-sm">
                <h2 className="font-bold text-black mb-3">Change Email</h2>
                <form onSubmit={handleChangeEmail} className="space-y-3">
                    <div>
                        <label htmlFor="new-email" className="block text-sm font-medium text-gray-700 mb-1">
                            New Email
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
                    <button
                        type="submit"
                        disabled={loading}
                        aria-busy={loading}
                        className="w-full rounded-md px-4 py-2 font-medium disabled:opacity-50"
                        style={{ backgroundColor: "var(--primary)", color: "var(--primary-text)" }}
                    >
                        {loading ? "Saving..." : "Update Email"}
                    </button>
                </form>
            </div>

            {/* Danger Zone */}
            <div className="rounded-lg bg-white p-4 shadow-sm border border-red-200">
                <h2 className="font-bold text-red-600 mb-2">Danger Zone</h2>
                {isOwner && (
                    <>
                        <p className="text-sm text-gray-500 mb-3">
                            Disband your team. All members will be removed and lose their roles. All team data (events, lineups, set pieces) will be permanently deleted.
                        </p>
                        <button
                            onClick={() => setDisbandConfirmOpen(true)}
                            disabled={loading}
                            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 mb-3"
                        >
                            Disband Team
                        </button>
                        <hr className="border-red-200 my-3" />
                    </>
                )}
                <p className="text-sm text-gray-500 mb-3">
                    This will remove you from your team and sign you out. You can&apos;t delete your account if you&apos;re the only admin — promote someone first.
                </p>
                <button
                    onClick={() => setConfirmOpen(true)}
                    disabled={loading}
                    className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                    Delete Account
                </button>
            </div>
        </div>
    );
}

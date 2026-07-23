"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Member = {
    id: string;
    user_id: string;
    name: string;
    position: string | null;
    shirt_number: number | null;
    is_admin: boolean;
};

type Unassigned = {
    id: string;
    user_id: string;
    name: string;
};

export default function RosterClient({
    inviteCode,
    members,
    unassigned,
    isAdmin,
    currentUserId,
}: {
    inviteCode: string;
    members: Member[];
    unassigned: Unassigned[];
    isAdmin: boolean;
    currentUserId: string;
}) {
    const router = useRouter();
    const supabase = createClient();
    const [copied, setCopied] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editPosition, setEditPosition] = useState("");
    const [editShirt, setEditShirt] = useState("");
    const [editName, setEditName] = useState("");
    const [editAdmin, setEditAdmin] = useState(false);
    const [loading, setLoading] = useState(false);


    // Copy invite code
    async function copyInviteCode() {
        await navigator.clipboard.writeText(inviteCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    // Start editing a player
    function startEdit(member: Member) {
        setEditingId(member.id);
        setEditName(member.name);
        setEditPosition(member.position ?? "");
        setEditShirt(member.shirt_number?.toString() ?? "");
        setEditAdmin(member.is_admin);
    }

    // Save the edit
    async function saveEdit(memberId: string) {
        setLoading(true);
        const update: { name: string; position: string | null; shirt_number: number | null; is_admin?: boolean } = {
            name: editName,
            position: editPosition || null,
            shirt_number: editShirt ? parseInt(editShirt) : null,
        };
        if (isAdmin) {
            update.is_admin = editAdmin;
        }
        await supabase
            .from("profiles")
            .update(update)
            .eq("id", memberId);
        setEditingId(null);
        setLoading(false);
        router.refresh();
    }

    // Add unassigned player to team
    async function addToTeam(userId: string) {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        const { data: me } = await supabase
            .from("profiles")
            .select("team_id")
            .eq("user_id", user!.id)
            .single();
        await supabase
            .from("profiles")
            .update({ team_id: me?.team_id })
            .eq("user_id", userId);
        setLoading(false);
        router.refresh();
    }

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <h1 className="text-2xl font-bold text-black">Team Roster</h1>
            {/* Invite Code Section */}
            {isAdmin && (
                <div className="rounded-lg bg-white p-4 shadow-sm">
                    <p className="text-sm text-gray-500 mb-1">📋 Invite Code</p>
                    <div className="flex items-center gap-3">
                        <span className="text-xl font-mono font-bold text-black">{inviteCode}</span>
                        <button
                            onClick={copyInviteCode}
                            className="rounded-md px-3 py-1 text-sm font-medium"
                            style={{ backgroundColor: "var(--primary)", color: "var(--primary-text)" }}
                        >
                            {copied ? "Copied!" : "Copy"}
                        </button>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">Share this code with players to join</p>
                </div>
            )}
            {/* Team Members Section */}
            <div className="rounded-lg bg-white p-4 shadow-sm">
                <h2 className="font-bold text-black mb-3">Team Members ({members.length})</h2>
                <div className="divide-y divide-gray-100">
                    {members.map((member) => (
                        <div key={member.id} className="py-3">
                            {editingId === member.id ? (
                                <div className="space-y-2">
                                    <input
                                        type="text"
                                        value={editName}
                                        onChange={(e) => setEditName(e.target.value)}
                                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm text-black"
                                        placeholder="Full name"
                                    />
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            placeholder="Position"
                                            value={editPosition}
                                            onChange={(e) => setEditPosition(e.target.value)}
                                            className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm text-black"
                                        />
                                        <input
                                            type="number"
                                            placeholder="#"
                                            value={editShirt}
                                            onChange={(e) => setEditShirt(e.target.value)}
                                            className="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm text-black"
                                        />
                                    </div>
                                    {isAdmin && (
                                        <label className="flex items-center gap-2 text-sm text-gray-700">
                                            <input
                                                type="checkbox"
                                                checked={editAdmin}
                                                onChange={(e) => setEditAdmin(e.target.checked)}
                                            />
                                            Make Admin
                                        </label>
                                    )}
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => saveEdit(member.id)}
                                            disabled={loading}
                                            className="rounded-md px-3 py-1 text-sm font-medium"
                                            style={{ backgroundColor: "var(--primary)", color: "var(--primary-text)" }}
                                        >
                                            {loading ? "Saving..." : "Save"}
                                        </button>
                                        <button
                                            onClick={() => setEditingId(null)}
                                            className="rounded-md bg-gray-200 px-3 py-1 text-sm text-gray-700"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="font-medium text-black">
                                            {member.name}
                                            {member.shirt_number && (
                                                <span className="ml-2 text-sm text-gray-500">#{member.shirt_number}</span>
                                            )}
                                        </p>
                                        <p className="text-sm text-gray-500">
                                            {member.position || "No position"}
                                            {member.is_admin && (
                                                <span className="ml-2 inline-block rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
                          Admin
                        </span>
                                            )}
                                        </p>
                                    </div>
                                    {(isAdmin || member.user_id === currentUserId) && (
                                        <button
                                            onClick={() => startEdit(member)}
                                            className="text-sm text-gray-500 hover:text-gray-700"
                                        >
                                            Edit
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
            {/* Unassigned Users Section (admin only) */}
            {isAdmin && unassigned.length > 0 && (
                <div className="rounded-lg bg-white p-4 shadow-sm">
                    <h2 className="font-bold text-black mb-3">Waiting to Join ({unassigned.length})</h2>
                    <div className="divide-y divide-gray-100">
                        {unassigned.map((user) => (
                            <div key={user.id} className="flex items-center justify-between py-3">
                                <div>
                                    <p className="font-medium text-black">{user.name}</p>
                                </div>
                                <button
                                    onClick={() => addToTeam(user.user_id)}
                                    disabled={loading}
                                    className="rounded-md px-3 py-1 text-sm font-medium"
                                    style={{ backgroundColor: "var(--primary)", color: "var(--primary-text)" }}
                                >
                                    Add to Team
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
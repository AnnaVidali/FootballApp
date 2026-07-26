"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { positionLabels } from "@/lib/constants";
import AlertModal from "@/components/AlertModal";
import ConfirmModal from "@/components/ConfirmModal";

type Member = {
    id: string;
    user_id: string;
    name: string;
    position: string | null;
    shirt_number: number | null;
    is_admin: boolean;
    role: string;
};

export default function RosterClient({
    inviteCode,
    members,
    isAdmin,
    currentUserId,
    ownerId,
}: {
    inviteCode: string;
    members: Member[];
    isAdmin: boolean;
    currentUserId: string;
    ownerId: string;
}) {
    const router = useRouter();
    const supabase = createClient();
    const [copied, setCopied] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editPosition, setEditPosition] = useState("");
    const [editShirt, setEditShirt] = useState("");
    const [editName, setEditName] = useState("");
    const [editAdmin, setEditAdmin] = useState(false);
    const [editCoach, setEditCoach] = useState(false);
    const [loading, setLoading] = useState(false);
    const [alertOpen, setAlertOpen] = useState(false);
    const [alertMsg, setAlertMsg] = useState("");
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [confirmMsg, setConfirmMsg] = useState("");
    const [pendingLeave, setPendingLeave] = useState(false);
    const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);
    const [pendingTransferId, setPendingTransferId] = useState<string | null>(null);

    const isOwner = currentUserId === ownerId;


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
        setEditCoach(member.role === "coach");
    }

    // Save the edit
    async function saveEdit(memberId: string) {
        setLoading(true);
        const update: { name: string; position: string | null; shirt_number: number | null; is_admin?: boolean; role?: string } = {
            name: editName,
            position: editPosition || null,
            shirt_number: editShirt ? parseInt(editShirt) : null,
        };
        if (isAdmin) {
            update.is_admin = editAdmin;
            update.role = editCoach ? "coach" : "player";
        }
        await supabase
            .from("profiles")
            .update(update)
            .eq("id", memberId);
        setEditingId(null);
        setLoading(false);
        router.refresh();
    }

    // Leave the team
    async function leaveTeam() {
        const { data: canLeave } = await supabase.rpc("can_leave_team");
        if (canLeave === false) {
            if (isOwner) {
                setAlertMsg("You're the team owner. Transfer ownership to another member before leaving.");
            } else {
                setAlertMsg("You're the only admin on this team. Promote another player to admin before leaving.");
            }
            setAlertOpen(true);
            return;
        }
        setConfirmMsg("Are you sure you want to leave this team?");
        setPendingLeave(true);
        setConfirmOpen(true);
    }

    // Transfer ownership to another member
    function promptTransferOwnership(member: Member) {
        setConfirmMsg(`Transfer ownership to ${member.name}? You'll remain an admin.`);
        setPendingTransferId(member.id);
        setConfirmOpen(true);
    }

    // Remove a player from the team (admin only)
    async function removeFromTeam(member: Member) {
        setConfirmMsg(`Remove ${member.name} from the team?`);
        setPendingRemoveId(member.id);
        setConfirmOpen(true);
    }

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <AlertModal open={alertOpen} title="Notice" message={alertMsg} onClose={() => setAlertOpen(false)} />
            <ConfirmModal
                open={confirmOpen}
                title="Confirm"
                message={confirmMsg}
                danger
                onConfirm={async () => {
                    setConfirmOpen(false);
                    if (pendingLeave) {
                        setPendingLeave(false);
                        setLoading(true);
                        const { data: { user } } = await supabase.auth.getUser();
                        if (!user) return;
                        await supabase
                            .from("profiles")
                            .update({ team_id: null })
                            .eq("user_id", user.id);
                        setLoading(false);
                        router.push("/dashboard");
                        router.refresh();
                    } else if (pendingTransferId) {
                        const targetId = pendingTransferId;
                        setPendingTransferId(null);
                        setLoading(true);
                        await supabase.rpc("transfer_ownership", { target_profile_id: targetId });
                        setLoading(false);
                        router.refresh();
                    } else if (pendingRemoveId) {
                        const targetId = pendingRemoveId;
                        setPendingRemoveId(null);
                        setLoading(true);
                        await supabase.rpc("admin_remove_player", { target_profile_id: targetId });
                        setLoading(false);
                        router.refresh();
                    }
                }}
                onCancel={() => { setConfirmOpen(false); setPendingLeave(false); setPendingTransferId(null); setPendingRemoveId(null); }}
            />
            <h1 className="text-2xl font-bold text-black">Team Roster</h1>
            {/* Leave Team*/}
            <button
                onClick={leaveTeam}
                className="rounded-md bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100"
            >
                Leave Team
            </button>
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
                                    <div className="grid grid-cols-[5fr_1fr] gap-2">
                                        <select
                                            value={editPosition}
                                            onChange={(e) => setEditPosition(e.target.value)}
                                            className="min-w-0 rounded-md border border-gray-300 px-2 py-1 text-sm text-black"
                                        >
                                            <option value="">Position</option>
                                            <option value="GK">GK - Goalkeeper</option>
                                            <option value="CB">CB - Center Back</option>
                                            <option value="LB">LB - Left Back</option>
                                            <option value="RB">RB - Right Back</option>
                                            <option value="CM">CM - Central Midfielder</option>
                                            <option value="LM">LM - Left Midfielder</option>
                                            <option value="RM">RM - Right Midfielder</option>
                                            <option value="ST">ST - Striker</option>
                                        </select>
                                        <input
                                            type="number"
                                            placeholder="#"
                                            value={editShirt}
                                            onChange={(e) => setEditShirt(e.target.value)}
                                            className="min-w-0 rounded-md border border-gray-300 px-2 py-1 text-sm text-black"
                                        />
                                    </div>
                                    {isAdmin && (
                                        <>
                                            <label className="flex items-center gap-2 text-sm text-gray-700">
                                                <input
                                                    type="checkbox"
                                                    checked={editAdmin}
                                                    onChange={(e) => setEditAdmin(e.target.checked)}
                                                />
                                                Make Admin
                                            </label>
                                            <label className="flex items-center gap-2 text-sm text-gray-700">
                                                <input
                                                    type="checkbox"
                                                    checked={editCoach}
                                                    onChange={(e) => setEditCoach(e.target.checked)}
                                                />
                                                Coach (doesn&apos;t play in lineups)
                                            </label>
                                        </>
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
                                            {member.position ? `${member.position} - ${positionLabels[member.position] ?? member.position}` : "No position"}
                                            {member.user_id === ownerId && (
                                                <span className="ml-2 inline-block rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800">
                                                    Owner
                                                </span>
                                            )}
                                            {member.is_admin && (
                                                <span className="ml-2 inline-block rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
                                                    Admin
                                                </span>
                                            )}
                                            {member.role === "coach" && (
                                                <span className="ml-2 inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                                                    Coach
                                                </span>
                                            )}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {(isAdmin || member.user_id === currentUserId) && (
                                            <button
                                                onClick={() => startEdit(member)}
                                                className="text-sm text-gray-500 hover:text-gray-700"
                                            >
                                                Edit
                                            </button>
                                        )}
                                        {isOwner && member.user_id !== currentUserId && member.user_id !== ownerId && (
                                            <button
                                                onClick={() => promptTransferOwnership(member)}
                                                className="text-sm text-purple-600 hover:text-purple-800"
                                            >
                                                Make Owner
                                            </button>
                                        )}
                                        {isAdmin && member.user_id !== currentUserId && (
                                            <button
                                                onClick={() => removeFromTeam(member)}
                                                className="text-sm text-red-500 hover:text-red-700"
                                            >
                                                Remove
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
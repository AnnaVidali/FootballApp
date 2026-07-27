"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLocaleContext } from "@/lib/i18n-context";
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

const positionOptions = ["GK", "CB", "LB", "RB", "CM", "LM", "RM", "ST"] as const;

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
    const { t } = useLocaleContext();
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

    async function copyInviteCode() {
        await navigator.clipboard.writeText(inviteCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    function startEdit(member: Member) {
        setEditingId(member.id);
        setEditName(member.name);
        setEditPosition(member.position ?? "");
        setEditShirt(member.shirt_number?.toString() ?? "");
        setEditAdmin(member.is_admin);
        setEditCoach(member.role === "coach");
    }

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

    async function leaveTeam() {
        const { data: canLeave } = await supabase.rpc("can_leave_team");
        if (canLeave === false) {
            if (isOwner) {
                setAlertMsg(t("roster.ownerWarning"));
            } else {
                setAlertMsg(t("roster.soleAdminWarning"));
            }
            setAlertOpen(true);
            return;
        }
        setConfirmMsg(t("roster.leaveConfirm"));
        setPendingLeave(true);
        setConfirmOpen(true);
    }

    function promptTransferOwnership(member: Member) {
        setConfirmMsg(t("roster.transferConfirm", { name: member.name }));
        setPendingTransferId(member.id);
        setConfirmOpen(true);
    }

    function removeFromTeam(member: Member) {
        setConfirmMsg(t("roster.removeConfirm", { name: member.name }));
        setPendingRemoveId(member.id);
        setConfirmOpen(true);
    }

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <AlertModal open={alertOpen} title={t("common.notice")} message={alertMsg} onClose={() => setAlertOpen(false)} />
            <ConfirmModal
                open={confirmOpen}
                title={t("common.confirm")}
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
            <h1 className="text-2xl font-bold text-black">{t("roster.teamRoster")}</h1>
            {/* Leave Team*/}
            <button
                onClick={leaveTeam}
                className="rounded-md bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100"
            >
                {t("roster.leaveTeam")}
            </button>
            {/* Invite Code Section */}
            {isAdmin && (
                <div className="rounded-lg bg-white p-4 shadow-sm">
                    <p className="text-sm text-gray-500 mb-1">{t("roster.inviteCode")}</p>
                    <div className="flex items-center gap-3">
                        <span className="text-xl font-mono font-bold text-black">{inviteCode}</span>
                        <button
                            onClick={copyInviteCode}
                            className="rounded-md px-3 py-1 text-sm font-medium"
                            style={{ backgroundColor: "var(--primary)", color: "var(--primary-text)" }}
                        >
                            {copied ? t("roster.copied") : t("roster.copy")}
                        </button>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{t("roster.shareCode")}</p>
                </div>
            )}
            {/* Team Members Section */}
            <div className="rounded-lg bg-white p-4 shadow-sm">
                <h2 className="font-bold text-black mb-3">{t("roster.teamMembers", { count: members.length })}</h2>
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
                                        placeholder={t("auth.fullName")}
                                    />
                                    <div className="grid grid-cols-[5fr_1fr] gap-2">
                                        <select
                                            value={editPosition}
                                            onChange={(e) => setEditPosition(e.target.value)}
                                            className="min-w-0 rounded-md border border-gray-300 px-2 py-1 text-sm text-black"
                                        >
                                            <option value="">{t("roster.position")}</option>
                                            {positionOptions.map((pos) => (
                                                <option key={pos} value={pos}>
                                                    {pos} - {t(`positions.${pos}`)}
                                                </option>
                                            ))}
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
                                                {t("roster.makeAdmin")}
                                            </label>
                                            <label className="flex items-center gap-2 text-sm text-gray-700">
                                                <input
                                                    type="checkbox"
                                                    checked={editCoach}
                                                    onChange={(e) => setEditCoach(e.target.checked)}
                                                />
                                                {t("roster.coachDescription")}
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
                                            {loading ? t("common.saving") : t("common.save")}
                                        </button>
                                        <button
                                            onClick={() => setEditingId(null)}
                                            className="rounded-md bg-gray-200 px-3 py-1 text-sm text-gray-700"
                                        >
                                            {t("common.cancel")}
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
                                            {member.position ? `${member.position} - ${t(`positions.${member.position}`)}` : t("roster.noPosition")}
                                            {member.user_id === ownerId && (
                                                <span className="ml-2 inline-block rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800">
                                                    {t("roles.owner")}
                                                </span>
                                            )}
                                            {member.is_admin && (
                                                <span className="ml-2 inline-block rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
                                                    {t("roles.admin")}
                                                </span>
                                            )}
                                            {member.role === "coach" && (
                                                <span className="ml-2 inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                                                    {t("roles.coach")}
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
                                                {t("common.edit")}
                                            </button>
                                        )}
                                        {isOwner && member.user_id !== currentUserId && member.user_id !== ownerId && (
                                            <button
                                                onClick={() => promptTransferOwnership(member)}
                                                className="text-sm text-purple-600 hover:text-purple-800"
                                            >
                                                {t("roster.makeOwner")}
                                            </button>
                                        )}
                                        {isAdmin && member.user_id !== currentUserId && (
                                            <button
                                                onClick={() => removeFromTeam(member)}
                                                className="text-sm text-red-500 hover:text-red-700"
                                            >
                                                {t("common.remove")}
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

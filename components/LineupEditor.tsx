"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { positionLabels } from "@/lib/constants";
import AlertModal from "@/components/AlertModal";

type Member = {
    id: string;
    user_id: string;
    name: string;
    position: string | null;
    shirt_number: number | null;
};

type LineupEntry = {
    player_id: string;
    position: string;
    shirt_number: number | null;
    pos_x: number | null;
    pos_y: number | null;
};

type Assignment = {
    playerId: string;
    name: string;
    shirtNumber: number | null;
    x: number;
    y: number;
};

const FORMATIONS: Record<string, { label: string; positions: { name: string; x: number; y: number }[] }> = {
    "7v7-standard": {
        label: "7v7 Standard (3-2-1)",
        positions: [
            { name: "GK", x: 50, y: 90 },
            { name: "LB", x: 18, y: 65 },
            { name: "CB", x: 50, y: 68 },
            { name: "RB", x: 82, y: 65 },
            { name: "LM", x: 25, y: 40 },
            { name: "RM", x: 75, y: 40 },
            { name: "ST", x: 50, y: 20 },
        ],
    },
    "7v7-2-3-1": {
        label: "7v7 (2-3-1)",
        positions: [
            { name: "GK", x: 50, y: 90 },
            { name: "CB", x: 35, y: 70 },
            { name: "CB", x: 65, y: 70 },
            { name: "LM", x: 18, y: 45 },
            { name: "CM", x: 50, y: 48 },
            { name: "RM", x: 82, y: 45 },
            { name: "ST", x: 50, y: 18 },
        ],
    },
    "7v7-3-3": {
        label: "7v7 (3-3)",
        positions: [
            { name: "GK", x: 50, y: 90 },
            { name: "LB", x: 20, y: 68 },
            { name: "CB", x: 50, y: 70 },
            { name: "RB", x: 80, y: 68 },
            { name: "LM", x: 20, y: 38 },
            { name: "CM", x: 50, y: 35 },
            { name: "RM", x: 80, y: 38 },
        ],
    },
    "7v7-4-2": {
        label: "7v7 (4-2)",
        positions: [
            { name: "GK", x: 50, y: 90 },
            { name: "LB", x: 15, y: 65 },
            { name: "CB", x: 38, y: 70 },
            { name: "CB", x: 62, y: 70 },
            { name: "RB", x: 85, y: 65 },
            { name: "CM", x: 35, y: 35 },
            { name: "CM", x: 65, y: 35 },
        ],
    },
    "7v7-1-3-2": {
        label: "7v7 (1-3-2)",
        positions: [
            { name: "GK", x: 50, y: 90 },
            { name: "CB", x: 50, y: 68 },
            { name: "LM", x: 20, y: 50 },
            { name: "CM", x: 50, y: 48 },
            { name: "RM", x: 80, y: 50 },
            { name: "ST", x: 35, y: 20 },
            { name: "ST", x: 65, y: 20 },
        ],
    },
};

export default function LineupEditor({
    event,
    members,
    existingLineup,
    existingSetPieces,
    isAdmin,
}: {
    event: { id: string; title: string; type: string; date: string; location: string | null; formation: string | null; captain_id: string | null };
    members: Member[];
    existingLineup: LineupEntry[];
    existingSetPieces: { piece_type: string; player_id: string }[];
    isAdmin: boolean;
}) {
    const router = useRouter();
    const supabase = createClient();
    const pitchRef = useRef<HTMLDivElement>(null);
    const [saving, setSaving] = useState(false);
    const [formation, setFormation] = useState<string>(event.formation ?? "");
    const [captainId, setCaptainId] = useState<string>(event.captain_id ?? "");
    const [alertOpen, setAlertOpen] = useState(false);
    const [alertMsg, setAlertMsg] = useState("");

    const isLocked = new Date(event.date) <= new Date();
    const canEdit = isAdmin && !isLocked;

    useEffect(() => {
        setFormation(event.formation ?? "");
        setCaptainId(event.captain_id ?? "");
    }, [event.id]);

    const [assignments, setAssignments] = useState<Record<string, Assignment>>({});
    const [subs, setSubs] = useState<Assignment[]>([]);
    const [setPieceFoul, setSetPieceFoul] = useState<string>("");
    const [setPieceCorner, setSetPieceCorner] = useState<string>("");
    const [setPiecePenalty, setSetPiecePenalty] = useState<string>("");

    useEffect(() => {
        const map: Record<string, string> = {};
        for (const sp of existingSetPieces) {
            map[sp.piece_type] = sp.player_id;
        }
        setSetPieceFoul(map["foul"] ?? "");
        setSetPieceCorner(map["corner"] ?? "");
        setSetPiecePenalty(map["penalty"] ?? "");
    }, [existingSetPieces]);

    useEffect(() => {
        const newAssignments: Record<string, Assignment> = {};
        const newSubs: Assignment[] = [];
        for (const entry of existingLineup) {
            const member = members.find((m) => m.id === entry.player_id);
            if (!member) continue;
            const a: Assignment = {
                playerId: member.id,
                name: member.name,
                shirtNumber: entry.shirt_number ?? member.shirt_number,
                x: entry.pos_x ?? 50,
                y: entry.pos_y ?? 50,
            };
            if (entry.position === "SUB") {
                newSubs.push(a);
            } else {
                newAssignments[entry.position] = a;
            }
        }
        // Fill in empty formation slots so ghost circles appear
        const f = FORMATIONS[event.formation ?? ""];
        if (f) {
            f.positions.forEach((pos, i) => {
                const slotKey = pos.name + (i > 0 ? i : "");
                if (!newAssignments[slotKey]) {
                    newAssignments[slotKey] = {
                        playerId: "",
                        name: "",
                        shirtNumber: null,
                        x: pos.x,
                        y: pos.y,
                    };
                }
            });
        }
        setAssignments(newAssignments);
        setSubs(newSubs);
    }, [existingLineup, members, event.formation]);

    const allAssignedIds = new Set([
        ...Object.values(assignments).map((a) => a.playerId),
        ...subs.map((a) => a.playerId),
    ]);
    const pool = members.filter((m) => !allAssignedIds.has(m.id));

    const [draggingPlayer, setDraggingPlayer] = useState<string | null>(null);
    const [draggingSlot, setDraggingSlot] = useState<string | null>(null);
    const [dragTarget, setDragTarget] = useState<"pitch" | "subs" | null>(null);
    const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null);
    const subsRef = useRef<HTMLDivElement>(null);

    function getPitchCoords(clientX: number, clientY: number) {
        if (!pitchRef.current) return { x: 50, y: 50 };
        const rect = pitchRef.current.getBoundingClientRect();
        const x = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
        const y = Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100));
        return { x, y };
    }

    function getDragTarget(clientX: number, clientY: number): "pitch" | "subs" | null {
        let target: "pitch" | "subs" | null = null;
        if (pitchRef.current) {
            const r = pitchRef.current.getBoundingClientRect();
            if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
                target = "pitch";
            }
        }
        if (!target && subsRef.current) {
            const r = subsRef.current.getBoundingClientRect();
            if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
                target = "subs";
            }
        }
        return target;
    }

    function startDragPlayer(e: React.MouseEvent | React.TouchEvent, playerId: string) {
        e.preventDefault();
        const pos = "touches" in e ? e.touches[0] : e;
        setDraggingPlayer(playerId);
        setDragTarget(null);
        setGhostPos({ x: pos.clientX, y: pos.clientY });
    }

    function startDragSlot(e: React.MouseEvent | React.TouchEvent, slot: string) {
        e.preventDefault();
        e.stopPropagation();
        const pos = "touches" in e ? e.touches[0] : e;
        setDraggingSlot(slot);
        setDragTarget(null);
        setGhostPos({ x: pos.clientX, y: pos.clientY });
    }

    function handleMouseMove(e: React.MouseEvent) {
        if (!draggingPlayer && !draggingSlot) return;
        setGhostPos({ x: e.clientX, y: e.clientY });
        setDragTarget(getDragTarget(e.clientX, e.clientY));
    }

    function handleTouchMove(e: React.TouchEvent) {
        if (!draggingPlayer && !draggingSlot) return;
        e.preventDefault();
        const touch = e.touches[0];
        setGhostPos({ x: touch.clientX, y: touch.clientY });
        setDragTarget(getDragTarget(touch.clientX, touch.clientY));
    }

    function findNearestEmptySlot(x: number, y: number, currentAssignments: Record<string, Assignment>): string | null {
        const f = FORMATIONS[formation];
        if (!f) return null;
        let bestKey: string | null = null;
        let bestDist = Infinity;
        f.positions.forEach((pos, i) => {
            const slotKey = pos.name + (i > 0 ? i : "");
            if (currentAssignments[slotKey] && currentAssignments[slotKey].playerId) return;
            const dist = Math.hypot(pos.x - x, pos.y - y);
            if (dist < bestDist) {
                bestDist = dist;
                bestKey = slotKey;
            }
        });
        return bestKey;
    }

    function handleMouseUp(e: React.MouseEvent | React.TouchEvent) {
        if (!draggingPlayer && !draggingSlot) return;
        const pos = "changedTouches" in e ? e.changedTouches[0] : e;
        const target = getDragTarget(pos.clientX, pos.clientY);

        if (draggingPlayer) {
            const member = members.find((m) => m.id === draggingPlayer);
            if (member && target === "pitch") {
                const { x, y } = getPitchCoords(pos.clientX, pos.clientY);
                setAssignments((prev) => {
                    const next = { ...prev };
                    for (const [key, val] of Object.entries(next)) {
                        if (val.playerId === draggingPlayer) delete next[key];
                    }
                    if (formation) {
                        const slotKey = findNearestEmptySlot(x, y, next);
                        if (slotKey) {
                            const f = FORMATIONS[formation];
                            const slotPos = f.positions.find((p, i) => p.name + (i > 0 ? i : "") === slotKey)!;
                            next[slotKey] = {
                                playerId: member.id,
                                name: member.name,
                                shirtNumber: member.shirt_number,
                                x: slotPos.x,
                                y: slotPos.y,
                            };
                            return next;
                        }
                        return next;
                    }
                    const slotKey = `POS${Object.keys(next).length}`;
                    next[slotKey] = {
                        playerId: member.id,
                        name: member.name,
                        shirtNumber: member.shirt_number,
                        x,
                        y,
                    };
                    return next;
                });
                setSubs((prev) => prev.filter((a) => a.playerId !== draggingPlayer));
            } else if (member && target === "subs") {
                setAssignments((prev) => {
                    const next = { ...prev };
                    for (const [key, val] of Object.entries(next)) {
                        if (val.playerId === draggingPlayer) delete next[key];
                    }
                    return next;
                });
                setSubs((prev) => {
                    if (prev.some((a) => a.playerId === draggingPlayer)) return prev;
                    return [...prev, {
                        playerId: member.id,
                        name: member.name,
                        shirtNumber: member.shirt_number,
                        x: 50,
                        y: 50,
                    }];
                });
            }
            setDraggingPlayer(null);
        }

        if (draggingSlot) {
            if (!target) {
                setDraggingSlot(null);
            } else if (target === "subs") {
                const moving = assignments[draggingSlot];
                if (moving && moving.playerId) {
                    setAssignments((prev) => {
                        const next = { ...prev };
                        if (formation) {
                            next[draggingSlot] = { ...next[draggingSlot], playerId: "", name: "", shirtNumber: null };
                        } else {
                            delete next[draggingSlot];
                        }
                        return next;
                    });
                    setSubs((prev) => {
                        if (prev.some((a) => a.playerId === moving.playerId)) return prev;
                        return [...prev, {
                            playerId: moving.playerId,
                            name: moving.name,
                            shirtNumber: moving.shirtNumber,
                            x: 50,
                            y: 50,
                        }];
                    });
                }
                setDraggingSlot(null);
            } else {
                const { x, y } = getPitchCoords(pos.clientX, pos.clientY);
                setAssignments((prev) => {
                    const moving = prev[draggingSlot];
                    if (!moving) return prev;
                    if (formation) {
                        let bestKey: string | null = null;
                        let bestDist = Infinity;
                        const f = FORMATIONS[formation];
                        f.positions.forEach((pos, i) => {
                            const slotKey = pos.name + (i > 0 ? i : "");
                            if (slotKey === draggingSlot) return;
                            const dist = Math.hypot(pos.x - x, pos.y - y);
                            if (dist < bestDist) {
                                bestDist = dist;
                                bestKey = slotKey;
                            }
                        });
                        if (bestKey) {
                            const next = { ...prev };
                            const targetSlot = next[bestKey];
                            if (targetSlot && targetSlot.playerId) {
                                // Swap: move target player to the dragged-from slot
                                next[draggingSlot] = { ...targetSlot, x: moving.x, y: moving.y };
                                const targetPos = f.positions.find((p, i) => p.name + (i > 0 ? i : "") === bestKey)!;
                                next[bestKey] = { ...moving, x: targetPos.x, y: targetPos.y };
                            } else {
                                // Empty slot: move there
                                const targetPos = f.positions.find((p, i) => p.name + (i > 0 ? i : "") === bestKey)!;
                                next[draggingSlot] = { ...moving, playerId: "", name: "", shirtNumber: null };
                                next[bestKey] = { ...moving, x: targetPos.x, y: targetPos.y };
                            }
                            return next;
                        }
                    }
                    return { ...prev, [draggingSlot]: { ...moving, x, y } };
                });
                setDraggingSlot(null);
            }
        }

        setDragTarget(null);
        setGhostPos(null);
    }

    function handleRemove(slot: string) {
        if (formation) {
            setAssignments((prev) => ({
                ...prev,
                [slot]: { ...prev[slot], playerId: "", name: "", shirtNumber: null },
            }));
        } else {
            setAssignments((prev) => {
                const next = { ...prev };
                delete next[slot];
                return next;
            });
        }
    }

    function handleRemoveSub(playerId: string) {
        setSubs((prev) => prev.filter((a) => a.playerId !== playerId));
    }

    function applyFormation(key: string) {
        setFormation(key);
        if (!key) {
            setAssignments((prev) => {
                const next: Record<string, Assignment> = {};
                for (const [k, v] of Object.entries(prev)) {
                    if (v.playerId) next[k] = v;
                }
                return next;
            });
            return;
        }
        const f = FORMATIONS[key];
        if (!f) return;

        const currentPlayers = Object.values(assignments).filter(a => a.playerId);
        const slotKeys = f.positions.map((pos, i) => ({
            key: pos.name + (i > 0 ? i : ""),
            pos,
        }));

        const newAssignments: Record<string, Assignment> = {};
        if (currentPlayers.length === 0) {
            slotKeys.forEach(({ key, pos }) => {
                newAssignments[key] = { playerId: "", name: "", shirtNumber: null, x: pos.x, y: pos.y };
            });
            setAssignments(newAssignments);
            return;
        }

        const sortedPlayers = [...currentPlayers].sort((a, b) => a.x + a.y - (b.x + b.y));
        const sortedSlots = [...slotKeys].sort((a, b) => a.pos.x + a.pos.y - (b.pos.x + b.pos.y));

        const usedSlots = new Set<number>();
        sortedPlayers.forEach(player => {
            let bestIdx = -1;
            let bestDist = Infinity;
            sortedSlots.forEach((slot, idx) => {
                if (usedSlots.has(idx)) return;
                const dist = Math.hypot(player.x - slot.pos.x, player.y - slot.pos.y);
                if (dist < bestDist) {
                    bestDist = dist;
                    bestIdx = idx;
                }
            });
            if (bestIdx >= 0) {
                usedSlots.add(bestIdx);
                const slot = sortedSlots[bestIdx];
                newAssignments[slot.key] = { ...player, x: slot.pos.x, y: slot.pos.y };
            }
        });

        sortedSlots.forEach((slot, idx) => {
            if (!usedSlots.has(idx)) {
                newAssignments[slot.key] = { playerId: "", name: "", shirtNumber: null, x: slot.pos.x, y: slot.pos.y };
            }
        });

        setAssignments(newAssignments);
    }

    async function save() {
        setSaving(true);
        const { error: deleteError } = await supabase.from("lineups").delete().eq("event_id", event.id);
        if (deleteError) {
            console.error("Lineup delete error:", deleteError);
            setAlertMsg("Failed to clear existing lineup: " + deleteError.message);
            setAlertOpen(true);
            setSaving(false);
            return;
        }
        const rows = [
            ...Object.entries(assignments)
                .filter(([, a]) => a.playerId)
                .map(([slot, a]) => ({
                    event_id: event.id,
                    player_id: a.playerId,
                    position: slot.replace(/\d+$/, ""),
                    shirt_number: a.shirtNumber,
                    pos_x: a.x,
                    pos_y: a.y,
                })),
            ...subs.map((a) => ({
                event_id: event.id,
                player_id: a.playerId,
                position: "SUB",
                shirt_number: a.shirtNumber,
                pos_x: null as number | null,
                pos_y: null as number | null,
            })),
        ];
        if (rows.length > 0) {
            const { error } = await supabase.from("lineups").insert(rows);
            if (error) {
                console.error("Lineup save error:", error);
                setAlertMsg("Failed to save lineup: " + error.message);
                setAlertOpen(true);
                setSaving(false);
                return;
            }
        }
        await supabase.from("events").update({ formation: formation || null, captain_id: captainId || null }).eq("id", event.id);

        const { error: spDeleteError } = await supabase.from("set_pieces").delete().eq("event_id", event.id);
        const spRows: { event_id: string; piece_type: string; player_id: string }[] = [];
        if (setPieceFoul) spRows.push({ event_id: event.id, piece_type: "foul", player_id: setPieceFoul });
        if (setPieceCorner) spRows.push({ event_id: event.id, piece_type: "corner", player_id: setPieceCorner });
        if (setPiecePenalty) spRows.push({ event_id: event.id, piece_type: "penalty", player_id: setPiecePenalty });
        if (spRows.length > 0 && !spDeleteError) {
            await supabase.from("set_pieces").insert(spRows);
        }

        setSaving(false);
        router.refresh();
    }

    const isDragging = draggingPlayer !== null || draggingSlot !== null;
    const ghostName = draggingPlayer
        ? members.find((m) => m.id === draggingPlayer)?.name ?? ""
        : draggingSlot
            ? assignments[draggingSlot]?.name ?? ""
            : "";

    return (
        <div
            className="max-w-5xl mx-auto relative"
            onMouseMove={canEdit ? handleMouseMove : undefined}
            onMouseUp={canEdit ? handleMouseUp : undefined}
            onMouseLeave={canEdit ? () => { if (isDragging) { setDraggingPlayer(null); setDraggingSlot(null); setDragTarget(null); setGhostPos(null); } } : undefined}
            onTouchMove={canEdit ? handleTouchMove : undefined}
            onTouchEnd={canEdit ? handleMouseUp : undefined}
            onTouchCancel={canEdit ? () => { if (isDragging) { setDraggingPlayer(null); setDraggingSlot(null); setDragTarget(null); setGhostPos(null); } } : undefined}
        >
            <AlertModal open={alertOpen} title="Error" message={alertMsg} onClose={() => setAlertOpen(false)} />
            {/* Ghost element while dragging */}
            {isDragging && ghostPos && (
                <div
                    className="fixed pointer-events-none z-50 w-12 h-12 rounded-full bg-white text-black border-2 border-blue-500 flex items-center justify-center text-[10px] font-bold shadow-lg -translate-x-1/2 -translate-y-1/2"
                    style={{ left: ghostPos.x, top: ghostPos.y }}
                >
                    {ghostName.split(" ")[0]}
                </div>
            )}

            <div className="mb-6">
                <h1 className="text-2xl font-bold text-black">{event.title} — Lineup</h1>
                <p className="text-sm text-gray-500">
                    {event.type === "match" ? "⚽ Match" : "🏃 Training"} ·{" "}
                    {new Date(event.date).toLocaleDateString("en-GB", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                    })}
                </p>
            </div>

            <div className="flex flex-col md:flex-row gap-6">
                {/* Left: pitch + subs */}
                <div className="flex-1">
                    {isAdmin && (
                        <div className="mb-3">
                            {isLocked && (
                                <p className="text-xs text-red-500 mb-1">Lineup is locked — event has started</p>
                            )}
                            <label className="text-sm font-medium text-gray-700 mr-2">Formation:</label>
                            <select
                                value={formation}
                                onChange={(e) => applyFormation(e.target.value)}
                                disabled={isLocked}
                                className="rounded-md border border-gray-300 px-2 py-1 text-sm text-black disabled:opacity-50"
                            >
                                <option value="">Select formation</option>
                                {Object.entries(FORMATIONS).map(([key, f]) => (
                                    <option key={key} value={key}>{f.label}</option>
                                ))}
                            </select>
                            <label className="text-sm font-medium text-gray-700 mr-2 ml-4">Captain:</label>
                            <select
                                value={captainId}
                                onChange={(e) => setCaptainId(e.target.value)}
                                disabled={isLocked}
                                className="rounded-md border border-gray-300 px-2 py-1 text-sm text-black disabled:opacity-50"
                            >
                                <option value="">None</option>
                                {members.map((m) => (
                                    <option key={m.id} value={m.id}>
                                        {m.name}{m.shirt_number ? ` #${m.shirt_number}` : ""}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                    {isAdmin && captainId && !isLocked && (
                        <p className="text-xs text-gray-400 mb-1">Captain will be shown with a &quot;C&quot; badge on the pitch</p>
                    )}
                    {!isAdmin && captainId && (
                        <p className="text-xs text-gray-400 mb-1">Captain: <span className="font-medium text-black">{members.find(m => m.id === captainId)?.name ?? "Unknown"}</span></p>
                    )}

                    {/* Pitch */}
                    <div
                        ref={pitchRef}
                        className={`relative w-full rounded-lg overflow-hidden border select-none ${dragTarget === "pitch" ? "border-blue-500 border-2" : "border-green-700"}`}
                        style={{ paddingBottom: "130%", backgroundColor: "#15803d" }}
                    >
                        {/* Field markings */}
                        <div className="absolute top-1/2 left-0 right-0 h-px bg-white/30" />
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full border border-white/30" />
                        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/2 h-[15%] border-t border-l border-r border-white/30" />
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-[15%] border-b border-l border-r border-white/30" />

                        {/* Players on pitch */}
                        {Object.entries(assignments).map(([slot, a]) => {
                            if (!a.playerId) {
                                return (
                                    <div
                                        key={slot}
                                        className="absolute -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-full border-2 border-dashed border-white/40 flex items-center justify-center"
                                        style={{ left: `${a.x}%`, top: `${a.y}%` }}
                                    >
                                        <span className="text-[10px] text-white/60 font-bold">{slot.replace(/\d+$/, "")}</span>
                                    </div>
                                );
                            }
                            return (
                                <div
                                    key={slot}
                                    onMouseDown={canEdit ? (e) => startDragSlot(e, slot) : undefined}
                                    onTouchStart={canEdit ? (e) => startDragSlot(e, slot) : undefined}
                                    className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
                                    style={{ left: `${a.x}%`, top: `${a.y}%` }}
                                >
                                    <div className={`w-12 h-12 rounded-full bg-white text-black border-2 ${a.playerId === captainId ? "border-yellow-500" : "border-white"} flex flex-col items-center justify-center text-[10px] font-bold ${canEdit ? "cursor-grab active:cursor-grabbing" : ""} ${draggingSlot === slot ? "opacity-40" : ""}`}
                                        style={{ touchAction: "none" }}
                                    >
                                        {a.playerId === captainId && (
                                            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-yellow-400 text-black text-[8px] font-bold flex items-center justify-center border border-yellow-600">C</span>
                                        )}
                                        <span className="leading-tight">{a.name.split(" ")[0]}</span>
                                        {a.shirtNumber && (
                                            <span className="text-[9px] text-gray-500">#{a.shirtNumber}</span>
                                        )}
                                    </div>
                                    {canEdit && (
                                        <button
                                            onMouseDown={(e) => e.stopPropagation()}
                                            onTouchStart={(e) => e.stopPropagation()}
                                            onClick={() => handleRemove(slot)}
                                            className="mt-0.5 text-[10px] text-white/60 hover:text-white"
                                        >
                                            remove
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Player pool + subs */}
                <div className="w-full md:w-64">
                    <h2 className="font-bold text-black mb-3">
                        Players ({pool.length} unassigned)
                    </h2>
                    <div className="space-y-2">
                        {pool.length === 0 ? (
                            <p className="text-sm text-gray-400">All players assigned</p>
                        ) : (
                            pool.map((player) => (
                                <div
                                    key={player.id}
                                    onMouseDown={canEdit ? (e) => startDragPlayer(e, player.id) : undefined}
                                    onTouchStart={canEdit ? (e) => startDragPlayer(e, player.id) : undefined}
                                    className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm ${
                                        canEdit
                                            ? "cursor-grab border-gray-200 bg-white hover:border-gray-400 active:cursor-grabbing"
                                            : "border-gray-100 bg-gray-50"
                                    } ${draggingPlayer === player.id ? "opacity-40" : ""}`}
                                    style={{ touchAction: "none" }}
                                >
                                    <span className="text-black font-medium">{player.name}</span>
                                    <div className="flex items-center gap-2 text-xs text-gray-400">
                                        {player.position && <span>{player.position} - {positionLabels[player.position] ?? player.position}</span>}
                                        {player.shirt_number && <span>#{player.shirt_number}</span>}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {isAdmin && (
                        <>
                            <div
                                ref={subsRef}
                                className={`mt-4 rounded-lg border-2 border-dashed p-4 ${dragTarget === "subs" ? "border-blue-500 bg-blue-50" : "border-gray-300 bg-gray-50"}`}
                            >
                                <h3 className="text-sm font-bold text-black mb-2">
                                    Substitutes ({subs.length})
                                </h3>
                                {subs.length === 0 ? (
                                    <p className="text-xs text-gray-400">Drag players here</p>
                                ) : (
                                    <div className="space-y-2">
                                        {subs.map((sub) => (
                                            <div
                                                key={sub.playerId}
                                                onMouseDown={canEdit ? (e) => startDragPlayer(e, sub.playerId) : undefined}
                                                onTouchStart={canEdit ? (e) => startDragPlayer(e, sub.playerId) : undefined}
                                                className={`flex items-center justify-between rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm ${canEdit ? "cursor-grab active:cursor-grabbing" : ""} ${draggingPlayer === sub.playerId ? "opacity-40" : ""}`}
                                                style={{ touchAction: "none" }}
                                            >
                                                <span className="text-black font-medium">{sub.name}{sub.playerId === captainId && <span className="ml-1 inline-block w-4 h-4 rounded-full bg-yellow-400 text-black text-[8px] font-bold text-center leading-4 border border-yellow-600">C</span>}</span>
                                                <div className="flex items-center gap-2">
                                                    {sub.shirtNumber && (
                                                        <span className="text-gray-400 text-xs">#{sub.shirtNumber}</span>
                                                    )}
                                                    {canEdit && (
                                                    <button
                                                        onClick={() => handleRemoveSub(sub.playerId)}
                                                        className="text-gray-400 hover:text-red-500 text-xs"
                                                    >
                                                        ✕
                                                    </button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
                                <h3 className="text-sm font-bold text-black mb-3">Set Pieces</h3>
                                <div className="space-y-3">
                                    <div>
                                        <label className="text-xs font-medium text-gray-500 mb-1 block">Fouls (Free Kicks)</label>
                                        <select
                                            value={setPieceFoul}
                                            onChange={(e) => setSetPieceFoul(e.target.value)}
                                            disabled={isLocked}
                                            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-black disabled:opacity-50"
                                        >
                                            <option value="">None</option>
                                            {members.map((m) => (
                                                <option key={m.id} value={m.id}>
                                                    {m.name}{m.shirt_number ? ` #${m.shirt_number}` : ""}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-gray-500 mb-1 block">Corners</label>
                                        <select
                                            value={setPieceCorner}
                                            onChange={(e) => setSetPieceCorner(e.target.value)}
                                            disabled={isLocked}
                                            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-black disabled:opacity-50"
                                        >
                                            <option value="">None</option>
                                            {members.map((m) => (
                                                <option key={m.id} value={m.id}>
                                                    {m.name}{m.shirt_number ? ` #${m.shirt_number}` : ""}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-gray-500 mb-1 block">Penalties</label>
                                        <select
                                            value={setPiecePenalty}
                                            onChange={(e) => setSetPiecePenalty(e.target.value)}
                                            disabled={isLocked}
                                            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-black disabled:opacity-50"
                                        >
                                            <option value="">None</option>
                                            {members.map((m) => (
                                                <option key={m.id} value={m.id}>
                                                    {m.name}{m.shirt_number ? ` #${m.shirt_number}` : ""}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={save}
                                disabled={saving || isLocked}
                                className="mt-4 w-full rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
                                style={{ backgroundColor: "var(--primary)", color: "var(--primary-text)" }}
                            >
                                {saving ? "Saving..." : "Save Lineup"}
                            </button>
                        </>
                    )}
                    {!isAdmin && (setPieceFoul || setPieceCorner || setPiecePenalty) && (
                        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
                            <h3 className="text-sm font-bold text-black mb-2">Set Pieces</h3>
                            <div className="space-y-1 text-sm text-gray-600">
                                {setPieceFoul && <p>Fouls: <span className="font-medium text-black">{members.find(m => m.id === setPieceFoul)?.name ?? "Unknown"}</span></p>}
                                {setPieceCorner && <p>Corners: <span className="font-medium text-black">{members.find(m => m.id === setPieceCorner)?.name ?? "Unknown"}</span></p>}
                                {setPiecePenalty && <p>Penalties: <span className="font-medium text-black">{members.find(m => m.id === setPiecePenalty)?.name ?? "Unknown"}</span></p>}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

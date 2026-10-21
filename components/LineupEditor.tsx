"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLocaleContext } from "@/lib/i18n-context";
import AlertModal from "@/components/AlertModal";
import ConfirmModal from "@/components/ConfirmModal";
import EventDate from "@/components/EventDate";

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

type DrawingStroke = {
    color: string;
    // Stroke width as a fraction of the pitch width, so it scales with the pitch size.
    width: number;
    // When true the stroke erases previously drawn strokes instead of painting.
    erase?: boolean;
    // Normalised points (0..1) relative to the pitch: [[x, y], ...].
    points: number[][];
};

const FORMATIONS: Record<string, { labelKey: string; positions: { name: string; x: number; y: number }[] }> = {
    "7v7-standard": {
        labelKey: "formations.7v7-standard",
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
        labelKey: "formations.7v7-2-3-1",
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
        labelKey: "formations.7v7-3-3",
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
        labelKey: "formations.7v7-4-2",
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
        labelKey: "formations.7v7-1-3-2",
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

// Basic pen palette. Yellow/white/black all read well on the green pitch.
const PEN_COLORS = ["#ffffff", "#facc15", "#ef4444", "#3b82f6", "#000000"];
// Stroke width as a fraction of the pitch width, so drawings scale on every screen.
const PEN_WIDTH = 0.008;
const ERASER_WIDTH = 0.035;

function clamp01(n: number) {
    return Math.max(0, Math.min(1, n));
}

/**
 * The key a formation position is stored under: "GK", "CB", "CB3", "CB6", ...
 *
 * The index is appended so that repeated positions inside a formation (two
 * centre backs, two strikers, ...) get distinct keys. The key is what gets
 * written to `lineups.position`, which is why it must survive a save/load
 * round trip untouched.
 */
function slotKeyFor(positions: { name: string }[], index: number): string {
    return positions[index].name + (index > 0 ? index : "");
}

/** The base position name of a slot key: "CB3" -> "CB". */
function slotBaseName(slot: string): string {
    return slot.replace(/\d+$/, "");
}

/**
 * Resolve the slot key a stored `position` belongs to.
 *
 * Rows saved by the current code store the full slot key ("CB3"). Rows saved
 * before that fix stored only the base position ("CB"), so several players
 * collapsed onto the same key and all but one were dropped on the next save.
 * Those legacy rows are matched to the first free slot with that base name,
 * in formation order.
 */
function resolveSlotKey(
    stored: string,
    positions: { name: string }[],
    taken: Set<string>
): string | null {
    for (let i = 0; i < positions.length; i++) {
        const key = slotKeyFor(positions, i);
        if (key === stored && !taken.has(key)) return key;
    }
    for (let i = 0; i < positions.length; i++) {
        const key = slotKeyFor(positions, i);
        if (positions[i].name === stored && !taken.has(key)) return key;
    }
    return null;
}

/** The first free "POSn" key, used when players are placed freely. */
function nextFreePosKey(taken: Set<string>): string {
    let n = 0;
    while (taken.has(`POS${n}`)) n++;
    return `POS${n}`;
}

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
    const { t } = useLocaleContext();
    const [saving, setSaving] = useState(false);
    const [formation, setFormation] = useState<string>(event.formation ?? "");
    const [captainId, setCaptainId] = useState<string>(event.captain_id ?? "");
    const [alertOpen, setAlertOpen] = useState(false);
    const [alertMsg, setAlertMsg] = useState("");

    const isLocked = new Date(event.date) <= new Date();
    const canEdit = isAdmin && !isLocked;

    // The event's own formation and captain are the source of truth, but only
    // until the admin changes them locally. Reset them when a different
    // event is loaded. This runs during render instead of in an effect so
    // there is no extra render pass and no frame with stale values.
    const [loadedEventId, setLoadedEventId] = useState(event.id);
    if (loadedEventId !== event.id) {
        setLoadedEventId(event.id);
        setFormation(event.formation ?? "");
        setCaptainId(event.captain_id ?? "");
    }

    const [assignments, setAssignments] = useState<Record<string, Assignment>>({});
    const [subs, setSubs] = useState<Assignment[]>([]);
    const [setPieceFoul, setSetPieceFoul] = useState<string>("");
    const [setPieceCorner, setSetPieceCorner] = useState<string>("");
    const [setPiecePenalty, setSetPiecePenalty] = useState<string>("");

    // The persisted lineup and the roster are copied into local state so the
    // admin can edit them. The key is derived from the *content* of the
    // props, so a background refetch that returns the same data no longer
    // throws away the edits in progress.
    const lineupSourceKey =
        (event.formation ?? "") +
        "#" +
        existingLineup.map((l) => `${l.player_id}:${l.position}`).join("|") +
        "#" +
        members.map((m) => `${m.id}:${m.name}:${m.shirt_number ?? ""}`).join("|");

    const [loadedLineupKey, setLoadedLineupKey] = useState<string | null>(null);
    if (loadedLineupKey !== lineupSourceKey) {
        setLoadedLineupKey(lineupSourceKey);
        const newAssignments: Record<string, Assignment> = {};
        const newSubs: Assignment[] = [];
        const positions = FORMATIONS[event.formation ?? ""]?.positions ?? [];
        const taken = new Set<string>();

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
                continue;
            }
            if (positions.length > 0) {
                const key = resolveSlotKey(entry.position, positions, taken);
                // No free slot left for this player. Skip them instead of
                // overwriting somebody who is already in that slot.
                if (!key) continue;
                taken.add(key);
                newAssignments[key] = a;
            } else {
                const key = nextFreePosKey(taken);
                taken.add(key);
                newAssignments[key] = a;
            }
        }

        // Show every position of the formation, including the empty ones.
        positions.forEach((pos, i) => {
            const key = slotKeyFor(positions, i);
            if (!newAssignments[key]) {
                newAssignments[key] = {
                    playerId: "",
                    name: "",
                    shirtNumber: null,
                    x: pos.x,
                    y: pos.y,
                };
            }
        });

        setAssignments(newAssignments);
        setSubs(newSubs);
    }

    const setPiecesKey = existingSetPieces.map((sp) => `${sp.piece_type}:${sp.player_id}`).join("|");
    const [loadedSetPiecesKey, setLoadedSetPiecesKey] = useState<string | null>(null);
    if (loadedSetPiecesKey !== setPiecesKey) {
        setLoadedSetPiecesKey(setPiecesKey);
        const map: Record<string, string> = {};
        for (const sp of existingSetPieces) {
            map[sp.piece_type] = sp.player_id;
        }
        setSetPieceFoul(map["foul"] ?? "");
        setSetPieceCorner(map["corner"] ?? "");
        setSetPiecePenalty(map["penalty"] ?? "");
    }

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

    // Where the current drag started, and whether the pointer has actually
    // moved. A press that never moves is a click, and clicks are handled by
    // the keyboard-accessible buttons instead of the drag logic.
    const dragOriginRef = useRef<{ x: number; y: number } | null>(null);
    const dragMovedRef = useRef(false);
    // Set while a drag has just finished, so that the click the browser
    // fires straight afterwards is not treated as a separate action. It is
    // cleared again by the click handler on the container.
    const suppressClickRef = useRef(false);

    // Player picked up with the keyboard (or clicked) and waiting to be put
    // somewhere on the pitch.
    const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
    const [announcement, setAnnouncement] = useState("");

    const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

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
        dragOriginRef.current = { x: pos.clientX, y: pos.clientY };
        dragMovedRef.current = false;
    }

    function startDragSlot(e: React.MouseEvent | React.TouchEvent, slot: string) {
        e.preventDefault();
        e.stopPropagation();
        const pos = "touches" in e ? e.touches[0] : e;
        setDraggingSlot(slot);
        setDragTarget(null);
        setGhostPos({ x: pos.clientX, y: pos.clientY });
        dragOriginRef.current = { x: pos.clientX, y: pos.clientY };
        dragMovedRef.current = false;
    }

    /** Record whether the pointer has travelled far enough to count as a drag. */
    function trackDragMovement(clientX: number, clientY: number) {
        const origin = dragOriginRef.current;
        if (!origin || dragMovedRef.current) return;
        if (Math.hypot(clientX - origin.x, clientY - origin.y) > 5) {
            dragMovedRef.current = true;
        }
    }

    function handleMouseMove(e: React.MouseEvent) {
        if (!draggingPlayer && !draggingSlot) return;
        trackDragMovement(e.clientX, e.clientY);
        setGhostPos({ x: e.clientX, y: e.clientY });
        setDragTarget(getDragTarget(e.clientX, e.clientY));
    }

    function handleTouchMove(e: React.TouchEvent) {
        if (!draggingPlayer && !draggingSlot) return;
        e.preventDefault();
        const touch = e.touches[0];
        trackDragMovement(touch.clientX, touch.clientY);
        setGhostPos({ x: touch.clientX, y: touch.clientY });
        setDragTarget(getDragTarget(touch.clientX, touch.clientY));
    }

    function findNearestEmptySlot(x: number, y: number, currentAssignments: Record<string, Assignment>): string | null {
        const f = FORMATIONS[formation];
        if (!f) return null;
        let bestKey: string | null = null;
        let bestDist = Infinity;
        f.positions.forEach((pos, i) => {
            const slotKey = slotKeyFor(f.positions, i);
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

        // A press that never moved is a click, not a drag. Let the click
        // handlers deal with it so the same actions are reachable without a
        // mouse.
        const wasDrag = dragMovedRef.current;
        dragMovedRef.current = false;
        dragOriginRef.current = null;
        if (!wasDrag) {
            setDraggingPlayer(null);
            setDraggingSlot(null);
            setDragTarget(null);
            setGhostPos(null);
            return;
        }
        suppressClickRef.current = true;

        const target = getDragTarget(pos.clientX, pos.clientY);
        if (draggingPlayer) {
            const member = members.find((m) => m.id === draggingPlayer);
            if (member && target === "pitch") {
                const playersOnPitch = Object.values(assignments).filter((a) => a.playerId).length;
                if (playersOnPitch >= 7) {
                    setDraggingPlayer(null);
                    setDragTarget(null);
                    setGhostPos(null);
                    return;
                }
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
                            const slotPos = f.positions.find((p, i) => slotKeyFor(f.positions, i) === slotKey)!;
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
                    // The key has to be the first free "POSn" slot. Deriving it
                    // from the number of entries produced a key that already
                    // existed whenever a player had been removed before.
                    const taken = new Set(Object.keys(next));
                    const slotKey = nextFreePosKey(taken);
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
                            const slotKey = slotKeyFor(f.positions, i);
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
                                next[draggingSlot] = { ...targetSlot, x: moving.x, y: moving.y };
                                const targetPos = f.positions.find((p, i) => slotKeyFor(f.positions, i) === bestKey)!;
                                next[bestKey] = { ...moving, x: targetPos.x, y: targetPos.y };
                            } else {
                                const targetPos = f.positions.find((p, i) => slotKeyFor(f.positions, i) === bestKey)!;
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
        setSelectedPlayerId((prev) => (prev === playerId ? null : prev));
    }

    /** The on-pitch coordinates of a slot, if it belongs to the formation. */
    function slotPosition(slot: string): { x: number; y: number } | null {
        const f = FORMATIONS[formation];
        if (!f) return null;
        for (let i = 0; i < f.positions.length; i++) {
            if (slotKeyFor(f.positions, i) === slot) return f.positions[i];
        }
        return null;
    }

    /** The human readable name of the position a slot stands for. */
    function slotLabel(slot: string): string {
        const base = slotBaseName(slot);
        const name = t(`positions.${base}`);
        return name.startsWith("positions.") ? base : name;
    }

    /**
     * Put the selected player into a slot, or pick up the player that is
     * already there. This is the click and keyboard equivalent of dragging a
     * player onto the pitch.
     */
    function placePlayerInSlot(slot: string) {
        if (!canEdit) return;
        // Ignore the click the browser fires right after a drag ended.
        if (suppressClickRef.current) return;

        const playerId = selectedPlayerId;
        if (!playerId) {
            // Nothing selected: pick up the player in this slot so it can be
            // moved somewhere else.
            const occupant = assignments[slot];
            if (occupant?.playerId) {
                setSelectedPlayerId(occupant.playerId);
                setAnnouncement(t("lineup.selectedPlayer", { name: occupant.name }));
            }
            return;
        }

        const member = memberById.get(playerId);
        if (!member) return;

        const displaced = assignments[slot]?.playerId;
        const nextAssignments: Record<string, Assignment> = { ...assignments };
        // Take the player out of the slot they were in.
        for (const [key, val] of Object.entries(nextAssignments)) {
            if (val.playerId === playerId) delete nextAssignments[key];
        }
        const pos = slotPosition(slot);
        nextAssignments[slot] = {
            playerId: member.id,
            name: member.name,
            shirtNumber: member.shirt_number,
            x: pos?.x ?? assignments[slot]?.x ?? 50,
            y: pos?.y ?? assignments[slot]?.y ?? 50,
        };

        setAssignments(nextAssignments);
        // The player comes off the bench, and whoever was in the slot goes
        // back to the pool of unassigned players.
        setSubs((prev) => prev.filter((a) => a.playerId !== playerId && a.playerId !== displaced));
        setSelectedPlayerId(null);
        setAnnouncement(
            t("lineup.placedPlayer", { name: member.name, position: slotLabel(slot) })
        );
    }

    /** Move the selected player to the bench. */
    function placeSelectedAsSub() {
        if (!canEdit || !selectedPlayerId) return;
        const member = memberById.get(selectedPlayerId);
        if (!member) return;

        const nextAssignments: Record<string, Assignment> = { ...assignments };
        for (const [key, val] of Object.entries(nextAssignments)) {
            if (val.playerId === member.id) delete nextAssignments[key];
        }
        setAssignments(nextAssignments);
        setSubs((prev) =>
            prev.some((a) => a.playerId === member.id)
                ? prev
                : [
                      ...prev,
                      {
                          playerId: member.id,
                          name: member.name,
                          shirtNumber: member.shirt_number,
                          x: 50,
                          y: 50,
                      },
                  ]
        );
        setSelectedPlayerId(null);
        setAnnouncement(t("lineup.addedSubstitute", { name: member.name }));
    }

    /** Select a player so it can be placed on the pitch or on the bench. */
    function togglePlayerSelection(playerId: string) {
        if (!canEdit) return;
        // Ignore the click the browser fires right after a drag ended.
        if (suppressClickRef.current) return;
        const member = memberById.get(playerId);
        setSelectedPlayerId((prev) => (prev === playerId ? null : playerId));
        if (member) {
            setAnnouncement(
                selectedPlayerId === playerId
                    ? t("lineup.deselectedPlayer", { name: member.name })
                    : t("lineup.selectedPlayer", { name: member.name })
            );
        }
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
            key: slotKeyFor(f.positions, i),
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
        try {
            const rows = [
                ...Object.entries(assignments)
                    .filter(([, a]) => a.playerId)
                    .map(([slot, a]) => ({
                        event_id: event.id,
                        player_id: a.playerId,
                        // The full slot key ("CB3") is stored verbatim. Stripping
                        // the index here collapsed several players onto the same
                        // position and silently dropped them on the next save.
                        position: slot,
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

            // Write first, prune afterwards. Deleting the old rows up front
            // meant a failed insert left the saved lineup empty in the
            // database.
            if (rows.length > 0) {
                const { error: upsertError } = await supabase
                    .from("lineups")
                    .upsert(rows, { onConflict: "event_id,player_id" });
                if (upsertError) throw new Error(upsertError.message);
            }

            const keepIds = rows.map((r) => r.player_id);
            const { data: currentRows, error: readError } = await supabase
                .from("lineups")
                .select("player_id")
                .eq("event_id", event.id);
            if (readError) throw new Error(readError.message);
            const staleIds = (currentRows ?? [])
                .map((r) => r.player_id as string)
                .filter((id) => !keepIds.includes(id));
            for (const staleId of staleIds) {
                const { error: deleteError } = await supabase
                    .from("lineups")
                    .delete()
                    .eq("event_id", event.id)
                    .eq("player_id", staleId);
                if (deleteError) throw new Error(deleteError.message);
            }

            const { error: eventError } = await supabase
                .from("events")
                .update({ formation: formation || null, captain_id: captainId || null })
                .eq("id", event.id);
            if (eventError) throw new Error(eventError.message);

            const spRows: { event_id: string; piece_type: string; player_id: string }[] = [];
            if (setPieceFoul) spRows.push({ event_id: event.id, piece_type: "foul", player_id: setPieceFoul });
            if (setPieceCorner) spRows.push({ event_id: event.id, piece_type: "corner", player_id: setPieceCorner });
            if (setPiecePenalty) spRows.push({ event_id: event.id, piece_type: "penalty", player_id: setPiecePenalty });
            if (spRows.length > 0) {
                const { error: spUpsertError } = await supabase
                    .from("set_pieces")
                    .upsert(spRows, { onConflict: "event_id,piece_type" });
                if (spUpsertError) throw new Error(spUpsertError.message);
            }
            const { data: currentPieces, error: spReadError } = await supabase
                .from("set_pieces")
                .select("piece_type")
                .eq("event_id", event.id);
            if (spReadError) throw new Error(spReadError.message);
            const keepPieces = spRows.map((r) => r.piece_type);
            for (const piece of currentPieces ?? []) {
                if (keepPieces.includes(piece.piece_type)) continue;
                const { error: spDeleteError } = await supabase
                    .from("set_pieces")
                    .delete()
                    .eq("event_id", event.id)
                    .eq("piece_type", piece.piece_type);
                if (spDeleteError) throw new Error(spDeleteError.message);
            }

            router.refresh();
        } catch (err) {
            setAlertMsg(
                t("lineup.saveFailed", {
                    error: err instanceof Error ? err.message : String(err),
                })
            );
            setAlertOpen(true);
        } finally {
            setSaving(false);
        }
    }

    const isDragging = draggingPlayer !== null || draggingSlot !== null;
    const ghostName = draggingPlayer
        ? members.find((m) => m.id === draggingPlayer)?.name ?? ""
        : draggingSlot
            ? assignments[draggingSlot]?.name ?? ""
            : "";

    // ----- Freehand drawing (coach tactics) -----
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const strokesRef = useRef<DrawingStroke[]>([]);
    const currentStrokeRef = useRef<DrawingStroke | null>(null);
    const [drawMode, setDrawMode] = useState(false);
    const [penColor, setPenColor] = useState(PEN_COLORS[0]);
    const [erasing, setErasing] = useState(false);
    const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

    const drawStroke = useCallback((ctx: CanvasRenderingContext2D, stroke: DrawingStroke, w: number, h: number) => {
        if (stroke.points.length === 0) return;
        const lineWidth = Math.max(1, stroke.width * w);
        ctx.save();
        ctx.globalCompositeOperation = stroke.erase ? "destination-out" : "source-over";
        ctx.strokeStyle = stroke.color;
        ctx.fillStyle = stroke.color;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        if (stroke.points.length === 1) {
            const [x, y] = stroke.points[0];
            ctx.beginPath();
            ctx.arc(x * w, y * h, lineWidth / 2, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.beginPath();
            ctx.moveTo(stroke.points[0][0] * w, stroke.points[0][1] * h);
            for (let i = 1; i < stroke.points.length; i++) {
                ctx.lineTo(stroke.points[i][0] * w, stroke.points[i][1] * h);
            }
            ctx.stroke();
        }
        ctx.restore();
    }, []);

    const redraw = useCallback(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        ctx.clearRect(0, 0, w, h);
        for (const stroke of strokesRef.current) drawStroke(ctx, stroke, w, h);
    }, [drawStroke]);

    const resizeCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        if (w === 0 || h === 0) return;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        redraw();
    }, [redraw]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        resizeCanvas();
        const observer = new ResizeObserver(() => resizeCanvas());
        observer.observe(canvas);
        return () => observer.disconnect();
    }, [resizeCanvas]);

    useEffect(() => {
        // The drawing is session-only, so clear it when switching to a different event.
        strokesRef.current.splice(0, strokesRef.current.length);
        const frame = requestAnimationFrame(() => redraw());
        return () => cancelAnimationFrame(frame);
    }, [event.id, redraw]);

    function getCanvasPoint(clientX: number, clientY: number) {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        // Round to 0.1% of the pitch (well below a pixel) so the saved JSON stays compact.
        const round = (n: number) => Math.round(clamp01(n) * 1000) / 1000;
        return {
            x: round((clientX - rect.left) / rect.width),
            y: round((clientY - rect.top) / rect.height),
        };
    }

    function handlePenDown(e: React.PointerEvent<HTMLCanvasElement>) {
        if (!drawMode || !canEdit) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        e.preventDefault();
        try {
            canvas.setPointerCapture(e.pointerId);
        } catch {
            // Not all environments support pointer capture; drawing still works.
        }
        const { x, y } = getCanvasPoint(e.clientX, e.clientY);
        const stroke: DrawingStroke = {
            color: penColor,
            width: erasing ? ERASER_WIDTH : PEN_WIDTH,
            erase: erasing,
            points: [[x, y]],
        };
        currentStrokeRef.current = stroke;
        strokesRef.current.push(stroke);
        const ctx = canvas.getContext("2d");
        if (ctx) drawStroke(ctx, stroke, canvas.clientWidth, canvas.clientHeight);
    }

    function handlePenMove(e: React.PointerEvent<HTMLCanvasElement>) {
        if (!drawMode || !currentStrokeRef.current) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        e.preventDefault();
        const stroke = currentStrokeRef.current;
        const { x, y } = getCanvasPoint(e.clientX, e.clientY);
        const last = stroke.points[stroke.points.length - 1];
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        // Skip near-duplicate points to keep the saved stroke small.
        if (Math.hypot((x - last[0]) * w, (y - last[1]) * h) < 1.5) return;
        stroke.points.push([x, y]);
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.save();
        ctx.globalCompositeOperation = stroke.erase ? "destination-out" : "source-over";
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = Math.max(1, stroke.width * w);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(last[0] * w, last[1] * h);
        ctx.lineTo(x * w, y * h);
        ctx.stroke();
        ctx.restore();
    }

    function handlePenUp() {
        currentStrokeRef.current = null;
    }

    function undoStroke() {
        strokesRef.current.pop();
        redraw();
    }

    function clearDrawing() {
        strokesRef.current.splice(0, strokesRef.current.length);
        redraw();
    }

    return (
        <div
            className="max-w-5xl mx-auto relative"
            onMouseMove={canEdit ? handleMouseMove : undefined}
            onMouseUp={canEdit ? handleMouseUp : undefined}
            onMouseLeave={canEdit ? () => { if (isDragging) { setDraggingPlayer(null); setDraggingSlot(null); setDragTarget(null); setGhostPos(null); } } : undefined}
            onTouchMove={canEdit ? handleTouchMove : undefined}
            onTouchEnd={canEdit ? handleMouseUp : undefined}
            onTouchCancel={canEdit ? () => { if (isDragging) { setDraggingPlayer(null); setDraggingSlot(null); setDragTarget(null); setGhostPos(null); } } : undefined}
            onClick={() => { suppressClickRef.current = false; }}
        >
            <AlertModal open={alertOpen} title={t("common.error")} message={alertMsg} onClose={() => setAlertOpen(false)} />
            {/* Announces the outcome of every action for screen readers. */}
            <p aria-live="polite" className="sr-only">{announcement}</p>
            <ConfirmModal
                open={clearConfirmOpen}
                title={t("lineup.clearConfirmTitle")}
                message={t("lineup.clearConfirmMessage")}
                confirmLabel={t("lineup.clearDrawing")}
                danger
                onConfirm={() => { clearDrawing(); setClearConfirmOpen(false); }}
                onCancel={() => setClearConfirmOpen(false)}
            />
            {isDragging && ghostPos && (
                <div
                    className="fixed pointer-events-none z-50 w-12 h-12 rounded-full bg-white text-black border-2 border-blue-500 flex items-center justify-center text-[10px] font-bold shadow-lg -translate-x-1/2 -translate-y-1/2"
                    style={{ left: ghostPos.x, top: ghostPos.y }}
                >
                    {ghostName.split(" ")[0]}
                </div>
            )}

            <div className="mb-6">
                <h1 className="text-2xl font-bold text-black">{t("lineup.lineupTitle", { title: event.title })}</h1>
                <p className="text-sm text-gray-500">
                    {event.type === "match" ? t("events.match") : t("events.training")} · 
                    <EventDate date={event.date} />
                </p>
            </div>

            <div className="flex flex-col md:flex-row gap-6">
                <div className="flex-1">
                    {isAdmin && (
                        <div className="mb-3">
                            {isLocked && (
                                <p className="text-xs text-red-500 mb-1">{t("lineup.locked")}</p>
                            )}
                            <label className="text-sm font-medium text-gray-700 mr-2">{t("lineup.formation")}</label>
                            <select
                                value={formation}
                                onChange={(e) => applyFormation(e.target.value)}
                                disabled={isLocked}
                                className="rounded-md border border-gray-300 px-2 py-1 text-sm text-black disabled:opacity-50"
                            >
                                <option value="">{t("lineup.selectFormation")}</option>
                                {Object.entries(FORMATIONS).map(([key, f]) => (
                                    <option key={key} value={key}>{t(f.labelKey)}</option>
                                ))}
                            </select>
                            <label className="text-sm font-medium text-gray-700 mr-2 ml-4">{t("lineup.captainLabel")}</label>
                            <select
                                value={captainId}
                                onChange={(e) => setCaptainId(e.target.value)}
                                disabled={isLocked}
                                className="rounded-md border border-gray-300 px-2 py-1 text-sm text-black disabled:opacity-50"
                            >
                                <option value="">{t("common.none")}</option>
                                {members.map((m) => (
                                    <option key={m.id} value={m.id}>
                                        {m.name}{m.shirt_number ? ` #${m.shirt_number}` : ""}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                    {isAdmin && captainId && !isLocked && (
                        <p className="text-xs text-gray-400 mb-1">{t("lineup.captainBadge")}</p>
                    )}
                    {!isAdmin && captainId && (
                        <p className="text-xs text-gray-400 mb-1">{t("lineup.captainDisplay", { name: members.find(m => m.id === captainId)?.name ?? "Unknown" })}</p>
                    )}

                    {canEdit && (
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={() => { setDrawMode((v) => !v); setErasing(false); }}
                                className={`rounded-md border px-3 py-1 text-sm font-medium ${drawMode ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-300 bg-white text-gray-700 hover:border-gray-400"}`}
                            >
                                ✏️ {t("lineup.draw")}
                            </button>
                            {drawMode && (
                                <>
                                    {PEN_COLORS.map((c) => (
                                        <button
                                            key={c}
                                            type="button"
                                            onClick={() => { setPenColor(c); setErasing(false); }}
                                            aria-label={t("lineup.color")}
                                            className={`h-6 w-6 rounded-full border-2 ${!erasing && penColor === c ? "border-gray-900" : "border-gray-300"}`}
                                            style={{ backgroundColor: c }}
                                        />
                                    ))}
                                    <button
                                        type="button"
                                        onClick={() => setErasing((v) => !v)}
                                        className={`rounded-md border px-2 py-1 text-sm ${erasing ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-300 bg-white text-gray-700"}`}
                                    >
                                        {t("lineup.eraser")}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={undoStroke}
                                        className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700"
                                    >
                                        {t("lineup.undo")}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setClearConfirmOpen(true)}
                                        className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700"
                                    >
                                        {t("lineup.clearDrawing")}
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                    {canEdit && drawMode && (
                        <p className="mb-1 text-xs text-gray-500">{t("lineup.drawHint")}</p>
                    )}

                    <div
                        ref={pitchRef}
                        role="group"
                        aria-label={t("lineup.pitchLabel")}
                        className={`relative w-full rounded-lg overflow-hidden border select-none ${dragTarget === "pitch" ? "border-blue-500 border-2" : "border-green-700"}`}
                        style={{ paddingBottom: "130%", backgroundColor: "#15803d" }}
                    >
                        <div className="absolute top-1/2 left-0 right-0 h-px bg-white/30" />
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full border border-white/30" />
                        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/2 h-[15%] border-t border-l border-r border-white/30" />
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-[15%] border-b border-l border-r border-white/30" />

                        {Object.entries(assignments).map(([slot, a]) => {
                            if (!a.playerId) {
                                return (
                                    <div
                                        key={slot}
                                        className="absolute -translate-x-1/2 -translate-y-1/2"
                                        style={{ left: `${a.x}%`, top: `${a.y}%` }}
                                    >
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.currentTarget.focus();
                                                placePlayerInSlot(slot);
                                            }}
                                            aria-label={t("lineup.emptySlot", { position: slotLabel(slot) })}
                                            className="w-12 h-12 rounded-full border-2 border-dashed border-white/40 flex items-center justify-center hover:border-white/70"
                                        >
                                            <span className="text-[10px] text-white/60 font-bold">{slotBaseName(slot)}</span>
                                        </button>
                                    </div>
                                );
                            }
                            return (
                                <div
                                    key={slot}
                                    className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
                                    style={{ left: `${a.x}%`, top: `${a.y}%` }}
                                >
                                    <button
                                        type="button"
                                        onMouseDown={canEdit ? (e) => startDragSlot(e, slot) : undefined}
                                        onTouchStart={canEdit ? (e) => startDragSlot(e, slot) : undefined}
                                        onClick={(e) => {
                                            e.currentTarget.focus();
                                            placePlayerInSlot(slot);
                                        }}
                                        aria-label={t("lineup.slotWithPlayer", {
                                            position: slotLabel(slot),
                                            name: a.name,
                                        })}
                                        className={`relative w-12 h-12 rounded-full bg-white text-black border-2 ${a.playerId === captainId ? "border-yellow-500" : "border-white"} flex items-center justify-center font-bold ${canEdit ? "cursor-grab active:cursor-grabbing" : ""} ${draggingSlot === slot ? "opacity-40" : ""}`}
                                        style={{ touchAction: "none" }}
                                    >
                                        {a.playerId === captainId && (
                                            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-yellow-400 text-black text-[8px] font-bold flex items-center justify-center border border-yellow-600">C</span>
                                        )}
                                        <span className="text-sm leading-tight">{a.shirtNumber ? `#${a.shirtNumber}` : "?"}</span>
                                    </button>
                                    <span className="mt-0.5 text-[10px] leading-tight text-white text-center max-w-[5rem] truncate drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">{a.name}</span>
                                    {canEdit && (
                                        <button
                                            type="button"
                                            onMouseDown={(e) => e.stopPropagation()}
                                            onTouchStart={(e) => e.stopPropagation()}
                                            onClick={() => handleRemove(slot)}
                                            aria-label={t("lineup.removePlayerFrom", { name: a.name })}
                                            className="text-[10px] text-white/60 hover:text-white"
                                        >
                                            {t("lineup.remove")}
                                        </button>
                                    )}
                                </div>
                            );
                        })}

                        <canvas
                            ref={canvasRef}
                            className="absolute inset-0 h-full w-full"
                            style={{
                                touchAction: "none",
                                pointerEvents: canEdit && drawMode ? "auto" : "none",
                                cursor: drawMode ? "crosshair" : "default",
                            }}
                            onPointerDown={canEdit ? handlePenDown : undefined}
                            onPointerMove={canEdit ? handlePenMove : undefined}
                            onPointerUp={canEdit ? handlePenUp : undefined}
                            onPointerCancel={canEdit ? handlePenUp : undefined}
                        />
                    </div>
                </div>

                <div className="w-full md:w-64">
                    <h2 className="font-bold text-black mb-3">
                        {t("lineup.players", { count: pool.length })}
                    </h2>
                    <div className="space-y-2" role="group" aria-label={t("lineup.poolLabel")}>
                        {pool.length === 0 ? (
                            <p className="text-sm text-gray-400">{t("lineup.allAssigned")}</p>
                        ) : (
                            pool.map((player) => (
                                <button
                                    key={player.id}
                                    type="button"
                                    onMouseDown={canEdit ? (e) => startDragPlayer(e, player.id) : undefined}
                                    onTouchStart={canEdit ? (e) => startDragPlayer(e, player.id) : undefined}
                                    onClick={(e) => {
                                        e.currentTarget.focus();
                                        togglePlayerSelection(player.id);
                                    }}
                                    aria-pressed={selectedPlayerId === player.id}
                                    aria-label={t("lineup.selectPlayer", { name: player.name })}
                                    className={`w-full flex items-center justify-between rounded-md border px-3 py-2 text-sm ${
                                        canEdit
                                            ? `cursor-grab border-gray-200 bg-white hover:border-gray-400 active:cursor-grabbing ${
                                                  selectedPlayerId === player.id
                                                      ? "border-blue-500 ring-2 ring-blue-500"
                                                      : ""
                                              }`
                                            : "border-gray-100 bg-gray-50"
                                    } ${draggingPlayer === player.id ? "opacity-40" : ""}`}
                                    style={{ touchAction: "none" }}
                                >
                                    <span className="text-black font-medium">{player.name}</span>
                                    <span className="flex items-center gap-2 text-xs text-gray-400">
                                        {player.position && <span>{player.position} - {t(`positions.${player.position}`)}</span>}
                                        {player.shirt_number && <span>#{player.shirt_number}</span>}
                                    </span>
                                </button>
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
                                    {t("lineup.substitutes", { count: subs.length })}
                                </h3>
                                {canEdit && selectedPlayerId && (
                                    <button
                                        type="button"
                                        onClick={placeSelectedAsSub}
                                        className="mb-2 rounded-md border border-blue-300 bg-white px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
                                    >
                                        {t("lineup.addToSubstitutes")}
                                    </button>
                                )}
                                {subs.length === 0 ? (
                                    <p className="text-xs text-gray-400">{t("lineup.dragHere")}</p>
                                ) : (
                                    <div className="space-y-2" role="group" aria-label={t("lineup.substitutes", { count: subs.length })}>
                                        {subs.map((sub) => (
                                            <div
                                                key={sub.playerId}
                                                className="flex items-center justify-between rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm"
                                            >
                                                <button
                                                    type="button"
                                                    onMouseDown={canEdit ? (e) => startDragPlayer(e, sub.playerId) : undefined}
                                                    onTouchStart={canEdit ? (e) => startDragPlayer(e, sub.playerId) : undefined}
                                                    onClick={(e) => {
                                                        e.currentTarget.focus();
                                                        togglePlayerSelection(sub.playerId);
                                                    }}
                                                    aria-pressed={selectedPlayerId === sub.playerId}
                                                    aria-label={t("lineup.selectPlayer", { name: sub.name })}
                                                    className={`flex-1 text-left ${canEdit ? "cursor-grab active:cursor-grabbing" : ""} ${draggingPlayer === sub.playerId ? "opacity-40" : ""} ${selectedPlayerId === sub.playerId ? "text-blue-700" : "text-black"}`}
                                                    style={{ touchAction: "none" }}
                                                >
                                                    <span className="font-medium">{sub.name}</span>
                                                    {sub.playerId === captainId && <span className="ml-1 inline-block w-4 h-4 rounded-full bg-yellow-400 text-black text-[8px] font-bold text-center leading-4 border border-yellow-600">C</span>}
                                                </button>
                                                <div className="flex items-center gap-2">
                                                    {sub.shirtNumber && (
                                                        <span className="text-gray-400 text-xs">#{sub.shirtNumber}</span>
                                                    )}
                                                    {canEdit && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRemoveSub(sub.playerId)}
                                                            aria-label={t("lineup.removePlayerFrom", { name: sub.name })}
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
                                <h3 className="text-sm font-bold text-black mb-3">{t("lineup.setPieces")}</h3>
                                <div className="space-y-3">
                                    <div>
                                        <label className="text-xs font-medium text-gray-500 mb-1 block">{t("lineup.fouls")}</label>
                                        <select
                                            value={setPieceFoul}
                                            onChange={(e) => setSetPieceFoul(e.target.value)}
                                            disabled={isLocked}
                                            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-black disabled:opacity-50"
                                        >
                                            <option value="">{t("common.none")}</option>
                                            {members.map((m) => (
                                                <option key={m.id} value={m.id}>
                                                    {m.name}{m.shirt_number ? ` #${m.shirt_number}` : ""}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-gray-500 mb-1 block">{t("lineup.corners")}</label>
                                        <select
                                            value={setPieceCorner}
                                            onChange={(e) => setSetPieceCorner(e.target.value)}
                                            disabled={isLocked}
                                            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-black disabled:opacity-50"
                                        >
                                            <option value="">{t("common.none")}</option>
                                            {members.map((m) => (
                                                <option key={m.id} value={m.id}>
                                                    {m.name}{m.shirt_number ? ` #${m.shirt_number}` : ""}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-gray-500 mb-1 block">{t("lineup.penalties")}</label>
                                        <select
                                            value={setPiecePenalty}
                                            onChange={(e) => setSetPiecePenalty(e.target.value)}
                                            disabled={isLocked}
                                            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-black disabled:opacity-50"
                                        >
                                            <option value="">{t("common.none")}</option>
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
                                {saving ? t("common.saving") : t("lineup.saveLineup")}
                            </button>
                        </>
                    )}
                    {!isAdmin && (setPieceFoul || setPieceCorner || setPiecePenalty) && (
                        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
                            <h3 className="text-sm font-bold text-black mb-2">{t("lineup.setPieces")}</h3>
                            <div className="space-y-1 text-sm text-gray-600">
                                {setPieceFoul && <p>{t("lineup.fouls")}: <span className="font-medium text-black">{members.find(m => m.id === setPieceFoul)?.name ?? "Unknown"}</span></p>}
                                {setPieceCorner && <p>{t("lineup.corners")}: <span className="font-medium text-black">{members.find(m => m.id === setPieceCorner)?.name ?? "Unknown"}</span></p>}
                                {setPiecePenalty && <p>{t("lineup.penalties")}: <span className="font-medium text-black">{members.find(m => m.id === setPiecePenalty)?.name ?? "Unknown"}</span></p>}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

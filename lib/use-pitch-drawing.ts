"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type DrawingStroke = {
    color: string;
    // Stroke width as a fraction of the pitch width, so it scales with the pitch size.
    width: number;
    // When true the stroke erases previously drawn strokes instead of painting.
    erase?: boolean;
    // Normalised points (0..1) relative to the pitch: [[x, y], ...].
    points: number[][];
};

// Basic pen palette. Yellow/white/black all read well on the green pitch.
export const PEN_COLORS = ["#ffffff", "#facc15", "#ef4444", "#3b82f6", "#000000"];
// Stroke width as a fraction of the pitch width, so drawings scale on every screen.
const PEN_WIDTH = 0.008;
const ERASER_WIDTH = 0.035;

function clamp01(n: number) {
    return Math.max(0, Math.min(1, n));
}

/**
 * Freehand drawing on the pitch (coach tactics).
 *
 * Strokes live in a ref rather than in state: they are painted straight onto
 * a canvas, so re-rendering React on every pointer move would be wasted work.
 * The hook owns the canvas, the pen/eraser state and the pointer handlers,
 * and clears the drawing when a different event is opened. Drawing is
 * session-only -- strokes are never persisted.
 */
export function usePitchDrawing({ canEdit, eventId }: { canEdit: boolean; eventId: string }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const strokesRef = useRef<DrawingStroke[]>([]);
    const currentStrokeRef = useRef<DrawingStroke | null>(null);
    const [drawMode, setDrawMode] = useState(false);
    const [penColor, setPenColor] = useState(PEN_COLORS[0]);
    const [erasing, setErasing] = useState(false);

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
    }, [eventId, redraw]);

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

    return {
        canvasRef,
        drawMode,
        setDrawMode,
        penColor,
        setPenColor,
        erasing,
        setErasing,
        handlePenDown,
        handlePenMove,
        handlePenUp,
        undoStroke,
        clearDrawing,
    };
}

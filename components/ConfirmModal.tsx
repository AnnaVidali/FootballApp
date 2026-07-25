"use client";

import { useEffect, useRef, useCallback } from "react";

export default function ConfirmModal({
    open,
    title,
    message,
    confirmLabel = "Confirm",
    danger = false,
    onConfirm,
    onCancel,
}: {
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    danger?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    const cancelRef = useRef<HTMLButtonElement>(null);
    const dialogRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (open) cancelRef.current?.focus();
    }, [open]);

    const handleKey = useCallback(
        (e: KeyboardEvent) => {
            if (e.key === "Escape") onCancel();
            if (e.key === "Tab" && dialogRef.current) {
                const focusable = dialogRef.current.querySelectorAll<HTMLElement>("button");
                if (focusable.length === 0) return;
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        },
        [onCancel]
    );

    useEffect(() => {
        if (!open) return;
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, [open, handleKey]);

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            onClick={onCancel}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="confirm-dialog-title"
                className="bg-white rounded-lg shadow-lg p-6 max-w-sm w-full mx-4"
                onClick={(e) => e.stopPropagation()}
            >
                <h3 id="confirm-dialog-title" className="text-lg font-bold text-black mb-2">{title}</h3>
                <p className="text-sm text-gray-600 mb-4">{message}</p>
                <div className="flex gap-2">
                    <button
                        ref={cancelRef}
                        onClick={onCancel}
                        className="flex-1 rounded-md bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className={`flex-1 rounded-md px-4 py-2 text-sm font-medium text-white ${
                            danger ? "bg-red-600 hover:bg-red-700" : ""
                        }`}
                        style={danger ? {} : { backgroundColor: "var(--primary)", color: "var(--primary-text)" }}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}

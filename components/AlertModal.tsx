"use client";

import { useEffect, useRef, useCallback } from "react";
import { useLocaleContext } from "@/lib/i18n-context";

export default function AlertModal({
    open,
    title,
    message,
    onClose,
}: {
    open: boolean;
    title: string;
    message: string;
    onClose: () => void;
}) {
    const buttonRef = useRef<HTMLButtonElement>(null);
    const dialogRef = useRef<HTMLDivElement>(null);
    const { t } = useLocaleContext();

    useEffect(() => {
        if (open) buttonRef.current?.focus();
    }, [open]);

    const handleKey = useCallback(
        (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
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
        [onClose]
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
            onClick={onClose}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="alert-dialog-title"
                className="bg-white rounded-lg shadow-lg p-6 max-w-sm w-full mx-4"
                onClick={(e) => e.stopPropagation()}
            >
                <h3 id="alert-dialog-title" className="text-lg font-bold text-black mb-2">{title}</h3>
                <p className="text-sm text-gray-600 mb-4">{message}</p>
                <button
                    ref={buttonRef}
                    onClick={onClose}
                    className="rounded-md px-4 py-2 text-sm font-medium w-full"
                    style={{ backgroundColor: "var(--primary)", color: "var(--primary-text)" }}
                >
                    {t("common.ok")}
                </button>
            </div>
        </div>
    );
}

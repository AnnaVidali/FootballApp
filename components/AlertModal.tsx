"use client";

import { useEffect, useRef } from "react";

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

    useEffect(() => {
        if (open) buttonRef.current?.focus();
    }, [open]);

    useEffect(() => {
        if (!open) return;
        function handleKey(e: KeyboardEvent) {
            if (e.key === "Escape") onClose();
        }
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-lg shadow-lg p-6 max-w-sm w-full mx-4"
                onClick={(e) => e.stopPropagation()}
            >
                <h3 className="text-lg font-bold text-black mb-2">{title}</h3>
                <p className="text-sm text-gray-600 mb-4">{message}</p>
                <button
                    ref={buttonRef}
                    onClick={onClose}
                    className="rounded-md px-4 py-2 text-sm font-medium w-full"
                    style={{ backgroundColor: "var(--primary)", color: "var(--primary-text)" }}
                >
                    OK
                </button>
            </div>
        </div>
    );
}

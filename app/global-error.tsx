"use client";

import { useEffect } from "react";

/**
 * Replaces the root layout, so it cannot use the locale provider (or any
 * of the app's CSS variables). Keep the markup and copy dependency-free.
 */
export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error(error);
    }, [error]);

    return (
        <html lang="en">
            <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f9fafb" }}>
                <main
                    style={{
                        minHeight: "100vh",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 16,
                        padding: 24,
                        textAlign: "center",
                        color: "#111827",
                    }}
                >
                    <h1 style={{ margin: 0, fontSize: 24 }}>Something went wrong</h1>
                    <p style={{ margin: 0, color: "#4b5563" }}>
                        The app hit an unexpected error. You can try again.
                    </p>
                    <button
                        type="button"
                        onClick={reset}
                        style={{
                            borderRadius: 6,
                            border: 0,
                            padding: "10px 16px",
                            fontWeight: 600,
                            cursor: "pointer",
                            background: "#16a34a",
                            color: "#ffffff",
                        }}
                    >
                        Try again
                    </button>
                </main>
            </body>
        </html>
    );
}

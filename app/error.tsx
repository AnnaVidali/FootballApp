"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useLocaleContext } from "@/lib/i18n-context";

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    const { t } = useLocaleContext();

    useEffect(() => {
        console.error(error);
    }, [error]);

    return (
        <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
            <span className="text-4xl" aria-hidden="true">⚠️</span>
            <h1 className="text-2xl font-bold text-black">{t("common.somethingWentWrong")}</h1>
            <p className="text-sm text-gray-600">{t("common.errorDescription")}</p>
            <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                    type="button"
                    onClick={reset}
                    className="rounded-md px-4 py-2 font-medium"
                    style={{ backgroundColor: "var(--primary)", color: "var(--primary-text)" }}
                >
                    {t("common.tryAgain")}
                </button>
                <Link href="/dashboard" className="text-sm font-medium text-gray-700 underline">
                    {t("common.backToDashboard")}
                </Link>
            </div>
        </div>
    );
}

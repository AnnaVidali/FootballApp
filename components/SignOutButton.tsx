"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLocaleContext } from "@/lib/i18n-context";
import AlertModal from "@/components/AlertModal";

const supabase = createClient();

export default function SignOutButton() {
    const router = useRouter();
    const { t } = useLocaleContext();
    const [alertOpen, setAlertOpen] = useState(false);

    async function handleSignOut() {
        const { error } = await supabase.auth.signOut();
        if (error) {
            // Stay on the page: navigating to /login would show a stale
            // session and hide the fact that sign-out never happened.
            console.error("sign-out failed", error.message);
            setAlertOpen(true);
            return;
        }
        router.push("/login");
        router.refresh();
    }

    return (
        <>
            <AlertModal
                open={alertOpen}
                title={t("common.error")}
                message={t("auth.signOutFailed")}
                onClose={() => setAlertOpen(false)}
            />
            <button
                onClick={handleSignOut}
                className="w-full rounded-md bg-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-300"
            >
                {t("auth.signOut")}
            </button>
        </>
    );
}

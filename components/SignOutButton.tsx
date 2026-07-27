"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLocaleContext } from "@/lib/i18n-context";

export default function SignOutButton() {
  const router = useRouter();
  const supabase = createClient();
  const { t } = useLocaleContext();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleSignOut}
      className="w-full rounded-md bg-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-300"
    >
      {t("auth.signOut")}
    </button>
  );
}

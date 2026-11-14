import { redirect } from "next/navigation";
import AccountClient from "@/components/AccountClient";
import { getSessionContext } from "@/lib/session";

export default async function AccountPage() {
    const { user, profile, team } = await getSessionContext();
    if (!user) redirect("/login");

    return (
        <AccountClient
            email={user.email ?? ""}
            isOwner={team?.owner_id === user.id}
            isAdmin={profile?.is_admin ?? false}
        />
    );
}

import type { Metadata } from "next";
import ReservationsClient, {
    type AvailabilityRow,
    type Member,
    type TrainingEvent,
} from "@/components/ReservationsClient";
import { getSessionContext } from "@/lib/session";
import { pageMetadata } from "@/lib/page-metadata";
import type { Reservation, ReservationPayment } from "@/types/database";

const PAYMENT_COLUMNS = "id, reservation_id, user_id, amount, paid, paid_at, created_at";

// Reservations are settled within weeks of the training, so a year of
// trainings is plenty and keeps this query bounded.
const RESERVATION_WINDOW_DAYS = 365;

export async function generateMetadata(): Promise<Metadata> {
    return pageMetadata("nav.reservations");
}

export default async function ReservationsPage() {
    const { supabase, user, profile } = await getSessionContext();
    const serverNow = new Date().toISOString();

    if (!user || !profile?.team_id) {
        return (
            <ReservationsClient
                myProfileId={null}
                hasTeam={false}
                isAdmin={false}
                initialMembers={[]}
                initialEvents={[]}
                initialReservations={[]}
                initialPayments={[]}
                initialAvailability={[]}
                serverNow={serverNow}
            />
        );
    }

    const teamId = profile.team_id;
    const since = new Date();
    since.setDate(since.getDate() - RESERVATION_WINDOW_DAYS);

    const [{ data: memberRows }, { data: eventRows }] = await Promise.all([
        supabase.from("profiles").select("id, user_id, name, role").eq("team_id", teamId),
        // Reservations only ever exist for trainings.
        supabase
            .from("events")
            .select("id, title, type, date, location")
            .eq("team_id", teamId)
            .eq("type", "training")
            .gte("date", since.toISOString())
            .order("date", { ascending: true }),
    ]);

    const trainings = (eventRows ?? []) as TrainingEvent[];
    const eventIds = trainings.map((event) => event.id);

    let availability: AvailabilityRow[] = [];
    let reservations: Reservation[] = [];
    let payments: ReservationPayment[] = [];

    if (eventIds.length > 0) {
        const [{ data: avail }, { data: reservationRows }] = await Promise.all([
            supabase
                .from("availability")
                .select("event_id, user_id, status")
                .in("event_id", eventIds),
            supabase
                .from("reservations")
                .select("id, event_id, created_by, amount, closed_at, created_at")
                .in("event_id", eventIds),
        ]);
        availability = (avail ?? []) as AvailabilityRow[];
        reservations = (reservationRows ?? []) as Reservation[];

        const reservationIds = reservations.map((reservation) => reservation.id);
        if (reservationIds.length > 0) {
            const { data: paymentRows } = await supabase
                .from("reservation_payments")
                .select(PAYMENT_COLUMNS)
                .in("reservation_id", reservationIds);
            payments = (paymentRows ?? []) as ReservationPayment[];
        }
    }

    return (
        <ReservationsClient
            myProfileId={profile.id}
            hasTeam={true}
            isAdmin={profile.is_admin}
            initialMembers={(memberRows ?? []) as Member[]}
            initialEvents={trainings}
            initialReservations={reservations}
            initialPayments={payments}
            initialAvailability={availability}
            serverNow={serverNow}
        />
    );
}

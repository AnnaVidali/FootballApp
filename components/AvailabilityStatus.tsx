"use client";

import { useMemo } from "react";
import { formatTimeLeft, getAvailabilityDeadline } from "@/lib/utils";
import { useLocaleContext } from "@/lib/i18n-context";
import { useNow } from "@/lib/use-now";

export default function AvailabilityStatus({ eventDate }: { eventDate: string }) {
  const { t } = useLocaleContext();

  // Derived, not stored: the deadline has to follow the event when the admin
  // moves it, otherwise the countdown keeps pointing at the old date.
  const deadline = useMemo(
    () => getAvailabilityDeadline({ date: eventDate }),
    [eventDate]
  );

  const now = useNow();
  const timeLeft = now === null ? null : deadline.getTime() - now;

  if (timeLeft !== null && timeLeft <= 0) {
    return <p className="text-xs text-gray-400 mt-1">{t("availability.closed")}</p>;
  }

  return (
    <p className="text-xs text-gray-400 mt-1">
      {timeLeft === null ? "" : t("availability.closesIn", { time: formatTimeLeft(timeLeft) ?? "" })}
    </p>
  );
}

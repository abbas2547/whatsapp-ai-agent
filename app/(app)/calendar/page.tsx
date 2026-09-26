import type { Metadata } from "next";
import { requireSessionOrRedirect } from "@/app/actions/session";
import { listAppointments } from "@/services/calendar/google-calendar";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/badge";
import { AppointmentStatusBadge } from "@/components/status-badges";
import { fmtDate, fmtTime } from "@/components/format";
import { CalendarDays } from "lucide-react";

export const metadata: Metadata = { title: "Calendar" };

export default async function CalendarPage() {
  const session = await requireSessionOrRedirect();
  const appointments = await listAppointments(session.user.organizationId!);

  const grouped = new Map<string, typeof appointments>();
  for (const appt of appointments) {
    const day = fmtDate(appt.startAt, { year: "numeric", month: "short", day: "numeric", weekday: "short" });
    grouped.set(day, [...(grouped.get(day) || []), appt]);
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <PageHeader
        title="Calendar"
        description="Appointments booked by agents. Connect Google Calendar in Integrations to sync events automatically."
      />

      {appointments.length ? (
        <div className="flex flex-col gap-4">
          {[...grouped.entries()].map(([day, items]) => (
            <div key={day}>
              <p className="mb-2 text-sm font-semibold">{day}</p>
              <div className="flex flex-col gap-2">
                {items.map((a) => (
                  <Card key={a.id} className="card-elevated flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{a.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {fmtTime(a.startAt)} – {fmtTime(a.endAt)} ·{" "}
                        {a.contact ? a.contact.name || a.contact.phone : "No contact"}
                      </p>
                    </div>
                    <AppointmentStatusBadge status={a.status} />
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={CalendarDays}
          title="No appointments"
          description="Appointments appear here when AI agents or workflows book them. Availability is never invented — only real bookings are shown."
        />
      )}
    </div>
  );
}
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSessionOrRedirect } from "@/app/actions/session";
import { getContact } from "@/services/contacts/contact.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ContactTags } from "@/components/contacts/contact-tags";
import { LeadStatusBadge, AppointmentStatusBadge } from "@/components/status-badges";
import { fmtDateTime } from "@/components/format";
import { ArrowLeft, MessageSquare } from "lucide-react";

export const metadata: Metadata = { title: "Contact" };

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSessionOrRedirect();
  const orgId = session.user.organizationId!;
  const { id } = await params;
  const contact = await getContact(orgId, id).catch(() => null);
  if (!contact) notFound();

  const rows: [string, string][] = [
    ["Phone", contact.phone],
    ["Email", contact.email || "—"],
    ["Company", contact.company || "—"],
    ["Source", contact.source || "—"],
    ["Notes", contact.notes || "—"],
    ["Created", fmtDateTime(contact.createdAt)],
  ];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <Link href="/contacts" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to contacts
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{contact.name || "Unnamed contact"}</h1>
          <p className="text-sm text-muted-foreground">{contact.phone}</p>
        </div>
        <ContactTags contactId={contact.id} tags={contact.tags} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2.5">
            {rows.map(([k, v]) => (
              <div key={k}>
                <p className="text-xs font-semibold uppercase text-muted-foreground">{k}</p>
                <p className="text-sm">{v}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Leads</CardTitle>
          </CardHeader>
          <CardContent>
            {contact.leads.length ? (
              <div className="flex flex-col divide-y">
                {contact.leads.map((lead) => (
                  <div key={lead.id} className="flex items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm">{lead.service || "General"}</p>
                      <p className="text-xs text-muted-foreground">Score {lead.score}</p>
                    </div>
                    <LeadStatusBadge status={lead.status} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No leads for this contact.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Appointments</CardTitle>
        </CardHeader>
        <CardContent>
          {contact.appointments.length ? (
            <div className="flex flex-col divide-y">
              {contact.appointments.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm">{a.title}</p>
                    <p className="text-xs text-muted-foreground">{fmtDateTime(a.startAt)}</p>
                  </div>
                  <AppointmentStatusBadge status={a.status} />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No appointments.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Conversations</CardTitle>
        </CardHeader>
        <CardContent>
          {contact.conversations.length ? (
            <div className="flex flex-col divide-y">
              {contact.conversations.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 py-2.5">
                  <p className="truncate text-sm text-muted-foreground">{fmtDateTime(c.updatedAt)}</p>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/inbox/${c.id}`}>
                      <MessageSquare className="h-3.5 w-3.5" /> Open
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No conversations.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
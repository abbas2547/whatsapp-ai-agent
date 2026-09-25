import { google } from "googleapis";
import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/encryption";
import { env, isPlaceholder } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { triggerWorkflows } from "@/services/automation/engine";

async function getCalendarClient(organizationId: string) {
  const cred = await db.apiCredential.findFirst({
    where: { organizationId, provider: "google" },
    orderBy: { updatedAt: "desc" },
  });
  if (!cred) {
    throw new AppError("Google Calendar is not connected. Connect it in Integrations.", "GOOGLE_NOT_CONNECTED", 400);
  }
  const tokens = JSON.parse(decryptSecret(cred.encryptedValue)) as {
    access_token?: string;
    refresh_token?: string;
    expiry_date?: number;
  };
  if (isPlaceholder(env().GOOGLE_CLIENT_ID) || isPlaceholder(env().GOOGLE_CLIENT_SECRET)) {
    throw new AppError("Google OAuth is not configured on the server.", "GOOGLE_OAUTH_MISSING", 400);
  }
  const oauth = new google.auth.OAuth2(env().GOOGLE_CLIENT_ID, env().GOOGLE_CLIENT_SECRET);
  oauth.setCredentials(tokens);
  return google.calendar({ version: "v3", auth: oauth });
}

export async function checkAvailability(organizationId: string, date: string, durationMinutes: number) {
  const calendar = await getCalendarClient(organizationId);
  const start = new Date(date);
  if (!date || isNaN(start.getTime())) {
    throw new AppError("Provide a valid date to check availability.", "INVALID_DATE", 400);
  }
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const result = await calendar.freebusy.query({
    requestBody: {
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      items: [{ id: "primary" }],
    },
  });
  const busy = result.data.calendars?.primary?.busy || [];
  const slots: { start: string; end: string }[] = [];
  let cursor = new Date(start);
  cursor.setHours(9, 0, 0, 0);
  const close = new Date(start);
  close.setHours(17, 0, 0, 0);
  while (cursor < close) {
    const slotEnd = new Date(cursor.getTime() + durationMinutes * 60000);
    const overlap = busy.some((b) => {
      const bStart = new Date(b.start || "");
      const bEnd = new Date(b.end || "");
      return cursor < bEnd && slotEnd > bStart;
    });
    if (!overlap && slotEnd <= close) {
      slots.push({ start: cursor.toISOString(), end: slotEnd.toISOString() });
    }
    cursor = new Date(cursor.getTime() + 30 * 60000);
  }
  return { slots: slots.slice(0, 8), busy };
}

export async function bookAppointment(input: {
  organizationId: string;
  contactId?: string;
  conversationId?: string;
  title: string;
  startAt: string;
  endAt: string;
}) {
  const contact = input.contactId
    ? await db.contact.findFirst({ where: { id: input.contactId, organizationId: input.organizationId } })
    : null;
  if (!contact?.name && !contact?.phone) {
    throw new AppError("Collect the customer name or phone before booking.", "INSUFFICIENT_CUSTOMER_INFO");
  }

  let googleEventId: string | undefined;
  try {
    const calendar = await getCalendarClient(input.organizationId);
    const event = await calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: input.title,
        description: `WhatsApp appointment with ${contact.name || contact.phone}`,
        start: { dateTime: input.startAt },
        end: { dateTime: input.endAt },
      },
    });
    googleEventId = event.data.id || undefined;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("Could not create Google Calendar event. Reconnect Google in Integrations.", "CALENDAR_CREATE_FAILED", 502);
  }

  const startAt = new Date(input.startAt);
  const endAt = new Date(input.endAt);
  if (!input.startAt || !input.endAt || isNaN(startAt.getTime()) || isNaN(endAt.getTime())) {
    throw new AppError("Provide valid start and end times to book.", "INVALID_DATE", 400);
  }
  if (endAt <= startAt) {
    throw new AppError("The appointment end must be after its start.", "INVALID_DATE", 400);
  }

  const appointment = await db.appointment.create({
    data: {
      organizationId: input.organizationId,
      contactId: input.contactId,
      conversationId: input.conversationId,
      title: input.title,
      startAt,
      endAt,
      status: "CONFIRMED",
      googleEventId,
    },
  });
  await triggerWorkflows(input.organizationId, "appointment.created", { appointmentId: appointment.id });
  return appointment;
}

export async function listAppointments(organizationId: string) {
  return db.appointment.findMany({
    where: { organizationId },
    include: { contact: true },
    orderBy: { startAt: "asc" },
    take: 100,
  });
}

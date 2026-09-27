"use server";

import { assertAdmin, requireOrgContext } from "@/lib/tenant";
import { connectWhatsApp } from "@/services/whatsapp/connect";
import { fail } from "./_shared";

export async function connectWhatsAppAction(input: {
  wabaId?: string;
  phoneNumberId?: string;
  accessToken?: string;
  displayPhoneNumber?: string;
  clientId?: string;
  clientSecret?: string;
}) {
  try {
    const ctx = await requireOrgContext();
    assertAdmin(ctx);
    return { ok: true as const, ...(await connectWhatsApp(ctx.organizationId, ctx.userId, input)) };
  } catch (error) {
    return fail(error);
  }
}

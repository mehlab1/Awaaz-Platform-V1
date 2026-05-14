import type { UserJSON } from '@clerk/backend';

export function primaryEmailFromUserJson(user: UserJSON): string | null {
  const primaryId = user.primary_email_address_id;
  const emails = user.email_addresses;
  const chosen =
    primaryId !== null
      ? emails.find((entry) => entry.id === primaryId)
      : emails[0];
  return chosen?.email_address ?? null;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

import * as Contacts from 'expo-contacts';
import { getDb } from '../db/client';
import { contacts } from '../db/schema';
import { eq } from 'drizzle-orm';
import api from '../api/client';

/** Normalize a Sri Lankan phone number to +94XXXXXXXXX format */
function normalizeSriLankanNumber(raw: string): string | null {
  const digits = raw.replace(/[\s\-().+]/g, '');

  // +94XXXXXXXXX or 94XXXXXXXXX (9 digits after country code)
  if (/^94\d{9}$/.test(digits)) return `+${digits}`;
  // 0XXXXXXXXX local format
  if (/^0\d{9}$/.test(digits)) return `+94${digits.slice(1)}`;
  // Just 9 digits starting with 7
  if (/^7\d{8}$/.test(digits)) return `+94${digits}`;

  return null;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return name.substring(0, Math.min(2, name.length)).toUpperCase();
}

export interface SyncedContact {
  name: string;
  phone: string;
  avatar: string;
  publicId: string;
  imageUrl: string;
  publicKey: string;
  pubKeyVersion: string;
}

export interface ContactSyncResult {
  contacts: SyncedContact[];
  cookieHeader: string;
}

/**
 * Fetch device contacts + unsent DB contacts, normalize Sri Lankan numbers,
 * and sync with the backend. Stores matched contacts in local DB.
 */
export async function fetchAndSyncContacts(): Promise<ContactSyncResult> {
  // 1. Read device contacts
  const { data: deviceContacts } = await Contacts.getContactsAsync({
    fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
  });

  // 2. Filter & normalize Sri Lankan mobile numbers
  const seenNumbers = new Set<string>();
  const sriLankanContacts: { name: string; phone: string; avatar: string }[] = [];

  for (const contact of deviceContacts) {
    if (!contact.phoneNumbers) continue;
    for (const phoneEntry of contact.phoneNumbers) {
      if (!phoneEntry.number) continue;
      const normalized = normalizeSriLankanNumber(phoneEntry.number);
      if (!normalized || seenNumbers.has(normalized)) continue;
      seenNumbers.add(normalized);

      const displayName = contact.name || 'Unknown';
      sriLankanContacts.push({
        name: displayName,
        phone: normalized,
        avatar: getInitials(displayName),
      });
    }
  }

  // 3. Also include DB contacts that haven't been synced yet
  const database = getDb();
  const unsyncedDbContacts = await database
    .select()
    .from(contacts)
    .where(eq(contacts.synced, false));

  for (const dbContact of unsyncedDbContacts) {
    if (!seenNumbers.has(dbContact.phone)) {
      seenNumbers.add(dbContact.phone);
      sriLankanContacts.push({
        name: dbContact.name,
        phone: dbContact.phone,
        avatar: getInitials(dbContact.name),
      });
    }
  }

  // Sort alphabetically
  sriLankanContacts.sort((a, b) =>
    a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
  );

  // 4. Build phone-only list for the API using local format (0XXXXXXXXX)
  const phoneNumbers = sriLankanContacts.map((c) => {
    if (c.phone.startsWith('+94') && c.phone.length === 12) {
      return `0${c.phone.slice(3)}`;
    }
    return c.phone; 
  });

  console.log('[ContactService] Sending contacts to server:', phoneNumbers);

  // 5. Send to backend
  const response = await api.post('/users/sync-contacts', {
    phones: phoneNumbers, 
  });

  console.log('[ContactService] Server response:', response.data);

  const apiContacts: any[] = response.data.contacts ?? [];
  const cookies: Record<string, string> = response.data.cookies ?? {};

  // 6. Build lookup map: phone -> backend data
  const phoneToData = new Map<string, { publicId: string; imageUrl: string; publicKey: string; pubKeyVersion: string }>();
  for (const entry of apiContacts) {
    if (entry.phone && entry.public_id) {
      const normalizedApiPhone = normalizeSriLankanNumber(entry.phone) ?? entry.phone;
      phoneToData.set(normalizedApiPhone, {
        publicId: entry.public_id,
        imageUrl: entry.image_url ?? '',
        publicKey: entry.public_key ?? '',
        pubKeyVersion: entry.pub_key_version ?? '',
      });
    }
  }

  // 7. Cookie header for CloudFront signed URLs
  const cookieHeader = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');

  // 8. Match local contacts with registered users
  const registeredContacts: SyncedContact[] = [];
  for (const local of sriLankanContacts) {
    const normalizedLocalPhone = normalizeSriLankanNumber(local.phone) ?? local.phone;
    const data = phoneToData.get(normalizedLocalPhone);
    if (data) {
      registeredContacts.push({
        ...local,
        publicId: data.publicId,
        imageUrl: data.imageUrl,
        publicKey: data.publicKey,
        pubKeyVersion: data.pubKeyVersion,
      });
    }
  }

  // 9. Upsert matched contacts into local DB
  for (const c of registeredContacts) {
    const existing = await database
      .select()
      .from(contacts)
      .where(eq(contacts.phone, c.phone))
      .limit(1);

    if (existing.length > 0) {
      await database
        .update(contacts)
        .set({
          name: c.name,
          publicId: c.publicId,
          imageUrl: c.imageUrl,
          publicKey: c.publicKey || existing[0].publicKey,
          pubKeyVersion: c.pubKeyVersion || existing[0].pubKeyVersion,
          synced: true,
        })
        .where(eq(contacts.phone, c.phone));
    } else {
      await database.insert(contacts).values({
        name: c.name,
        phone: c.phone,
        publicId: c.publicId,
        imageUrl: c.imageUrl,
        publicKey: c.publicKey,
        pubKeyVersion: c.pubKeyVersion,
        synced: true,
      });
    }
  }

  console.log(`[ContactService] Synced ${registeredContacts.length} matched contacts`);

  return {
    contacts: registeredContacts,
    cookieHeader,
  };
}

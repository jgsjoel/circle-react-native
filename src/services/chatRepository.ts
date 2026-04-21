import { eq, asc } from 'drizzle-orm';
import { getDb } from '../db/client';
import { contacts, chats, chatParticipants, chatMessages } from '../db/schema';

export type ChatRow = typeof chats.$inferSelect;
export type ChatMessageRow = typeof chatMessages.$inferSelect;

/**
 * Low-level DB operations for chat data.
 * Mirrors the Flutter chatService pattern: find-or-create chats,
 * save/update messages, and resolve contacts by public ID.
 */
export const chatRepository = {
  async getContactIdByPublicId(publicId: string): Promise<number | null> {
    const db = getDb();
    const rows = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(eq(contacts.publicId, publicId))
      .limit(1);
    return rows[0]?.id ?? null;
  },

  /**
   * Find an existing single chat for a given contact, or create one.
   * Also inserts a chat_participant row linking the chat to the contact.
   */
  async getOrCreateSingleChat(contactId: number, chatName: string): Promise<ChatRow> {
    const db = getDb();

    // Look for an existing chat participant row for this contact
    const existing = await db
      .select({ chatId: chatParticipants.chatId })
      .from(chatParticipants)
      .where(eq(chatParticipants.contactId, contactId))
      .limit(1);

    if (existing[0]) {
      const chat = await db
        .select()
        .from(chats)
        .where(eq(chats.id, existing[0].chatId))
        .limit(1);
      if (chat[0]) return chat[0];
    }

    // Create a new chat
    const inserted = await db
      .insert(chats)
      .values({ chatName, type: 'single', pubChatId: '', createdAt: new Date() })
      .returning();

    const newChat = inserted[0];

    // Link contact as participant
    await db.insert(chatParticipants).values({ chatId: newChat.id, contactId }).onConflictDoNothing();

    return newChat;
  },

  async getChatById(chatId: number): Promise<ChatRow | null> {
    const db = getDb();
    const rows = await db.select().from(chats).where(eq(chats.id, chatId)).limit(1);
    return rows[0] ?? null;
  },

  async updateChatPubId(chatId: number, pubChatId: string): Promise<void> {
    const db = getDb();
    await db.update(chats).set({ pubChatId }).where(eq(chats.id, chatId));
  },

  async saveMessage(params: {
    chatId: number;
    text: string;
    senderId: number;
    msgType: string;
    status?: string;
    offset?: string;
    mediaUrls?: string;
    isDownloaded?: boolean;
  }): Promise<ChatMessageRow> {
    const db = getDb();
    const inserted = await db
      .insert(chatMessages)
      .values({
        chatId: params.chatId,
        text: params.text,
        senderId: params.senderId,
        msgType: params.msgType,
        status: params.status ?? 'pending',
        pubMsgId: '',
        pubChatId: '',
        offset: params.offset ?? '',
        mediaUrls: params.mediaUrls ?? '',
        isDownloaded: params.isDownloaded ?? false,
        createdAt: new Date(),
      })
      .returning();
    return inserted[0];
  },

  /**
   * Update status / pubMsgId / pubChatId on a locally stored message after
   * a server acknowledgment (message_status WS event).
   * When skipChatIdIfSet=true, the pubChatId is only written if not already set,
   * matching the Flutter behaviour.
   */
  async updateMessageStatus(params: {
    locMsgId: number;
    pubMsgId: string;
    pubChatId: string;
    status: string;
    skipChatIdIfSet?: boolean;
  }): Promise<void> {
    const db = getDb();

    const existing = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.id, params.locMsgId))
      .limit(1);

    if (!existing[0]) return;

    const msg = existing[0];
    const patch: Partial<typeof chatMessages.$inferInsert> = { status: params.status };

    if (params.pubMsgId) patch.pubMsgId = params.pubMsgId;

    if (params.pubChatId) {
      if (!params.skipChatIdIfSet || !msg.pubChatId) {
        patch.pubChatId = params.pubChatId;
      }
    }

    await db.update(chatMessages).set(patch).where(eq(chatMessages.id, params.locMsgId));
  },

  async getMessagesForChat(chatId: number): Promise<ChatMessageRow[]> {
    const db = getDb();
    return db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.chatId, chatId))
      .orderBy(asc(chatMessages.createdAt));
  },

  /**
   * Resolve or create a contact by public ID.
   * If a contact with the same phone already exists but has no publicId,
   * it is updated in place rather than duplicated.
   */
  async getOrCreateContactByPublicId(
    publicId: string,
    name: string,
    phone: string,
  ): Promise<number> {
    const db = getDb();

    // Already exists by publicId
    const byPublicId = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(eq(contacts.publicId, publicId))
      .limit(1);
    if (byPublicId[0]) return byPublicId[0].id;

    // Try to claim an existing contact by phone (synced without publicId match)
    if (phone) {
      const byPhone = await db
        .select({ id: contacts.id, name: contacts.name })
        .from(contacts)
        .where(eq(contacts.phone, phone))
        .limit(1);
      if (byPhone[0]) {
        await db
          .update(contacts)
          .set({ publicId, name: name || byPhone[0].name })
          .where(eq(contacts.id, byPhone[0].id));
        return byPhone[0].id;
      }
    }

    // Create a new contact
    const inserted = await db
      .insert(contacts)
      .values({ name: name || phone, phone: phone || publicId, publicId, synced: false })
      .returning({ id: contacts.id });
    return inserted[0].id;
  },
};

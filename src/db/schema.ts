import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const contacts = sqliteTable('contacts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  phone: text('phone').notNull().unique(),
  publicId: text('public_id').default(''),
  imageUrl: text('image_url').default(''),
  key: text('key').default(''),
  publicKey: text('public_key').default(''),
  pubKeyVersion: text('pub_key_version').default(''),
  synced: integer('synced', { mode: 'boolean' }).default(false),
});

export const chats = sqliteTable('chats', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  pubChatId: text('pub_chat_id').default(''),
  type: text('type').default('single'),
  chatName: text('chat_name').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const chatParticipants = sqliteTable('chat_participants', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  chatId: integer('chat_id').notNull(),
  contactId: integer('contact_id').notNull(),
});

export const chatMessages = sqliteTable('chat_messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  chatId: integer('chat_id').notNull(),
  senderId: integer('sender_id').notNull().default(0),
  text: text('text').default(''),
  msgType: text('msg_type').default('text'),
  status: text('status').default('pending'),
  pubMsgId: text('pub_msg_id').default(''),
  pubChatId: text('pub_chat_id').default(''),
  offset: text('offset').default(''),
  mediaUrls: text('media_urls').default(''),
  isDownloaded: integer('is_downloaded', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

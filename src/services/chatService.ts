/**
 * Chat Service - Handles all business logic for chat operations
 * 
 * This service layer manages:
 * - Chat session initialization (resolve/create contacts and chats)
 * - Message sending (text and media)
 * - Message status updates
 * - WebSocket communication
 * 
 * State management is delegated to the Zustand store.
 */

import * as SecureStore from 'expo-secure-store';
import { wsService } from './websocket';
import { chatRepository, type ChatMessageRow, type ChatRow } from './chatRepository';
import {
  uploadMediaToS3,
  type SelectedMediaForUpload,
  type UploadProgress,
} from './mediaUploadService';
import type { ChatMessage, ChatSession, SelectedMedia } from '../store/chatStore';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface OpenChatParams {
  recipientPublicId: string;
  recipientName: string;
  recipientMobile: string;
  privateChatId?: number;
  pubChatId?: string;
}

export interface MediaSendResult {
  uploadedMedia: Array<{ s3_key: string }>;
  thumbnails: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mapRow(row: ChatMessageRow): ChatMessage {
  return {
    id: row.id,
    chatId: row.chatId,
    text: row.text ?? '',
    fromMe: row.senderId === 0,
    status: row.status ?? 'pending',
    pubMsgId: row.pubMsgId ?? '',
    msgType: row.msgType ?? 'text',
    mediaUrls: row.mediaUrls ?? '',
    createdAt: row.createdAt,
  };
}

/**
 * Generate a UUID v4-like string.
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ─── Chat Session Management ─────────────────────────────────────────────────

/**
 * Initialize a chat session: resolve/create contact and chat in DB,
 * load persisted messages.
 */
export async function initializeChatSession(
  params: OpenChatParams,
): Promise<{
  session: ChatSession;
  messages: ChatMessage[];
}> {
  const { recipientPublicId, recipientName, recipientMobile, privateChatId, pubChatId } = params;

  // 1. Resolve or create the contact in the DB
  let contactId = await chatRepository.getContactIdByPublicId(recipientPublicId);
  if (contactId === null) {
    contactId = await chatRepository.getOrCreateContactByPublicId(
      recipientPublicId,
      recipientName,
      recipientMobile,
    );
  }

  // 2. Resolve or create the chat
  let chat: ChatRow;
  if (privateChatId && privateChatId > 0) {
    chat =
      (await chatRepository.getChatById(privateChatId)) ??
      (await chatRepository.getOrCreateSingleChat(contactId, recipientName));
  } else {
    chat = await chatRepository.getOrCreateSingleChat(contactId, recipientName);
  }

  // 3. Prefer pubChatId from the navigator param if the DB row is still empty
  const resolvedPubChatId = pubChatId || chat.pubChatId || '';

  const session: ChatSession = {
    chatId: chat.id,
    pubChatId: resolvedPubChatId,
    recipientPublicId,
    recipientName,
    recipientMobile,
  };

  // 4. Load persisted messages
  const rows = await chatRepository.getMessagesForChat(chat.id);
  const messages = rows.map(mapRow);

  return { session, messages };
}

// ─── Text Message Sending ────────────────────────────────────────────────────

export interface TextMessageResult {
  locMsgId: number;
  message: ChatMessage;
}

/**
 * Send a text-only message:
 * 1. Persist to DB
 * 2. Add to in-memory store
 * 3. Build and send WS payload
 */
export async function sendTextMessage(
  session: ChatSession,
  caption: string,
): Promise<TextMessageResult> {
  const myPublicId = (await SecureStore.getItemAsync('user_id')) ?? '';
  const myMobile = (await SecureStore.getItemAsync('mobile')) ?? '';

  // Persist to DB
  const saved = await chatRepository.saveMessage({
    chatId: session.chatId,
    text: caption,
    senderId: 0,
    msgType: 'text',
    status: 'pending',
  });

  const message = mapRow(saved);
  const locMsgId = saved.id;

  // Send WS payload
  const payload = {
    message_type: 'message',
    body: {
      from: myPublicId,
      to: session.recipientPublicId,
      pub_chat_id: session.pubChatId,
      private_chat_id: session.chatId.toString(),
      loc_msg_id: locMsgId.toString(),
      content: {
        message: caption,
        sender_mobile: myMobile,
        timestamp: new Date().toISOString(),
        attachments: [],
      },
    },
  };

  console.log('[ChatService] Sending text message payload:', payload);
  wsService.send(payload);

  return { locMsgId, message };
}

// ─── Media Message Sending ──────────────────────────────────────────────────

export interface MediaMessageResult {
  locMsgId: number;
  message: ChatMessage;
  onProgress: (callback: (progress: number) => void) => void;
}

/**
 * Send a media message:
 * 1. Persist to DB
 * 2. Upload to S3 with progress tracking
 * 3. Build and send WS payload with S3 references
 */
export async function sendMediaMessage(
  session: ChatSession,
  selectedMedia: SelectedMedia[],
  caption: string,
  onProgress?: (progress: number) => void,
): Promise<MediaMessageResult> {
  const myPublicId = (await SecureStore.getItemAsync('user_id')) ?? '';
  const myMobile = (await SecureStore.getItemAsync('mobile')) ?? '';

  // Determine message type based on media
  const types = new Set(selectedMedia.map((m) => m.type));
  const msgType =
    types.size === 1
      ? types.has('photo')
        ? 'image'
        : types.has('video')
          ? 'video'
          : 'file'
      : 'media';

  const mediaUrls = JSON.stringify(
    selectedMedia.map((m) => ({
      uri: m.uri,
      type: m.type,
      filename: m.filename,
      mimeType: m.mimeType,
    })),
  );

  // 1. Persist to DB
  const saved = await chatRepository.saveMessage({
    chatId: session.chatId,
    text: caption,
    senderId: 0,
    msgType,
    status: 'pending',
    mediaUrls,
  });

  const message = mapRow(saved);
  const locMsgId = saved.id;

  // 2. Upload media to S3 with progress tracking
  console.log('[ChatService] Starting media upload for message', locMsgId);

  const mediaForUpload: SelectedMediaForUpload[] = selectedMedia.map((m) => ({
    uri: m.uri,
    type: m.type,
    filename: m.filename ?? 'file',
    mimeType: m.mimeType ?? 'application/octet-stream',
  }));

  const uploadResults = await uploadMediaToS3(
    mediaForUpload,
    msgType as 'image' | 'video' | 'file',
    (progress: UploadProgress) => {
      const totalProgress =
        ((progress.fileIndex + progress.bytesTransferred / progress.totalBytes) /
          mediaForUpload.length) *
        100;
      onProgress?.(Math.min(totalProgress, 99));
    },
  );

  console.log('[ChatService] Media upload complete:', uploadResults);

  // 3. Build WS payload
  const pubMessageId = generateUUID();
  const thumbnails = uploadResults
    .map((r) => r.blurhash)
    .filter((b) => b && b.length > 0);

  const attachments = uploadResults.map((r) => ({
    s3_key: r.s3_key,
  }));

  const payload = {
    message_type: 'message',
    body: {
      loc_msg_id: locMsgId.toString(),
      from: myPublicId,
      to: session.recipientPublicId,
      private_chat_id: session.chatId.toString(),
      pub_chat_id: session.pubChatId,
      pub_message_id: pubMessageId,
      sender_name: session.recipientName,
      content: {
        message: caption,
        sender_mobile: myMobile,
        metadata: {
          type: msgType,
          thumbnail: thumbnails,
        },
      },
      attachments,
    },
  };

  console.log('[ChatService] Sending media message payload:', payload);
  wsService.send(payload);

  // Notify final progress
  onProgress?.(100);

  return { locMsgId, message, onProgress: (callback) => callback(100) };
}

// ─── Message Status Updates ─────────────────────────────────────────────────

export interface MessageStatusUpdate {
  locMsgId: number;
  pubMsgId: string;
  pubChatId: string;
  status: string;
}

/**
 * Handle incoming message status update from WS:
 * 1. Persist status change to DB (fire-and-forget)
 * 2. Return updated session pubChatId if applicable
 */
export async function handleMessageStatusUpdate(update: MessageStatusUpdate): Promise<{
  pubChatIdToSync?: string;
}> {
  const { locMsgId, pubMsgId, pubChatId, status } = update;

  // Persist to DB (fire-and-forget)
  chatRepository
    .updateMessageStatus({ locMsgId, pubMsgId, pubChatId, status, skipChatIdIfSet: true })
    .catch(console.error);

  return { pubChatIdToSync: pubChatId };
}

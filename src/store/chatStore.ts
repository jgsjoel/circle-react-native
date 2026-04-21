import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { wsService } from '../services/websocket';
import { chatRepository, type ChatMessageRow, type ChatRow } from '../services/chatRepository';

// ─── Public types ────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: number;
  chatId: number;
  text: string;
  fromMe: boolean;
  status: string;
  pubMsgId: string;
  msgType: string;
  mediaUrls: string;
  createdAt: Date;
}

export interface ChatSession {
  chatId: number;
  pubChatId: string;
  recipientPublicId: string;
  recipientName: string;
  recipientMobile: string;
}

// ─── Store shape ─────────────────────────────────────────────────────────────

interface ChatStoreState {
  session: ChatSession | null;
  messages: ChatMessage[];
  draft: string;
  isLoading: boolean;

  /**
   * Initialize a chat session: resolve / create the DB chat, load persisted
   * messages, and set the active session so incoming WS messages are routed
   * to the correct conversation.
   */
  openChat: (params: {
    recipientPublicId: string;
    recipientName: string;
    recipientMobile: string;
    privateChatId?: number;
    pubChatId?: string;
  }) => Promise<void>;

  closeChat: () => void;
  setDraft: (text: string) => void;

  /**
   * Persist the current draft to DB, send via WebSocket, and optimistically
   * add the message to the in-memory list.
   */
  sendTextMessage: () => Promise<void>;

  // ── Called by wsMessageHandler ──────────────────────────────────────────
  _onMessageStatus: (params: {
    locMsgId: number;
    pubMsgId: string;
    pubChatId: string;
    status: string;
  }) => void;
  _onIncomingMessage: (msg: ChatMessage) => void;
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

// ─── Store ───────────────────────────────────────────────────────────────────

export const useChatStore = create<ChatStoreState>((set, get) => ({
  session: null,
  messages: [],
  draft: '',
  isLoading: false,

  openChat: async ({ recipientPublicId, recipientName, recipientMobile, privateChatId, pubChatId }) => {
    set({ isLoading: true, messages: [], draft: '' });

    try {
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

      set({ session, messages: rows.map(mapRow), isLoading: false });
    } catch (e) {
      console.error('[ChatStore] openChat error:', e);
      set({ isLoading: false });
    }
  },

  closeChat: () => set({ session: null, messages: [], draft: '' }),

  setDraft: (text) => set({ draft: text }),

  sendTextMessage: async () => {
    const { session, draft } = get();
    if (!session || !draft.trim()) return;

    const text = draft.trim();
    set({ draft: '' });

    // Read current user credentials
    const myPublicId = (await SecureStore.getItemAsync('user_id')) ?? '';
    const myMobile = (await SecureStore.getItemAsync('mobile')) ?? '';

    // Persist the outgoing message first (status: pending)
    let locMsgId = 0;
    try {
      const saved = await chatRepository.saveMessage({
        chatId: session.chatId,
        text,
        senderId: 0, // 0 = current user
        msgType: 'text',
        status: 'pending',
      });
      locMsgId = saved.id;

      // Optimistically add to UI
      set((state) => ({ messages: [...state.messages, mapRow(saved)] }));
    } catch (e) {
      console.error('[ChatStore] saveMessage error:', e);
    }

    // Build and send the WebSocket payload — matches the Flutter format exactly
    const payload = {
      message_type: 'message',
      body: {
        from: myPublicId,
        to: session.recipientPublicId,
        pub_chat_id: session.pubChatId,
        private_chat_id: session.chatId.toString(),
        loc_msg_id: locMsgId.toString(),
        content: {
          message: text,
          sender_mobile: myMobile,
          timestamp: new Date().toISOString(),
          attachments: [],
        },
      },
    };

    console.log('[ChatStore] Sending message payload:', payload);
    wsService.send(payload);
  },

  // ── WS callbacks (called from wsMessageHandler) ──────────────────────────

  _onMessageStatus: ({ locMsgId, pubMsgId, pubChatId, status }) => {
    // Update the DB row (fire-and-forget; UI is authoritative for the session)
    chatRepository
      .updateMessageStatus({ locMsgId, pubMsgId, pubChatId, status, skipChatIdIfSet: true })
      .catch(console.error);

    // Propagate pubChatId to the active session if not yet set
    const { session } = get();
    if (session && pubChatId && !session.pubChatId) {
      set({ session: { ...session, pubChatId } });
    }

    // Update status on the in-memory message
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === locMsgId
          ? { ...m, status, pubMsgId: pubMsgId || m.pubMsgId }
          : m,
      ),
    }));
  },

  _onIncomingMessage: (msg) => {
    const { session } = get();
    // Only render messages that belong to the currently open chat
    if (session && msg.chatId === session.chatId) {
      set((state) => ({ messages: [...state.messages, msg] }));
    }
  },
}));


import { create } from 'zustand';
import {
  initializeChatSession,
  sendTextMessage,
  sendMediaMessage,
  handleMessageStatusUpdate,
  type OpenChatParams,
} from '../services/chatService';

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

export interface SelectedMedia {
  uri: string;
  type: 'photo' | 'video' | 'file';
  filename?: string;
  duration?: number; // for videos in seconds
  mimeType?: string;
}

// ─── Store shape ─────────────────────────────────────────────────────────────

interface UploadingMessage {
  locMsgId: number;
  progress: number; // 0-100
}

interface ChatStoreState {
  session: ChatSession | null;
  messages: ChatMessage[];
  draft: string;
  isLoading: boolean;
  selectedMedia: SelectedMedia[];
  uploadingMessages: Map<number, UploadingMessage>;

  // ── State Management Actions ────────────────────────────────────────────
  openChat: (params: OpenChatParams) => Promise<void>;
  closeChat: () => void;
  setDraft: (text: string) => void;
  addSelectedMedia: (media: SelectedMedia[]) => void;
  clearSelectedMedia: () => void;
  sendTextMessage: () => Promise<void>;
  sendMediaMessage: () => Promise<void>;

  // ── Called by wsMessageHandler ──────────────────────────────────────────
  _onMessageStatus: (params: {
    locMsgId: number;
    pubMsgId: string;
    pubChatId: string;
    status: string;
  }) => void;
  _onIncomingMessage: (msg: ChatMessage) => void;
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useChatStore = create<ChatStoreState>((set, get) => ({
  session: null,
  messages: [],
  draft: '',
  isLoading: false,
  selectedMedia: [],
  uploadingMessages: new Map(),

  // ── Open Chat Session ──────────────────────────────────────────────────
  openChat: async (params) => {
    set({ isLoading: true, messages: [], draft: '' });

    try {
      const { session, messages } = await initializeChatSession(params);
      set({ session, messages, isLoading: false });
    } catch (e) {
      console.error('[ChatStore] openChat error:', e);
      set({ isLoading: false });
    }
  },

  setDraft: (text) => set({ draft: text }),

  addSelectedMedia: (media) => set((state) => ({ selectedMedia: [...state.selectedMedia, ...media] })),

  clearSelectedMedia: () => set({ selectedMedia: [] }),

  // ── Send Text Message ─────────────────────────────────────────────────
  sendTextMessage: async () => {
    const { session, draft } = get();
    if (!session || draft.trim().length === 0) return;

    const caption = draft.trim();
    set({ draft: '' });

    try {
      const { locMsgId, message } = await sendTextMessage(session, caption);
      set((state) => ({ messages: [...state.messages, message] }));
    } catch (e) {
      console.error('[ChatStore] sendTextMessage error:', e);
      // Restore draft on error
      set({ draft: caption });
    }
  },

  // ── Send Media Message ────────────────────────────────────────────────
  sendMediaMessage: async () => {
    const { session, draft, selectedMedia } = get();
    if (!session || selectedMedia.length === 0) return;

    const caption = draft.trim();
    const mediaToSend = [...selectedMedia];

    set({ draft: '', selectedMedia: [] });

    try {
      const { locMsgId, message } = await sendMediaMessage(session, mediaToSend, caption, (progress) => {
        set((state) => {
          const updated = new Map(state.uploadingMessages);
          if (progress === 100) {
            updated.delete(locMsgId);
          } else {
            updated.set(locMsgId, { locMsgId, progress });
          }
          return { uploadingMessages: updated };
        });
      });

      set((state) => ({ messages: [...state.messages, message] }));
    } catch (e) {
      console.error('[ChatStore] sendMediaMessage error:', e);
      // Restore state on error
      set({ draft: caption, selectedMedia: mediaToSend });
    }
  },

  // ── Close Chat Session ────────────────────────────────────────────────
  closeChat: () => set({
    session: null,
    messages: [],
    draft: '',
    selectedMedia: [],
    uploadingMessages: new Map(),
  }),

  // ── WebSocket Callbacks ────────────────────────────────────────────────
  _onMessageStatus: async ({ locMsgId, pubMsgId, pubChatId, status }) => {
    const { session } = get();

    // Persist status change to DB and get any pubChatId sync needs
    const { pubChatIdToSync } = await handleMessageStatusUpdate({
      locMsgId,
      pubMsgId,
      pubChatId,
      status,
    });

    // Propagate pubChatId to the active session if needed
    if (session && pubChatIdToSync && !session.pubChatId) {
      set({ session: { ...session, pubChatId: pubChatIdToSync } });
    }

    // Update message status in state
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


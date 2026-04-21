import { chatRepository } from './chatRepository';

/**
 * Dispatches incoming WebSocket messages to the appropriate handler
 * based on the `message_type` field in the envelope.
 *
 * Mirrors the Flutter WebSocketMessageHandler design:
 *   - message_status  → update local message row (pubMsgId, pubChatId, status)
 *   - message         → find/create contact+chat, save message, notify store
 */
class WsMessageHandler {
  /** Called after each processed offset so the WS service can track replay position. */
  onOffsetReceived: ((offset: string) => void) | null = null;

  handle(raw: string): void {
    console.log('[WSHandler] ← RAW incoming:', raw);

    let envelope: Record<string, unknown>;
    try {
      envelope = JSON.parse(raw) as Record<string, unknown>;
    } catch (e) {
      console.log('[WSHandler] Failed to decode message:', e);
      return;
    }

    const messageType = (envelope['message_type'] as string | undefined) ?? '';
    console.log('[WSHandler] Handling message_type:', messageType);

    switch (messageType) {
      case 'message_status':
        this._handleMessageStatus(envelope);
        break;
      case 'message':
        this._handleIncomingMessage(envelope);
        break;
      default:
        console.log('[WSHandler] Unknown message_type:', messageType);
    }
  }

  /**
   * Handle server acknowledgment of a sent message.
   * Updates pubChatId, pubMsgId, and status on the local message row,
   * then notifies the chat store so the UI reflects the new status.
   */
  private _handleMessageStatus(envelope: Record<string, unknown>): void {
    const body = (envelope['body'] as Record<string, unknown> | undefined) ?? {};

    const messageIdStr = (body['message_id'] as string | undefined) ?? '';
    const pubChatId = (body['pub_chat_id'] as string | undefined) ?? '';
    const pubMsgId = (body['pub_msg_id'] as string | undefined) ?? '';
    const status = ((body['msg_status'] as string | undefined) ?? '').toLowerCase();

    const locMsgId = parseInt(messageIdStr, 10);
    if (Number.isNaN(locMsgId)) {
      console.log('[WSHandler] message_status: invalid message_id=', messageIdStr);
      return;
    }

    console.log('[WSHandler] message_status: locMsgId=', locMsgId, 'pubMsgId=', pubMsgId, 'status=', status);

    // Lazy import to avoid circular dependency at module load time
    const { useChatStore } = require('../store/chatStore') as typeof import('../store/chatStore');
    useChatStore.getState()._onMessageStatus({ locMsgId, pubMsgId, pubChatId, status });
  }

  /**
   * Handle an incoming message from another user.
   * Delegates to async processing so the WS callback returns immediately.
   */
  private _handleIncomingMessage(envelope: Record<string, unknown>): void {
    const body = (envelope['body'] as Record<string, unknown> | undefined) ?? {};
    const offset = (envelope['offset'] as string | undefined) ?? '';

    const senderId = (body['sender_id'] as string | undefined) ?? '';
    const pubChatId = (body['pub_chat_id'] as string | undefined) ?? '';
    const pubMsgId = (body['pub_message_id'] as string | undefined) ?? '';
    const senderName = (body['sender_name'] as string | undefined) ?? '';

    const contentRaw = body['content'];
    let content: Record<string, unknown>;

    if (typeof contentRaw === 'string') {
      try {
        content = JSON.parse(contentRaw) as Record<string, unknown>;
      } catch (e) {
        console.log('[WSHandler] Failed to decode content string:', e);
        return;
      }
    } else if (contentRaw && typeof contentRaw === 'object') {
      content = contentRaw as Record<string, unknown>;
    } else {
      console.log('[WSHandler] Unknown content format');
      return;
    }

    const message = (content['message'] as string | undefined) ?? '';
    const senderPhone = (content['sender_mobile'] as string | undefined) ?? '';

    console.log('[WSHandler] Incoming message: from=', senderId, 'pubChatId=', pubChatId, 'pubMsgId=', pubMsgId);

    this._processIncomingMessage({
      senderId,
      senderName,
      senderPhone,
      pubChatId,
      pubMsgId,
      message,
      offset,
    }).catch((e) => console.error('[WSHandler] Error processing incoming message:', e));
  }

  private async _processIncomingMessage(params: {
    senderId: string;
    senderName: string;
    senderPhone: string;
    pubChatId: string;
    pubMsgId: string;
    message: string;
    offset: string;
  }): Promise<void> {
    const { senderId, senderName, senderPhone, pubChatId, pubMsgId, message, offset } = params;

    // Resolve or create the sender contact
    let contactId = await chatRepository.getContactIdByPublicId(senderId);
    if (contactId === null) {
      console.log('[WSHandler] Unknown sender publicId=', senderId, '— creating new contact');
      contactId = await chatRepository.getOrCreateContactByPublicId(
        senderId,
        senderName || senderPhone,
        senderPhone,
      );
    }

    // Find or create a single chat with this contact
    const contactName = senderName || senderPhone;
    const chat = await chatRepository.getOrCreateSingleChat(contactId, contactName);

    // Persist pubChatId on the chat if not already set
    if (pubChatId && !chat.pubChatId) {
      await chatRepository.updateChatPubId(chat.id, pubChatId);
    }

    // Persist the message
    const saved = await chatRepository.saveMessage({
      chatId: chat.id,
      text: message,
      senderId: contactId,
      msgType: 'text',
      status: 'delivered',
      offset,
    });

    // Update pubMsgId / pubChatId on the saved row
    if (pubMsgId) {
      await chatRepository.updateMessageStatus({
        locMsgId: saved.id,
        pubMsgId,
        pubChatId,
        status: 'delivered',
      });
    }

    // Notify the chat store so the UI re-renders if this chat is open
    const { useChatStore } = require('../store/chatStore') as typeof import('../store/chatStore');
    useChatStore.getState()._onIncomingMessage({
      id: saved.id,
      chatId: saved.chatId,
      text: saved.text ?? '',
      fromMe: false,
      status: 'delivered',
      pubMsgId: pubMsgId,
      msgType: 'text',
      mediaUrls: '',
      createdAt: saved.createdAt,
    });

    if (offset && this.onOffsetReceived) {
      this.onOffsetReceived(offset);
    }
  }
}

export const wsMessageHandler = new WsMessageHandler();

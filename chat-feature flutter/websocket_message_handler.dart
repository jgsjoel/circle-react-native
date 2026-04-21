import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:circle/core/service_locator.dart';
import 'package:circle/data/models/contact_entity.dart';

/// Dispatches incoming WebSocket messages to the appropriate handler
/// based on the `message_type` field in the envelope.
class WebSocketMessageHandler {
  /// Called whenever a new offset is received so the WS service can track it.
  void Function(String offset)? onOffsetReceived;

  /// Process a raw WebSocket message string.
  void handle(String raw) {
    debugPrint('[WSHandler] ← RAW incoming: $raw');

    final Map<String, dynamic> envelope;
    try {
      envelope = jsonDecode(raw) as Map<String, dynamic>;
    } catch (e) {
      debugPrint('[WSHandler] Failed to decode message: $e');
      return;
    }

    final messageType = envelope['message_type'] as String? ?? '';
    debugPrint('[WSHandler] Handling message_type: $messageType');

    switch (messageType) {
      case 'message_status':
        _handleMessageStatus(envelope);
        break;
      case 'message':
        _handleIncomingMessage(envelope);
        break;
      default:
        debugPrint('[WSHandler] Unknown message_type: $messageType');
    }
  }

  /// Handle server acknowledgment of a sent message.
  /// Updates pubChatId, pubMsgId, and status on the local message.
  void _handleMessageStatus(Map<String, dynamic> envelope) {
    final body = envelope['body'] as Map<String, dynamic>? ?? {};

    final messageIdStr = body['message_id'] as String? ?? '';
    final pubChatId = body['pub_chat_id'] as String? ?? '';
    final pubMsgId = body['pub_msg_id'] as String? ?? '';
    final status = (body['msg_status'] as String? ?? '').toLowerCase();

    final locMsgId = int.tryParse(messageIdStr);
    if (locMsgId == null) {
      debugPrint('[WSHandler] message_status: invalid message_id=$messageIdStr');
      return;
    }

    debugPrint(
      '[WSHandler] message_status: locMsgId=$locMsgId, '
      'pubMsgId=$pubMsgId, pubChatId=$pubChatId, status=$status',
    );

    sl.chatService.updateMessageStatus(
      locMsgId: locMsgId,
      pubMsgId: pubMsgId,
      pubChatId: pubChatId,
      status: status,
      skipChatIdIfSet: true,
    );
  }

  /// Handle an incoming message from another user.
  void _handleIncomingMessage(Map<String, dynamic> envelope) {
    final body = envelope['body'] as Map<String, dynamic>? ?? {};
    final offset = envelope['offset'] as String? ?? '';

    final senderId = body['sender_id'] as String? ?? '';
    final pubChatId = body['pub_chat_id'] as String? ?? '';
    final pubMsgId = body['pub_message_id'] as String? ?? '';

    // Parse the content - it can be either a string (old format) or a map (new format)
    final contentRaw = body['content'];
    final Map<String, dynamic> content;
    
    if (contentRaw is String) {
      // Old format: content is a JSON string
      try {
        content = jsonDecode(contentRaw) as Map<String, dynamic>;
      } catch (e) {
        debugPrint('[WSHandler] Failed to decode content: $e');
        return;
      }
    } else if (contentRaw is Map<String, dynamic>) {
      // New format: content is already a map
      content = contentRaw;
    } else {
      debugPrint('[WSHandler] Unknown content format');
      return;
    }

    final message = content['message'] as String? ?? '';
    final senderPhone = content['sender_mobile'] as String? ?? '';
    final senderName = body['sender_name'] as String? ?? '';
    
    // Extract metadata
    final metadata = content['metadata'] as Map<String, dynamic>? ?? {};
    final metadataType = metadata['type'] as String? ?? 'file';
    final blurhashList = metadata['thumbnail'] as List<dynamic>? ?? [];
    final blurhashes =
        blurhashList.map((e) => e.toString()).toList();

    // Extract attachments if present
    final attachmentsList = body['attachments'] as List<dynamic>? ?? [];
    final attachments = <String>[]; // Store s3_keys as mediaUrls
    for (final att in attachmentsList) {
      if (att is Map<String, dynamic>) {
        final s3Key = att['s3_key'] as String? ?? '';
        if (s3Key.isNotEmpty) {
          attachments.add(s3Key);
        }
      }
    }

    debugPrint(
      '[WSHandler] Incoming message from=$senderId, '
      'pubChatId=$pubChatId, pubMsgId=$pubMsgId, offset=$offset, '
      'attachments=${attachments.length}, type=$metadataType, blurhashes=${blurhashes.length}',
    );

    // Try to resolve the sender's local Contact ID
    int? contactId = sl.chatService.getContactIdByPublicId(senderId);
    if (contactId == null) {
      // Create a new Contact for this sender
      final contactBox = sl.objectBoxStore.store.box<Contact>();
      debugPrint('[WSHandler] Unknown sender publicId=$senderId, creating new contact');
      final newContact = Contact(
        name: senderName.isNotEmpty ? senderName : senderPhone,
        phone: senderPhone,
        publicId: senderId,
        imageUrl: '',
      );
      contactId = contactBox.put(newContact);
      debugPrint('[WSHandler] Created new contact for unknown sender: $senderId, id=$contactId');
    }

    // Find or create a chat with this contact
    final contact = sl.objectBoxStore.store.box<Contact>().get(contactId);
    final contactName = contact?.name ?? senderPhone;

    final chat = sl.chatService.getOrCreateSingleChat(
      contactId: contactId,
      chatName: contactName,
    );

    // Update pubChatId if provided
    if (pubChatId.isNotEmpty && chat.pubChatId.isEmpty) {
      sl.chatService.updateChatPubId(chat.id, pubChatId);
    }

    // Determine message type based on attachments or metadata
    final msgType = blurhashes.isNotEmpty || attachments.isNotEmpty ? 'media' : 'text';
    
    // Save message with offset and blurhashes (will be stored in mediaUrls field)
    // Attachments are stored separately for reference but display uses blurhashes until downloaded
    final saved = sl.chatService.saveMessage(
      chatId: chat.id,
      message: message,
      senderId: contactId,
      msgType: msgType,
      offset: offset,
      blurhashes: blurhashes, // Stored in mediaUrls field (UI will parse based on isDownloaded flag)
      metadataType: metadataType,
      isDownloaded: false, // Received messages not yet downloaded
    );

    // Update pubMsgId on the saved message
    if (pubMsgId.isNotEmpty) {
      sl.chatService.updateMessageStatus(
        locMsgId: saved.id,
        pubMsgId: pubMsgId,
        pubChatId: pubChatId,
        status: 'delivered',
      );
    }

    // Update offset if provided
    if (offset.isNotEmpty && onOffsetReceived != null) {
      onOffsetReceived!(offset);
    }
  }

}

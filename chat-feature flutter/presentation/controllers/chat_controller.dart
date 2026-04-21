import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:circle/core/service_locator.dart';
import 'package:circle/core/services/user_session.dart';
import 'package:circle/data/models/chat_entity.dart';
import '../../data/models/message.dart';
import '../../data/services/chat_api_service.dart';

class ChatController extends ChangeNotifier {
  final String recipientId;
  final String recipientName;
  final int privateChatId;
  final String pubChatIdArg;
  
  final ChatApiService _apiService = ChatApiService();
  final List<Message> messages = [];
  
  Chat? _chat;
  int? _contactId;
  String _pubChatId = '';
  StreamSubscription? _messageWatchSub;
  DateTime? _lastProgressUpdate;
  
  // Expose contactId for accessing contact info
  int? get contactId => _contactId;
  
  static const int _maxSizeBytes = 150 * 1024 * 1024;

  ChatController({
    required this.recipientId,
    required this.recipientName,
    required this.privateChatId,
    required this.pubChatIdArg,
  });

  Future<void> initialize() async {
    _initChat();
    await _loadMessages();
  }

  void _initChat() {
    _contactId = sl.chatService.getContactIdByPublicId(recipientId);
    if (_contactId == null) return;

    if (privateChatId > 0) {
      _chat = sl.chatService.getChatById(privateChatId);
    }

    _chat ??= sl.chatService.getOrCreateSingleChat(
      contactId: _contactId!,
      chatName: recipientName,
    );

    _pubChatId = pubChatIdArg.isNotEmpty
        ? pubChatIdArg
        : (_chat?.pubChatId ?? '');

    _messageWatchSub = sl.chatService
        .watchMessagesForChat(_chat!.id)
        .listen((_) => _loadMessages());
  }

  Future<void> _loadMessages() async {
    if (_chat == null) return;

    if (_pubChatId.isEmpty) {
      final freshChat = sl.chatService.getChatById(_chat!.id);
      if (freshChat != null && freshChat.pubChatId.isNotEmpty) {
        _pubChatId = freshChat.pubChatId;
      }
    }

    final stored = sl.chatService.getMessagesForChat(_chat!.id);

    final newMessages = <Message>[];
    for (final m in stored) {
      final mediaAttachments = <MediaAttachment>[];
      final blurhashes = <String>[];

      if ((m.msgType == 'media' || m.msgType == 'file') &&
          m.mediaUrls.isNotEmpty) {
        try {
          final content = Uri.decodeComponent(m.mediaUrls).split('|||');

          if (m.isDownloaded) {
            for (final url in content) {
              if (url.isNotEmpty) {
                mediaAttachments.add(
                  MediaAttachment(
                    filePath: url,
                    isVideo:
                        url.toLowerCase().endsWith('.mp4') ||
                        url.toLowerCase().endsWith('.mov'),
                  ),
                );
              }
            }
          } else {
            for (final hash in content) {
              if (hash.isNotEmpty) {
                blurhashes.add(hash);
              }
            }
          }
        } catch (e) {
          debugPrint('Error parsing media content: $e');
        }
      }

      newMessages.add(
        Message(
          text: m.message,
          isMe: m.senderId == 0,
          type: (m.msgType == 'media' || m.msgType == 'file')
              ? MessageType.media
              : MessageType.text,
          mediaAttachments: mediaAttachments,
          status: m.status,
          timestamp: m.sentAt,
          isDownloaded: m.isDownloaded,
          blurhashes: blurhashes,
          metadataType: m.metadataType,
        ),
      );
    }

    messages.clear();
    messages.addAll(newMessages);
    notifyListeners();
  }

  Future<void> sendTextMessage(String text) async {
    if (text.trim().isEmpty) return;

    int locMsgId = 0;
    if (_chat != null) {
      final saved = sl.chatService.saveMessage(
        chatId: _chat!.id,
        message: text,
        senderId: 0,
        msgType: 'text',
      );
      locMsgId = saved.id;
    }

    messages.add(
      Message(
        text: text,
        isMe: true,
        type: MessageType.text,
        timestamp: DateTime.now(),
      ),
    );
    notifyListeners();

    final fromId = userSession.publicId ?? '';
    final senderMobile = userSession.mobileNumber ?? '';

    final payload = {
      'message_type': 'message',
      'body': {
        'from': fromId,
        'to': recipientId,
        'pub_chat_id': _pubChatId,
        'private_chat_id': _chat?.id.toString() ?? '',
        'loc_msg_id': locMsgId.toString(),
        'content': {
          'message': text,
          'sender_mobile': senderMobile,
          'timestamp': DateTime.now().toUtc().toIso8601String(),
          'attachments': [],
        },
      },
    };
    debugPrint('[ChatController] Sending message: $payload');
    sl.webSocketService.send(payload);
  }

  Future<void> sendAttachment(
    Message message,
    Function(String) onError,
  ) async {
    messages.add(message);
    notifyListeners();

    final filePaths = <String>[];
    final contentTypes = <String>[];

    if (message.type == MessageType.media) {
      for (final att in message.mediaAttachments) {
        if (att.filePath.isNotEmpty) {
          filePaths.add(att.filePath);
          contentTypes.add(att.isVideo ? 'video/mp4' : 'image/jpeg');
        }
      }
    } else if (message.type == MessageType.file) {
      final path = message.fileAttachment?.filePath;
      if (path != null && path.isNotEmpty) {
        filePaths.add(path);
        contentTypes.add('application/octet-stream');
      }
    }

    if (filePaths.isEmpty) return;

    await _uploadFiles(
      filePaths,
      contentTypes,
      message.type,
      messages.length - 1,
      onError,
    );
  }

  Future<void> _uploadFiles(
    List<String> filePaths,
    List<String> contentTypes,
    MessageType messageType,
    int messageIndex,
    Function(String) onError,
  ) async {
    try {
      int totalSize = 0;
      for (final filePath in filePaths) {
        final file = File(filePath);
        if (!await file.exists()) {
          onError('File not found: $filePath');
          messages.removeAt(messageIndex);
          notifyListeners();
          return;
        }
        totalSize += await file.length();
      }

      if (totalSize > _maxSizeBytes) {
        final sizeInMB = (totalSize / (1024 * 1024)).toStringAsFixed(2);
        onError('Files too large ($sizeInMB MB). Maximum is 150 MB');
        messages.removeAt(messageIndex);
        notifyListeners();
        return;
      }

      final userID = userSession.publicId ?? '';
      final mediaType = messageType == MessageType.media ? 'media' : 'document';
      final token = await sl.secureStorageService.getToken() ?? '';

      final presignedUrls = await _apiService.getPresignedUploadUrls(
        filePaths: filePaths,
        contentTypes: contentTypes,
        mediaType: mediaType,
        userID: userID,
        token: token,
      );

      if (presignedUrls == null || presignedUrls.isEmpty) {
        onError('Failed to get upload URLs from server');
        messages.removeAt(messageIndex);
        notifyListeners();
        return;
      }

      final s3Keys = await _apiService.uploadFilesToS3(
        filePaths: filePaths,
        presignedUrls: presignedUrls,
        contentTypes: contentTypes,
        onFileProgress: (fileIndex, sent, total) {
          if (total <= 0) return;
          final progress = sent / total;

          final now = DateTime.now();
          if (_lastProgressUpdate == null ||
              now.difference(_lastProgressUpdate!).inMilliseconds > 200) {
            if (messageIndex >= 0 && messageIndex < messages.length) {
              messages[messageIndex] = messages[messageIndex].copyWith(
                uploadProgress: progress,
              );
              notifyListeners();
              _lastProgressUpdate = now;
            }
          }
        },
      );

      if (s3Keys == null) {
        onError('Upload failed');
        messages.removeAt(messageIndex);
        notifyListeners();
        return;
      }

      _lastProgressUpdate = null;
      messages[messageIndex] = messages[messageIndex].copyWith(
        isUploading: false,
        uploadProgress: 1.0,
        status: 'pending',
      );
      notifyListeners();

      await _sendMediaMessage(messages[messageIndex], s3Keys, messageType);
    } catch (e) {
      _lastProgressUpdate = null;
      debugPrint('[ChatController] Error uploading files: $e');
      onError('Upload error: ${e.toString()}');
      if (messageIndex >= 0 && messageIndex < messages.length) {
        messages.removeAt(messageIndex);
        notifyListeners();
      }
    }
  }

  Future<void> _sendMediaMessage(
    Message message,
    Map<String, String> s3Keys,
    MessageType messageType,
  ) async {
    final filePaths = <String>[];
    if (message.type == MessageType.media) {
      for (final att in message.mediaAttachments) {
        if (att.filePath.isNotEmpty) {
          filePaths.add(att.filePath);
        }
      }
    } else if (message.type == MessageType.file) {
      final path = message.fileAttachment?.filePath;
      if (path != null && path.isNotEmpty) {
        filePaths.add(path);
      }
    }

    int locMsgId = 0;
    if (_chat != null) {
      final msgType = messageType == MessageType.media ? 'media' : 'file';
      final saved = sl.chatService.saveMessage(
        chatId: _chat!.id,
        message: message.text ?? '',
        senderId: 0,
        msgType: msgType,
        mediaUrls: filePaths,
      );
      locMsgId = saved.id;
    }

    final fromId = userSession.publicId ?? '';
    final senderMobile = userSession.mobileNumber ?? '';

    final mediaTypes = <String>{};
    final blurhashes = <String>[];

    if (message.type == MessageType.media) {
      for (final att in message.mediaAttachments) {
        mediaTypes.add(att.isVideo ? 'video' : 'image');
        if (att.blurHash != null) {
          blurhashes.add(att.blurHash!);
        }
      }
    }

    String mediaType = 'file';
    if (mediaTypes.length == 1) {
      mediaType = mediaTypes.first;
    } else if (mediaTypes.contains('image')) {
      mediaType = 'image';
    } else if (mediaTypes.contains('video')) {
      mediaType = 'video';
    }

    final List<Map<String, dynamic>> attachments = [];
    for (int i = 0; i < s3Keys.length; i++) {
      final entry = s3Keys.entries.elementAt(i);
      final attachment = <String, dynamic>{
        's3_key': entry.value,
      };
      attachments.add(attachment);
    }

    final metadata = <String, dynamic>{
      'type': mediaType,
    };

    if (message.type == MessageType.media && blurhashes.isNotEmpty) {
      metadata['thumbnail'] = blurhashes;
    }

    final payload = {
      'message_type': 'message',
      'body': {
        'from': fromId,
        'to': recipientId,
        'pub_chat_id': _pubChatId,
        'private_chat_id': _chat?.id.toString() ?? '',
        'loc_msg_id': locMsgId.toString(),
        'content': {
          'message': message.text ?? '',
          'sender_mobile': senderMobile,
          'timestamp': DateTime.now().toUtc().toIso8601String(),
          'metadata': metadata,
        },
        'attachments': attachments.isNotEmpty ? attachments : null,
      },
    };

    debugPrint('[ChatController] Sending media message: $payload');
    sl.webSocketService.send(payload);
  }

  @override
  void dispose() {
    _messageWatchSub?.cancel();
    super.dispose();
  }
}

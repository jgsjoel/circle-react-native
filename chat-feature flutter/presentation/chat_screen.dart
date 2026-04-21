import 'dart:async';
import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter_cache_manager/flutter_cache_manager.dart';
import 'package:circle/core/service_locator.dart';
import 'package:circle/data/models/contact_entity.dart';
import 'controllers/chat_controller.dart';
import 'widgets/chat_input_area.dart';
import 'widgets/message_bubble.dart';

class ChatScreen extends StatefulWidget {
  final String recipientId;
  final String recipientName;
  final int privateChatId;
  final String recipientImageUrl;
  final String pubChatId;

  const ChatScreen({
    super.key,
    required this.recipientId,
    required this.recipientName,
    this.recipientImageUrl = '',
    this.privateChatId = 0,
    this.pubChatId = '',
  });

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final TextEditingController _controller = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  final FocusNode _focusNode = FocusNode();

  late ChatController _chatController;

  static final _cacheManager = CacheManager(
    Config(
      'contact_images',
      stalePeriod: const Duration(days: 7),
      maxNrOfCacheObjects: 200,
    ),
  );

  @override
  void initState() {
    super.initState();
    _chatController = ChatController(
      recipientId: widget.recipientId,
      recipientName: widget.recipientName,
      privateChatId: widget.privateChatId,
      pubChatIdArg: widget.pubChatId,
    );
    _chatController.addListener(_onChatStateChanged);
    _initialize();
  }

  Future<void> _initialize() async {
    await _chatController.initialize();
  }

  void _onChatStateChanged() {
    _scrollToBottom();
  }

  @override
  void dispose() {
    _chatController.removeListener(_onChatStateChanged);
    _chatController.dispose();
    _controller.dispose();
    _scrollController.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeOut,
        );
      }
    });
  }

  void _showError(String error) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(error),
        backgroundColor: Colors.redAccent,
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  Contact? get _resolvedContact {
    final contactId = _chatController.contactId;
    if (contactId == null) return null;
    return sl.objectBoxStore.store.box<Contact>().get(contactId);
  }

  String get _displayName {
    final c = _resolvedContact;
    if (c == null) return widget.recipientName;
    return c.name.isNotEmpty ? c.name : c.phone;
  }

  Widget _buildRecipientAvatar() {
    final imageUrl = widget.recipientImageUrl;
    if (imageUrl.isNotEmpty) {
      final cookieHeader = sl.contactService.cookieHeader;
      return Container(
        height: 40,
        width: 40,
        decoration: const BoxDecoration(shape: BoxShape.circle),
        clipBehavior: Clip.antiAlias,
        child: CachedNetworkImage(
          imageUrl: imageUrl,
          cacheManager: _cacheManager,
          httpHeaders: cookieHeader.isNotEmpty
              ? {'Cookie': cookieHeader}
              : const {},
          fit: BoxFit.cover,
          placeholder: (context, url) => const CircleAvatar(
            radius: 20,
            backgroundColor: Colors.grey,
            child: Icon(Icons.person, color: Colors.white),
          ),
          errorWidget: (context, url, error) => const CircleAvatar(
            radius: 20,
            backgroundColor: Colors.grey,
            child: Icon(Icons.person, color: Colors.white),
          ),
        ),
      );
    }
    return const CircleAvatar(
      radius: 20,
      backgroundColor: Colors.grey,
      child: Icon(Icons.person, color: Colors.white),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0A0A0A),
      resizeToAvoidBottomInset: true,
      appBar: AppBar(
        elevation: 0,
        backgroundColor: const Color(0xFF0A0A0A),
        title: Row(
          children: [
            _buildRecipientAvatar(),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    _displayName,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  Row(
                    children: [
                      Container(
                        width: 8,
                        height: 8,
                        decoration: BoxDecoration(
                          color: Colors.green,
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 4),
                      const Text(
                        "Online",
                        style: TextStyle(color: Colors.white70, fontSize: 14),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.videocam, color: Colors.white),
            onPressed: () {},
          ),
          IconButton(
            icon: const Icon(Icons.call, color: Colors.white),
            onPressed: () {},
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            /// 💬 Messages
            Expanded(
              child: RepaintBoundary(
                child: ListenableBuilder(
                  listenable: _chatController,
                  builder: (context, _) {
                    return ListView.builder(
                      controller: _scrollController,
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      itemCount: _chatController.messages.length,
                      itemBuilder: (context, index) {
                        return MessageBubble(
                          message: _chatController.messages[index],
                        );
                      },
                    );
                  },
                ),
              ),
            ),

            /// ⌨️ Input area
            ChatInputArea(
              controller: _controller,
              focusNode: _focusNode,
              onSendText: () async {
                final text = _controller.text;
                await _chatController.sendTextMessage(text);
                _controller.clear();
              },
              onSendAttachment: (message) async {
                await _chatController.sendAttachment(message, _showError);
              },
              onError: _showError,
            ),
          ],
        ),
      ),
    );
  }
}

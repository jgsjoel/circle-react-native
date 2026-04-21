import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:photo_manager/photo_manager.dart';
import '../../../../core/services/thumbnail_generator.dart';
import '../../data/models/message.dart';
import 'media_bottom_sheet.dart';

class ChatInputArea extends StatefulWidget {
  final TextEditingController controller;
  final FocusNode focusNode;
  final VoidCallback onSendText;
  final void Function(Message message) onSendAttachment;
  final void Function(String error) onError;

  const ChatInputArea({
    super.key,
    required this.controller,
    required this.focusNode,
    required this.onSendText,
    required this.onSendAttachment,
    required this.onError,
  });

  @override
  State<ChatInputArea> createState() => _ChatInputAreaState();
}

class _ChatInputAreaState extends State<ChatInputArea> {
  List<AssetEntity> _selectedMedia = [];
  bool _showAttachmentTray = false;

  static const int _maxSizeBytes = 150 * 1024 * 1024;

  void _toggleAttachmentTray() {
    setState(() {
      _showAttachmentTray = !_showAttachmentTray;
      if (_showAttachmentTray) {
        widget.focusNode.unfocus();
      }
    });
  }

  void _clearSelectedMedia() {
    setState(() {
      _selectedMedia = [];
    });
  }

  void _openMediaBottomSheet({required bool showImages}) {
    _toggleAttachmentTray();

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF1E1E1E),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) {
        return MediaBottomSheet(
          showImages: showImages,
          onMediaSelected: ({required selectedMedia}) {
            setState(() {
              _selectedMedia = selectedMedia;
            });
          },
        );
      },
    );
  }

  Future<void> _handleMediaSend() async {
    if (_selectedMedia.isEmpty) return;

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => const AlertDialog(
        backgroundColor: Color(0xFF1E1E1E),
        content: Row(
          children: [
            CircularProgressIndicator(color: Color(0xFF64B5F6)),
            SizedBox(width: 16),
            Text(
              'Generating thumbnails...',
              style: TextStyle(color: Colors.white),
            ),
          ],
        ),
      ),
    );

    try {
      final filePaths = <String>[];
      final isVideoFlags = <bool>[];
      int totalSize = 0;

      for (final asset in _selectedMedia) {
        final file = await asset.file;
        if (file != null) {
          filePaths.add(file.path);
          isVideoFlags.add(asset.type == AssetType.video);
          if (await file.exists()) {
            totalSize += await file.length();
          }
        }
      }

      if (totalSize > _maxSizeBytes) {
        Navigator.pop(context);
        widget.onError('Cannot upload over 150 MB');
        return;
      }

      final thumbnails = <Uint8List?>[];
      for (final asset in _selectedMedia) {
        final thumbnail = await asset.thumbnailDataWithSize(
          const ThumbnailSize(200, 200),
        );
        thumbnails.add(thumbnail);
      }

      final blurhashes = <String>[];
      try {
        final results = await ThumbnailGeneratorService.generateMultiple(
          paths: filePaths,
          isVideo: isVideoFlags,
        );
        for (final r in results) {
          blurhashes.add(r?.blurHash ?? 'L5QQQ6');
        }
      } catch (e) {
        debugPrint('Blurhash generation failed: $e');
        blurhashes.addAll(List.filled(filePaths.length, 'L5QQQ6'));
      }

      final attachments = <MediaAttachment>[];
      for (int i = 0; i < filePaths.length; i++) {
        attachments.add(
          MediaAttachment(
            filePath: filePaths[i],
            thumbnail: thumbnails[i],
            isVideo: isVideoFlags[i],
            blurHash: blurhashes[i],
          ),
        );
      }

      final message = Message(
        isMe: true,
        type: MessageType.media,
        mediaAttachments: attachments,
        isUploading: true,
      );

      Navigator.pop(context);
      widget.onSendAttachment(message);

      setState(() {
        _selectedMedia = [];
      });
    } catch (e) {
      print('Error in _handleMediaSend: $e');
      Navigator.pop(context);
      widget.onError('Error processing media: $e');
    }
  }

  void _openFilePicker() async {
    Navigator.pushNamed(context, '/documents');
  }

  @override
  Widget build(BuildContext context) {
    final hasText = widget.controller.text.trim().isNotEmpty;
    final hasMedia = _selectedMedia.isNotEmpty;

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // Attachment tray
        if (_showAttachmentTray)
          Container(
            height: 180,
            color: const Color(0xFF1E1E1E),
            child: GridView.count(
              crossAxisCount: 3,
              padding: const EdgeInsets.all(12),
              children: [
                _buildAttachmentOption(
                  Icons.image,
                  "Photo",
                  Colors.purple,
                  () => _openMediaBottomSheet(showImages: true),
                ),
                _buildAttachmentOption(
                  Icons.video_file,
                  "Video",
                  Colors.pink,
                  () => _openMediaBottomSheet(showImages: false),
                ),
                _buildAttachmentOption(
                  Icons.insert_drive_file,
                  "File",
                  Colors.orange,
                  _openFilePicker,
                ),
              ],
            ),
          ),

        // Media selection ribbon
        if (hasMedia)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            color: const Color(0xFF2A2A2A),
            child: Row(
              children: [
                Icon(
                  _selectedMedia.any((a) => a.type == AssetType.video)
                      ? Icons.videocam
                      : Icons.image,
                  color: Colors.white70,
                  size: 20,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    '${_selectedMedia.length} media selected',
                    style: const TextStyle(
                      color: Colors.white70,
                      fontSize: 14,
                    ),
                  ),
                ),
                GestureDetector(
                  onTap: _clearSelectedMedia,
                  child: const Icon(
                    Icons.close,
                    color: Colors.white70,
                    size: 20,
                  ),
                ),
              ],
            ),
          ),

        // Input bar
        Container(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
          decoration: const BoxDecoration(
            border: Border(top: BorderSide(color: Colors.white12)),
          ),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: widget.controller,
                  focusNode: widget.focusNode,
                  onChanged: (_) => setState(() {}),
                  style: const TextStyle(color: Colors.white),
                  cursorColor: Colors.white,
                  decoration: InputDecoration(
                    hintText: "Type a message...",
                    hintStyle: const TextStyle(color: Colors.white54),
                    filled: true,
                    fillColor: const Color(0xFF2A2A2A),
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 10,
                    ),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(20),
                      borderSide: BorderSide.none,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              SizedBox(
                width: 48,
                height: 48,
                child: hasText
                    ? GestureDetector(
                        onTap: widget.onSendText,
                        child: const CircleAvatar(
                          radius: 20,
                          backgroundColor: Colors.blueAccent,
                          child: Icon(Icons.send, color: Colors.white),
                        ),
                      )
                    : hasMedia
                        ? GestureDetector(
                            onTap: _handleMediaSend,
                            child: const CircleAvatar(
                              radius: 20,
                              backgroundColor: Colors.blueAccent,
                              child: Icon(Icons.send, color: Colors.white),
                            ),
                          )
                        : IconButton(
                            icon: const Icon(
                              Icons.attach_file,
                              color: Colors.white70,
                            ),
                            onPressed: _toggleAttachmentTray,
                          ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildAttachmentOption(
    IconData icon,
    String label,
    Color color,
    VoidCallback onTap,
  ) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          CircleAvatar(
            radius: 28,
            backgroundColor: color,
            child: Icon(icon, color: Colors.white, size: 28),
          ),
          const SizedBox(height: 4),
          Text(label, style: const TextStyle(color: Colors.white70)),
        ],
      ),
    );
  }
}

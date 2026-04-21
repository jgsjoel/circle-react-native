import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_blurhash/flutter_blurhash.dart';
import 'package:open_filex/open_filex.dart';
import 'package:video_player/video_player.dart';
import '../../data/models/message.dart';
import 'media_viewer.dart';

class MessageBubble extends StatelessWidget {
  final Message message;

  const MessageBubble({super.key, required this.message});

  @override
  Widget build(BuildContext context) {
    final isMe = message.isMe;

    return Align(
      alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: EdgeInsets.only(
          top: 6,
          bottom: 6,
          left: isMe ? 50 : 0,
          right: isMe ? 0 : 50,
        ),
        constraints: const BoxConstraints(maxWidth: 280),
        decoration: BoxDecoration(
          color: isMe ? Colors.blueAccent : const Color(0xFF2A2A2A),
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(12),
            topRight: const Radius.circular(12),
            bottomLeft: Radius.circular(isMe ? 12 : 0),
            bottomRight: Radius.circular(isMe ? 0 : 12),
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: _buildContent(context),
      ),
    );
  }

  Widget _buildContent(BuildContext context) {
    switch (message.type) {
      case MessageType.media:
        return _buildMediaContent(context);
      case MessageType.file:
        return _buildFileContent();
      case MessageType.text:
        return _buildTextContent();
    }
  }

  Widget _buildTextContent() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            message.text ?? '',
            style: const TextStyle(color: Colors.white, fontSize: 15),
          ),
          const SizedBox(height: 4),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                _formatTime(message.timestamp),
                style: const TextStyle(color: Colors.white54, fontSize: 11),
              ),
              if (message.isMe) ...[
                const SizedBox(width: 3),
                Icon(
                  Icons.done,
                  size: 14,
                  color: message.status == 'sent'
                      ? Colors.white70
                      : Colors.white38,
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }

  String _formatTime(DateTime? dt) {
    if (dt == null) return '';
    final local = dt.toLocal();
    final hour = local.hour % 12 == 0 ? 12 : local.hour % 12;
    final min = local.minute.toString().padLeft(2, '0');
    final amPm = local.hour < 12 ? 'AM' : 'PM';
    return '$hour:$min $amPm';
  }

  Widget _buildMediaContent(BuildContext context) {
    final attachments = message.mediaAttachments;
    final caption = message.text;
    final hasCaption = caption != null && caption.isNotEmpty;
    final percent = (message.uploadProgress * 100).toInt();

    // For received messages not yet downloaded, show blurhash placeholders
    if (!message.isMe && !message.isDownloaded && message.blurhashes.isNotEmpty) {
      return _buildReceivedMediaContent(context);
    }

    // For sent messages or already downloaded messages, show actual media
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        // Show media grid — tappable
        if (attachments.length == 1)
          _buildSingleMedia(context, attachments.first, 0)
        else
          _buildMediaGrid(context, attachments),

        // Upload progress indicator (for sent messages)
        if (message.isUploading)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: message.uploadProgress,
                    backgroundColor: Colors.white24,
                    valueColor: const AlwaysStoppedAnimation<Color>(Colors.white),
                    minHeight: 4,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Uploading… $percent%',
                  style: const TextStyle(color: Colors.white70, fontSize: 11),
                ),
              ],
            ),
          ),

        // Caption
        if (hasCaption)
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 6, 12, 10),
            child: Text(
              caption,
              style: const TextStyle(color: Colors.white),
            ),
          ),
      ],
    );
  }

  /// Display received media with blurhash preview and download button.
  Widget _buildReceivedMediaContent(BuildContext context) {
    final blurhashes = message.blurhashes;
    final caption = message.text;
    final hasCaption = caption != null && caption.isNotEmpty;
    
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        // Show blurhash grid
        if (blurhashes.length == 1)
          _buildSingleBlurhash(context, blurhashes.first)
        else
          _buildBlurhashGrid(context, blurhashes),

        // Caption
        if (hasCaption)
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 6, 12, 10),
            child: Text(
              caption,
              style: const TextStyle(color: Colors.white),
            ),
          ),
      ],
    );
  }

  /// Display a single blurhash with download button overlay.
  Widget _buildSingleBlurhash(BuildContext context, String blurhash) {
    return GestureDetector(
      child: Stack(
        alignment: Alignment.center,
        children: [
          _buildBlurhashThumbnail(blurhash, width: 280, height: 200),
          // Download button overlay
          Positioned(
            top: 8,
            right: 8,
            child: GestureDetector(
              onTap: () {
                debugPrint('[MessageBubble] Download button tapped for blurhash: $blurhash');
                // TODO: Implement download logic
                // - Download file from S3
                // - Save to local storage
                // - Update isDownloaded flag
              },
              child: Container(
                decoration: BoxDecoration(
                  color: Colors.black54,
                  shape: BoxShape.circle,
                ),
                padding: const EdgeInsets.all(8),
                child: const Icon(
                  Icons.download,
                  color: Colors.white,
                  size: 20,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// Display a grid of blurhashes with download button overlay.
  Widget _buildBlurhashGrid(BuildContext context, List<String> blurhashes) {
    const int maxVisible = 4;
    final int totalCount = blurhashes.length;
    final int displayCount = totalCount > maxVisible ? maxVisible : totalCount;
    final int extraCount = totalCount - maxVisible;

    return Padding(
      padding: const EdgeInsets.all(4),
      child: GridView.builder(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        itemCount: displayCount,
        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: displayCount >= 2 ? 2 : 1,
          crossAxisSpacing: 4,
          mainAxisSpacing: 4,
        ),
        itemBuilder: (context, index) {
          final blurhash = blurhashes[index];
          final isLastTile = index == maxVisible - 1 && extraCount > 0;

          return Stack(
            alignment: Alignment.center,
            children: [
              Positioned.fill(
                child: _buildBlurhashThumbnail(blurhash),
              ),
              // "+N" overlay on the last visible tile
              if (isLastTile)
                Positioned.fill(
                  child: ColoredBox(
                    color: Colors.black54,
                    child: Center(
                      child: Text(
                        '+$extraCount',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 24,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ),
                ),
              // Download button overlay (except on "+N" tile)
              if (!isLastTile)
                Positioned(
                  top: 4,
                  right: 4,
                  child: GestureDetector(
                    onTap: () {
                      debugPrint('[MessageBubble] Download button tapped for blurhash: $blurhash');
                      // TODO: Implement download logic
                    },
                    child: Container(
                      decoration: BoxDecoration(
                        color: Colors.black54,
                        shape: BoxShape.circle,
                      ),
                      padding: const EdgeInsets.all(6),
                      child: const Icon(
                        Icons.download,
                        color: Colors.white,
                        size: 16,
                      ),
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }

  /// Render a blurhash as a thumbnail placeholder.
  Widget _buildBlurhashThumbnail(String blurhash, {double width = 280, double height = 200}) {
    if (blurhash.isEmpty) {
      return Container(
        width: width,
        height: height,
        decoration: BoxDecoration(
          color: Colors.grey[800],
          borderRadius: BorderRadius.circular(4),
        ),
        child: const Icon(Icons.image, color: Colors.white38, size: 48),
      );
    }

    return SizedBox(
      width: width,
      height: height,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(4),
        child: BlurHash(
          hash: blurhash,
          imageFit: BoxFit.cover,
          decodingWidth: 32,
          decodingHeight: 32,
        ),
      ),
    );
  }

  void _openViewer(BuildContext context, int initialIndex) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => MediaViewer(
          attachments: message.mediaAttachments,
          initialIndex: initialIndex,
        ),
      ),
    );
  }

  Widget _buildMediaThumbnail(MediaAttachment attachment, {double width = 280, double height = 200}) {
    if (attachment.isVideo) {
      return _VideoThumbnail(
        filePath: attachment.filePath,
        width: width,
        height: height,
      );
    }
    
    if (attachment.filePath.isEmpty) {
      return Container(
        width: width,
        height: height,
        color: Colors.grey[800],
        child: const Icon(Icons.image, color: Colors.white38, size: 48),
      );
    }

    return Image.file(
      File(attachment.filePath),
      width: width,
      height: height,
      fit: BoxFit.cover,
      errorBuilder: (_, __, ___) => Container(
        width: width,
        height: height,
        color: Colors.grey[800],
        child: const Icon(Icons.image, color: Colors.white38, size: 48),
      ),
    );
  }

  Widget _buildSingleMedia(BuildContext context, MediaAttachment attachment, int index) {
    return GestureDetector(
      onTap: () => _openViewer(context, index),
      child: Stack(
        alignment: Alignment.center,
        children: [
          _buildMediaThumbnail(attachment, width: 280, height: 200),
          if (attachment.isVideo)
            const CircleAvatar(
              radius: 24,
              backgroundColor: Colors.black54,
              child: Icon(Icons.play_arrow, color: Colors.white, size: 32),
            ),
        ],
      ),
    );
  }

  Widget _buildMediaGrid(BuildContext context, List<MediaAttachment> attachments) {
    const int maxVisible = 4;
    final int totalCount = attachments.length;
    final int displayCount = totalCount > maxVisible ? maxVisible : totalCount;
    final int extraCount = totalCount - maxVisible;

    return Padding(
      padding: const EdgeInsets.all(4),
      child: GridView.builder(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        itemCount: displayCount,
        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: displayCount >= 2 ? 2 : 1,
          crossAxisSpacing: 4,
          mainAxisSpacing: 4,
        ),
        itemBuilder: (context, index) {
          final att = attachments[index];
          final isLastTile = index == maxVisible - 1 && extraCount > 0;

          return GestureDetector(
            onTap: () => _openViewer(context, index),
            child: Stack(
              alignment: Alignment.center,
              children: [
                Positioned.fill(
                  child: _buildMediaThumbnail(att),
                ),
                if (att.isVideo && !isLastTile)
                  const CircleAvatar(
                    radius: 18,
                    backgroundColor: Colors.black54,
                    child: Icon(Icons.play_arrow, color: Colors.white, size: 24),
                  ),
                // "+N" overlay on the last visible tile
                if (isLastTile)
                  Positioned.fill(
                    child: ColoredBox(
                      color: Colors.black54,
                      child: Center(
                        child: Text(
                          '+$extraCount',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 24,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildFileContent() {
    final fileAtt = message.fileAttachment;
    if (fileAtt == null) return const SizedBox.shrink();
    final percent = (message.uploadProgress * 100).toInt();
    final isReceived = !message.isMe;

    return GestureDetector(
      onTap: (!message.isUploading && !isReceived)
          ? () => OpenFilex.open(fileAtt.filePath)
          : null,
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                CircleAvatar(
                  radius: 20,
                  backgroundColor: Colors.orange.withAlpha(50),
                  child: const Icon(Icons.insert_drive_file, color: Colors.orange, size: 22),
                ),
                const SizedBox(width: 10),
                Flexible(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        fileAtt.fileName,
                        style: const TextStyle(color: Colors.white, fontSize: 14),
                        overflow: TextOverflow.ellipsis,
                        maxLines: 1,
                      ),
                      const SizedBox(height: 2),
                      Text(
                        fileAtt.formattedSize,
                        style: const TextStyle(color: Colors.white54, fontSize: 12),
                      ),
                    ],
                  ),
                ),
                // Download button for received files
                if (isReceived && !message.isUploading)
                  GestureDetector(
                    onTap: () {
                      debugPrint('[MessageBubble] Download button tapped for file: ${fileAtt.fileName}');
                      // TODO: Implement file download logic
                      // - Download file from S3
                      // - Save to local storage
                      // - Update isDownloaded flag
                    },
                    child: Container(
                      decoration: BoxDecoration(
                        color: Colors.blue.withAlpha(50),
                        shape: BoxShape.circle,
                      ),
                      padding: const EdgeInsets.all(8),
                      child: const Icon(
                        Icons.download,
                        color: Colors.blue,
                        size: 18,
                      ),
                    ),
                  ),
              ],
            ),
            if (message.isUploading) ...[
              const SizedBox(height: 8),
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: message.uploadProgress,
                  backgroundColor: Colors.white24,
                  valueColor: const AlwaysStoppedAnimation<Color>(Colors.orangeAccent),
                  minHeight: 4,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                'Uploading… $percent%',
                style: const TextStyle(color: Colors.white70, fontSize: 11),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Generates a video thumbnail by loading the video and showing the first frame
/// Uses lazy initialization - only loads when visible in viewport
class _VideoThumbnail extends StatefulWidget {
  final String filePath;
  final double width;
  final double height;

  const _VideoThumbnail({
    required this.filePath,
    required this.width,
    required this.height,
  });

  @override
  State<_VideoThumbnail> createState() => _VideoThumbnailState();
}

class _VideoThumbnailState extends State<_VideoThumbnail> {
  late VideoPlayerController _controller;
  bool _initialized = false;
  bool _shouldInitialize = false;

  @override
  void initState() {
    super.initState();
    // Schedule initialization for next frame to avoid blocking UI
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _initializeVideo();
    });
  }

  void _initializeVideo() {
    if (_shouldInitialize || _initialized) return;
    
    _shouldInitialize = true;
    try {
      _controller = VideoPlayerController.file(File(widget.filePath))
        ..initialize().then((_) {
          if (mounted) {
            setState(() => _initialized = true);
          }
        }).catchError((e) {
          debugPrint('Error initializing video: $e');
          if (mounted) {
            setState(() => _shouldInitialize = false);
          }
        });
    } catch (e) {
      debugPrint('Error creating video controller: $e');
      _shouldInitialize = false;
    }
  }

  @override
  void dispose() {
    try {
      if (_initialized) {
        _controller.dispose();
      }
    } catch (e) {
      debugPrint('Error disposing video controller: $e');
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return _buildContent();
  }

  Widget _buildContent() {
    if (!_initialized) {
      // Show placeholder while video loads
      return Container(
        width: widget.width,
        height: widget.height,
        decoration: BoxDecoration(
          color: Colors.grey[800],
          borderRadius: BorderRadius.circular(4),
        ),
        child: Center(
          child: Icon(
            Icons.videocam,
            color: Colors.white38,
            size: widget.width * 0.2,
          ),
        ),
      );
    }

    // Show video texture as thumbnail
    return Container(
      width: widget.width,
      height: widget.height,
      decoration: BoxDecoration(
        color: Colors.black,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Stack(
        alignment: Alignment.center,
        fit: StackFit.expand,
        children: [
          // Video texture
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: AspectRatio(
              aspectRatio: _controller.value.aspectRatio,
              child: VideoPlayer(_controller),
            ),
          ),
          // Play button overlay
          Container(
            decoration: BoxDecoration(
              color: Colors.black38,
              borderRadius: BorderRadius.circular(4),
            ),
          ),
          const CircleAvatar(
            radius: 20,
            backgroundColor: Colors.black54,
            child: Icon(Icons.play_arrow, color: Colors.white, size: 28),
          ),
        ],
      ),
    );
  }
}
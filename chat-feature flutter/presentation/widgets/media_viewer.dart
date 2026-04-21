import 'dart:io';

import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';
import '../../data/models/message.dart';

class MediaViewer extends StatefulWidget {
  final List<MediaAttachment> attachments;
  final int initialIndex;

  const MediaViewer({
    super.key,
    required this.attachments,
    this.initialIndex = 0,
  });

  @override
  State<MediaViewer> createState() => _MediaViewerState();
}

class _MediaViewerState extends State<MediaViewer> {
  late PageController _pageController;
  late int _currentIndex;

  @override
  void initState() {
    super.initState();
    _currentIndex = widget.initialIndex;
    _pageController = PageController(initialPage: _currentIndex);
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          PageView.builder(
            controller: _pageController,
            itemCount: widget.attachments.length,
            onPageChanged: (index) {
              setState(() => _currentIndex = index);
            },
            itemBuilder: (context, index) {
              final att = widget.attachments[index];
              if (att.isVideo) {
                return _VideoPage(
                  attachment: att,
                  isActive: index == _currentIndex,
                );
              }
              return _ImagePage(attachment: att);
            },
          ),

          // Top bar
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: SafeArea(
              child: Container(
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [Colors.black54, Colors.transparent],
                  ),
                ),
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                child: Row(
                  children: [
                    IconButton(
                      icon: const Icon(Icons.close, color: Colors.white, size: 28),
                      onPressed: () => Navigator.pop(context),
                    ),
                    const Spacer(),
                    if (widget.attachments.length > 1)
                      Text(
                        '${_currentIndex + 1} / ${widget.attachments.length}',
                        style: const TextStyle(color: Colors.white70, fontSize: 16),
                      ),
                    const SizedBox(width: 16),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Image page (pinch-to-zoom) ───────────────────────────────────────

class _ImagePage extends StatelessWidget {
  final MediaAttachment attachment;

  const _ImagePage({required this.attachment});

  @override
  Widget build(BuildContext context) {
    final file = File(attachment.filePath);

    return InteractiveViewer(
      minScale: 0.5,
      maxScale: 4.0,
      child: Center(
        child: FutureBuilder<bool>(
          future: file.exists(),
          builder: (context, snapshot) {
            if (snapshot.data == true) {
              return Image.file(
                file,
                fit: BoxFit.contain,
                errorBuilder: (_, __, ___) => _thumbnailFallback(),
              );
            }
            return _thumbnailFallback();
          },
        ),
      ),
    );
  }

  Widget _thumbnailFallback() {
    if (attachment.thumbnail != null) {
      return Image.memory(attachment.thumbnail!, fit: BoxFit.contain);
    }
    return const Icon(Icons.image, color: Colors.white38, size: 64);
  }
}

// ── Video page (full playback controls) ──────────────────────────────

class _VideoPage extends StatefulWidget {
  final MediaAttachment attachment;
  final bool isActive;

  const _VideoPage({required this.attachment, required this.isActive});

  @override
  State<_VideoPage> createState() => _VideoPageState();
}

class _VideoPageState extends State<_VideoPage> {
  late VideoPlayerController _controller;
  bool _initialized = false;
  bool _showControls = true;

  @override
  void initState() {
    super.initState();
    _controller = VideoPlayerController.file(File(widget.attachment.filePath))
      ..initialize().then((_) {
        if (mounted) {
          setState(() => _initialized = true);
        }
      });

    _controller.addListener(_onVideoUpdate);
  }

  void _onVideoUpdate() {
    if (mounted) setState(() {});
  }

  @override
  void didUpdateWidget(covariant _VideoPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Pause when swiped away
    if (!widget.isActive && _controller.value.isPlaying) {
      _controller.pause();
    }
  }

  @override
  void dispose() {
    _controller.removeListener(_onVideoUpdate);
    _controller.dispose();
    super.dispose();
  }

  String _formatDuration(Duration d) {
    final minutes = d.inMinutes.remainder(60).toString().padLeft(2, '0');
    final seconds = d.inSeconds.remainder(60).toString().padLeft(2, '0');
    if (d.inHours > 0) {
      return '${d.inHours}:$minutes:$seconds';
    }
    return '$minutes:$seconds';
  }

  @override
  Widget build(BuildContext context) {
    if (!_initialized) {
      return Center(
        child: widget.attachment.thumbnail != null
            ? Stack(
                alignment: Alignment.center,
                children: [
                  Image.memory(widget.attachment.thumbnail!, fit: BoxFit.contain),
                  const CircularProgressIndicator(color: Colors.white),
                ],
              )
            : const CircularProgressIndicator(color: Colors.white),
      );
    }

    final value = _controller.value;
    final progress = value.duration.inMilliseconds > 0
        ? value.position.inMilliseconds / value.duration.inMilliseconds
        : 0.0;

    return GestureDetector(
      onTap: () => setState(() => _showControls = !_showControls),
      child: Stack(
        alignment: Alignment.center,
        children: [
          // Video
          Center(
            child: AspectRatio(
              aspectRatio: value.aspectRatio,
              child: VideoPlayer(_controller),
            ),
          ),

          // Play / pause center button
          if (_showControls)
            GestureDetector(
              onTap: () {
                if (value.isPlaying) {
                  _controller.pause();
                } else {
                  _controller.play();
                  // Auto-hide controls after playing
                  Future.delayed(const Duration(seconds: 2), () {
                    if (mounted && _controller.value.isPlaying) {
                      setState(() => _showControls = false);
                    }
                  });
                }
              },
              child: CircleAvatar(
                radius: 32,
                backgroundColor: Colors.black54,
                child: Icon(
                  value.isPlaying ? Icons.pause : Icons.play_arrow,
                  color: Colors.white,
                  size: 48,
                ),
              ),
            ),

          // Bottom progress bar + time
          if (_showControls)
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: SafeArea(
                child: Container(
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.bottomCenter,
                      end: Alignment.topCenter,
                      colors: [Colors.black54, Colors.transparent],
                    ),
                  ),
                  padding: const EdgeInsets.fromLTRB(16, 20, 16, 12),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      // Seek bar
                      SliderTheme(
                        data: SliderTheme.of(context).copyWith(
                          trackHeight: 3,
                          thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 6),
                          overlayShape: const RoundSliderOverlayShape(overlayRadius: 14),
                          activeTrackColor: Colors.white,
                          inactiveTrackColor: Colors.white24,
                          thumbColor: Colors.white,
                        ),
                        child: Slider(
                          value: progress.clamp(0.0, 1.0),
                          onChanged: (v) {
                            final position = Duration(
                              milliseconds: (v * value.duration.inMilliseconds).toInt(),
                            );
                            _controller.seekTo(position);
                          },
                        ),
                      ),
                      // Time labels
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 4),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              _formatDuration(value.position),
                              style: const TextStyle(color: Colors.white70, fontSize: 12),
                            ),
                            Text(
                              _formatDuration(value.duration),
                              style: const TextStyle(color: Colors.white70, fontSize: 12),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:photo_manager/photo_manager.dart';

/// Callback that delivers selected media assets.
typedef OnMediaSelected =
    void Function({
      required List<AssetEntity> selectedMedia,
    });

class MediaBottomSheet extends StatefulWidget {
  final bool showImages;
  final OnMediaSelected onMediaSelected;

  const MediaBottomSheet({
    super.key,
    required this.showImages,
    required this.onMediaSelected,
  });

  @override
  State<MediaBottomSheet> createState() => _MediaBottomSheetState();
}

class _MediaBottomSheetState extends State<MediaBottomSheet> {
  late Future<_MediaData> _mediaFuture;

  @override
  void initState() {
    super.initState();
    _mediaFuture = _loadMedia();
  }

  Future<_MediaData> _loadMedia() async {
    final result = await PhotoManager.requestPermissionExtend();
    if (!result.isAuth) return _MediaData([], {});

    final albums = await PhotoManager.getAssetPathList(
      type: widget.showImages ? RequestType.image : RequestType.video,
    );

    List<AssetEntity> media = [];
    if (albums.isNotEmpty) {
      media = await albums[0].getAssetListPaged(page: 0, size: 100);
    }

    // Load thumbnails in parallel instead of sequentially
    final thumbnailFutures = <Future<MapEntry<AssetEntity, Uint8List?>>>[];
    for (final asset in media) {
      thumbnailFutures.add(
        asset
            .thumbnailDataWithSize(const ThumbnailSize(200, 200))
            .then((thumbnail) => MapEntry(asset, thumbnail)),
      );
    }

    // Wait for all thumbnails to load concurrently
    final thumbnailEntries = await Future.wait(thumbnailFutures);
    final thumbnails = Map<AssetEntity, Uint8List?>.fromEntries(
      thumbnailEntries,
    );

    return _MediaData(media, thumbnails);
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<_MediaData>(
      future: _mediaFuture,
      builder: (context, snapshot) {
        if (!snapshot.hasData) {
          return const SizedBox(
            height: 300,
            child: Center(
              child: CircularProgressIndicator(color: Colors.white),
            ),
          );
        }

        final data = snapshot.data!;
        return _MediaBottomSheetBody(
          media: data.media,
          thumbnails: data.thumbnails,
          showImages: widget.showImages,
          onMediaSelected: widget.onMediaSelected,
        );
      },
    );
  }
}

class _MediaData {
  final List<AssetEntity> media;
  final Map<AssetEntity, Uint8List?> thumbnails;
  _MediaData(this.media, this.thumbnails);
}

class _MediaBottomSheetBody extends StatefulWidget {
  final List<AssetEntity> media;
  final Map<AssetEntity, Uint8List?> thumbnails;
  final bool showImages;
  final OnMediaSelected onMediaSelected;

  const _MediaBottomSheetBody({
    required this.media,
    required this.thumbnails,
    required this.showImages,
    required this.onMediaSelected,
  });

  @override
  State<_MediaBottomSheetBody> createState() => _MediaBottomSheetBodyState();
}

class _MediaBottomSheetBodyState extends State<_MediaBottomSheetBody> {
  late ValueNotifier<List<AssetEntity>> _selectedMediaNotifier;

  @override
  void initState() {
    super.initState();
    _selectedMediaNotifier = ValueNotifier<List<AssetEntity>>([]);
  }

  @override
  void dispose() {
    _selectedMediaNotifier.dispose();
    super.dispose();
  }

  void _toggleSelection(AssetEntity asset) {
    final current = List<AssetEntity>.from(_selectedMediaNotifier.value);
    if (current.contains(asset)) {
      current.remove(asset);
    } else {
      current.add(asset);
    }
    _selectedMediaNotifier.value = current;
  }

  @override
  Widget build(BuildContext context) {
    final mediaQuery = MediaQuery.of(context);
    final bottomInset = mediaQuery.viewInsets.bottom;
    final systemNavBar = mediaQuery.padding.bottom;
    final bottomPadding = bottomInset > 0 ? bottomInset : systemNavBar;
    final visibleHeight = mediaQuery.size.height * 0.75;
    final sheetHeight = visibleHeight + bottomPadding;

    return SizedBox(
      height: sheetHeight,
      child: Padding(
        padding: EdgeInsets.only(bottom: bottomPadding),
        child: Column(
          children: [
            // Header with close button
            Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  ValueListenableBuilder<List<AssetEntity>>(
                    valueListenable: _selectedMediaNotifier,
                    builder: (context, selectedMedia, _) {
                      return Text(
                        "Selected: ${selectedMedia.length}",
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 16,
                          fontWeight: FontWeight.w500,
                        ),
                      );
                    },
                  ),
                  IconButton(
                    icon: const Icon(Icons.close, color: Colors.white),
                    onPressed: () => Navigator.pop(context),
                  ),
                ],
              ),
            ),
            // Media grid
            Expanded(
              child: GridView.builder(
                padding: const EdgeInsets.all(4),
                itemCount: widget.media.length,
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 4,
                  crossAxisSpacing: 4,
                  mainAxisSpacing: 4,
                ),
                itemBuilder: (context, index) {
                  final asset = widget.media[index];
                  return _MediaGridItem(
                    asset: asset,
                    thumbnail: widget.thumbnails[asset],
                    selectedMediaNotifier: _selectedMediaNotifier,
                    onTap: () => _toggleSelection(asset),
                  );
                },
              ),
            ),
            // Done button
            ValueListenableBuilder<List<AssetEntity>>(
              valueListenable: _selectedMediaNotifier,
              builder: (context, selectedMedia, _) {
                return Padding(
                  padding: const EdgeInsets.all(12),
                  child: SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: selectedMedia.isEmpty
                          ? null
                          : () {
                              widget.onMediaSelected(selectedMedia: selectedMedia);
                              Navigator.pop(context);
                            },
                      child: const Text('Done'),
                    ),
                  ),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _MediaGridItem extends StatelessWidget {
  final AssetEntity asset;
  final Uint8List? thumbnail;
  final ValueNotifier<List<AssetEntity>> selectedMediaNotifier;
  final VoidCallback onTap;

  const _MediaGridItem({
    required this.asset,
    required this.thumbnail,
    required this.selectedMediaNotifier,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    if (thumbnail == null) {
      return const ColoredBox(color: Colors.grey);
    }

    return GestureDetector(
      onTap: onTap,
      child: Stack(
        fit: StackFit.expand,
        children: [
          // Thumbnail image
          Image.memory(
            thumbnail!,
            fit: BoxFit.cover,
          ),
          // Video icon overlay
          if (asset.type == AssetType.video)
            const Positioned(
              bottom: 4,
              left: 4,
              child: Icon(
                Icons.videocam,
                color: Colors.white,
                size: 18,
              ),
            ),
          // Selection overlay
          ValueListenableBuilder<List<AssetEntity>>(
            valueListenable: selectedMediaNotifier,
            builder: (context, selectedMedia, _) {
              final isSelected = selectedMedia.contains(asset);
              return isSelected
                  ? const Positioned.fill(
                      child: ColoredBox(
                        color: Colors.black45,
                        child: Icon(
                          Icons.check_circle,
                          color: Colors.blueAccent,
                        ),
                      ),
                    )
                  : const SizedBox.shrink();
            },
          ),
        ],
      ),
    );
  }
}

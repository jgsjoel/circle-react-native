import 'dart:typed_data';

enum MessageType { text, media, file }

class MediaAttachment {
  final String filePath;
  final Uint8List? thumbnail;
  final bool isVideo;
  final String? blurHash; // For instant placeholder preview

  const MediaAttachment({
    required this.filePath,
    this.thumbnail,
    this.isVideo = false,
    this.blurHash,
  });
}

class FileAttachment {
  final String filePath;
  final String fileName;
  final int sizeInBytes;

  const FileAttachment({
    required this.filePath,
    required this.fileName,
    required this.sizeInBytes,
  });

  String get formattedSize {
    if (sizeInBytes < 1024) return '$sizeInBytes B';
    if (sizeInBytes < 1024 * 1024) {
      return '${(sizeInBytes / 1024).toStringAsFixed(1)} KB';
    }
    return '${(sizeInBytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }
}

class Message {
  final String? text;
  final bool isMe;
  final MessageType type;
  final List<MediaAttachment> mediaAttachments;
  final FileAttachment? fileAttachment;
  final bool isUploading;
  final double uploadProgress; // 0.0 to 1.0
  final String status; // "pending", "sent", "delivered", "read"
  final DateTime? timestamp;
  final bool isDownloaded; // For received messages: false = show blurhash + download, true = show downloaded
  final List<String> blurhashes; // Blurhashes from server for received media
  final String metadataType; // 'image', 'video', or 'file' from metadata.type

  const Message({
    this.text,
    required this.isMe,
    this.type = MessageType.text,
    this.mediaAttachments = const [],
    this.fileAttachment,
    this.isUploading = false,
    this.uploadProgress = 0.0,
    this.status = 'pending',
    this.timestamp,
    this.isDownloaded = false,
    this.blurhashes = const [],
    this.metadataType = 'file',
  });

  Message copyWith({
    bool? isUploading,
    double? uploadProgress,
    String? status,
    bool? isDownloaded,
    List<String>? blurhashes,
    String? metadataType,
  }) {
    return Message(
      text: text,
      isMe: isMe,
      type: type,
      mediaAttachments: mediaAttachments,
      fileAttachment: fileAttachment,
      isUploading: isUploading ?? this.isUploading,
      uploadProgress: uploadProgress ?? this.uploadProgress,
      status: status ?? this.status,
      timestamp: timestamp,
      isDownloaded: isDownloaded ?? this.isDownloaded,
      blurhashes: blurhashes ?? this.blurhashes,
      metadataType: metadataType ?? this.metadataType,
    );
  }
}

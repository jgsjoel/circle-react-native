import 'package:objectbox/objectbox.dart';

@Entity()
class ChatMessage {
  @Id()
  int id = 0;

  String message;

  @Property(type: PropertyType.date)
  DateTime sentAt;

  /// Foreign key to Contact.id (0 means current user / self)
  int senderId;

  /// Foreign key to Chat.id
  int chatId;

  /// "text" or "media"
  String msgType;

  /// Public message ID assigned by the server
  String pubMsgId;

  /// Message status: "pending", "sent", "delivered", "read"
  String status;

  /// Server-assigned offset for ordering / resuming (e.g. "TIMESTAMP-SEQUENCE")
  String offset;

  /// For media messages: JSON-encoded list of file paths or URLs
  /// For local display: local file paths
  /// Format: ["path/to/image1.jpg", "path/to/image2.jpg"]
  String mediaUrls;

  /// For received media: is the media fully downloaded
  bool isDownloaded;

  /// Blurhashes for received media (JSON-encoded array)
  /// Format: '["L5QQQ6", "L4PQRS"]'
  String blurhashesJson;

  /// Metadata type from server: 'image', 'video', or 'file'
  String metadataType;

  ChatMessage({
    this.id = 0,
    this.message = '',
    required this.sentAt,
    this.senderId = 0,
    this.chatId = 0,
    this.msgType = 'text',
    this.pubMsgId = '',
    this.status = 'pending',
    this.offset = '',
    this.mediaUrls = '',
    this.isDownloaded = false,
    this.blurhashesJson = '[]',
    this.metadataType = 'file',
  });
}

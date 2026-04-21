import 'package:objectbox/objectbox.dart';

@Entity()
class Chat {
  @Id()
  int id = 0;

  String pubChatId;

  @Property(type: PropertyType.date)
  DateTime createdOn;

  /// "single" or "group"
  String type;

  String chatName;

  Chat({
    this.id = 0,
    this.pubChatId = '',
    required this.createdOn,
    this.type = 'single',
    this.chatName = '',
  });
}

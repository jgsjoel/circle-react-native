import 'package:objectbox/objectbox.dart';

@Entity()
class ChatParticipant {
  @Id()
  int id = 0;

  /// Foreign key to Chat.id
  int chatId;

  /// Foreign key to Contact.id
  int participantId;

  ChatParticipant({
    this.id = 0,
    required this.chatId,
    required this.participantId,
  });
}

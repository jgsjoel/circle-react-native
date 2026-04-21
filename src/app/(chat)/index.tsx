import React, { useEffect, useRef, useCallback, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useChatStore, type ChatMessage } from '../../store/chatStore';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return name.substring(0, Math.min(2, name.length)).toUpperCase();
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Material icon for each message status, matching Flutter's done/done-all pattern. */
function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'sent':
      return <MaterialIcons name="done" size={13} color="#93c5fd" />;
    case 'delivered':
      return <MaterialIcons name="done-all" size={13} color="#93c5fd" />;
    case 'read':
      return <MaterialIcons name="done-all" size={13} color="#38bdf8" />;
    default:
      return <MaterialIcons name="access-time" size={13} color="#6b7280" />;
  }
}

// ─── Message bubble ───────────────────────────────────────────────────────────

const MessageRow = React.memo(function MessageRow({ item }: { item: ChatMessage }) {
  return (
    <View className={`mb-3 max-w-[78%] ${item.fromMe ? 'self-end' : 'self-start'}`}>
      <View
        className={`px-4 py-2 rounded-2xl ${
          item.fromMe ? 'bg-blue-600 rounded-br-none' : 'bg-zinc-800 rounded-bl-none'
        }`}
      >
        {!!item.text && <Text className="text-white text-base">{item.text}</Text>}

        <View className="flex-row items-center justify-end mt-1 gap-1">
          <Text className="text-white/50 text-[10px]">{formatTime(item.createdAt)}</Text>
          {item.fromMe && <StatusIcon status={item.status} />}
        </View>
      </View>
    </View>
  );
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const insets = useSafeAreaInsets();

  const { recipientId, recipientName, recipientMobile, privateChatId, pubChatId } =
    useLocalSearchParams<{
      recipientId?: string;
      recipientName?: string;
      recipientMobile?: string;
      privateChatId?: string;
      pubChatId?: string;
    }>();

  const displayName = recipientName || 'Circle Contact';

  // ── Store ───────────────────────────────────────────────────────────────────
  const openChat = useChatStore((s) => s.openChat);
  const closeChat = useChatStore((s) => s.closeChat);
  const draft = useChatStore((s) => s.draft);
  const setDraft = useChatStore((s) => s.setDraft);
  const sendTextMessage = useChatStore((s) => s.sendTextMessage);
  const messages = useChatStore((s) => s.messages);
  const isLoading = useChatStore((s) => s.isLoading);

  const listRef = useRef<FlatList<ChatMessage>>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  useEffect(() => {
    void openChat({
      recipientPublicId: recipientId ?? '',
      recipientName: displayName,
      recipientMobile: recipientMobile ?? '',
      privateChatId: privateChatId ? parseInt(privateChatId, 10) : undefined,
      pubChatId: pubChatId ?? '',
    });

    return () => {
      closeChat();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll to latest message on list change
  useEffect(() => {
    if (messages.length === 0) return;
    const timer = setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: true });
    }, 40);
    return () => clearTimeout(timer);
  }, [messages.length]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleSend = useCallback(() => {
    void sendTextMessage();
  }, [sendTextMessage]);

  const canSend = draft.trim().length > 0;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
   
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#000' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header — apply top safe area manually since SafeAreaView is not the root */}
      <View
        className="px-4 pb-3 flex-row items-center border-b border-zinc-800"
        style={{ paddingTop: insets.top + 8 }}
      >
        <TouchableOpacity onPress={() => router.back()} className="mr-3">
          <MaterialIcons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>

        <View className="w-10 h-10 rounded-full bg-zinc-800 items-center justify-center mr-3">
          <Text className="text-white font-bold">{getInitials(displayName)}</Text>
        </View>

        <View className="flex-1">
          <Text className="text-white text-lg font-semibold">{displayName}</Text>
          {!!recipientMobile && (
            <Text className="text-zinc-500 text-xs">{recipientMobile}</Text>
          )}
        </View>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#ffffff" />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: 16, paddingBottom: 10 }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => <MessageRow item={item} />}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center py-20">
              <Text className="text-zinc-600 text-sm">No messages yet. Say hello!</Text>
            </View>
          }
        />
      )}

      {/* Input bar — only apply bottom safe area when keyboard is hidden */}
      <View
        className="px-3 pt-2 border-t border-zinc-800 flex-row items-center bg-black"
        style={{ paddingBottom: keyboardVisible ? 8 : Math.max(insets.bottom, 8) }}
      >
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Message"
          placeholderTextColor="#71717a"
          className="flex-1 bg-zinc-900 text-white px-4 py-3 rounded-full mr-2"
          multiline
        />

        <TouchableOpacity
          className={`p-3 rounded-full ${canSend ? 'bg-blue-600' : 'bg-zinc-900'}`}
          onPress={handleSend}
          disabled={!canSend}
        >
          <MaterialIcons name="send" size={20} color={canSend ? 'white' : '#52525b'} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

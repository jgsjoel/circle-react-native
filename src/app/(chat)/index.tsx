import React, { useEffect, useRef, useCallback, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Platform,
  ActivityIndicator,
  Keyboard,
  Image,
  Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as MediaLibrary from 'expo-media-library';
import { useChatStore, type ChatMessage } from '../../store/chatStore';
import { AttachmentMenu, type AttachmentOption } from '../../components/chat/AttachmentMenu';
import PhotoPicker from '@/src/components/chat/image_picker';
import VideoPicker from '@/src/components/chat/video_picker';

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

// ─── Media types & grid ───────────────────────────────────────────────────────

type MediaItem = {
  uri: string;
  type: 'photo' | 'video' | 'file';
  filename?: string;
  mimeType?: string;
};

const SCREEN_W = Dimensions.get('window').width;
// Matches FlatList contentContainerStyle padding (16) + max-w-[78%] on bubble
const BUBBLE_W = (SCREEN_W - 32) * 0.78;

function MediaGrid({ items }: { items: MediaItem[] }) {
  const shown = items.slice(0, 4);
  const hiddenCount = items.length - 4; // positive only when >4 total

  // ── Single item ──────────────────────────────────────────────────────────
  if (items.length === 1) {
    const item = items[0];
    if (item.type === 'file') {
      return (
        <View className="px-3 pt-3 pb-1 flex-row items-center gap-2">
          <MaterialIcons name="insert-drive-file" size={36} color="white" />
          <Text className="text-white text-sm flex-1" numberOfLines={2}>
            {item.filename ?? 'File'}
          </Text>
        </View>
      );
    }
    return (
      <View style={{ width: BUBBLE_W, height: BUBBLE_W * 0.75 }}>
        <Image source={{ uri: item.uri }} style={{ flex: 1 }} resizeMode="cover" />
        {item.type === 'video' && (
          <View className="absolute inset-0 items-center justify-center">
            <View className="bg-black/50 rounded-full p-2">
              <MaterialIcons name="play-arrow" size={30} color="white" />
            </View>
          </View>
        )}
      </View>
    );
  }

  // ── 2-column grid for 2+ items ──────────────────────────────────────────
  const cellSize = (BUBBLE_W - 2) / 2;
  return (
    <View style={{ width: BUBBLE_W, flexDirection: 'row', flexWrap: 'wrap', gap: 2 }}>
      {shown.map((item, i) => {
        const isLastShown = i === shown.length - 1;
        const showOverlay = isLastShown && hiddenCount > 0;

        if (item.type === 'file') {
          return (
            <View
              key={i}
              style={{ width: cellSize, height: cellSize }}
              className="bg-zinc-700 items-center justify-center p-2"
            >
              <MaterialIcons name="insert-drive-file" size={32} color="white" />
              <Text className="text-white text-[10px] text-center mt-1" numberOfLines={2}>
                {item.filename ?? 'File'}
              </Text>
              {showOverlay && (
                <View className="absolute inset-0 bg-black/60 items-center justify-center">
                  <Text className="text-white text-xl font-bold">+{hiddenCount}</Text>
                </View>
              )}
            </View>
          );
        }

        return (
          <View key={i} style={{ width: cellSize, height: cellSize }}>
            <Image
              source={{ uri: item.uri }}
              style={{ width: cellSize, height: cellSize }}
              resizeMode="cover"
            />
            {item.type === 'video' && !showOverlay && (
              <View className="absolute inset-0 items-center justify-center">
                <MaterialIcons name="play-circle-outline" size={28} color="white" />
              </View>
            )}
            {showOverlay && (
              <View className="absolute inset-0 bg-black/60 items-center justify-center">
                <Text className="text-white text-2xl font-bold">+{hiddenCount}</Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

const MessageRow = React.memo(function MessageRow({
  item,
  uploadProgress,
}: {
  item: ChatMessage;
  uploadProgress?: number;
}) {
  let mediaItems: MediaItem[] = [];
  if (item.mediaUrls) {
    try {
      mediaItems = JSON.parse(item.mediaUrls);
    } catch {}
  }
  const hasMedia = mediaItems.length > 0;
  const hasText = item.text.length > 0;
  const isUploading = uploadProgress !== undefined && uploadProgress < 100;

  return (
    <View className={`mb-3 max-w-[78%] ${item.fromMe ? 'self-end' : 'self-start'}`}>
      <View
        className={`rounded-2xl overflow-hidden ${
          item.fromMe ? 'bg-blue-600 rounded-br-none' : 'bg-zinc-800 rounded-bl-none'
        }`}
      >
        {hasMedia && <MediaGrid items={mediaItems} />}

        <View className={hasMedia ? 'px-3 py-1.5' : 'px-4 py-2'}>
          {hasText && <Text className="text-white text-base">{item.text}</Text>}
          <View className={`flex-row items-center justify-end gap-1${hasText ? ' mt-1' : ''}`}>
            <Text className="text-white/50 text-[10px]">{formatTime(item.createdAt)}</Text>
            {item.fromMe && <StatusIcon status={item.status} />}
          </View>
        </View>

        {isUploading && (
          <View className="absolute inset-0 bg-black/40 items-center justify-center rounded-2xl">
            <View className="items-center gap-2">
              <ActivityIndicator color="white" size="large" />
              <Text className="text-white text-sm font-semibold">
                {Math.round(uploadProgress)}%
              </Text>
            </View>
          </View>
        )}
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
  const sendMediaMessage = useChatStore((s) => s.sendMediaMessage);
  const messages = useChatStore((s) => s.messages);
  const isLoading = useChatStore((s) => s.isLoading);
  const selectedMedia = useChatStore((s) => s.selectedMedia);
  const uploadingMessages = useChatStore((s) => s.uploadingMessages);
  const addSelectedMedia = useChatStore((s) => s.addSelectedMedia);
  const clearSelectedMedia = useChatStore((s) => s.clearSelectedMedia);

  const listRef = useRef<FlatList<ChatMessage>>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [mediaPickerMode, setMediaPickerMode] = useState<'photo' | 'video'>('photo');

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
    if (selectedMedia.length > 0) {
      void sendMediaMessage();
    } else {
      void sendTextMessage();
    }
  }, [selectedMedia, sendMediaMessage, sendTextMessage]);

  const handleAttachmentSelect = useCallback(async (option: AttachmentOption) => {
    if (option === 'files') {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: true });
      if (!result.canceled && result.assets.length > 0) {
        const files = result.assets.map((a) => ({
          uri: a.uri,
          type: 'file' as const,
          filename: a.name ?? undefined,
          mimeType: a.mimeType ?? undefined,
        }));
        addSelectedMedia(files);
      }
    } else if (option === 'photos') {
      setMediaPickerMode('photo');
      setMediaPickerOpen(true);
    } else if (option === 'videos') {
      setMediaPickerMode('video');
      setMediaPickerOpen(true);
    }
  }, [addSelectedMedia]);

  const handleMediaSelected = useCallback((assets: any[]) => {
    // Convert from PhotoIdentifier format to SelectedMedia format
    const convertedMedia = assets.map((asset) => ({
      uri: asset.node?.image?.uri || asset.uri,
      type: (mediaPickerMode === 'photo' ? 'photo' : 'video') as 'photo' | 'video',
      filename: asset.node?.image?.filename,
      duration: mediaPickerMode === 'video' ? asset.node?.image?.playableDuration : undefined,
    }));
    
    addSelectedMedia(convertedMedia);
    console.log('Media selected and added to store:', convertedMedia);
  }, [mediaPickerMode, addSelectedMedia]);

  const canSend = draft.trim().length > 0 || selectedMedia.length > 0;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView className="flex-1">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header — apply top safe area manually since SafeAreaView is not the root */}
        <View
          className="px-4 pb-3 flex-row items-center border-b border-zinc-800"
          style={{ paddingTop: insets.top }}
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
            renderItem={({ item }) => {
              const uploadingMessage = Array.from(uploadingMessages.values()).find(
                (m) => m.locMsgId === item.id,
              );
              return (
                <MessageRow
                  item={item}
                  uploadProgress={uploadingMessage?.progress}
                />
              );
            }}
            ListEmptyComponent={
              <View className="flex-1 items-center justify-center py-20">
                <Text className="text-zinc-600 text-sm">No messages yet. Say hello!</Text>
              </View>
            }
          />
        )}

        {/* Media selection ribbon */}
        {selectedMedia.length > 0 && (
          <View className="px-3 py-2 bg-blue-600/20 border-b border-blue-600/40 flex-row items-center justify-between">
            <View className="flex-row items-center flex-1">
              <MaterialIcons name="attach-file" size={18} color="#3b82f6" />
              <Text className="text-blue-400 text-sm ml-2 font-semibold">
                {selectedMedia.length} file{selectedMedia.length > 1 ? 's' : ''} selected
              </Text>
            </View>
            <TouchableOpacity
              onPress={clearSelectedMedia}
              hitSlop={8}
            >
              <MaterialIcons name="close" size={20} color="#3b82f6" />
            </TouchableOpacity>
          </View>
        )}

        {/* Input bar — only apply bottom safe area when keyboard is hidden */}
        <View
          className="px-3 pt-2 border-t border-zinc-800 flex-row items-center bg-black pb-3"
        >
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={selectedMedia.length > 0 ? "Add a caption..." : "Message"}
            placeholderTextColor="#71717a"
            className="flex-1 bg-zinc-900 text-white px-4 py-3 rounded-full mr-2"
            multiline
          />

          {canSend ? (
            <TouchableOpacity
              className="p-3 rounded-full bg-blue-600"
              onPress={handleSend}
            >
              <MaterialIcons name="send" size={20} color="white" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              className="p-3 rounded-full bg-zinc-900"
              onPress={() => setAttachMenuOpen(true)}
            >
              <MaterialIcons name="attach-file" size={20} color="#a1a1aa" />
            </TouchableOpacity>
          )}
        </View>

        <AttachmentMenu
          visible={attachMenuOpen}
          onClose={() => setAttachMenuOpen(false)}
          onSelect={handleAttachmentSelect}
        />

        <PhotoPicker
          visible={mediaPickerOpen && mediaPickerMode === 'photo'}
          onClose={() => setMediaPickerOpen(false)}
          onSelected={(assets) => {
            handleMediaSelected(assets);
            setMediaPickerOpen(false);
          }}
        />

        <VideoPicker
          visible={mediaPickerOpen && mediaPickerMode === 'video'}
          onClose={() => setMediaPickerOpen(false)}
          onSelected={(assets) => {
            handleMediaSelected(assets);
            setMediaPickerOpen(false);
          }}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

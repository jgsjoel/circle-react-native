import React, { useEffect, useState, useCallback } from "react";
import { View, Text, TouchableOpacity, Modal, ActivityIndicator, Dimensions, Image } from "react-native";
import { CameraRoll, PhotoIdentifier } from "@react-native-camera-roll/camera-roll";
import { FlashList, ListRenderItem } from "@shopify/flash-list";
import * as MediaLibrary from "expo-media-library";

const { height, width } = Dimensions.get("window");
const ITEM_SIZE = width / 3;
const OptimizedFlashList = FlashList as any;

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelected: (assets: PhotoIdentifier[]) => void;
};

export default function VideoPicker({ visible, onClose, onSelected }: Props) {
  const [assets, setAssets] = useState<PhotoIdentifier[]>([]);
  const [selectedIds, setSelectedIds] = useState<Record<string, PhotoIdentifier>>({});
  const [loading, setLoading] = useState(false);
  const [endCursor, setEndCursor] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState(true);

  const fetchVideos = async (after: string | null = null) => {
    if (loading || (!hasNextPage && after)) return;
    setLoading(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') return;

      const result = await CameraRoll.getPhotos({
        first: 40,
        after: after ?? undefined,
        assetType: 'Videos',
        include: ['playableDuration'], // Specific to videos
      });

      setAssets(prev => (after ? [...prev, ...result.edges] : result.edges));
      setEndCursor(result.page_info.end_cursor ?? null);
      setHasNextPage(result.page_info.has_next_page);
    } catch (e) {
      console.error("Video Fetch Error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      fetchVideos();
    } else {
      setSelectedIds({});
    }
  }, [visible]);

  const renderItem: ListRenderItem<PhotoIdentifier> = useCallback(({ item }) => {
    const isSelected = !!selectedIds[item.node.image.uri];
    return (
      <TouchableOpacity 
        onPress={() => setSelectedIds(prev => {
          const next = { ...prev };
          next[item.node.image.uri] ? delete next[item.node.image.uri] : next[item.node.image.uri] = item;
          return next;
        })}
        style={{ width: ITEM_SIZE, height: ITEM_SIZE, padding: 1 }}
      >
        <Image source={{ uri: item.node.image.uri }} style={{ flex: 1, backgroundColor: '#222' }} />
        <View className="absolute bottom-1 right-1 bg-black/60 px-1 rounded">
          <Text className="text-white text-[10px]">{Math.floor(item.node.image.playableDuration || 0)}s</Text>
        </View>
        {isSelected && <View className="absolute inset-0 bg-blue-500/40 border-2 border-blue-500 items-center justify-center" />}
      </TouchableOpacity>
    );
  }, [selectedIds]);

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View className="flex-1 justify-end bg-black/60">
        <View style={{ height: height * 0.85 }} className="bg-[#121212] rounded-t-3xl">
          <View className="flex-row justify-between p-4 border-b border-white/10">
            <TouchableOpacity onPress={onClose}><Text className="text-white">Cancel</Text></TouchableOpacity>
            <Text className="text-white font-bold">Videos</Text>
            <TouchableOpacity onPress={() => { onSelected(Object.values(selectedIds)); onClose(); }}>
              <Text className="text-blue-500 font-bold">Done ({Object.keys(selectedIds).length})</Text>
            </TouchableOpacity>
          </View>
          <OptimizedFlashList
            data={assets}
            renderItem={renderItem}
            estimatedItemSize={ITEM_SIZE}
            numColumns={3}
            onEndReached={() => hasNextPage && fetchVideos(endCursor)}
          />
        </View>
      </View>
    </Modal>
  );
}
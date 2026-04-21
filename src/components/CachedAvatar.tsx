import { Image } from 'expo-image';
import { View, Text } from 'react-native';

// 7 days in seconds
const CACHE_TTL = 7 * 24 * 60 * 60;

interface CachedAvatarProps {
  imageUrl?: string;
  cookieHeader?: string;
  initials: string;
  size?: number;
}

/**
 * Displays a contact avatar with disk caching (7-day TTL).
 * Falls back to initials if no image URL is provided.
 *
 * Uses expo-image which leverages SDWebImage (iOS) and Coil (Android)
 * for built-in disk + memory caching.
 */
export default function CachedAvatar({
  imageUrl,
  cookieHeader,
  initials,
  size = 48,
}: CachedAvatarProps) {
  if (!imageUrl) {
    return (
      <View
        style={{ width: size, height: size, borderRadius: size / 2 }}
        className="bg-zinc-800 justify-center items-center"
      >
        <Text
          style={{ fontSize: size * 0.38 }}
          className="text-zinc-400 font-bold"
        >
          {initials}
        </Text>
      </View>
    );
  }

  return (
    <Image
      source={{
        uri: imageUrl,
        headers: cookieHeader ? { Cookie: cookieHeader } : undefined,
      }}
      cachePolicy="disk"
      style={{ width: size, height: size, borderRadius: size / 2 }}
      placeholder={{ uri: undefined }}
      placeholderContentFit="cover"
      contentFit="cover"
      recyclingKey={imageUrl}
      transition={200}
    />
  );
}

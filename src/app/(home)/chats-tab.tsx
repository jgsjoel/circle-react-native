import { router } from "expo-router";
import { FlatList, Text, TouchableOpacity, View } from "react-native";

export default function ChatsTab() {
  const chats = [
    { id: '1', name: 'John Doe', message: 'Hey bro', time: '2:30 PM' },
    { id: '2', name: 'Sarah', message: 'See you!', time: '1:15 PM' },
  ];

  return (
    <FlatList
      data={chats}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <TouchableOpacity
          onPress={() =>
            router.push({
              pathname: '/(chat)',
              params: {
                recipientId: item.id,
                recipientName: item.name,
              },
            })
          }
          className="px-4 py-5 flex-row items-center mt-3 mx-4 border border-zinc-800 rounded-xl"
        >

          {/* Avatar */}
          <View className="w-12 h-12 rounded-full bg-zinc-800 items-center justify-center mr-3">
            <Text className="text-white font-bold">
              {item.name.substring(0, 2).toUpperCase()}
            </Text>
          </View>

          {/* Text */}
          <View className="flex-1">
            <Text className="text-white font-semibold">{item.name}</Text>
            <Text className="text-zinc-400 text-sm">{item.message}</Text>
          </View>

          {/* Time */}
          <Text className="text-zinc-500 text-xs">{item.time}</Text>
        </TouchableOpacity>

      )}
    />
  );
}
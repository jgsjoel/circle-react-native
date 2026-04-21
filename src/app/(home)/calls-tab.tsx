import { MaterialIcons } from "@expo/vector-icons";
import { FlatList, Text, View } from "react-native";

export default function CallsTab() {
  const calls = [
    { id: '1', name: 'Alex', type: 'incoming', time: '2:30 PM' },
    { id: '2', name: 'Sarah', type: 'outgoing', time: '1:15 PM' },
  ];

  return (
    <FlatList
      data={calls}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => {
        const isIncoming = item.type === 'incoming';

        return (
          <View className="mx-4 my-2 p-4 bg-zinc-900 rounded-xl flex-row items-center">
            
            {/* Avatar */}
            <View className="w-12 h-12 rounded-full bg-blue-900 items-center justify-center mr-3">
              <Text className="text-white font-bold">
                {item.name.substring(0, 2).toUpperCase()}
              </Text>
            </View>

            {/* Info */}
            <View className="flex-1">
              <Text className="text-white font-semibold">{item.name}</Text>

              <View className="flex-row items-center mt-1">
                <MaterialIcons
                  name={isIncoming ? 'call-received' : 'call-made'}
                  size={14}
                  color={isIncoming ? '#4ade80' : '#9ca3af'}
                />
                <Text className="text-zinc-400 text-xs ml-1">
                  {item.time}
                </Text>
              </View>
            </View>

            {/* Call button */}
            <MaterialIcons name="call" size={20} color="#9ca3af" />
          </View>
        );
      }}
    />
  );
}
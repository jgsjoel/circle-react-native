import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import ChatsTab from './chats-tab';
import CallsTab from './calls-tab';
import { wsService } from '../../services/websocket';
import { wsMessageHandler } from '../../services/wsMessageHandler';
import { closeDb } from '../../db/client';

export default function HomeScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<'chats' | 'calls'>('chats');
  const [menuVisible, setMenuVisible] = useState(false);

  const handleLogout = async () => {
    try {
      wsService.disconnect();
      closeDb();

      await Promise.all([
        SecureStore.deleteItemAsync('token'),
        SecureStore.deleteItemAsync('user_id'),
        SecureStore.deleteItemAsync('name'),
        SecureStore.deleteItemAsync('mobile'),
        SecureStore.deleteItemAsync('ws_offset'),
      ]);
    } catch (error) {
      console.log('[Auth] Logout cleanup failed:', error);
    } finally {
      router.replace('/(auth)/landing');
    }
  };

  useEffect(() => {
    // Register the WS message handler so incoming messages are processed
    const unsub = wsService.onMessage((raw) => wsMessageHandler.handle(raw));
    wsMessageHandler.onOffsetReceived = (offset) => wsService.updateOffset(offset);

    wsService.connect();

    return () => {
      unsub();
      wsMessageHandler.onOffsetReceived = null;
      wsService.disconnect();
    };
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-black">

      {/* HEADER */}
      <View className="px-5 pt-2 pb-3 flex-row items-center justify-between">
        <Text className="text-white text-3xl font-bold">Circle</Text>

        <TouchableOpacity onPress={() => setMenuVisible(true)}>
          <MaterialIcons name="more-vert" size={26} color="white" />
        </TouchableOpacity>
      </View>

      {/* DROPDOWN MENU */}
      {menuVisible && (
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setMenuVisible(false)}
          className="absolute top-0 left-0 right-0 bottom-0 z-10"
        >
          <View className="absolute right-5 top-16 bg-zinc-900 rounded border border-zinc-800 w-44 overflow-hidden">

            <TouchableOpacity
              onPress={() => {
                setMenuVisible(false);
                console.log('Profile');
              }}
              className="px-4 py-3 flex-row items-center gap-3"
            >
              <MaterialIcons name="person" size={18} color="white" />
              <Text className="text-white text-base">Profile</Text>
            </TouchableOpacity>

            <View className="h-[1px] bg-zinc-800" />

            <TouchableOpacity
              onPress={() => {
                setMenuVisible(false);
                void handleLogout();
              }}
              className="px-4 py-3 flex-row items-center gap-3"
            >
              <MaterialIcons name="logout" size={18} color="#f87171" />
              <Text className="text-red-400 text-base">Logout</Text>
            </TouchableOpacity>

          </View>
        </TouchableOpacity>
      )}

      {/* TAB BAR */}
      <View className="flex-row border-b border-zinc-800">
        <TouchableOpacity
          onPress={() => setTab('chats')}
          className={`flex-1 items-center py-3 ${
            tab === 'chats' ? 'border-b-2 border-blue-500' : ''
          }`}
        >
          <View className="flex-row items-center gap-1">
            <MaterialIcons name="chat-bubble" size={18} color="white" />
            <Text className="text-white font-medium">Chats</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setTab('calls')}
          className={`flex-1 items-center py-3 ${
            tab === 'calls' ? 'border-b-2 border-blue-500' : ''
          }`}
        >
          <View className="flex-row items-center gap-1">
            <MaterialIcons name="call" size={18} color="white" />
            <Text className="text-white font-medium">Calls</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* CONTENT */}
      {tab === 'chats' ? <ChatsTab /> : <CallsTab />}

      {/* FAB */}
      {tab === 'chats' && (
        <TouchableOpacity
          onPress={() => router.push('/(contacts)')}
          className="absolute bottom-24 right-6 bg-blue-600 w-14 h-14 rounded-full items-center justify-center shadow-lg"
        >
          <MaterialIcons name="add" size={26} color="white" />
        </TouchableOpacity>
      )}

    </SafeAreaView>
  );
}
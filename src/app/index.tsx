import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import api from '../api/client';
import { initDb } from '../db/client';

export default function Index() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const token = await SecureStore.getItemAsync('token');
        if (!token) {
          router.replace('/(auth)/landing');
          return;
        }

        const res = await api.post('/auth/validate-token', { token });
        if (res.data?.valid) {
          // Init user-scoped DB for returning user
          const userId = res.data.user_id ?? await SecureStore.getItemAsync('user_id');
          if (userId) initDb(userId);

          router.replace('/(home)');
        } else {
          // Token invalid — clear stored data and go to landing
          await Promise.all([
            SecureStore.deleteItemAsync('token'),
            SecureStore.deleteItemAsync('user_id'),
            SecureStore.deleteItemAsync('name'),
            SecureStore.deleteItemAsync('mobile'),
          ]);
          router.replace('/(auth)/landing');
        }
      } catch {
        // Network error or server down — go to landing
        router.replace('/(auth)/landing');
      } finally {
        setChecking(false);
      }
    })();
  }, []);

  return (
    <View className="flex-1 bg-black justify-center items-center">
      <StatusBar style="light" />

      <View className="h-24 w-24 rounded-full bg-zinc-800 justify-center items-center mb-8">
        <MaterialIcons name="chat-bubble" size={50} color="#3b82f6" />
      </View>

      <Text className="text-white text-4xl font-bold mb-12">
        Circle Chat
      </Text>

      <ActivityIndicator size="large" color="#3b82f6" />

      <Text className="text-zinc-400 mt-4 text-base">
        {checking ? 'Checking authentication...' : 'Redirecting...'}
      </Text>
    </View>
  );
}
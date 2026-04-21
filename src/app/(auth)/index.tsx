import React, { useEffect } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

export default function AuthCheckScreen() {
  const router = useRouter();

  return (
    <View className="flex-1 bg-black justify-center items-center">
      <StatusBar style="light" />
      
      {/* Logo Container */}
      <View className="h-24 w-24 rounded-full bg-zinc-800 justify-center items-center mb-8">
        <MaterialIcons name="chat-bubble" size={50} color="#3b82f6" /> 
      </View>

      {/* App Title */}
      <Text className="text-white text-4xl font-bold mb-12">
        Circle Chat
      </Text>

      {/* Loading Indicator */}
      <ActivityIndicator size="large" color="#3b82f6" />

      {/* Status Text */}
      <Text className="text-zinc-400 mt-4 text-base">
        Checking authentication...
      </Text>
    </View>
  );
}
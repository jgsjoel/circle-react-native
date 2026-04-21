import React from 'react';
import { View, Text, TouchableOpacity, Alert, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { Camera } from 'expo-camera';
import * as Contacts from 'expo-contacts';
import * as MediaLibrary from 'expo-media-library';

async function checkAllPermissions() {
  const [camera, mic, contacts, media] = await Promise.all([
    Camera.getCameraPermissionsAsync(),
    Camera.getMicrophonePermissionsAsync(),
    Contacts.getPermissionsAsync(),
    MediaLibrary.getPermissionsAsync(),
  ]);
  return { camera, mic, contacts, media };
}

async function requestAllPermissions() {
  const [camera, mic, contacts, media] = await Promise.all([
    Camera.requestCameraPermissionsAsync(),
    Camera.requestMicrophonePermissionsAsync(),
    Contacts.requestPermissionsAsync(),
    MediaLibrary.requestPermissionsAsync(),
  ]);
  const allGranted =
    camera.granted && mic.granted && contacts.granted && media.granted;
  const anyPermanentlyDenied =
    !camera.canAskAgain || !mic.canAskAgain || !contacts.canAskAgain || !media.canAskAgain;
  return { allGranted, anyPermanentlyDenied };
}

export default function LandingScreen() {
  const router = useRouter();

  const handleGetStarted = async () => {
    const { camera, mic, contacts, media } = await checkAllPermissions();
    const allGranted =
      camera.granted && mic.granted && contacts.granted && media.granted;

    if (allGranted) {
      router.push('/(auth)/request-otp');
    } else {
      showPermissionDialog();
    }
  };

  const showPermissionDialog = () => {
    Alert.alert(
      'Permissions Required',
      'Circle Chat needs camera, microphone, contacts, and storage permissions to function correctly.',
      [
        {
          text: 'Grant Permissions',
          onPress: async () => {
            const { allGranted, anyPermanentlyDenied } = await requestAllPermissions();
            if (allGranted) {
              router.push('/(auth)/request-otp');
            } else if (anyPermanentlyDenied) {
              showSettingsDialog();
            } else {
              showDeniedDialog();
            }
          },
        },
      ],
      { cancelable: false },
    );
  };

  const showDeniedDialog = () => {
    Alert.alert(
      'Permissions Required',
      'All permissions are required to continue. Please grant camera, microphone, contacts, and storage access.',
      [
        {
          text: 'Try Again',
          onPress: async () => {
            const { allGranted, anyPermanentlyDenied } = await requestAllPermissions();
            if (allGranted) {
              router.push('/(auth)/request-otp');
            } else if (anyPermanentlyDenied) {
              showSettingsDialog();
            } else {
              showDeniedDialog();
            }
          },
        },
      ],
      { cancelable: false },
    );
  };

  const showSettingsDialog = () => {
    Alert.alert(
      'Permissions Required',
      'Some permissions were permanently denied. Please enable camera, microphone, contacts, and storage access in your device settings to continue.',
      [
        {
          text: 'Open Settings',
          onPress: async () => {
            await Linking.openSettings();
            // Re-check after returning from settings
            const { camera, mic, contacts, media } = await checkAllPermissions();
            const allGranted =
              camera.granted && mic.granted && contacts.granted && media.granted;
            if (allGranted) {
              router.push('/(auth)/request-otp');
            } else {
              showSettingsDialog();
            }
          },
        },
      ],
      { cancelable: false },
    );
  };

  return (
    <View className="flex-1 bg-black px-6 justify-center items-center">
      <StatusBar style="light" />

      {/* Logo/App Icon */}
      <View className="h-24 w-24 rounded-full bg-blue-600 justify-center items-center mb-10">
        <MaterialIcons name="chat-bubble" size={50} color="white" />
      </View>

      {/* App Title */}
      <Text className="text-white text-5xl font-bold text-center mb-4">
        Circle Chat
      </Text>

      {/* Subtitle */}
      <Text className="text-zinc-400 text-lg text-center mb-14 px-4">
        Connect with people around you
      </Text>

      {/* Main CTA Button */}
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={handleGetStarted}
        className="w-full h-14 bg-blue-600 rounded-xl justify-center items-center mb-4"
      >
        <Text className="text-white text-lg font-bold">Get Started</Text>
      </TouchableOpacity>

      {/* Footer Text */}
      <Text className="text-zinc-600 text-sm text-center px-6">
        By continuing, you agree to our Terms of Service
      </Text>
    </View>
  );
}
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Image, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import axios from 'axios';
import api from '../../api/client';

export default function ProfileSetupScreen() {
    const router = useRouter();
    const [image, setImage] = useState<string | null>(null);
    const [description, setDescription] = useState('');
    const [loading, setLoading] = useState(false);

    const pickImage = async () => {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

        if (!permission.granted) {
            alert('Permission to access gallery is required!');
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            allowsEditing: true, // enables cropping
            aspect: [1, 1],      // square crop (profile pic)
            quality: 0.8,
        });

        if (!result.canceled) {
            const uri = result.assets[0].uri;
            setImage(uri);
        }
    };

    const handleCompleteProfile = async () => {
        if (!image) {
            Alert.alert('Error', 'Please select a profile picture.');
            return;
        }
        if (!description.trim()) {
            Alert.alert('Error', 'Please write something about yourself.');
            return;
        }

        setLoading(true);
        try {
            // 1. Get presigned upload URL
            const presignedRes = await api.post('media/profile/presigned-upload', [
                {
                    file_name: image.split('/').pop() || 'profile.jpg',
                    content_type: 'image/jpeg',
                },
            ]);
            const { upload_url, s3_key } = presignedRes.data.data[0];

            // 2. Upload image to S3
            const fileResponse = await fetch(image);
            const blob = await fileResponse.blob();
            await axios.put(upload_url, blob, {
                headers: { 'Content-Type': blob.type || 'image/jpeg' },
            });

            // 3. Complete profile setup
            await api.post('/users/complete-setup', {
                description: description.trim(),
                s3_key,
            });

            router.replace('/(home)');
        } catch (err: any) {
            console.error('Profile setup error:', err);
            const message = err?.response?.data?.error || 'Profile setup failed. Please try again.';
            Alert.alert('Error', message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView className='flex-1'>
            <ScrollView className="flex-1 bg-black" contentContainerStyle={{ flexGrow: 1 }}>
                <StatusBar style="light" />

                <View className="flex-1 px-8 pt-16 pb-10 items-center">
                    {/* Header */}
                    <Text className="text-white text-3xl font-bold mb-2 w-full">
                        Complete Profile
                    </Text>
                    <Text className="text-zinc-500 text-base mb-10 w-full">
                        Add a photo and a short bio so friends can recognize you.
                    </Text>

                    {/* Profile Image Picker */}
                    <TouchableOpacity
                        onPress={pickImage}
                        activeOpacity={0.9}
                        className="relative mb-12"
                    >
                        <View className="h-40 w-40 rounded-full bg-zinc-900 justify-center items-center overflow-hidden border-2 border-zinc-800">
                            {image ? (
                                <Image source={{ uri: image }} className="h-full w-full" />
                            ) : (
                                <MaterialIcons name="person" size={80} color="#3f3f46" />
                            )}
                        </View>

                        {/* Camera Action Button */}
                        <View className="absolute bottom-1 right-1 bg-blue-600 h-11 w-11 rounded-full items-center justify-center border-4 border-black">
                            <MaterialIcons name="camera-alt" size={20} color="white" />
                        </View>

                        {/* Remove Image Button (Visible if image exists) */}
                        {image && (
                            <TouchableOpacity
                                onPress={() => setImage(null)}
                                className="absolute top-1 right-1 bg-zinc-800 h-8 w-8 rounded-full items-center justify-center border-2 border-black"
                            >
                                <MaterialIcons name="close" size={16} color="white" />
                            </TouchableOpacity>
                        )}
                    </TouchableOpacity>

                    {/* Description Input */}
                    <View className="w-full mb-10">
                        <Text className="text-zinc-500 text-sm mb-2 ml-1">About You</Text>
                        <TextInput
                            placeholder="Write something about yourself..."
                            placeholderTextColor="#52525b"
                            multiline
                            numberOfLines={4}
                            maxLength={150}
                            textAlignVertical="top"
                            value={description}
                            onChangeText={setDescription}
                            className="w-full bg-zinc-900 rounded-2xl p-5 text-white text-lg border border-zinc-800 focus:border-blue-600 min-h-[120px]"
                        />
                        <Text className="text-zinc-600 text-right mt-2 text-xs">
                            {description.length}/150
                        </Text>
                    </View>

                    <View className="flex-1" />

                    {/* Action Buttons */}
                    <View className="w-full space-y-4">
                        <TouchableOpacity
                            onPress={handleCompleteProfile}
                            disabled={loading}
                            className={`w-full h-16 rounded-2xl justify-center items-center shadow-lg shadow-blue-500/50 ${loading ? 'bg-blue-800' : 'bg-blue-600'}`}
                        >
                            {loading ? (
                                <ActivityIndicator color="white" />
                            ) : (
                                <Text className="text-white text-xl font-bold">Complete Profile</Text>
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={() => router.replace('/(home)')}
                            disabled={loading}
                            className="w-full h-14 bg-transparent rounded-2xl justify-center items-center"
                        >
                            <Text className="text-zinc-400 text-lg font-medium">Skip for now</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}
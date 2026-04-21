import React, { useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import api from '../../api/client';
import { initDb } from '../../db/client';
import { fetchAndSyncContacts } from '../../services/contacts';

export default function VerifyOtpScreen() {
    const router = useRouter();
    const { mobile, name } = useLocalSearchParams<{ mobile: string; name: string }>();
    const [code, setCode] = useState(['', '', '', '']); // 4-digit OTP
    const inputs = useRef<Array<TextInput | null>>([]);
    const [loading, setLoading] = useState(false);

    const handleInput = (text: string, index: number) => {
        const newCode = [...code];
        newCode[index] = text;
        setCode(newCode);

        // Auto-focus next input
        if (text && index < 3) {
            inputs.current[index + 1]?.focus();
        }
    };

    const handleKeyPress = (e: any, index: number) => {
        // Move to previous input on backspace
        if (e.nativeEvent.key === 'Backspace' && !code[index] && index > 0) {
            inputs.current[index - 1]?.focus();
        }
    };

    const handleVerify = async () => {
        const otp = code.join('');
        if (otp.length < 4) {
            Alert.alert('Error', 'Please enter the full 4-digit code.');
            return;
        }

        setLoading(true);
        try {
            const res = await api.post('/auth/verify-otp', {
                mobile,
                otp,
                name,
            });

            if (res.status === 200) {
                const { token, user_id } = res.data;

                await Promise.all([
                    SecureStore.setItemAsync('token', token),
                    SecureStore.setItemAsync('user_id', user_id),
                    SecureStore.setItemAsync('name', name ?? ''),
                    SecureStore.setItemAsync('mobile', mobile ?? ''),
                ]);

                // Init user-scoped DB, then sync contacts in the background
                initDb(user_id);
                fetchAndSyncContacts().catch((err) =>
                    console.log('[ContactSync] Initial sync failed:', err),
                );

                router.replace('/(auth)/profile-setup');
            }
        } catch (err: any) {
            const message = err?.response?.data?.error || 'Verification failed. Please try again.';
            Alert.alert('Error', message);
        } finally {
            setLoading(false);
        }
    };

    return (

        <SafeAreaView className='flex-1'>
            <Stack.Screen
            options={{
                headerShown: true,
                headerTitle: '',
                headerStyle: { backgroundColor: '#000' },
                headerTintColor: '#fff',
                headerShadowVisible: false,
                headerLeft: () => (
                    <TouchableOpacity onPress={() => router.back()} style={{ marginLeft: 10 }}>
                        <MaterialIcons name="arrow-back" size={24} color="white" />
                    </TouchableOpacity>
                ),
            }}
        />
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                className="flex-1 bg-black"
            >
                <StatusBar style="light" />
                <ScrollView contentContainerStyle={{ flexGrow: 1 }}>

                    <View className="flex-1 px-8 pt-20 pb-10">

                        {/* Header */}
                        <Text className="text-white text-4xl font-bold mb-3">Verify OTP</Text>
                        <Text className="text-zinc-400 text-lg mb-12">
                            We've sent a 4-digit code to your phone number.
                        </Text>

                        {/* OTP Input Row */}
                        <View className="flex-row justify-between mb-10 px-4">
                            {code.map((digit, index) => (
                                <TextInput
                                    key={index}
                                    ref={(ref) => {
                                        inputs.current[index] = ref;
                                    }}
                                    className="w-16 h-20 bg-zinc-900 border border-zinc-800 rounded-2xl text-white text-3xl text-center font-bold focus:border-blue-600"
                                    maxLength={1}
                                    keyboardType="number-pad"
                                    value={digit}
                                    onChangeText={(text) => handleInput(text, index)}
                                    onKeyPress={(e) => handleKeyPress(e, index)}
                                />
                            ))}
                        </View>

                        {/* Timer Section */}
                        <View className="items-center mb-10">
                            <Text className="text-zinc-500 text-base">
                                Didn't receive the code?
                            </Text>
                            <TouchableOpacity className="mt-2">
                                <Text className="text-blue-500 font-bold text-base">
                                    Resend in 00:59
                                </Text>
                            </TouchableOpacity>
                        </View>

                        <View className="flex-1" />

                        {/* Verify Button */}
                        <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={handleVerify}
                            disabled={loading}
                            className={`w-full h-16 rounded-2xl justify-center items-center shadow-lg shadow-blue-500/50 ${loading ? 'bg-blue-800' : 'bg-blue-600'}`}
                        >
                            {loading ? (
                                <ActivityIndicator color="white" />
                            ) : (
                                <Text className="text-white text-xl font-bold">Verify & Continue</Text>
                            )}
                        </TouchableOpacity>
                    </View>

                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}
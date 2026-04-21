import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import api from '../../api/client';

export default function RequestOtpScreen() {
    const router = useRouter();
    const [name, setName] = useState('');
    const [mobile, setMobile] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSendOtp = async () => {
        const fullMobile = `+94${mobile.replace(/\s/g, '')}`;

        if (!name.trim()) {
            Alert.alert('Error', 'Please enter your name.');
            return;
        }
        if (mobile.replace(/\s/g, '').length < 9) {
            Alert.alert('Error', 'Please enter a valid phone number.');
            return;
        }

        setLoading(true);
        try {
            const res = await api.post('/auth/request-otp', { mobile: fullMobile });
            if (res.status === 200) {
                router.push({
                    pathname: '/(auth)/verify-otp',
                    params: { mobile: fullMobile, name: name.trim() },
                });
            }
        } catch (err: any) {
            const message = err?.response?.data?.error || 'Failed to send OTP. Please try again.';
            Alert.alert('Error', message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView className='flex-1'>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                className="flex-1 bg-black"
            >
                <StatusBar style="light" />
                <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">

                    <View className="flex-1 px-8 pt-20 pb-10">

                        {/* Header Section */}
                        <Text className="text-white text-4xl font-bold mb-3">
                            Register
                        </Text>
                        <Text className="text-zinc-400 text-lg mb-12">
                            Enter your details to receive an OTP verification code.
                        </Text>

                        {/* Input Fields */}
                        <View className="space-y-6">
                            <View>
                                <Text className="text-zinc-500 text-sm mb-2 ml-1">Full Name</Text>
                                <TextInput
                                    placeholder="Enter your name"
                                    placeholderTextColor="#52525b"
                                    value={name}
                                    onChangeText={setName}
                                    className="w-full h-16 bg-zinc-900 rounded-2xl px-5 text-white text-lg border border-zinc-800 focus:border-blue-600"
                                />
                            </View>

                            <View className="mt-6">
                                <Text className="text-zinc-500 text-sm mb-2 ml-1">Phone Number</Text>
                                <View className="flex-row items-center w-full h-16 bg-zinc-900 rounded-2xl px-5 border border-zinc-800 focus:border-blue-600">
                                    <Text className="text-white text-lg mr-3">+94</Text>
                                    <View className="w-[1px] h-6 bg-zinc-700 mr-3" />
                                    <TextInput
                                        placeholder="77 123 4567"
                                        placeholderTextColor="#52525b"
                                        keyboardType="phone-pad"
                                        value={mobile}
                                        onChangeText={setMobile}
                                        maxLength={12}
                                        className="flex-1 text-white text-lg"
                                    />
                                </View>
                            </View>
                        </View>

                        {/* Spacer to push button to bottom */}
                        <View className="flex-1" />

                        {/* CTA Button */}
                        <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={handleSendOtp}
                            disabled={loading}
                            className={`w-full h-16 rounded-2xl justify-center items-center shadow-lg shadow-blue-500/50 ${loading ? 'bg-blue-800' : 'bg-blue-600'}`}
                        >
                            {loading ? (
                                <ActivityIndicator color="white" />
                            ) : (
                                <Text className="text-white text-xl font-bold">Send OTP</Text>
                            )}
                        </TouchableOpacity>

                        {/* Subtext */}
                        <Text className="text-zinc-500 text-center mt-6 text-sm">
                            Standard call or SMS rates may apply.
                        </Text>
                    </View>

                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}
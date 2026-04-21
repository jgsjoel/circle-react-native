import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { getDb } from '../../db/client';
import { contacts as contactsTable } from '../../db/schema';
import { fetchAndSyncContacts, type SyncedContact } from '../../services/contacts';
import CachedAvatar from '../../components/CachedAvatar';

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return name.substring(0, Math.min(2, name.length)).toUpperCase();
}

export default function ContactsScreen() {
  const router = useRouter();
  const [allContacts, setAllContacts] = useState<SyncedContact[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cookieHeader, setCookieHeader] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return allContacts;
    const q = search.toLowerCase();
    return allContacts.filter(
      (c) => c.name.toLowerCase().includes(q) || c.phone.includes(q),
    );
  }, [allContacts, search]);

  const loadFromDb = async () => {
    try {
      const db = getDb();
      const rows = await db.select().from(contactsTable);
      const mapped: SyncedContact[] = rows
        .filter((r) => r.publicId)
        .map((r) => ({
          name: r.name,
          phone: r.phone,
          avatar: getInitials(r.name),
          publicId: r.publicId ?? '',
          imageUrl: r.imageUrl ?? '',
          publicKey: r.publicKey ?? '',
          pubKeyVersion: r.pubKeyVersion ?? '',
        }))
        .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
      setAllContacts(mapped);
    } catch (e) {
      console.log('[Contacts] Failed to load from DB:', e);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const result = await fetchAndSyncContacts();
      setAllContacts(result.contacts);
      setCookieHeader(result.cookieHeader);
    } catch (e) {
      console.log('[Contacts] Refresh failed:', e);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    (async () => {
      // Load cached contacts from DB first, then sync in background
      await loadFromDb();
      setLoading(false);
      try {
        const result = await fetchAndSyncContacts();
        setAllContacts(result.contacts);
        setCookieHeader(result.cookieHeader);
      } catch (e) {
        console.log('[Contacts] Background sync failed:', e);
      }
    })();
  }, []);

  const renderItem = ({ item }: { item: SyncedContact }) => (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => {
        router.push({
          pathname: '/(chat)',
          params: {
            recipientId: item.publicId,
            recipientName: item.name,
            recipientMobile: item.phone,
            recipientImageUrl: item.imageUrl,
          },
        });
      }}
      className="flex-row items-center px-5 py-3"
    >
      <CachedAvatar
        imageUrl={item.imageUrl || undefined}
        cookieHeader={cookieHeader || undefined}
        initials={item.avatar}
        size={50}
      />
      <View className="ml-4 flex-1">
        <Text className="text-white text-base font-medium">{item.name}</Text>
        <Text className="text-zinc-500 text-sm mt-0.5">{item.phone}</Text>
      </View>
      <MaterialIcons name="chat" size={22} color="#3b82f6" />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView className="flex-1 bg-black">
      <StatusBar style="light" />

      {/* Header */}
      <View className="px-5 pt-2 pb-3 flex-row items-center">
        <TouchableOpacity onPress={() => router.back()} className="mr-4">
          <MaterialIcons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <Text className="text-white text-2xl font-bold">Select Contact</Text>
      </View>

      {/* Search */}
      <View className="px-5 pb-3">
        <View className="flex-row items-center bg-zinc-900 rounded-xl px-4 h-12 border border-zinc-800">
          <MaterialIcons name="search" size={20} color="#71717a" />
          <TextInput
            placeholder="Search contacts..."
            placeholderTextColor="#52525b"
            value={search}
            onChangeText={setSearch}
            className="flex-1 text-white text-base ml-2"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <MaterialIcons name="clear" size={20} color="#71717a" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Content */}
      {loading ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      ) : filtered.length === 0 && allContacts.length === 0 ? (
        <View className="flex-1 justify-center items-center px-8">
          <MaterialIcons name="people-outline" size={64} color="#3f3f46" />
          <Text className="text-zinc-500 text-center mt-4 text-base">
            No contacts found{'\n\n'}Pull down to refresh or invite friends to Circle.
          </Text>
        </View>
      ) : filtered.length === 0 ? (
        <View className="flex-1 justify-center items-center">
          <Text className="text-zinc-500 text-base">No matching contacts found</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.phone}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#3b82f6"
              colors={['#3b82f6']}
            />
          }
          ItemSeparatorComponent={() => (
            <View className="h-[1px] bg-zinc-900 ml-[74px]" />
          )}
        />
      )}
    </SafeAreaView>
  );
}

import '../../global.css';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function Layout() {
  return (
    <ThemeProvider value={DarkTheme}>
      <SafeAreaProvider>
        {/* Ensures the time and battery icons stay white */}
        <StatusBar style="light" />
        <Stack 
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: "#000" },
            animation: "none"
          }} 
        />
      </SafeAreaProvider>
    </ThemeProvider>
  );
}
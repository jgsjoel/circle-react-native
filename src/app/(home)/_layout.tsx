import { Stack } from "expo-router";

export default function HomeLayout() {
  return (
    <Stack
      screenOptions={{
        // Hide the header for all screens in (auth) for a custom look
        headerShown: false,
        // Optional: Ensure the background matches your dark theme
        contentStyle: { backgroundColor: '#000' },
        // Smooth transition between login and signup
        animation: 'fade',
      }}
    >
      {/* Explicitly defining screens allows you to set specific 
          options like titles or different animations 
      */}
    </Stack>
  );
}
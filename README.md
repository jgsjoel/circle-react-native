# Circle

A private messaging app built with React Native and Expo. The idea is simple — you only talk to people already in your contacts, no random strangers, no public profiles.

> **Still actively being built.** Core messaging works, but there's a lot more planned.

---

## What works right now

- **Phone number auth** — OTP-based login, no passwords
- **Contacts sync** — pulls your device contacts, matches them against registered users, shows only the ones on Circle
- **Real-time messaging** — WebSocket connection with automatic reconnect and offline queuing
- **Persistent chat history** — messages are stored locally in SQLite (per-user database) so your chat history survives app restarts
- **Message status ticks** — pending → sent → delivered, same as you'd expect from any modern chat app
- **Offline awareness** — detects network state and reconnects automatically when you come back online
- **Profile setup** — photo + bio after first login, uploaded to S3

## Stack

| Layer | Tech |
|---|---|
| Framework | Expo 54 / React Native |
| Navigation | Expo Router (file-based) |
| Styling | NativeWind (Tailwind for RN) |
| Local DB | Expo SQLite + Drizzle ORM |
| State | Zustand |
| Real-time | WebSocket (custom service with reconnect logic) |
| HTTP | Axios |

## Project structure

```
src/
  app/          # Expo Router screens
    (auth)/     # OTP login, profile setup
    (home)/     # Chats + calls tab layout
    (contacts)/ # Contact list and search
    (chat)/     # Chat screen
  services/
    websocket.ts        # WS connection, reconnect, offset tracking
    wsMessageHandler.ts # Incoming message routing (status updates, new messages)
    chatRepository.ts   # All DB reads/writes for chat data
    contacts.ts         # Device contact sync with backend
  store/
    chatStore.ts  # Zustand store — open/close chat, send messages, WS callbacks
  db/
    schema.ts  # Drizzle table definitions
    client.ts  # DB init and per-user database setup
```

## Getting started

```bash
npm install
npx expo prebuild
npx expo run:android   # or run:ios
```

You'll need the backend running locally — it lives at [github.com/jgsjoel/circle-go](https://github.com/jgsjoel/circle-go). The API base URL is set in `src/api/client.ts` and the WebSocket URL in `src/services/websocket.ts` — both point to `192.168.1.5:8080` by default, change these to match your setup.

## What's still being worked on

- Media and file sending (photo/video/document upload via presigned S3 URLs)
- Calls tab (UI placeholder exists, no functionality yet)
- Read receipts
- Group chats
- Push notifications
- Better error states throughout the app

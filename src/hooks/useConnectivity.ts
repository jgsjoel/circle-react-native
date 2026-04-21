import { useEffect, useState, useCallback } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

let globalIsOnline = true;
const listeners = new Set<(online: boolean) => void>();

// Subscribe once at module level
NetInfo.addEventListener((state: NetInfoState) => {
  const online = !!(state.isConnected && state.isInternetReachable !== false);
  if (online !== globalIsOnline) {
    globalIsOnline = online;
    listeners.forEach((fn) => fn(online));
  }
});

export function useConnectivity() {
  const [isOnline, setIsOnline] = useState(globalIsOnline);

  useEffect(() => {
    const handler = (online: boolean) => setIsOnline(online);
    listeners.add(handler);

    // Sync on mount
    NetInfo.fetch().then((state) => {
      const online = !!(state.isConnected && state.isInternetReachable !== false);
      globalIsOnline = online;
      setIsOnline(online);
    });

    return () => {
      listeners.delete(handler);
    };
  }, []);

  return isOnline;
}

/** Imperative check — usable outside React */
export function getIsOnline() {
  return globalIsOnline;
}

/** Subscribe to connectivity changes outside React */
export function onConnectivityChange(cb: (online: boolean) => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

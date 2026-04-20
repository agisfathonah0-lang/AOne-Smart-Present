import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

export const useCheckConnection = () => {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    // Listener real-time
    const unsubscribe = NetInfo.addEventListener(state => {
      // isInternetReachable memastikan internet benar-benar bisa dipakai
      const status = state.isConnected && state.isInternetReachable !== false;
      setIsOnline(status);
    });

    // Cek status awal saat pertama kali hook dipanggil
    NetInfo.fetch().then(state => {
      setIsOnline(state.isConnected && state.isInternetReachable !== false);
    });

    return () => unsubscribe();
  }, []);

  return isOnline;
};
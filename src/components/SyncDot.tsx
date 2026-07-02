import React, { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet } from 'react-native';
import { useSyncStatus } from '../hooks/useSyncStatus';

const COLORS = {
  synced: '#34C759',
  syncing: '#F5A623',
  offline: '#9AA0A6',
};

interface SyncDotProps {
  size?: number;
  borderColor?: string;
}

export default function SyncDot({ size = 12, borderColor = '#fff' }: SyncDotProps) {
  const status = useSyncStatus();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (status !== 'syncing') {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.35, duration: 500, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [status, pulse]);

  return (
    <View
      style={[
        styles.wrapper,
        { width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor },
      ]}
    >
      <Animated.View
        style={[styles.dot, { backgroundColor: COLORS[status], opacity: pulse }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  dot: { width: '100%', height: '100%', borderRadius: 999 },
});

import React from 'react';
import { TouchableOpacity, Image, StyleSheet, Linking, Text, View } from 'react-native';
import { DirectAdConfig } from '../../services/adService';

interface DirectBannerProps {
  config: DirectAdConfig;
}

export default function DirectBanner({ config }: DirectBannerProps) {
  const handlePress = () => {
    adService.recordAdShown();
    Linking.openURL(config.targetUrl).catch((err) => console.error("Couldn't load page", err));
  };

  return (
    <TouchableOpacity style={styles.container} onPress={handlePress} activeOpacity={0.8}>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>Партнер</Text>
      </View>
      <Image
        source={{ uri: config.imageUrl }}
        style={styles.image}
        resizeMode="contain"
      />
      <View style={styles.textContainer}>
        <Text style={styles.title}>Специальное предложение для бизнеса</Text>
        <Text style={styles.subtitle}>Узнать больше на сайте партнера</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    margin: 10,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e9ecef',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  badge: {
    position: 'absolute',
    top: -10,
    right: 10,
    backgroundColor: '#1D9E75',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  image: {
    width: 50,
    height: 50,
    marginRight: 15,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#212529',
  },
  subtitle: {
    fontSize: 12,
    color: '#6c757d',
    marginTop: 2,
  },
});

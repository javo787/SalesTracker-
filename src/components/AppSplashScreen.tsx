import { useEffect } from 'react';
import { StyleSheet, Image, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { Colors } from '../constants/theme';

interface Props {
  ready: boolean;
  onHidden: () => void;
}

export default function AppSplashScreen({ ready, onHidden }: Props) {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.96);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) });
    scale.value = withSequence(
      withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }),
      withRepeat(
        withSequence(
          withTiming(1.015, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
          withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
      ),
    );
  }, []);

  useEffect(() => {
    if (ready) {
      opacity.value = withTiming(0, { duration: 350, easing: Easing.in(Easing.cubic) }, (finished) => {
        if (finished) {
          runOnJS(onHidden)();
        }
      });
      scale.value = withTiming(1.04, { duration: 350, easing: Easing.in(Easing.cubic) });
    }
  }, [ready]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        { zIndex: 10, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
      ]}
      pointerEvents="none"
    >
      <Animated.View style={[styles.logoBox, style]}>
        <Image
          source={require('../../assets/splash.png')}
          resizeMode="contain"
          style={styles.logoImage}
        />
      </Animated.View>
    </View>
  );
}

const IMAGE_ASPECT_RATIO = 768 / 1376; // ширина / высота assets/splash.png

const styles = StyleSheet.create({
  logoBox: {
    width: '55%',
    aspectRatio: IMAGE_ASPECT_RATIO,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
});

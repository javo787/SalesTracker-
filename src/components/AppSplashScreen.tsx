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
    <View style={[StyleSheet.absoluteFill, { zIndex: 10 }]} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFill, style]}>
        <Image
          source={require('../../assets/splash.png')}
          resizeMode="cover"
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: Colors.primary, zIndex: -1 }]} />
    </View>
  );
}

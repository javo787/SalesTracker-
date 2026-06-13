import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Dimensions, SafeAreaView
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');

const STEPS = [
  {
    title: 'Добавьте свои товары',
    description: 'Внесите список того, что вы продаете, укажите цену закупки и продажи.',
    icon: '📦',
    color: '#1D9E75'
  },
  {
    title: 'Записывайте продажи',
    description: 'Используйте голос или вводите вручную. AI сам посчитает вашу прибыль.',
    icon: '🎤',
    color: '#0C447C'
  },
  {
    title: 'Смотрите прибыль',
    description: 'Анализируйте доход за день, неделю или месяц. Управляйте бизнесом мудро.',
    icon: '📈',
    color: '#3B6D11'
  }
];

interface OnboardingScreenProps {
  onFinish: () => void;
}

export default function OnboardingScreen({ onFinish }: OnboardingScreenProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const handleNext = async () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      await AsyncStorage.setItem('onboarding_completed', 'true');
      onFinish();
    }
  };

  const step = STEPS[currentStep];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={[styles.iconContainer, { backgroundColor: step.color }]}>
          <Text style={styles.icon}>{step.icon}</Text>
        </View>

        <Text style={styles.title}>{step.title}</Text>
        <Text style={styles.description}>{step.description}</Text>

        <View style={styles.dots}>
          {STEPS.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                currentStep === i && styles.dotActive,
                { backgroundColor: currentStep === i ? step.color : '#CCC' }
              ]}
            />
          ))}
        </View>
      </View>

      <TouchableOpacity
        style={[styles.button, { backgroundColor: step.color }]}
        onPress={handleNext}
      >
        <Text style={styles.buttonText}>
          {currentStep === STEPS.length - 1 ? 'Начать работу' : 'Далее'}
        </Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 60
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 40
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4
  },
  icon: {
    fontSize: 60
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 20
  },
  description: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24
  },
  dots: {
    flexDirection: 'row',
    marginTop: 40,
    gap: 8
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4
  },
  dotActive: {
    width: 24
  },
  button: {
    width: width - 80,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4
  },
  buttonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold'
  }
});

import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator,
  Image, Animated,
  useWindowDimensions, KeyboardAvoidingView, Platform
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../context/AppContext';
import { useShop } from '../context/ShopContext';
import CurrencyStepSelector from '../components/onboarding/CurrencyStepSelector';

interface OnboardingStep {
  title: string;
  description: string;
  image: any;
  color: string;
  isSellerModeStep?: boolean;
  isRoleStep?: boolean;
  isCurrencyStep?: boolean;
}

interface OnboardingScreenProps {
  onFinish: () => void;
}

export default function OnboardingScreen({ onFinish }: OnboardingScreenProps) {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const illustrationSize = Math.min(width * 0.72, 300);

  const [selectedMode, setSelectedMode] = useState<'retail' | 'wholesale' | null>(null);
  const [selectedRole, setSelectedRole] = useState<'owner' | 'seller' | null>(null);
  const [selectedCurrencyCode, setSelectedCurrencyCode] = useState<string | null>(null);

  const STEPS: OnboardingStep[] = useMemo(() => {
    const baseSteps: OnboardingStep[] = [
      {
        title: t('onboarding.step1Title'),
        description: t('onboarding.step1Desc'),
        image: require('../../assets/onboarding/step1.png'),
        color: '#1D9E75'
      },
      {
        title: t('onboarding.step2Title'),
        description: t('onboarding.step2Desc'),
        image: require('../../assets/onboarding/step2.png'),
        color: '#0C447C'
      },
      {
        title: t('onboarding.step3Title'),
        description: t('onboarding.step3Desc'),
        image: require('../../assets/onboarding/step3.png'),
        color: '#854F0B',
        isSellerModeStep: true,
      },
      {
        title: t('onboarding.step4Title'),
        description: t('onboarding.step4Desc'),
        image: require('../../assets/onboarding/step4.png'),
        color: '#534AB7',
        isRoleStep: true,
      },
    ];

    if (selectedRole === 'owner') {
      baseSteps.push({
        title: t('onboarding.currencyTitle'),
        description: t('onboarding.currencyDesc'),
        image: null as any,
        color: '#0E7C66',
        isCurrencyStep: true,
      });
    }

    baseSteps.push({
      title: t('onboarding.step5Title'),
      description: t('onboarding.step5Desc'),
      image: require('../../assets/onboarding/step5.png'),
      color: '#3B6D11'
    });

    return baseSteps;
  }, [selectedRole, t]);

  const { setSellerMode, setCurrency } = useAppContext();
  const { createShop, joinShop } = useShop();
  const [currentStep, setCurrentStep] = useState(0);

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  const goToStep = (nextStep: number) => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      setCurrentStep(nextStep);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    });
  };

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: currentStep + 1,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [currentStep]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, STEPS.length],
    outputRange: ['0%', '100%'],
  });
  const [shopNameInput, setShopNameInput] = useState('');
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [roleLoading, setRoleLoading] = useState(false);
  const [roleError, setRoleError] = useState('');

  const step = STEPS[currentStep] || STEPS[STEPS.length - 1];

  useEffect(() => {
    if (step?.isCurrencyStep && !selectedCurrencyCode) {
      const lang = i18n.language.split('-')[0];
      const defaultByLang: Record<string, string> = {
        tg: 'TJS', uz: 'UZS', ru: 'TJS',
        en: 'USD', pt: 'USD', it: 'USD', es: 'USD',
      };
      setSelectedCurrencyCode(defaultByLang[lang] || 'TJS');
    }
  }, [currentStep, step, i18n.language, selectedCurrencyCode]);

  const handleNext = async () => {
    if (step.isSellerModeStep) {
      if (!selectedMode) return;
      await setSellerMode(selectedMode);
    }

    if (step.isRoleStep) {
      if (!selectedRole) { setRoleError(t('onboarding.errorSelectRole')); return; }
      setRoleLoading(true);
      setRoleError('');
      try {
        if (selectedRole === 'owner') {
          if (!shopNameInput.trim()) { setRoleError(t('onboarding.errorShopName')); setRoleLoading(false); return; }
          await createShop(shopNameInput.trim());
        } else {
          if (inviteCodeInput.length < 6) { setRoleError(t('onboarding.errorInviteCode')); setRoleLoading(false); return; }
          await joinShop(inviteCodeInput.trim().toUpperCase());
        }
      } catch (e: any) {
        setRoleError(e.message || t('onboarding.errorGeneric'));
        setRoleLoading(false);
        return;
      }
      setRoleLoading(false);
    }

    if (step.isCurrencyStep) {
      if (!selectedCurrencyCode) return;
      await setCurrency(selectedCurrencyCode);
    }

    if (currentStep < STEPS.length - 1) {
      goToStep(currentStep + 1);
    } else {
      await AsyncStorage.setItem('onboarding_completed', 'true');
      onFinish();
    }
  };

  return (
    <View style={[styles.container, { flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={[styles.progressTrack, { marginTop: Math.max(12, insets.top > 0 ? 12 : 20) }]}>
          <Animated.View
            style={[
              styles.progressFill,
              { width: progressWidth, backgroundColor: step.color }
            ]}
          />
        </View>
        <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
          {step.isSellerModeStep ? (
          <View style={selectionStyles.container}>
            <TouchableOpacity
              style={[
                selectionStyles.card,
                selectedMode === 'retail' && selectionStyles.cardActive
              ]}
              onPress={() => setSelectedMode('retail')}
            >
              <Text style={selectionStyles.cardIcon}>🛒</Text>
              <Text style={selectionStyles.cardTitle}>{t('onboarding.retailTitle')}</Text>
              <Text style={selectionStyles.cardDesc}>{t('onboarding.retailDesc')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                selectionStyles.card,
                selectedMode === 'wholesale' && selectionStyles.cardActive
              ]}
              onPress={() => setSelectedMode('wholesale')}
            >
              <Text style={selectionStyles.cardIcon}>📦</Text>
              <Text style={selectionStyles.cardTitle}>{t('onboarding.wholesaleTitle')}</Text>
              <Text style={selectionStyles.cardDesc}>{t('onboarding.wholesaleDesc')}</Text>
            </TouchableOpacity>
          </View>
        ) : step.isRoleStep ? (
          <View style={roleStyles.container}>
            <View style={roleStyles.roleRow}>
              <TouchableOpacity
                style={[roleStyles.roleBtn, selectedRole === 'owner' && roleStyles.roleBtnActive]}
                onPress={() => { setSelectedRole('owner'); setRoleError(''); }}
              >
                <Text style={[roleStyles.roleText, selectedRole === 'owner' && roleStyles.roleTextActive]}>{t('onboarding.ownerLabel')}</Text>
                <Text style={roleStyles.roleSubtext}>{t('onboarding.ownerSubtext')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[roleStyles.roleBtn, selectedRole === 'seller' && roleStyles.roleBtnActive]}
                onPress={() => { setSelectedRole('seller'); setRoleError(''); }}
              >
                <Text style={[roleStyles.roleText, selectedRole === 'seller' && roleStyles.roleTextActive]}>{t('onboarding.sellerLabel')}</Text>
                <Text style={roleStyles.roleSubtext}>{t('onboarding.sellerSubtext')}</Text>
              </TouchableOpacity>
            </View>

            {selectedRole === 'owner' && (
              <View style={roleStyles.inputGroup}>
                <Text style={roleStyles.label}>{t('onboarding.shopNameLabel')}</Text>
                <TextInput
                  style={roleStyles.input}
                  placeholder={t('debt.placeholderShopName')}
                  value={shopNameInput}
                  onChangeText={setShopNameInput}
                  autoFocus
                />
              </View>
            )}

            {selectedRole === 'seller' && (
              <View style={roleStyles.inputGroup}>
                <Text style={roleStyles.label}>{t('onboarding.inviteCodeLabel')}</Text>
                <TextInput
                  style={roleStyles.input}
                  placeholder={t('debt.placeholderInviteCode')}
                  value={inviteCodeInput}
                  onChangeText={setInviteCodeInput}
                  autoCapitalize="characters"
                  maxLength={6}
                  autoFocus
                />
              </View>
            )}

            {roleError ? <Text style={roleStyles.errorText}>{roleError}</Text> : null}
            {roleLoading && <ActivityIndicator color="#534AB7" style={{ marginTop: 10 }} />}
          </View>
          ) : step.isCurrencyStep ? (
            <CurrencyStepSelector
              selectedCode={selectedCurrencyCode}
              onSelect={setSelectedCurrencyCode}
            />
          ) : (
            <View style={[styles.iconContainer, {
              backgroundColor: step.color + '15',
              width: illustrationSize,
              height: illustrationSize
            }]}>
              <Image source={step.image} style={styles.illustrationImage} resizeMode="contain" />
            </View>
          )}

          <Text style={styles.title}>{step.title}</Text>
          <Text style={styles.description}>{step.description}</Text>
        </Animated.View>

        <View style={[styles.buttonContainer, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
        {currentStep > 0 && (
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => goToStep(currentStep - 1)}
          >
            <Text style={styles.backButtonText}>{t('onboarding.backBtn')}</Text>
          </TouchableOpacity>
        )}
          <TouchableOpacity
            style={[
              styles.button,
              { backgroundColor: step.color },
              ((step.isSellerModeStep && !selectedMode) ||
               (step.isRoleStep && !selectedRole) ||
               (step.isCurrencyStep && !selectedCurrencyCode) ||
               roleLoading) && { opacity: 0.5 }
            ]}
            onPress={handleNext}
            disabled={
              (step.isSellerModeStep && !selectedMode) ||
              (step.isRoleStep && !selectedRole) ||
              (step.isCurrencyStep && !selectedCurrencyCode) ||
              roleLoading
            }
            activeOpacity={0.82}
          >
            <Text style={styles.buttonText}>
              {currentStep === STEPS.length - 1 ? t('onboarding.startBtn') : t('onboarding.nextBtn')}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF',
  },
  content: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40
  },
  iconContainer: {
    borderRadius: 24,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
  },
  illustrationImage: {
    width: '90%',
    height: '90%',
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
  buttonContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
    width: '100%',
    justifyContent: 'center',
    marginTop: 16,
  },
  button: {
    flex: 1,
    height: 58,
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
    fontWeight: 'bold',
    letterSpacing: 0.3
  },
  backButton: {
    flex: 0.35,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#DDD',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent'
  },
  backButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600'
  },
  progressTrack: {
    height: 4,
    backgroundColor: '#EEE',
    borderRadius: 2,
    marginHorizontal: 20,
    overflow: 'hidden',
    alignSelf: 'stretch'
  },
  progressFill: {
    height: 4,
    borderRadius: 2
  }
});

const selectionStyles = StyleSheet.create({
  container: { gap: 16, width: '100%', paddingHorizontal: 20 },
  card: {
    borderWidth: 2, borderColor: '#E0E0E0', borderRadius: 16,
    padding: 20, alignItems: 'center', backgroundColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  cardActive: { borderColor: '#1D9E75', backgroundColor: '#F0FBF7' },
  cardIcon: { fontSize: 40, marginBottom: 10 },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 6 },
  cardDesc: { fontSize: 13, color: '#777', textAlign: 'center', lineHeight: 18 },
});

const roleStyles = StyleSheet.create({
  container: { width: '100%', paddingHorizontal: 20, marginBottom: 20 },
  roleRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  roleBtn: {
    flex: 1, padding: 16, borderRadius: 16, borderWidth: 2, borderColor: '#E0E0E0',
    alignItems: 'center', backgroundColor: '#FFF'
  },
  roleBtnActive: { borderColor: '#534AB7', backgroundColor: '#F5F4FF' },
  roleText: { fontSize: 14, fontWeight: '600', color: '#666' },
  roleTextActive: { color: '#534AB7' },
  roleSubtext: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
    textAlign: 'center',
  },
  inputGroup: { width: '100%' },
  label: { fontSize: 14, color: '#666', marginBottom: 8, fontWeight: '500' },
  input: {
    width: '100%', height: 50, borderRadius: 12, borderWidth: 1, borderColor: '#E0E0E0',
    paddingHorizontal: 16, fontSize: 16, backgroundColor: '#FAFAFA'
  },
  errorText: { color: '#FF3B30', fontSize: 13, marginTop: 8, textAlign: 'center' }
});

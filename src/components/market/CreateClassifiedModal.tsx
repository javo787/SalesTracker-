import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import { useAppContext } from '../../context/AppContext';
import { ClassifiedCategory } from '../../types/ads';
import { marketService } from '../../services/marketService';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const CATEGORIES: ClassifiedCategory[] = [
  'rent_spot',
  'rent_shop',
  'hire_seller',
  'looking_for_job',
  'sell_equipment',
  'buy_equipment',
  'partnership',
  'other',
];

export default function CreateClassifiedModal({ visible, onClose, onSuccess }: Props) {
  const { t } = useTranslation();
  const { resolvedTheme, currency } = useAppContext(); const isDark = resolvedTheme === "dark";

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ClassifiedCategory>('other');
  const [city, setCity] = useState('');
  const [market, setMarket] = useState('');
  const [price, setPrice] = useState('');
  const [phone, setPhone] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const pickImage = async () => {
    if (images.length >= 3) {
      Alert.alert(t('common.error'), t('classifieds.uploadImages'));
      return;
    }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('common.error'), 'Sorry, we need camera roll permissions to make this work!');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.6,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      setImages([...images, `data:image/jpeg;base64,${result.assets[0].base64}`]);
    }
  };

  const removeImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!title || !description || !city || !phone) {
      Alert.alert(t('common.error'), t('classifieds.errorFillAll'));
      return;
    }

    setLoading(true);
    try {
      await marketService.createClassified({
        title,
        description,
        category,
        city,
        market,
        price: price ? parseFloat(price) : undefined,
        currency: currency.code as 'TJS' | 'UZS',
        userPhone: phone,
        images,
      });

      Alert.alert('Success', t('classifieds.success'));
      onSuccess();
      handleClose();
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setTitle('');
    setDescription('');
    setCategory('other');
    setCity('');
    setMarket('');
    setPrice('');
    setPhone('');
    setImages([]);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={[styles.modalContent, isDark ? styles.darkBg : styles.lightBg]}
        >
          <View style={styles.header}>
            <Text style={[styles.headerTitle, isDark ? styles.textWhite : styles.textBlack]}>
              {t('classifieds.createTitle')}
            </Text>
            <TouchableOpacity onPress={handleClose}>
              <Ionicons name="close" size={28} color={isDark ? '#fff' : '#000'} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.form}>
            <Text style={[styles.label, isDark ? styles.textGray : styles.textDarkGray]}>{t('addSale.productName')} *</Text>
            <TextInput
              style={[styles.input, isDark ? styles.inputDark : styles.inputLight]}
              value={title}
              onChangeText={setTitle}
              placeholder="Сдаю место на Саховском..."
              placeholderTextColor="#888"
            />

            <Text style={[styles.label, isDark ? styles.textGray : styles.textDarkGray]}>{t('classifieds.city')} *</Text>
            <TextInput
              style={[styles.input, isDark ? styles.inputDark : styles.inputLight]}
              value={city}
              onChangeText={setCity}
              placeholder="Худжанд"
              placeholderTextColor="#888"
            />

            <Text style={[styles.label, isDark ? styles.textGray : styles.textDarkGray]}>{t('classifieds.market')}</Text>
            <TextInput
              style={[styles.input, isDark ? styles.inputDark : styles.inputLight]}
              value={market}
              onChangeText={setMarket}
              placeholder="Панчшанбе"
              placeholderTextColor="#888"
            />

            <Text style={[styles.label, isDark ? styles.textGray : styles.textDarkGray]}>{t('classifieds.description')} *</Text>
            <TextInput
              style={[styles.input, styles.textArea, isDark ? styles.inputDark : styles.inputLight]}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
              placeholder="Подробности вашего предложения..."
              placeholderTextColor="#888"
            />

            <View style={styles.row}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={[styles.label, isDark ? styles.textGray : styles.textDarkGray]}>{t('classifieds.price')}</Text>
                <TextInput
                  style={[styles.input, isDark ? styles.inputDark : styles.inputLight]}
                  value={price}
                  onChangeText={setPrice}
                  keyboardType="numeric"
                  placeholder={`0 ${currency}`}
                  placeholderTextColor="#888"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, isDark ? styles.textGray : styles.textDarkGray]}>{t('classifieds.contact')} *</Text>
                <TextInput
                  style={[styles.input, isDark ? styles.inputDark : styles.inputLight]}
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  placeholder="+992..."
                  placeholderTextColor="#888"
                />
              </View>
            </View>

            <Text style={[styles.label, isDark ? styles.textGray : styles.textDarkGray]}>{t('expenses.category')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
              {CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.categoryChip,
                    category === cat ? styles.categoryChipActive : (isDark ? styles.chipDark : styles.chipLight)
                  ]}
                  onPress={() => setCategory(cat)}
                >
                  <Text style={[
                    styles.categoryChipText,
                    category === cat ? styles.textWhite : (isDark ? styles.textGray : styles.textDarkGray)
                  ]}>
                    {t(`classifieds.categories.${cat}`)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={[styles.label, isDark ? styles.textGray : styles.textDarkGray]}>{t('classifieds.uploadImages')}</Text>
            <View style={styles.imageContainer}>
              {images.map((img, index) => (
                <View key={index} style={styles.imageWrapper}>
                  <Image source={{ uri: img }} style={styles.previewImage} />
                  <TouchableOpacity style={styles.removeImage} onPress={() => removeImage(index)}>
                    <Ionicons name="close-circle" size={20} color="#E53935" />
                  </TouchableOpacity>
                </View>
              ))}
              {images.length < 3 && (
                <TouchableOpacity style={[styles.addImage, isDark ? styles.inputDark : styles.inputLight]} onPress={pickImage}>
                  <Ionicons name="camera-outline" size={32} color="#1D9E75" />
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, loading && styles.disabledBtn]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                  <Text style={styles.submitBtnText}>{t('classifieds.submit')}</Text>
                </>
              )}
            </TouchableOpacity>
            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    height: '90%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
  },
  lightBg: { backgroundColor: '#fff' },
  darkBg: { backgroundColor: '#121212' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  textWhite: { color: '#fff' },
  textBlack: { color: '#000' },
  textGray: { color: '#aaa' },
  textDarkGray: { color: '#555' },
  form: {
    flex: 1,
  },
  label: {
    fontSize: 14,
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
  },
  inputLight: { backgroundColor: '#F5F5F5', color: '#000' },
  inputDark: { backgroundColor: '#1E1E1E', color: '#fff' },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  categoryScroll: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  categoryChipActive: {
    backgroundColor: '#1D9E75',
    borderColor: '#1D9E75',
  },
  chipLight: { backgroundColor: '#F5F5F5' },
  chipDark: { backgroundColor: '#1E1E1E' },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  imageContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    marginBottom: 20,
  },
  imageWrapper: {
    position: 'relative',
  },
  previewImage: {
    width: 80,
    height: 80,
    borderRadius: 10,
  },
  removeImage: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#fff',
    borderRadius: 10,
  },
  addImage: {
    width: 80,
    height: 80,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1D9E75',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitBtn: {
    backgroundColor: '#1D9E75',
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 20,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  disabledBtn: {
    backgroundColor: '#888',
  },
});

import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, Image, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';
import { useAppContext } from '../../context/AppContext';
import { Colors, Radius, Spacing, Shadow } from '../../constants/theme';
import { InvoiceScanItem, InvoiceScanResult } from '../../types/invoiceScan';

interface Props {
  visible: boolean;
  onClose: () => void;
}

type ScanStage = 'intro' | 'uploading' | 'review' | 'failed';

/**
 * Этап 2 фичи "склад по фото накладной": захват фото, сжатие, вызов
 * /invoice-scan, простой редактируемый список найденных позиций.
 *
 * Сознательно НЕТ на этом этапе:
 * - сопоставления с каталогом магазина (matchProductByName/voice-disambiguate) — этап 3;
 * - сохранения на склад (applyInvoiceScan) — этап 4, чтобы не плодить дубли
 *   товаров раньше, чем появится сопоставление с уже существующими.
 * Это осознанно "тестовый просмотр" — чтобы можно было проверить, насколько
 * хорошо AI читает реальные накладные, до того как достраивать остальное.
 */
export default function InvoiceScanModal({ visible, onClose }: Props) {
  const { t } = useTranslation();
  const { resolvedTheme, currency } = useAppContext();
  const isDark = resolvedTheme === 'dark';

  const [stage, setStage] = useState<ScanStage>('intro');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [result, setResult] = useState<InvoiceScanResult | null>(null);
  const [items, setItems] = useState<InvoiceScanItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const resetAndClose = () => {
    abortRef.current?.abort();
    setStage('intro');
    setPhotoUri(null);
    setResult(null);
    setItems([]);
    setErrorMessage(null);
    onClose();
  };

  const pickAndUpload = async (source: 'camera' | 'gallery') => {
    try {
      const perm = source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (perm.status !== 'granted') {
        Alert.alert(t('common.error'), t('warehouse.invoiceScanPermissionDenied'));
        return;
      }

      const pickerResult = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });

      if (pickerResult.canceled || !pickerResult.assets?.[0]?.uri) return;

      const originalUri = pickerResult.assets[0].uri;

      // Сжатие перед отправкой: фото с телефона может быть несколько MB, а
      // размер файла напрямую влияет на задержку и стоимость vision-запроса
      // к Gemini на бэкенде. 1600px по длинной стороне более чем достаточно
      // для рукописного текста.
      const manipulated = await ImageManipulator.manipulateAsync(
        originalUri,
        [{ resize: { width: 1600 } }],
        { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG }
      );

      setPhotoUri(manipulated.uri);
      await uploadInvoicePhoto(manipulated.uri);
    } catch (e: any) {
      console.error('[InvoiceScanModal] capture error', e);
      Alert.alert(t('common.error'), e?.message || t('warehouse.invoiceScanFailedTitle'));
    }
  };

  const uploadInvoicePhoto = async (uri: string) => {
    setStage('uploading');
    setErrorMessage(null);
    abortRef.current = new AbortController();

    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL;
      if (!apiUrl) {
        throw new Error('API URL не настроен. Обратитесь к администратору приложения.');
      }

      const token = await SecureStore.getItemAsync('auth_token');
      const uploadHeaders: Record<string, string> = {};
      if (token) uploadHeaders['Authorization'] = `Bearer ${token}`;

      const uploadResult = await FileSystem.uploadAsync(`${apiUrl}/invoice-scan`, uri, {
        fieldName: 'file',
        httpMethod: 'POST',
        mimeType: 'image/jpeg',
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        headers: uploadHeaders,
      });

      let body: any;
      try {
        body = JSON.parse(uploadResult.body);
      } catch {
        body = { message: uploadResult.body };
      }

      if (uploadResult.status === 401) {
        await SecureStore.deleteItemAsync('auth_token');
        throw new Error('Сессия истекла. Пожалуйста, войдите снова.');
      }

      if (uploadResult.status === 429) {
        const retryAfter = body?.retryAfterSeconds ? ` через ${body.retryAfterSeconds} сек.` : ' через минуту.';
        throw new Error(`Слишком много попыток. Попробуйте${retryAfter}`);
      }

      if (uploadResult.status !== 200 && uploadResult.status !== 201) {
        const errCode: string | undefined = body?.error;
        const FRIENDLY_ERRORS: Record<string, string> = {
          file_too_large: 'Фото слишком большое. Попробуйте ещё раз.',
          missing_file: 'Фото не получено. Попробуйте ещё раз.',
          pipeline_timeout: 'Не удалось распознать за отведённое время. Проверьте связь и попробуйте снова.',
          internal_error: 'Произошла ошибка на сервере. Мы уже получили уведомление об этом.',
        };
        const FRIENDLY_BY_STATUS: Record<number, string> = {
          503: 'Сервис распознавания перегружен. Попробуйте через минуту.',
          504: 'Не удалось распознать за отведённое время. Проверьте связь и попробуйте снова.',
          500: 'Произошла ошибка на сервере. Мы уже получили уведомление об этом.',
        };
        const friendly = (errCode && FRIENDLY_ERRORS[errCode]) || FRIENDLY_BY_STATUS[uploadResult.status];
        throw new Error(friendly || `[${uploadResult.status}] ${body?.message || 'Ошибка API'}`);
      }

      const parsed = body as InvoiceScanResult;
      setResult(parsed);
      setItems(parsed.items);

      if (parsed.source === 'scan_failed' || parsed.items.length === 0) {
        setStage('failed');
      } else {
        setStage('review');
      }
    } catch (e: any) {
      if (e.name === 'AbortError') return;
      setErrorMessage(e?.message || null);
      setStage('failed');
    }
  };

  const updateItem = (index: number, patch: Partial<InvoiceScanItem>) => {
    setItems(prev => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={resetAndClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, isDark ? styles.bgDark : styles.bgLight]}>
          <View style={styles.header}>
            <Text style={[styles.headerTitle, isDark ? styles.textWhite : styles.textBlack]}>
              {t('warehouse.invoiceScanTitle')}
            </Text>
            <TouchableOpacity onPress={resetAndClose} style={styles.closeBtn}>
              <Ionicons name="close" size={26} color={isDark ? '#fff' : '#000'} />
            </TouchableOpacity>
          </View>

          {stage === 'intro' && (
            <View style={styles.introBody}>
              <Ionicons name="receipt-outline" size={56} color={Colors.primary} style={{ marginBottom: 16 }} />
              <Text style={[styles.introText, isDark ? styles.textWhite : styles.textBlack]}>
                {t('warehouse.invoiceScanIntro')}
              </Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => pickAndUpload('camera')}>
                <Ionicons name="camera-outline" size={20} color="#fff" />
                <Text style={styles.primaryBtnText}>{t('warehouse.invoiceScanTakePhoto')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => pickAndUpload('gallery')}>
                <Ionicons name="images-outline" size={20} color={Colors.primary} />
                <Text style={styles.secondaryBtnText}>{t('warehouse.invoiceScanChooseGallery')}</Text>
              </TouchableOpacity>
            </View>
          )}

          {stage === 'uploading' && (
            <View style={styles.introBody}>
              {photoUri && <Image source={{ uri: photoUri }} style={styles.photoPreviewLarge} />}
              <ActivityIndicator size="large" color={Colors.primary} style={{ marginVertical: 16 }} />
              <Text style={[styles.introText, isDark ? styles.textWhite : styles.textBlack]}>
                {t('warehouse.invoiceScanProcessing')}
              </Text>
            </View>
          )}

          {stage === 'failed' && (
            <View style={styles.introBody}>
              {photoUri && <Image source={{ uri: photoUri }} style={styles.photoPreviewLarge} />}
              <Ionicons name="alert-circle-outline" size={48} color={Colors.warning} style={{ marginVertical: 12 }} />
              <Text style={[styles.introText, isDark ? styles.textWhite : styles.textBlack, { fontWeight: '600' }]}>
                {errorMessage || t('warehouse.invoiceScanFailedTitle')}
              </Text>
              <Text style={[styles.introSubtext, isDark ? styles.textGray : styles.textDarkGray]}>
                {t('warehouse.invoiceScanFailedBody')}
              </Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => setStage('intro')}>
                <Ionicons name="camera-outline" size={20} color="#fff" />
                <Text style={styles.primaryBtnText}>{t('warehouse.invoiceScanRetake')}</Text>
              </TouchableOpacity>
            </View>
          )}

          {stage === 'review' && result && (
            <>
              <ScrollView style={styles.reviewScroll}>
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryText, isDark ? styles.textGray : styles.textDarkGray]}>
                    {t('warehouse.invoiceScanItemsFound', { count: items.length })}
                  </Text>
                  {result.supplier_hint && (
                    <Text style={[styles.summaryText, isDark ? styles.textGray : styles.textDarkGray]}>
                      {t('warehouse.invoiceScanSupplierPrefix', { name: result.supplier_hint })}
                    </Text>
                  )}
                </View>

                {result.grand_total !== null && (
                  <View style={[styles.totalsBox, result.grand_total_mismatch && styles.totalsBoxWarning]}>
                    <Text style={[styles.totalsText, isDark ? styles.textWhite : styles.textBlack]}>
                      {t('warehouse.invoiceScanGrandTotalLabel', { total: result.grand_total })}
                    </Text>
                    {result.grand_total_mismatch && (
                      <Text style={styles.mismatchText}>
                        {t('warehouse.invoiceScanGrandMismatch', {
                          computed: result.computed_total,
                          stated: result.grand_total,
                        })}
                      </Text>
                    )}
                  </View>
                )}

                {items.map((item, index) => (
                  <View
                    key={index}
                    style={[
                      styles.itemCard,
                      isDark ? styles.cardDark : styles.cardLight,
                      item.needs_confirmation && styles.itemCardWarning,
                    ]}
                  >
                    {item.needs_confirmation && (
                      <View style={styles.reviewBadge}>
                        <Ionicons name="alert-circle" size={13} color="#fff" />
                        <Text style={styles.reviewBadgeText}>{t('warehouse.invoiceScanNeedsReview')}</Text>
                      </View>
                    )}

                    <TextInput
                      style={[styles.itemNameInput, isDark ? styles.textWhite : styles.textBlack]}
                      value={item.product_name}
                      onChangeText={(v) => updateItem(index, { product_name: v })}
                      placeholder={t('addSale.productName') ?? undefined}
                      placeholderTextColor={isDark ? '#888' : '#aaa'}
                    />
                    {item.variant ? (
                      <TextInput
                        style={[styles.itemVariantInput, isDark ? styles.textGray : styles.textDarkGray]}
                        value={item.variant}
                        onChangeText={(v) => updateItem(index, { variant: v })}
                      />
                    ) : null}

                    <View style={styles.itemFieldsRow}>
                      <View style={styles.itemFieldCol}>
                        <Text style={styles.itemFieldLabel}>{t('warehouse.invoiceScanQuantity')}</Text>
                        <TextInput
                          style={[styles.itemFieldInput, isDark ? styles.textWhite : styles.textBlack]}
                          value={String(item.quantity)}
                          onChangeText={(v) => updateItem(index, { quantity: Number(v.replace(',', '.')) || 0 })}
                          keyboardType="numeric"
                        />
                      </View>
                      <View style={styles.itemFieldCol}>
                        <Text style={styles.itemFieldLabel}>{t('warehouse.invoiceScanUnitPrice')}</Text>
                        <TextInput
                          style={[styles.itemFieldInput, isDark ? styles.textWhite : styles.textBlack]}
                          value={String(item.unit_price)}
                          onChangeText={(v) => updateItem(index, { unit_price: Number(v.replace(',', '.')) || 0 })}
                          keyboardType="numeric"
                        />
                      </View>
                      <View style={styles.itemFieldCol}>
                        <Text style={styles.itemFieldLabel}>{currency.symbol}</Text>
                        <Text style={[styles.itemLineTotal, isDark ? styles.textWhite : styles.textBlack]}>
                          {(item.quantity * item.unit_price).toFixed(0)}
                        </Text>
                      </View>
                    </View>

                    {item.line_total_mismatch && item.line_total !== null && (
                      <Text style={styles.mismatchText}>
                        {t('warehouse.invoiceScanLineMismatch', {
                          computed: (item.quantity * item.unit_price).toFixed(0),
                          stated: item.line_total,
                        })}
                      </Text>
                    )}

                    {item.category_guess ? (
                      <Text style={[styles.categoryGuessText, isDark ? styles.textGray : styles.textDarkGray]}>
                        {item.category_guess}
                      </Text>
                    ) : null}
                  </View>
                ))}

                <View style={{ height: 20 }} />
              </ScrollView>

              <View style={styles.previewNoteBox}>
                <Ionicons name="information-circle-outline" size={16} color={Colors.info} />
                <Text style={styles.previewNoteText}>{t('warehouse.invoiceScanPreviewNote')}</Text>
              </View>
            </>
          )}
        </View>
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
  bgLight: { backgroundColor: '#fff' },
  bgDark: { backgroundColor: '#121212' },
  cardLight: { backgroundColor: '#F9F9F9' },
  cardDark: { backgroundColor: '#1E1E1E' },
  textWhite: { color: '#fff' },
  textBlack: { color: '#000' },
  textGray: { color: '#aaa' },
  textDarkGray: { color: '#555' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeBtn: {
    padding: 4,
  },
  introBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  introText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
  },
  introSubtext: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  photoPreviewLarge: {
    width: 160,
    height: 160,
    borderRadius: Radius.lg,
    marginBottom: 12,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: Radius.lg,
    width: '100%',
    marginBottom: 12,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: Radius.lg,
    width: '100%',
  },
  secondaryBtnText: {
    color: Colors.primary,
    fontSize: 15,
    fontWeight: '600',
  },
  reviewScroll: {
    flex: 1,
  },
  summaryRow: {
    marginBottom: 10,
    gap: 2,
  },
  summaryText: {
    fontSize: 13,
  },
  totalsBox: {
    backgroundColor: Colors.infoLight,
    borderRadius: Radius.md,
    padding: 12,
    marginBottom: 12,
  },
  totalsBoxWarning: {
    backgroundColor: Colors.warningLight,
  },
  totalsText: {
    fontSize: 14,
    fontWeight: '600',
  },
  mismatchText: {
    fontSize: 12,
    color: Colors.warning,
    fontWeight: '600',
    marginTop: 4,
  },
  itemCard: {
    borderRadius: Radius.lg,
    padding: 12,
    marginBottom: 10,
    ...Shadow.sm,
  },
  itemCardWarning: {
    borderWidth: 1.5,
    borderColor: Colors.warning,
  },
  reviewBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    backgroundColor: Colors.warning,
    borderRadius: Radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 8,
  },
  reviewBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  itemNameInput: {
    fontSize: 16,
    fontWeight: '600',
    padding: 0,
    marginBottom: 2,
  },
  itemVariantInput: {
    fontSize: 13,
    padding: 0,
    marginBottom: 8,
  },
  itemFieldsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: 4,
  },
  itemFieldCol: {
    flex: 1,
  },
  itemFieldLabel: {
    fontSize: 11,
    color: '#999',
    marginBottom: 2,
  },
  itemFieldInput: {
    fontSize: 15,
    fontWeight: '600',
    padding: 0,
  },
  itemLineTotal: {
    fontSize: 15,
    fontWeight: '600',
  },
  categoryGuessText: {
    fontSize: 12,
    marginTop: 6,
    fontStyle: 'italic',
  },
  previewNoteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.infoLight,
    borderRadius: Radius.md,
    padding: 10,
    marginTop: 8,
  },
  previewNoteText: {
    flex: 1,
    fontSize: 12,
    color: Colors.info,
  },
});

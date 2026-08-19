import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';
import { useAppContext } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useShop } from '../../context/ShopContext';
import { Colors, Radius, Spacing, Shadow } from '../../constants/theme';
import { InvoiceScanItem, InvoiceScanResult, InvoiceScanApplyItem } from '../../types/invoiceScan';
import { getProducts, applyInvoiceScan, findPossibleDuplicateInvoiceScan } from '../../db/database';
import { matchProductByName, ProductMatchResult } from '../../utils/productMatching';
import { AutocompleteResult, Product } from '../../types/product';
import { SmartMatchQuotaService } from '../../services/SmartMatchQuotaService';
import { SyncService } from '../../services/syncService';
import { api } from '../../services/api';
import { VariantPicker } from '../sales/VariantPicker';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

type ScanStage = 'intro' | 'uploading' | 'review' | 'failed';

/**
 * Этап 3 фичи "склад по фото накладной": добавлено сопоставление с
 * каталогом магазина (matchProductByName -> /voice-disambiguate для
 * неоднозначных случаев, тот же паттерн, что VoiceBatchReview.tsx для
 * голосовых продаж) и наследование категории от найденного товара.
 *
 * Всё ещё НЕТ сохранения на склад (applyInvoiceScan) - это этап 4.
 * matchedProductId/matchConfidence на каждом item уже готовы к тому,
 * чтобы этап 4 их просто использовал.
 */
/**
 * Этап 4 (финальный) фичи "склад по фото накладной": сохранение на склад
 * одной транзакцией (applyInvoiceScan), обязательная цена продажи для
 * новых товаров, защита от повторного скана, единый push() после сохранения.
 */
export default function InvoiceScanModal({ visible, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  const { resolvedTheme, currency, isPremium } = useAppContext();
  const { user } = useAuth();
  const { sellerName } = useShop();
  const isDark = resolvedTheme === 'dark';

  const [stage, setStage] = useState<ScanStage>('intro');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [result, setResult] = useState<InvoiceScanResult | null>(null);
  const [items, setItems] = useState<InvoiceScanItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [matchResults, setMatchResults] = useState<Record<number, ProductMatchResult>>({});
  const [smartLimitReached, setSmartLimitReached] = useState(false);
  const [remainingQuota, setRemainingQuota] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const catalogRef = useRef<AutocompleteResult[]>([]);
  const productsByIdRef = useRef<Map<number, Product>>(new Map());

  const currentSellerId = user?._id || null;
  const currentSellerName = sellerName || user?.name || null;

  const resetAndClose = () => {
    abortRef.current?.abort();
    setStage('intro');
    setPhotoUri(null);
    setResult(null);
    setItems([]);
    setErrorMessage(null);
    setMatchResults({});
    setSmartLimitReached(false);
    setSaving(false);
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
      const itemsWithSellPrice = parsed.items.map(it => ({ ...it, sell_price: null }));

      if (parsed.source === 'scan_failed' || parsed.items.length === 0) {
        setItems(itemsWithSellPrice);
        setStage('failed');
      } else {
        setStage('review');
        await runMatching(itemsWithSellPrice);
      }
    } catch (e: any) {
      if (e.name === 'AbortError') return;
      setErrorMessage(e?.message || null);
      setStage('failed');
    }
  };

  /**
   * Локальное сопоставление (Левенштейн+транслитерация, см.
   * utils/productMatching.ts) для каждой позиции против ПОЛНОГО каталога
   * магазина, плюс наследование категории у сопоставленных товаров.
   * Доминирующая категория среди уже сопоставленных позиций этой же
   * накладной - разумный дефолт для реально новых товаров: одна накладная
   * обычно = один поставщик = одна товарная группа.
   */
  const runMatching = async (scannedItems: InvoiceScanItem[]) => {
    SmartMatchQuotaService.getRemainingToday(isPremium).then(setRemainingQuota);

    const products = await getProducts() as Product[];
    productsByIdRef.current = new Map(products.map((p: Product) => [p.id, p]));
    catalogRef.current = products.map((p: Product): AutocompleteResult => ({
      id: String(p.id),
      name: p.name,
      source: 'catalog',
      purchasePrice: p.buy_price,
      lastSalePrice: p.sell_price,
      salesCount: 0,
      lastSoldAt: null,
      article: p.article,
      color: p.color,
    }));

    const results: Record<number, ProductMatchResult> = {};
    const working = [...scannedItems];
    const matchedCategories: string[] = [];

    working.forEach((item, idx) => {
      const m = matchProductByName(item.product_name, catalogRef.current);
      results[idx] = m;
      if (m.confidence === 'exact' || m.confidence === 'fuzzy_confident') {
        const id = m.match?.id ? parseInt(m.match.id, 10) : null;
        const category = id !== null ? productsByIdRef.current.get(id)?.category : null;
        working[idx] = {
          ...item,
          matchedProductId: id,
          matchConfidence: m.confidence,
          category_guess: category || item.category_guess,
        };
        if (category) matchedCategories.push(category);
      }
    });

    const dominantCategory = matchedCategories.length
      ? Object.entries(
          matchedCategories.reduce<Record<string, number>>((acc, c) => {
            acc[c] = (acc[c] || 0) + 1;
            return acc;
          }, {})
        ).sort((a, b) => b[1] - a[1])[0][0]
      : null;

    working.forEach((item, idx) => {
      if (results[idx].confidence === 'none' && !item.category_guess && dominantCategory) {
        working[idx] = { ...item, category_guess: dominantCategory };
      }
    });

    setMatchResults(results);
    setItems(working);
    tryAiDisambiguation(working, results);
  };

  const tryAiDisambiguation = async (
    workingItems: InvoiceScanItem[],
    results: Record<number, ProductMatchResult>,
  ) => {
    let canUseSmart = await SmartMatchQuotaService.canUseSmartMatch(isPremium);
    if (!canUseSmart) {
      setSmartLimitReached(true);
      return;
    }

    for (let i = 0; i < workingItems.length; i++) {
      const m = results[i];
      if (m?.confidence !== 'ambiguous' || m.candidates.length === 0) continue;

      try {
        const transcript = [workingItems[i].product_name, workingItems[i].variant].filter(Boolean).join(' ');
        const data: any = await api.post('/voice-disambiguate', {
          transcript,
          candidates: m.candidates.map(c => ({
            id: c.id, name: c.name, color: c.color, size: c.size || c.article, price: c.purchasePrice,
          })),
        });

        await SmartMatchQuotaService.consumeUsage();
        setRemainingQuota(prev => (prev !== null ? Math.max(0, prev - 1) : prev));

        if (data.matched_candidate_id && data.confidence === 'high') {
          const picked = m.candidates.find(c => c.id === String(data.matched_candidate_id));
          if (picked) {
            setMatchResults(prev => ({ ...prev, [i]: { confidence: 'ai_matched', match: picked, candidates: m.candidates } }));
            setItems(prev => {
              const copy = [...prev];
              const id = picked.id ? parseInt(picked.id, 10) : null;
              const category = id !== null ? productsByIdRef.current.get(id)?.category : null;
              copy[i] = {
                ...copy[i],
                matchedProductId: id,
                matchConfidence: 'ai_matched',
                category_guess: category || copy[i].category_guess,
              };
              return copy;
            });
          }
        }

        canUseSmart = await SmartMatchQuotaService.canUseSmartMatch(isPremium);
        if (!canUseSmart) {
          setSmartLimitReached(true);
          break;
        }
      } catch (e) {
        console.warn('[InvoiceScanModal] voice-disambiguate error:', e);
      }
    }
  };

  const handleVariantSelected = (index: number, product: AutocompleteResult) => {
    const id = product.id ? parseInt(product.id, 10) : null;
    const category = id !== null ? productsByIdRef.current.get(id)?.category : null;
    setMatchResults(prev => ({ ...prev, [index]: { confidence: 'exact', match: product, candidates: [] } }));
    setItems(prev => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        matchedProductId: id,
        matchConfidence: 'exact',
        category_guess: category || copy[index].category_guess,
      };
      return copy;
    });
  };

  const handleMarkAsNew = (index: number) => {
    setMatchResults(prev => ({ ...prev, [index]: { confidence: 'none', match: null, candidates: [] } }));
    setItems(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], matchedProductId: null, matchConfidence: 'none' };
      return copy;
    });
  };

  const handleRemoveItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
    setMatchResults(prev => {
      const next: Record<number, ProductMatchResult> = {};
      Object.entries(prev).forEach(([k, v]) => {
        const i = Number(k);
        if (i < index) next[i] = v;
        else if (i > index) next[i - 1] = v;
      });
      return next;
    });
  };

  const updateItem = (index: number, patch: Partial<InvoiceScanItem>) => {
    setItems(prev => {
      const copy = prev.map((it, i) => (i === index ? { ...it, ...patch } : it));
      if (typeof patch.product_name === 'string') {
        const m = matchProductByName(patch.product_name, catalogRef.current);
        setMatchResults(mr => ({ ...mr, [index]: m }));
        const id = (m.confidence === 'exact' || m.confidence === 'fuzzy_confident') && m.match?.id
          ? parseInt(m.match.id, 10)
          : null;
        copy[index] = {
          ...copy[index],
          matchedProductId: id,
          matchConfidence: m.confidence === 'none' ? undefined : m.confidence,
        };
      }
      return copy;
    });
  };

  const buildInvoiceNote = () => {
    const dateStr = new Date().toLocaleDateString('ru-RU');
    const supplierSuffix = result?.supplier_hint ? ` (${result.supplier_hint})` : '';
    return `📷 накладная от ${dateStr}${supplierSuffix}`;
  };

  const doSave = async () => {
    setSaving(true);
    try {
      const applyItems: InvoiceScanApplyItem[] = items.map(it => ({
        matchedProductId: it.matchedProductId ?? null,
        product_name: it.product_name,
        variant: it.variant,
        category_guess: it.category_guess,
        quantity: it.quantity,
        unit_price: it.unit_price,
        sell_price: it.sell_price,
      }));

      await applyInvoiceScan(applyItems, buildInvoiceNote(), currentSellerId, currentSellerName);
      // Один push на всю накладную, не по одному на позицию - fire-and-forget,
      // как и в остальных местах приложения после мутаций склада.
      SyncService.push().catch(err => console.warn('[InvoiceScanModal] sync push failed', err));

      Alert.alert(t('common.success'), t('warehouse.invoiceScanSavedMessage', { count: applyItems.length }));
      onSaved?.();
      resetAndClose();
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || t('warehouse.invoiceScanFailedTitle'));
      setSaving(false);
    }
  };

  const handleSave = async () => {
    const missing = items.filter(it => it.matchedProductId === null && (it.sell_price === null || it.sell_price <= 0));
    if (missing.length > 0) {
      Alert.alert(
        t('common.error'),
        t('warehouse.invoiceScanMissingSellPrice', { names: missing.map(m => m.product_name).join(', ') })
      );
      return;
    }

    const totalValue = items.reduce((sum, it) => sum + it.quantity * it.unit_price, 0);
    const dup = await findPossibleDuplicateInvoiceScan(totalValue, items.length);
    if (dup.isDuplicate) {
      Alert.alert(
        t('warehouse.invoiceScanDuplicateTitle'),
        t('warehouse.invoiceScanDuplicateBody'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('warehouse.invoiceScanDuplicateConfirm'), style: 'destructive', onPress: () => doSave() },
        ]
      );
      return;
    }

    doSave();
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
                  {!isPremium && remainingQuota !== null && (
                    <Text style={styles.summaryText}>
                      {t('addSale.smartMatchRemaining', { count: remainingQuota })}
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

                    <View style={styles.cardHeaderRow}>
                      <TextInput
                        style={[styles.itemNameInput, isDark ? styles.textWhite : styles.textBlack]}
                        value={item.product_name}
                        onChangeText={(v) => updateItem(index, { product_name: v })}
                        placeholder={t('addSale.productName') ?? undefined}
                        placeholderTextColor={isDark ? '#888' : '#aaa'}
                      />
                      <TouchableOpacity onPress={() => handleRemoveItem(index)}>
                        <Ionicons name="close-circle" size={20} color="#FF3B30" />
                      </TouchableOpacity>
                    </View>

                    {item.variant ? (
                      <TextInput
                        style={[styles.itemVariantInput, isDark ? styles.textGray : styles.textDarkGray]}
                        value={item.variant}
                        onChangeText={(v) => updateItem(index, { variant: v })}
                      />
                    ) : null}

                    {matchResults[index]?.confidence === 'none' && (
                      <View style={[styles.statusBadge, styles.statusBadgeNew]}>
                        <Text style={[styles.statusBadgeText, styles.statusBadgeTextNew]}>
                          {t('addSale.newProductBadge')}
                        </Text>
                      </View>
                    )}

                    {(matchResults[index]?.confidence === 'exact' || matchResults[index]?.confidence === 'fuzzy_confident') && (
                      <View style={[styles.statusBadge, styles.statusBadgeMatched]}>
                        <Text style={[styles.statusBadgeText, styles.statusBadgeTextMatched]}>
                          ✓ {t('addSale.linkedTo', { name: matchResults[index]?.match?.name })}
                        </Text>
                      </View>
                    )}

                    {matchResults[index]?.confidence === 'ai_matched' && (
                      <View style={styles.aiMatchedRow}>
                        <View style={[styles.statusBadge, styles.statusBadgeMatched]}>
                          <Text style={[styles.statusBadgeText, styles.statusBadgeTextMatched]}>
                            🤖 {t('addSale.aiMatched', { name: matchResults[index]?.match?.name })}
                          </Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => setMatchResults(prev => ({ ...prev, [index]: { ...prev[index], confidence: 'ambiguous' } }))}
                        >
                          <Text style={styles.editLink}>{t('common.edit')}</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {matchResults[index]?.confidence === 'ambiguous' && (
                      <View>
                        <VariantPicker
                          candidates={matchResults[index].candidates}
                          isDark={isDark}
                          onSelect={(product) => handleVariantSelected(index, product)}
                          onMarkNew={() => handleMarkAsNew(index)}
                        />
                        {smartLimitReached && !isPremium && (
                          <Text style={styles.limitReachedText}>{t('addSale.smartMatchLimitReached')}</Text>
                        )}
                      </View>
                    )}

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

                    <View style={styles.categoryRow}>
                      <Text style={styles.itemFieldLabel}>{t('products.category')}</Text>
                      <TextInput
                        style={[styles.categoryInput, isDark ? styles.textWhite : styles.textBlack]}
                        value={item.category_guess || ''}
                        onChangeText={(v) => updateItem(index, { category_guess: v || null })}
                        placeholder={t('products.category') ?? undefined}
                        placeholderTextColor={isDark ? '#888' : '#aaa'}
                      />
                    </View>

                    {item.matchedProductId === null && (
                      <View style={[styles.categoryRow, !item.sell_price && styles.sellPriceRowMissing]}>
                        <Text style={styles.itemFieldLabel}>
                          {t('warehouse.invoiceScanSellPrice')} {!item.sell_price ? '*' : ''}
                        </Text>
                        <TextInput
                          style={[styles.categoryInput, isDark ? styles.textWhite : styles.textBlack]}
                          value={item.sell_price !== null ? String(item.sell_price) : ''}
                          onChangeText={(v) => updateItem(index, { sell_price: v ? Number(v.replace(',', '.')) || null : null })}
                          keyboardType="numeric"
                          placeholder={t('warehouse.invoiceScanSellPricePlaceholder') ?? undefined}
                          placeholderTextColor={isDark ? '#888' : '#aaa'}
                        />
                      </View>
                    )}
                  </View>
                ))}

                <View style={{ height: 20 }} />
              </ScrollView>

              <TouchableOpacity
                style={[styles.primaryBtn, saving && { opacity: 0.6 }]}
                onPress={handleSave}
                disabled={saving || items.length === 0}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                )}
                <Text style={styles.primaryBtnText}>
                  {saving ? t('warehouse.invoiceScanSaving') : t('warehouse.invoiceScanSave')}
                </Text>
              </TouchableOpacity>
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
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemNameInput: {
    fontSize: 16,
    fontWeight: '600',
    padding: 0,
    marginBottom: 2,
    flex: 1,
  },
  itemVariantInput: {
    fontSize: 13,
    padding: 0,
    marginBottom: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.sm,
    marginBottom: 8,
  },
  statusBadgeNew: {
    backgroundColor: '#E3F2FD',
  },
  statusBadgeMatched: {
    backgroundColor: Colors.primaryLight,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  statusBadgeTextNew: {
    color: '#2196F3',
  },
  statusBadgeTextMatched: {
    color: Colors.primaryDark,
  },
  aiMatchedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  editLink: {
    fontSize: 10,
    color: '#888',
    textDecorationLine: 'underline',
  },
  limitReachedText: {
    fontSize: 10,
    color: '#999',
    marginTop: 4,
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
  categoryRow: {
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e5e5',
    paddingTop: 8,
  },
  categoryInput: {
    fontSize: 14,
    padding: 0,
  },
  sellPriceRowMissing: {
    backgroundColor: Colors.warningLight,
    marginHorizontal: -12,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
});

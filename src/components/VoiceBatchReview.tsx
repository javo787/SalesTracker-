import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { VoiceSaleItem, VoiceSaleResult } from '../types/voiceSale';
import { Colors, Radius, Shadow, FontSize, Spacing } from '../constants/theme';
import { useAppContext } from '../context/AppContext';
import { getProducts } from '../db/database';
import { matchProductByName, ProductMatchResult } from '../utils/productMatching';
import { AutocompleteResult } from '../types/product';
import { VariantPicker } from './sales/VariantPicker';
import { SmartMatchQuotaService } from '../services/SmartMatchQuotaService';
import { api } from '../services/api';

interface VoiceBatchReviewProps {
  result: VoiceSaleResult;
  onConfirm: (items: VoiceSaleItem[]) => void;
  onCancel: () => void;
}

export default function VoiceBatchReview({ result, onConfirm, onCancel }: VoiceBatchReviewProps) {
  const { t } = useTranslation();
  const { resolvedTheme, currency, isPremium } = useAppContext();
  const isDark = resolvedTheme === 'dark';

  const [items, setItems] = useState<VoiceSaleItem[]>(
    result.items.map(item => ({ ...item, id: Math.random().toString(36).substring(2, 11) } as any))
  );

  const [matchResults, setMatchResults] = useState<Record<number, ProductMatchResult>>({});
  const [smartLimitReached, setSmartLimitReached] = useState(false);
  const [remainingQuota, setRemainingQuota] = useState<number | null>(null);

  useEffect(() => {
    SmartMatchQuotaService.getRemainingToday(isPremium).then(setRemainingQuota);

    const catalog = getProducts();
    const results: Record<number, ProductMatchResult> = {};

    // Initial local matching
    items.forEach((item, idx) => {
      const match = matchProductByName(item.product_name, catalog as any);
      results[idx] = match;
      if (match.confidence === 'exact' || match.confidence === 'fuzzy_confident') {
        item.matchedProductId = match.match?.id ? parseInt(match.match.id) : null;
        item.matchConfidence = match.confidence;
      }
    });
    setMatchResults(results);
    setItems([...items]);

    // Try AI disambiguation for ambiguous items
    const tryAI = async () => {
      if (!result.transcript) return;

      let canUseSmart = await SmartMatchQuotaService.canUseSmartMatch(isPremium);
      if (!canUseSmart) {
        setSmartLimitReached(true);
        return;
      }

      for (let i = 0; i < items.length; i++) {
        const m = results[i];
        if (m && m.confidence === 'ambiguous' && m.candidates.length > 0) {
          try {
            const data: any = await api.post('/voice-disambiguate', {
              transcript: result.transcript,
              candidates: m.candidates.map(c => ({
                id: c.id, name: c.name, color: c.color, size: c.article, price: c.lastSalePrice
              })),
            });

            await SmartMatchQuotaService.consumeUsage();
            setRemainingQuota(prev => prev !== null ? Math.max(0, prev - 1) : prev);

            if (data.matched_candidate_id && data.confidence === 'high') {
              const picked = m.candidates.find(c => c.id === String(data.matched_candidate_id));
              if (picked) {
                const updatedMatch: ProductMatchResult = {
                  confidence: 'ai_matched',
                  match: picked,
                  candidates: m.candidates
                };
                setMatchResults(prev => ({ ...prev, [i]: updatedMatch }));
                setItems(prev => {
                  const copy = [...prev];
                  copy[i].matchedProductId = parseInt(picked.id!);
                  copy[i].matchConfidence = 'ai_matched';
                  return copy;
                });
              }
            }

            // Check quota again after each usage
            canUseSmart = await SmartMatchQuotaService.canUseSmartMatch(isPremium);
            if (!canUseSmart) {
              setSmartLimitReached(true);
              break;
            }
          } catch (e) {
            console.warn('[voice-disambiguate] batch error:', e);
          }
        }
      }
    };

    tryAI();
  }, []);

  const handleUpdateItem = (index: number, field: keyof VoiceSaleItem, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };

    if (field === 'product_name') {
      const catalog = getProducts();
      const match = matchProductByName(value, catalog as any);
      setMatchResults(prev => ({ ...prev, [index]: match }));

      newItems[index].matchedProductId = (match.confidence === 'exact' || match.confidence === 'fuzzy_confident')
        ? (match.match?.id ? parseInt(match.match.id) : null)
        : null;
      newItems[index].matchConfidence = match.confidence;
    }

    setItems(newItems);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleVariantSelected = (index: number, product: AutocompleteResult) => {
    handleUpdateItem(index, 'matchedProductId' as any, product.id ? parseInt(product.id) : null);
    setMatchResults(prev => ({ ...prev, [index]: { confidence: 'exact', match: product, candidates: [] } }));
  };

  const total = items.reduce((acc, item) => acc + (item.sell_price * item.quantity), 0);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, isDark && styles.textDark]}>
            {t('addSale.itemsRecognized', { count: items.length })}
          </Text>
          {!isPremium && remainingQuota !== null && (
            <Text style={{ fontSize: FontSize.xs, color: '#999', marginBottom: Spacing.sm }}>
              {t('addSale.smartMatchRemaining', { count: remainingQuota })}
            </Text>
          )}
          {result.truncated && (
            <Text style={styles.truncatedNotice}>{t('addSale.truncatedNotice')}</Text>
          )}
        </View>
        <TouchableOpacity onPress={onCancel}>
          <Ionicons name="close" size={24} color={isDark ? '#ccc' : '#666'} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.itemList} contentContainerStyle={styles.scrollContent}>
        {result.source === 'transcript_only' && (
           <View style={[styles.transcriptOnlyCard, isDark && styles.cardDark]}>
              <Text style={[styles.transcriptLabel, isDark && styles.textDark]}>{t('addSale.voiceFailedNotice')}</Text>
              <Text style={[styles.transcriptText, isDark && styles.textDark]}>"{result.transcript}"</Text>
              <TouchableOpacity style={styles.manualBtn} onPress={onCancel}>
                <Text style={styles.manualBtnText}>{t('addSale.fillManually')}</Text>
              </TouchableOpacity>
           </View>
        )}

        {items.map((item, index) => (
          <View
            key={(item as any).id || index}
            style={[
              styles.card,
              isDark && styles.cardDark,
              item.needs_confirmation && styles.cardWarning
            ]}
          >
            <View style={styles.cardHeader}>
              <TextInput
                style={[styles.nameInput, isDark && styles.textDark]}
                value={item.product_name}
                onChangeText={(val) => handleUpdateItem(index, 'product_name', val)}
                placeholder={t('addSale.productName')}
                placeholderTextColor="#888"
              />
              <TouchableOpacity onPress={() => handleRemoveItem(index)}>
                <Ionicons name="close-circle" size={20} color="#FF3B30" />
              </TouchableOpacity>
            </View>

            <View style={styles.cardFields}>
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>{t('addSale.sellPrice')}</Text>
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={[styles.fieldInput, isDark && styles.textDark]}
                    value={(item.sell_price ?? 0).toString()}
                    onChangeText={(val) => handleUpdateItem(index, 'sell_price', parseFloat(val) || 0)}
                    keyboardType="numeric"
                  />
                  <Text style={styles.currencySuffix}>{currency.symbol}</Text>
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>{t('addSale.quantity')}</Text>
                <TextInput
                  style={[styles.fieldInput, isDark && styles.textDark]}
                  value={(item.quantity ?? 0).toString()}
                  onChangeText={(val) => handleUpdateItem(index, 'quantity', parseFloat(val) || 0)}
                  keyboardType="numeric"
                />
              </View>
            </View>

            {matchResults[index]?.confidence === 'exact' || matchResults[index]?.confidence === 'fuzzy_confident' ? (
              <Text style={styles.matchBadge}>✓ {t('addSale.linkedTo', { name: matchResults[index].match?.name })}</Text>
            ) : null}

            {matchResults[index]?.confidence === 'ai_matched' ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={[styles.matchBadge, { color: Colors.primary }]}>🤖 {t('addSale.aiMatched', { name: matchResults[index].match?.name })}</Text>
                <TouchableOpacity
                  onPress={() => setMatchResults(prev => ({ ...prev, [index]: { ...prev[index], confidence: 'ambiguous' } }))}
                  style={{ marginTop: Spacing.sm }}
                >
                  <Text style={{ fontSize: 10, color: '#888', textDecorationLine: 'underline' }}>{t('common.edit')}</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {matchResults[index]?.confidence === 'ambiguous' ? (
              <View>
                <VariantPicker
                  candidates={matchResults[index].candidates}
                  isDark={isDark}
                  onSelect={(product) => handleVariantSelected(index, product)}
                />
                {smartLimitReached && !isPremium && (
                  <Text style={{ fontSize: 10, color: '#999', marginTop: 4 }}>
                    {t('addSale.smartMatchLimitReached')}
                  </Text>
                )}
              </View>
            ) : null}

            {item.needs_confirmation && (
              <View style={styles.warningRow}>
                <Ionicons name="warning-outline" size={14} color="#FF9500" />
                <Text style={styles.warningText}>{t('addSale.checkPrice')}</Text>
              </View>
            )}
          </View>
        ))}
      </ScrollView>

      <View style={[styles.footer, isDark && styles.footerDark]}>
        <TouchableOpacity
          style={styles.confirmBtn}
          onPress={() => onConfirm(items)}
        >
          <Text style={styles.confirmBtnText}>
            {t('addSale.addAllBtn', { count: items.length })}
          </Text>
          <Text style={styles.totalText}>
            {total.toLocaleString()} {currency.symbol}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    maxHeight: '85%',
    backgroundColor: 'transparent',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: 'bold',
    color: '#333',
  },
  truncatedNotice: {
    fontSize: FontSize.xs,
    color: '#FF9500',
    marginTop: 2,
  },
  itemList: {
    maxHeight: 500,
  },
  scrollContent: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadow.sm,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  cardDark: {
    backgroundColor: '#2C2C2E',
  },
  cardWarning: {
    borderColor: '#FF9500',
    backgroundColor: '#FFF9F2',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  nameInput: {
    fontSize: FontSize.md,
    fontWeight: '600',
    flex: 1,
    padding: 0,
  },
  cardFields: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  fieldGroup: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: FontSize.xs,
    color: '#888',
    marginBottom: 4,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fieldInput: {
    fontSize: FontSize.md,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingVertical: 2,
    flex: 1,
  },
  currencySuffix: {
    fontSize: FontSize.xs,
    color: '#999',
    marginLeft: 4,
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.sm,
    gap: 4,
  },
  warningText: {
    fontSize: FontSize.xs,
    color: '#FF9500',
    fontWeight: '500',
  },
  footer: {
    padding: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#eee',
  },
  footerDark: {
    borderTopColor: '#333',
  },
  confirmBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    ...Shadow.md,
  },
  confirmBtnText: {
    color: '#fff',
    fontSize: FontSize.md,
    fontWeight: 'bold',
  },
  totalText: {
    color: '#fff',
    fontSize: FontSize.md,
    fontWeight: 'bold',
  },
  textDark: {
    color: '#eee',
  },
  matchBadge: {
    fontSize: FontSize.xs,
    color: '#34C759',
    marginTop: Spacing.sm,
    fontWeight: '500',
  },
  transcriptOnlyCard: {
    backgroundColor: '#fff',
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadow.sm,
  },
  transcriptLabel: {
    fontSize: FontSize.sm,
    color: '#666',
    marginBottom: Spacing.sm,
  },
  transcriptText: {
    fontSize: FontSize.md,
    fontStyle: 'italic',
    color: '#333',
    marginBottom: Spacing.md,
  },
  manualBtn: {
    backgroundColor: '#f0f0f0',
    padding: Spacing.md,
    borderRadius: Radius.sm,
    alignItems: 'center',
  },
  manualBtnText: {
    color: Colors.primary,
    fontWeight: '600',
  }
});

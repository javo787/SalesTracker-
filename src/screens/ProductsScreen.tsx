import { useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, TextInput, Alert, RefreshControl
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { addProduct, updateProduct, deleteProduct, getProducts } from '../db/database';
import { useAppContext } from '../context/AppContext';

export default function ProductsScreen() {
  const { t } = useTranslation();
  const { theme, currency } = useAppContext();
  const [products, setProducts] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [stock, setStock] = useState('');
  const [minStockAlert, setMinStockAlert] = useState('0');
  const [refreshing, setRefreshing] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  const loadProducts = () => setProducts(getProducts());

  useFocusEffect(useCallback(() => { loadProducts(); }, []));

  const onRefresh = () => {
    setRefreshing(true);
    loadProducts();
    setRefreshing(false);
  };

  const handleSave = () => {
    if (!name.trim() || !buyPrice || !sellPrice) {
      Alert.alert(t('common.error'), 'Заполните название, цену закупки и продажи');
      return;
    }

    const bPrice = parseFloat(buyPrice);
    const sPrice = parseFloat(sellPrice);
    const st = parseInt(stock) || 0;
    const alert = parseInt(minStockAlert) || 0;

    if (editingId) {
      updateProduct(editingId, name.trim(), bPrice, sPrice, st, alert);
    } else {
      addProduct(name.trim(), bPrice, sPrice, st, alert);
    }

    setName(''); setBuyPrice(''); setSellPrice(''); setStock(''); setMinStockAlert('0');
    setShowForm(false);
    setEditingId(null);
    loadProducts();
  };

  const handleLongPress = (p: any) => {
    Alert.alert(
      p.name,
      'Выберите действие',
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: 'Редактировать',
          onPress: () => {
            setEditingId(p.id);
            setName(p.name);
            setBuyPrice(String(p.buy_price));
            setSellPrice(String(p.sell_price));
            setStock(String(p.stock));
            setMinStockAlert(String(p.min_stock_alert || 0));
            setShowForm(true);
            scrollViewRef.current?.scrollTo({ y: 0, animated: true });
          }
        },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Удалить товар?',
              `Вы уверены, что хотите удалить "${p.name}"?`,
              [
                { text: t('common.cancel'), style: 'cancel' },
                {
                  text: t('common.delete'),
                  style: 'destructive',
                  onPress: () => {
                    deleteProduct(p.id);
                    loadProducts();
                  }
                }
              ]
            );
          }
        }
      ]
    );
  };

  const isDark = theme === 'dark';
  const themeStyles = isDark ? darkStyles : lightStyles;

  return (
    <ScrollView
      ref={scrollViewRef}
      style={[styles.container, themeStyles.container]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <TouchableOpacity
        style={[styles.addBtn, editingId ? { backgroundColor: '#FF9800' } : null]}
        onPress={() => {
          if (showForm) {
            setShowForm(false);
            setEditingId(null);
            setName(''); setBuyPrice(''); setSellPrice(''); setStock(''); setMinStockAlert('0');
          } else {
            setShowForm(true);
          }
        }}
      >
        <Text style={styles.addBtnText}>
          {showForm ? '✕ ' + t('common.cancel') : (editingId ? '✎ Редактировать' : '+ ' + t('products.addProduct'))}
        </Text>
      </TouchableOpacity>

      {showForm && (
        <View style={[styles.form, themeStyles.card]}>
          <Text style={[styles.formTitle, themeStyles.text]}>{editingId ? 'Редактировать товар' : 'Новый товар'}</Text>

          <Text style={[styles.label, themeStyles.text]}>{t('addSale.productName')} *</Text>
          <TextInput
            style={[styles.input, themeStyles.input]}
            placeholder={t('addSale.productPlaceholder')}
            placeholderTextColor={isDark ? '#888' : '#aaa'}
            value={name}
            onChangeText={setName}
          />

          <View style={styles.row}>
            <View style={styles.half}>
              <Text style={[styles.label, themeStyles.text]}>{t('addSale.buyPrice')} *</Text>
              <TextInput
                style={[styles.input, themeStyles.input]}
                placeholder="0"
                placeholderTextColor={isDark ? '#888' : '#aaa'}
                keyboardType="numeric"
                value={buyPrice}
                onChangeText={setBuyPrice}
              />
            </View>
            <View style={styles.half}>
              <Text style={[styles.label, themeStyles.text]}>{t('addSale.sellPrice')} *</Text>
              <TextInput
                style={[styles.input, themeStyles.input]}
                placeholder="0"
                placeholderTextColor={isDark ? '#888' : '#aaa'}
                keyboardType="numeric"
                value={sellPrice}
                onChangeText={setSellPrice}
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.half}>
              <Text style={[styles.label, themeStyles.text]}>{t('products.stock')} ({t('reports.pcs')})</Text>
              <TextInput
                style={[styles.input, themeStyles.input]}
                placeholder="0"
                placeholderTextColor={isDark ? '#888' : '#aaa'}
                keyboardType="numeric"
                value={stock}
                onChangeText={setStock}
              />
            </View>
            <View style={styles.half}>
              <Text style={[styles.label, themeStyles.text]}>{t('products.minStock')}</Text>
              <TextInput
                style={[styles.input, themeStyles.input]}
                placeholder="0"
                placeholderTextColor={isDark ? '#888' : '#aaa'}
                keyboardType="numeric"
                value={minStockAlert}
                onChangeText={setMinStockAlert}
              />
            </View>
          </View>

          {buyPrice && sellPrice && (
            <View style={styles.marginPreview}>
              <Text style={styles.marginText}>
                {t('products.margin')}: {(parseFloat(sellPrice) - parseFloat(buyPrice)).toFixed(1)} {currency.symbol}
                ({((( parseFloat(sellPrice) - parseFloat(buyPrice)) / parseFloat(sellPrice)) * 100).toFixed(0)}%)
              </Text>
            </View>
          )}

          <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
            <Text style={styles.saveBtnText}>
              {editingId ? 'Сохранить изменения' : t('common.save')}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <Text style={[styles.sectionTitle, themeStyles.text]}>
        Все товары ({products.length})
      </Text>

      {products.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Товаров пока нет</Text>
          <Text style={styles.emptyHint}>Добавь первый товар выше</Text>
        </View>
      ) : (
        products.map((p: any) => (
          <TouchableOpacity
            key={p.id}
            style={[styles.productItem, themeStyles.card]}
            onLongPress={() => handleLongPress(p)}
            delayLongPress={500}
          >
            <View style={styles.productLeft}>
              <Text style={[styles.productName, themeStyles.text]}>{p.name}</Text>
              <Text style={styles.productPrices}>
                {t('addSale.buyPrice')}: {p.buy_price} {currency.symbol} · {t('addSale.sellPrice')}: {p.sell_price} {currency.symbol}
              </Text>
            </View>
            <View style={styles.productRight}>
              <Text style={[
                styles.productStock,
                themeStyles.text,
                p.stock <= (p.min_stock_alert || 0) && { color: '#E53935' }
              ]}>
                {p.stock} {t('reports.pcs')}
              </Text>
              <Text style={styles.productProfit}>
                +{(p.sell_price - p.buy_price).toFixed(0)} {currency.symbol}
              </Text>
            </View>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

const lightStyles = StyleSheet.create({
  container: { backgroundColor: '#F5F5F5' },
  card: { backgroundColor: '#fff' },
  text: { color: '#333' },
  input: { backgroundColor: '#F5F5F5', borderColor: '#E0E0E0' },
});

const darkStyles = StyleSheet.create({
  container: { backgroundColor: '#000' },
  card: { backgroundColor: '#1E1E1E' },
  text: { color: '#EEE' },
  input: { backgroundColor: '#2C2C2C', borderColor: '#444', color: '#EEE' },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  addBtn: {
    margin: 16, backgroundColor: '#1D9E75',
    borderRadius: 12, padding: 14, alignItems: 'center',
  },
  addBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  form: {
    marginHorizontal: 16, marginBottom: 8,
    borderRadius: 12, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 2, elevation: 2,
  },
  formTitle: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  label: { fontSize: 13, marginBottom: 6, marginTop: 10 },
  input: {
    borderRadius: 8, padding: 12,
    fontSize: 15, borderWidth: 1,
  },
  row: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  marginPreview: {
    marginTop: 12, padding: 10, backgroundColor: '#F0FBF7',
    borderRadius: 8, borderWidth: 1, borderColor: '#1D9E75',
  },
  marginText: { fontSize: 13, color: '#1D9E75', fontWeight: '500' },
  saveBtn: {
    backgroundColor: '#1D9E75', borderRadius: 10,
    padding: 14, alignItems: 'center', marginTop: 16,
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  sectionTitle: {
    fontSize: 15, fontWeight: '600',
    paddingHorizontal: 16, marginBottom: 8,
  },
  empty: { alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 15, color: '#999', marginBottom: 6 },
  emptyHint: { fontSize: 13, color: '#bbb' },
  productItem: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginHorizontal: 16, marginBottom: 8,
    borderRadius: 12, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 2, elevation: 2,
  },
  productLeft: { flex: 1 },
  productName: { fontSize: 15, fontWeight: '500' },
  productPrices: { fontSize: 12, color: '#999', marginTop: 3 },
  productRight: { alignItems: 'flex-end' },
  productStock: { fontSize: 15, fontWeight: '600' },
  productProfit: { fontSize: 13, color: '#1D9E75', marginTop: 3 },
});

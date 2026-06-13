import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, TextInput, Alert
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Mode = 'normal' | 'trade';
type TradeTab = 'markup' | 'margin' | 'batch' | 'reverse';

export default function CalculatorScreen({ navigation }: any) {
  const [mode, setMode] = useState<Mode>('normal');
  const [tradeTab, setTradeTab] = useState<TradeTab>('markup');

  // Обычный калькулятор
  const [cur, setCur] = useState('0');
  const [prev, setPrev] = useState('');
  const [op, setOp] = useState<string | null>(null);
  const [expr, setExpr] = useState('');
  const [fresh, setFresh] = useState(false);

  // Торговый — наценка
  const [tBuy, setTBuy] = useState('');
  const [tPct, setTPct] = useState('');

  // Торговый — маржа
  const [mBuy, setMBuy] = useState('');
  const [mSell, setMSell] = useState('');

  // Торговый — партия
  const [bBuy, setBBuy] = useState('');
  const [bSell, setBSell] = useState('');
  const [bQty, setBQty] = useState('1');

  // Торговый — обратный
  const [rvBuy, setRvBuy] = useState('');
  const [rvProfit, setRvProfit] = useState('');

  // --- Сохранение последнего режима ---
  const switchMode = async (m: Mode) => {
    setMode(m);
    await AsyncStorage.setItem('calc_mode', m);
  };

  // --- Обычный калькулятор ---
  const OPS: Record<string, string> = { '+': '+', '-': '−', '*': '×', '/': '÷' };

  const evaluate = (p: number, o: string, c: number): number => {
    let res = 0;
    switch (o) {
      case '+': res = p + c; break;
      case '-': res = p - c; break;
      case '*': res = p * c; break;
      case '/': res = c === 0 ? 0 : p / c; break;
      default: res = c;
    }
    return Math.round(res * 1e10) / 1e10;
  };

  const pressKey = (k: string) => {
    if (k === 'AC') {
      setCur('0'); setPrev(''); setOp(null); setFresh(false); setExpr('');
    } else if (k === '+/-') {
      setCur(String(-parseFloat(cur)));
    } else if (k === '%') {
      setCur(String(parseFloat(cur) / 100));
    } else if (['+', '-', '*', '/'].includes(k)) {
      if (op && !fresh) {
        const res = evaluate(parseFloat(prev), op, parseFloat(cur));
        setCur(String(res));
        setPrev(String(res));
      } else {
        setPrev(cur);
      }
      setOp(k);
      setFresh(true);
      setExpr(`${cur} ${OPS[k]}`);
    } else if (k === '=') {
      if (op) {
        const res = evaluate(parseFloat(prev), op, parseFloat(cur));
        setExpr(`${prev} ${OPS[op]} ${cur} =`);
        setCur(String(res));
        setOp(null);
        setFresh(false);
      }
    } else if (k === '.') {
      if (!cur.includes('.')) setCur(cur + '.');
    } else {
      if (fresh || cur === '0') { setCur(k); setFresh(false); }
      else setCur(cur + k);
    }
  };

  const displayValue = cur.length > 10
    ? parseFloat(cur).toExponential(3)
    : parseFloat(cur).toLocaleString('ru-RU');

  const transferToSale = () => {
    navigation.navigate('Продажа', { prefillPrice: cur });
  };

  // --- Торговые расчёты ---
  const fmt = (n: number) =>
    isNaN(n) || !isFinite(n) ? '—' : Math.round(n).toLocaleString('ru-RU') + ' сом';
  const fmtP = (n: number) =>
    isNaN(n) || !isFinite(n) ? '—' : (Math.round(n * 10) / 10) + '%';

  // Наценка
  const markupSell = () => {
    const buy = parseFloat(tBuy); const pct = parseFloat(tPct);
    if (!buy || !pct) return { sell: '—', profit: '—' };
    const sell = buy * (1 + pct / 100);
    return { sell: fmt(sell), profit: fmt(sell - buy) };
  };

  // Маржа
  const marginResult = () => {
    const buy = parseFloat(mBuy); const sell = parseFloat(mSell);
    if (!buy || !sell) return { pct: '—', profit: '—' };
    return { pct: fmtP((sell - buy) / sell * 100), profit: fmt(sell - buy) };
  };

  // Партия
  const batchResult = () => {
    const buy = parseFloat(bBuy); const sell = parseFloat(bSell);
    const qty = parseFloat(bQty) || 1;
    if (!buy || !sell) return { rev: '—', profit: '—' };
    return { rev: fmt(sell * qty), profit: fmt((sell - buy) * qty) };
  };

  // Обратный
  const reverseResult = () => {
    const buy = parseFloat(rvBuy); const profit = parseFloat(rvProfit);
    if (!buy || !profit) return { sell: '—', pct: '—' };
    const sell = buy + profit;
    return { sell: fmt(sell), pct: fmtP(profit / sell * 100) };
  };

  const saveTrade = (sellPrice: string, buyPrice: string, qty: string = '1') => {
    navigation.navigate('Продажа', {
      prefillSell: sellPrice,
      prefillBuy: buyPrice,
      prefillQty: qty,
    });
  };

  const mu = markupSell();
  const mr = marginResult();
  const bt = batchResult();
  const rv = reverseResult();

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">

      {/* Переключатель режима */}
      <View style={styles.modeSwitch}>
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'normal' && styles.modeBtnActive]}
          onPress={() => switchMode('normal')}
        >
          <Text style={[styles.modeBtnText, mode === 'normal' && styles.modeBtnTextActive]}>
            Обычный
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'trade' && styles.modeBtnActive]}
          onPress={() => switchMode('trade')}
        >
          <Text style={[styles.modeBtnText, mode === 'trade' && styles.modeBtnTextActive]}>
            Торговый
          </Text>
        </TouchableOpacity>
      </View>

      {/* ===== ОБЫЧНЫЙ РЕЖИМ ===== */}
      {mode === 'normal' && (
        <View style={styles.section}>
          {/* Дисплей */}
          <View style={styles.display}>
            <Text style={styles.displayExpr} numberOfLines={1}>{expr}</Text>
            <Text style={styles.displayVal} numberOfLines={1} adjustsFontSizeToFit>
              {displayValue}
            </Text>
          </View>

          {/* Кнопки */}
          <View style={styles.keys}>
            {/* Ряд 1 */}
            <TouchableOpacity style={[styles.key, styles.keyFn]} onPress={() => pressKey('AC')}>
              <Text style={styles.keyFnText}>AC</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.key, styles.keyFn]} onPress={() => pressKey('+/-')}>
              <Text style={styles.keyFnText}>+/−</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.key, styles.keyFn]} onPress={() => pressKey('%')}>
              <Text style={styles.keyFnText}>%</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.key, styles.keyOp]} onPress={() => pressKey('/')}>
              <Text style={styles.keyOpText}>÷</Text>
            </TouchableOpacity>

            {/* Ряд 2 */}
            {['7','8','9'].map(k => (
              <TouchableOpacity key={k} style={styles.key} onPress={() => pressKey(k)}>
                <Text style={styles.keyText}>{k}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={[styles.key, styles.keyOp]} onPress={() => pressKey('*')}>
              <Text style={styles.keyOpText}>×</Text>
            </TouchableOpacity>

            {/* Ряд 3 */}
            {['4','5','6'].map(k => (
              <TouchableOpacity key={k} style={styles.key} onPress={() => pressKey(k)}>
                <Text style={styles.keyText}>{k}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={[styles.key, styles.keyOp]} onPress={() => pressKey('-')}>
              <Text style={styles.keyOpText}>−</Text>
            </TouchableOpacity>

            {/* Ряд 4 */}
            {['1','2','3'].map(k => (
              <TouchableOpacity key={k} style={styles.key} onPress={() => pressKey(k)}>
                <Text style={styles.keyText}>{k}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={[styles.key, styles.keyOp]} onPress={() => pressKey('+')}>
              <Text style={styles.keyOpText}>+</Text>
            </TouchableOpacity>

            {/* Ряд 5 */}
            <TouchableOpacity style={[styles.key, styles.keyZero]} onPress={() => pressKey('0')}>
              <Text style={styles.keyText}>0</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.key} onPress={() => pressKey('.')}>
              <Text style={styles.keyText}>.</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.key, styles.keyEq]} onPress={() => pressKey('=')}>
              <Text style={styles.keyEqText}>=</Text>
            </TouchableOpacity>
          </View>

          {/* Перенос в продажу */}
          <TouchableOpacity style={styles.transferBtn} onPress={transferToSale}>
            <Text style={styles.transferBtnText}>→ Перенести в продажу</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ===== ТОРГОВЫЙ РЕЖИМ ===== */}
      {mode === 'trade' && (
        <View style={styles.section}>
          {/* Табы */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tradeTabs}>
            {(['markup','margin','batch','reverse'] as TradeTab[]).map((t) => {
              const labels: Record<TradeTab, string> = {
                markup: 'Наценка', margin: 'Маржа',
                batch: 'Партия', reverse: 'Обратный'
              };
              return (
                <TouchableOpacity
                  key={t}
                  style={[styles.tradeTab, tradeTab === t && styles.tradeTabActive]}
                  onPress={() => setTradeTab(t)}
                >
                  <Text style={[styles.tradeTabText, tradeTab === t && styles.tradeTabTextActive]}>
                    {labels[t]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Наценка */}
          {tradeTab === 'markup' && (
            <View>
              <Text style={styles.label}>Цена закупки (сом)</Text>
              <TextInput style={styles.input} keyboardType="numeric"
                placeholder="0" value={tBuy} onChangeText={setTBuy} />
              <Text style={styles.label}>Желаемая наценка (%)</Text>
              <TextInput style={styles.input} keyboardType="numeric"
                placeholder="0" value={tPct} onChangeText={setTPct} />
              <View style={styles.resultCards}>
                <View style={styles.rCard}>
                  <Text style={styles.rLabel}>Цена продажи</Text>
                  <Text style={styles.rVal}>{mu.sell}</Text>
                </View>
                <View style={styles.rCard}>
                  <Text style={styles.rLabel}>Прибыль / шт</Text>
                  <Text style={[styles.rVal, styles.rValAccent]}>{mu.profit}</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.saveBtn}
                onPress={() => {
                  const sell = String(parseFloat(tBuy) * (1 + parseFloat(tPct) / 100));
                  saveTrade(sell, tBuy, '1');
                }}>
                <Text style={styles.saveBtnText}>Сохранить как продажу</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Маржа */}
          {tradeTab === 'margin' && (
            <View>
              <Text style={styles.label}>Цена закупки (сом)</Text>
              <TextInput style={styles.input} keyboardType="numeric"
                placeholder="0" value={mBuy} onChangeText={setMBuy} />
              <Text style={styles.label}>Цена продажи (сом)</Text>
              <TextInput style={styles.input} keyboardType="numeric"
                placeholder="0" value={mSell} onChangeText={setMSell} />
              <View style={styles.resultCards}>
                <View style={styles.rCard}>
                  <Text style={styles.rLabel}>Маржа</Text>
                  <Text style={styles.rVal}>{mr.pct}</Text>
                </View>
                <View style={styles.rCard}>
                  <Text style={styles.rLabel}>Прибыль / шт</Text>
                  <Text style={[styles.rVal, styles.rValAccent]}>{mr.profit}</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.saveBtn}
                onPress={() => saveTrade(mSell, mBuy, '1')}>
                <Text style={styles.saveBtnText}>Сохранить как продажу</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Партия */}
          {tradeTab === 'batch' && (
            <View>
              <Text style={styles.label}>Цена закупки (сом)</Text>
              <TextInput style={styles.input} keyboardType="numeric"
                placeholder="0" value={bBuy} onChangeText={setBBuy} />
              <Text style={styles.label}>Цена продажи (сом)</Text>
              <TextInput style={styles.input} keyboardType="numeric"
                placeholder="0" value={bSell} onChangeText={setBSell} />
              <Text style={styles.label}>Количество (шт)</Text>
              <TextInput style={styles.input} keyboardType="numeric"
                placeholder="1" value={bQty} onChangeText={setBQty} />
              <View style={styles.resultCards}>
                <View style={styles.rCard}>
                  <Text style={styles.rLabel}>Выручка</Text>
                  <Text style={styles.rVal}>{bt.rev}</Text>
                </View>
                <View style={styles.rCard}>
                  <Text style={styles.rLabel}>Прибыль</Text>
                  <Text style={[styles.rVal, styles.rValAccent]}>{bt.profit}</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.saveBtn}
                onPress={() => saveTrade(bSell, bBuy, bQty)}>
                <Text style={styles.saveBtnText}>Сохранить как продажу</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Обратный */}
          {tradeTab === 'reverse' && (
            <View>
              <Text style={styles.label}>Цена закупки (сом)</Text>
              <TextInput style={styles.input} keyboardType="numeric"
                placeholder="0" value={rvBuy} onChangeText={setRvBuy} />
              <Text style={styles.label}>Желаемая прибыль (сом)</Text>
              <TextInput style={styles.input} keyboardType="numeric"
                placeholder="0" value={rvProfit} onChangeText={setRvProfit} />
              <View style={styles.resultCards}>
                <View style={styles.rCard}>
                  <Text style={styles.rLabel}>Цена продажи</Text>
                  <Text style={[styles.rVal, styles.rValAccent]}>{rv.sell}</Text>
                </View>
                <View style={styles.rCard}>
                  <Text style={styles.rLabel}>Наценка</Text>
                  <Text style={styles.rVal}>{rv.pct}</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.saveBtn}
                onPress={() => {
                  const sell = String(parseFloat(rvBuy) + parseFloat(rvProfit));
                  saveTrade(sell, rvBuy, '1');
                }}>
                <Text style={styles.saveBtnText}>Сохранить как продажу</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const GREEN = '#1D9E75';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },

  modeSwitch: {
    flexDirection: 'row', margin: 16, marginBottom: 12,
    backgroundColor: '#fff', borderRadius: 12, padding: 4,
    borderWidth: 0.5, borderColor: '#E0E0E0',
  },
  modeBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center',
  },
  modeBtnActive: { backgroundColor: GREEN },
  modeBtnText: { fontSize: 14, fontWeight: '500', color: '#888' },
  modeBtnTextActive: { color: '#fff' },

  section: {
    marginHorizontal: 16, backgroundColor: '#fff',
    borderRadius: 16, padding: 16,
    borderWidth: 0.5, borderColor: '#E0E0E0',
    marginBottom: 24,
  },

  // Дисплей
  display: {
    backgroundColor: '#F5F5F5', borderRadius: 12,
    padding: 16, marginBottom: 16, alignItems: 'flex-end',
    minHeight: 90, justifyContent: 'flex-end',
  },
  displayExpr: { fontSize: 13, color: '#999', marginBottom: 4 },
  displayVal: { fontSize: 40, fontWeight: '500', color: '#222' },

  // Клавиши
  keys: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  key: {
    width: '22%', aspectRatio: 1,
    borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F9F9F9', borderWidth: 0.5, borderColor: '#E0E0E0',
  },
  keyText: { fontSize: 20, fontWeight: '500', color: '#222' },
  keyFn: { backgroundColor: '#EFEFEF' },
  keyFnText: { fontSize: 16, fontWeight: '500', color: '#555' },
  keyOp: { backgroundColor: '#F0FBF7' },
  keyOpText: { fontSize: 22, fontWeight: '500', color: GREEN },
  keyEq: { backgroundColor: GREEN },
  keyEqText: { fontSize: 24, fontWeight: '500', color: '#fff' },
  keyZero: { width: '47%', aspectRatio: undefined, paddingVertical: 18 },

  transferBtn: {
    marginTop: 14, padding: 14, borderRadius: 12,
    borderWidth: 0.5, borderColor: GREEN, alignItems: 'center',
  },
  transferBtnText: { fontSize: 14, fontWeight: '500', color: GREEN },

  // Торговые табы
  tradeTabs: { marginBottom: 16 },
  tradeTab: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 20, marginRight: 8,
    borderWidth: 0.5, borderColor: '#E0E0E0',
    backgroundColor: '#F9F9F9',
  },
  tradeTabActive: { backgroundColor: GREEN, borderColor: GREEN },
  tradeTabText: { fontSize: 13, color: '#666', fontWeight: '500' },
  tradeTabTextActive: { color: '#fff' },

  // Поля
  label: { fontSize: 12, color: '#888', marginBottom: 6, marginTop: 14 },
  input: {
    backgroundColor: '#F5F5F5', borderRadius: 10, padding: 13,
    fontSize: 16, color: '#222', borderWidth: 0.5, borderColor: '#E0E0E0',
  },

  // Карточки результата
  resultCards: { flexDirection: 'row', gap: 10, marginTop: 16 },
  rCard: {
    flex: 1, backgroundColor: '#F5F5F5', borderRadius: 10,
    padding: 14, borderWidth: 0.5, borderColor: '#E8E8E8',
  },
  rLabel: { fontSize: 11, color: '#999', marginBottom: 6 },
  rVal: { fontSize: 18, fontWeight: '500', color: '#222' },
  rValAccent: { color: GREEN },

  saveBtn: {
    marginTop: 16, backgroundColor: GREEN,
    borderRadius: 12, padding: 15, alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '500' },
});
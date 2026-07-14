export type ExpenseCategory =
  | 'inventory'    // Закупка товара
  | 'food'         // Еда
  | 'utilities'    // Коммуналка (свет, вода)
  | 'rent'         // Аренда
  | 'transport'    // Доставка/транспорт
  | 'salary'       // Зарплата
  | 'equipment'    // Оборудование (лампочка, весы)
  | 'other';       // Прочее

export type ExpenseType = 'operational' | 'inventory';

export interface Expense {
  id: number;
  _id?: string; // MongoDB ID for sync
  type: ExpenseType;
  category: ExpenseCategory;
  amount: number;
  description: string;
  linkedProductId?: number;
  created_at: string; // ISO string to match other entities
  userId: string;
  sellerId?: string;
  sellerName?: string;
}

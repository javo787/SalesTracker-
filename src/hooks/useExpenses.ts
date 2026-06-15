import { useState, useCallback } from 'react';
import { addExpense as dbAddExpense, getExpenses as dbGetExpenses, deleteExpense as dbDeleteExpense, getExpenseStats as dbGetExpenseStats } from '../db/database';
import { Expense, ExpenseCategory, ExpenseType } from '../types/expense';
import { useAuth } from '../context/AuthContext';

export function useExpenses() {
  const { user } = useAuth();
  const userId = user?._id || 'local_guest';

  const addExpense = useCallback(async (data: {
    type: ExpenseType;
    category: ExpenseCategory;
    amount: number;
    description: string;
    linkedProductId?: number;
  }) => {
    return dbAddExpense(
      data.type,
      data.category,
      data.amount,
      data.description,
      userId,
      data.linkedProductId || null
    );
  }, [userId]);

  const getExpenses = useCallback(async (days: number): Promise<Expense[]> => {
    return dbGetExpenses(days) as Expense[];
  }, []);

  const deleteExpense = useCallback(async (id: number) => {
    return dbDeleteExpense(id);
  }, []);

  const getTotals = useCallback(async (days: number): Promise<{ operational: number; inventory: number; total: number }> => {
    return dbGetExpenseStats(days) as { operational: number; inventory: number; total: number };
  }, []);

  return {
    addExpense,
    getExpenses,
    deleteExpense,
    getTotals
  };
}

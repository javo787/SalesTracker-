import { useShop } from '../context/ShopContext';

export function useRole() {
  const { role, isOwner, isSeller, sellerName, shopId } = useShop();
  return {
    role,
    isOwner,
    isSeller,
    sellerName,
    shopId,
    // Utility: if seller — return fallback value
    ownerOnly: <T,>(value: T, fallback: T): T => isOwner ? value : fallback,
  };
}

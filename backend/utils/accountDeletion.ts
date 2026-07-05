import ShopMember from '../models/ShopMember';
import Shop from '../models/Shop';
import User from '../models/User';

export async function deleteUserAccount(
  userId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const ownedShop = await ShopMember.findOne({ userId, role: 'owner', isActive: true });

  if (ownedShop) {
    const otherMembers = await ShopMember.countDocuments({
      shopId: ownedShop.shopId,
      userId: { $ne: userId },
      isActive: true,
    });
    if (otherMembers > 0) {
      return {
        ok: false,
        message: 'Владелец магазина с активными сотрудниками — сначала передайте владение или удалите сотрудников.',
      };
    }
    await Shop.deleteOne({ _id: ownedShop.shopId });
  }

  await ShopMember.deleteMany({ userId });
  await User.deleteOne({ _id: userId });

  return { ok: true };
}

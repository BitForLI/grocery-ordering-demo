/** 履约订单：待支付 → 待接单 → 备货 → 待取/待送 → 已完成（已取/已交接） */
export const TAB_ITEMS = [
  { key: 'Pending', label: 'Awaiting payment' },
  { key: 'Paid', label: 'To accept' },
  { key: 'Preparing', label: 'Preparing' },
  { key: 'PreparedPickup', label: 'Ready for pickup' },
  { key: 'PreparedDelivery', label: 'Ready for delivery' },
  { key: 'CompletedPickup', label: 'Completed (pickup)' },
  { key: 'CompletedDelivery', label: 'Completed (delivery)' },
  { key: 'RefundRequested', label: 'Refund requests' },
] as const;

export function resolveTabParams(tab: string | undefined): { status?: string; orderType?: string; pickedUp?: boolean } {
  if (!tab) return { status: 'Pending' };
  if (tab === 'PreparedPickup') return { status: 'Prepared', orderType: 'Pickup', pickedUp: false };
  if (tab === 'PreparedDelivery') return { status: 'Prepared', orderType: 'Delivery', pickedUp: false };
  if (tab === 'CompletedPickup') return { status: 'Prepared', orderType: 'Pickup', pickedUp: true };
  if (tab === 'CompletedDelivery') return { status: 'Prepared', orderType: 'Delivery', pickedUp: true };
  if (tab === 'Pending' || tab === 'Paid' || tab === 'Preparing' || tab === 'RefundRequested') return { status: tab };
  return { status: 'Pending' };
}

export type OrderTabKey = (typeof TAB_ITEMS)[number]['key'];

export interface OrderRow {
  id: number;
  userId: number;
  userName: string;
  userPhone: string;
  totalAmount: number;
  finalAmount?: number;
  orderStatus: string;
  orderType: string;
  pickupTime?: string;
  pickupCode?: string;
  deliveryAddress?: string;
  deliverySuburb?: string;
  createdAt: string;
  pickedUpAt?: string | null;
}

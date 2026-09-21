import { useCallback, useEffect, useState } from 'react';
import { Checkbox, Input, Modal, message } from 'antd';
import { Link } from 'react-router-dom';
import { orderAPI } from '../api';
import { useAuth, type User } from '../context/AuthContext';

interface NormalizedOrderItem {
  id: number;
  productName: string;
  quantity: number;
  priceAtPurchase: number;
  expectedWeight?: number;
  actualWeight?: number;
  isWeighingRequired: boolean;
  customerRefundCompletedAt: string | null;
}

interface NormalizedOrder {
  id: number;
  totalAmount: number;
  finalAmount?: number;
  refundAmount: number;
  refundRejectionReason: string;
  refundRequestReason: string;
  refundRequestedItemIds: number[] | null;
  orderStatus: string;
  orderType: string;
  pickupCode: string;
  pickupTime?: string;
  deliveryAddress?: string;
  createdAt?: string;
  items: NormalizedOrderItem[];
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return typeof value === 'object' && value !== null ? (value as UnknownRecord) : {};
}

function readField(record: UnknownRecord, camelName: string, pascalName: string): unknown {
  return record[camelName] ?? record[pascalName];
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toOptionalNumber(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toOptionalString(value: unknown): string | undefined {
  return value == null ? undefined : String(value);
}

function toNumberArray(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  return value.map((entry) => Number(entry)).filter((entry) => Number.isInteger(entry) && entry > 0);
}

function normalizeOrderItem(raw: unknown): NormalizedOrderItem {
  const row = asRecord(raw);
  return {
    id: toNumber(readField(row, 'id', 'Id')),
    productName: String(readField(row, 'productName', 'ProductName') ?? ''),
    quantity: toNumber(readField(row, 'quantity', 'Quantity')),
    priceAtPurchase: toNumber(readField(row, 'priceAtPurchase', 'PriceAtPurchase')),
    expectedWeight: toOptionalNumber(readField(row, 'expectedWeight', 'ExpectedWeight')),
    actualWeight: toOptionalNumber(readField(row, 'actualWeight', 'ActualWeight')),
    isWeighingRequired: Boolean(readField(row, 'isWeighingRequired', 'IsWeighingRequired')),
    customerRefundCompletedAt: toOptionalString(
      readField(row, 'customerRefundCompletedAt', 'CustomerRefundCompletedAt')
    ) ?? null,
  };
}

function normalizeOrder(raw: unknown): NormalizedOrder {
  const row = asRecord(raw);
  const rawItems = readField(row, 'items', 'Items');
  return {
    id: toNumber(readField(row, 'id', 'Id')),
    totalAmount: toNumber(readField(row, 'totalAmount', 'TotalAmount')),
    finalAmount: toOptionalNumber(readField(row, 'finalAmount', 'FinalAmount')),
    refundAmount: toNumber(readField(row, 'refundAmount', 'RefundAmount')),
    refundRejectionReason: String(readField(row, 'refundRejectionReason', 'RefundRejectionReason') ?? ''),
    refundRequestReason: String(readField(row, 'refundRequestReason', 'RefundRequestReason') ?? ''),
    refundRequestedItemIds: toNumberArray(readField(row, 'refundRequestedItemIds', 'RefundRequestedItemIds')),
    orderStatus: String(readField(row, 'orderStatus', 'OrderStatus') ?? ''),
    orderType: String(readField(row, 'orderType', 'OrderType') ?? ''),
    pickupCode: String(readField(row, 'pickupCode', 'PickupCode') ?? ''),
    pickupTime: toOptionalString(readField(row, 'pickupTime', 'PickupTime')),
    deliveryAddress: toOptionalString(readField(row, 'deliveryAddress', 'DeliveryAddress')),
    createdAt: toOptionalString(readField(row, 'createdAt', 'CreatedAt')),
    items: Array.isArray(rawItems) ? rawItems.map(normalizeOrderItem) : [],
  };
}

function orderLinePaidAmount(item: NormalizedOrderItem): number {
  const price = Number(item.priceAtPurchase);
  if (item.isWeighingRequired) {
    const kg = item.actualWeight != null && !Number.isNaN(Number(item.actualWeight))
      ? Number(item.actualWeight)
      : Number(item.expectedWeight ?? 0);
    return kg * price;
  }
  return price * Number(item.quantity);
}

const PAID_ORDER_STATUSES = new Set(['Paid', 'Preparing', 'Prepared', 'Completed', 'RefundRequested', 'Refunded']);

function isPaidOrder(order: NormalizedOrder): boolean {
  return PAID_ORDER_STATUSES.has(order.orderStatus);
}

export function OrderHistory({ user, onClose }: { user: User; onClose: () => void }) {
  const [orders, setOrders] = useState<NormalizedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<NormalizedOrder | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [refundRequesting, setRefundRequesting] = useState(false);
  const [refundConfirmOpen, setRefundConfirmOpen] = useState(false);
  const [refundReason, setRefundReason] = useState('');
  const [refundSelectedIds, setRefundSelectedIds] = useState<Set<number>>(new Set());
  const { setUser } = useAuth();

  const fetchOrders = useCallback(async () => {
    try {
      setError('');
      const res = await orderAPI.getUserOrders(user.id);
      const paidOrders = (Array.isArray(res) ? res : []).map(normalizeOrder).filter(isPaidOrder);
      setOrders(paidOrders);
    } catch (err) {
      setError((err as Error).message);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => {
    void fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    if (!refundConfirmOpen || !selectedOrder) return;
    const refundable = selectedOrder.items.filter((item) => !item.customerRefundCompletedAt);
    const next = new Set<number>();
    if (refundable.length === 1) next.add(refundable[0].id);
    setRefundSelectedIds(next);
    setRefundReason('');
  }, [refundConfirmOpen, selectedOrder]);

  const handleLogout = () => {
    setUser(null);
    onClose();
  };

  const openOrderDetail = async (orderId: number) => {
    setRefundConfirmOpen(false);
    setDetailLoading(true);
    setError('');
    try {
      const raw = await orderAPI.get(orderId);
      setSelectedOrder(normalizeOrder(raw));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDetailLoading(false);
    }
  };

  const hasRefundableLines = (order: NormalizedOrder) =>
    order.items.some((item) => !item.customerRefundCompletedAt);

  const canRequestRefund = (order: NormalizedOrder) => {
    const st = order.orderStatus;
    if (!['Paid', 'Preparing', 'Prepared', 'Completed'].includes(st)) return false;
    if (['RefundRequested', 'Refunded'].includes(st)) return false;
    return hasRefundableLines(order);
  };

  const submitRefundRequest = async (): Promise<void> => {
    if (!selectedOrder || !canRequestRefund(selectedOrder)) return;
    const items = selectedOrder.items;
    const refundable = items.filter((item) => !item.customerRefundCompletedAt);
    const isCompleted = String(selectedOrder.orderStatus) === 'Completed';
    if (isCompleted && refundReason.trim().length < 5) {
      message.warning('Completed orders must include a refund reason (at least 5 characters).');
      throw new Error('validation');
    }
    const itemIds = refundable.length === 1 ? [refundable[0].id] : Array.from(refundSelectedIds);
    if (refundable.length > 1 && itemIds.length === 0) {
      message.warning('Please select at least one item to refund.');
      throw new Error('validation');
    }
    setRefundRequesting(true);
    setError('');
    try {
      const raw = await orderAPI.requestRefund(selectedOrder.id, {
        reason: refundReason.trim() || undefined,
        itemIds,
      });
      const next = normalizeOrder(raw);
      setSelectedOrder(next);
      setOrders((list) => list.map((order) => (order.id === next.id ? { ...order, orderStatus: next.orderStatus } : order)));
      setRefundConfirmOpen(false);
      message.success('Refund request submitted');
    } catch (err) {
      setError((err as Error).message);
      throw err;
    } finally {
      setRefundRequesting(false);
    }
  };

  if (loading) {
    return <p style={{ textAlign: 'center', color: '#999' }}>Loading orders...</p>;
  }

  if (selectedOrder) {
    const amount = selectedOrder.finalAmount != null ? Number(selectedOrder.finalAmount) : Number(selectedOrder.totalAmount ?? 0);
    const items = selectedOrder.items;
    return (
      <div>
        <Modal
          title="Request refund"
          zIndex={1300}
          open={refundConfirmOpen}
          okText="Submit request"
          cancelText="Cancel"
          okButtonProps={{ danger: true }}
          confirmLoading={refundRequesting}
          cancelButtonProps={{ disabled: refundRequesting }}
          closable={!refundRequesting}
          maskClosable={!refundRequesting}
          onCancel={() => !refundRequesting && setRefundConfirmOpen(false)}
          onOk={submitRefundRequest}
        >
          <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem', color: '#374151', lineHeight: 1.55 }}>
            The refund request will be reviewed by staff. Refunds are not processed automatically.
          </p>
          {String(selectedOrder.orderStatus) === 'Completed' ? (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: 6 }}>Refund reason (required, at least 5 characters)</div>
              <Input.TextArea
                rows={3}
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                placeholder="Explain why you want a refund"
                maxLength={500}
                showCount
              />
            </div>
          ) : (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: 6 }}>Refund reason (optional)</div>
              <Input.TextArea rows={2} value={refundReason} onChange={(e) => setRefundReason(e.target.value)} maxLength={500} />
            </div>
          )}
          {(() => {
            const refundable = selectedOrder.items.filter((item) => !item.customerRefundCompletedAt);
            if (refundable.length <= 1) return null;
            return (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: 8 }}>Select items to refund (multiple allowed)</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {refundable.map((item) => {
                    const checked = refundSelectedIds.has(item.id);
                    return (
                      <label
                        key={item.id}
                        style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '0.85rem', cursor: 'pointer' }}
                      >
                        <Checkbox
                          checked={checked}
                          onChange={(e) => {
                            setRefundSelectedIds((prev) => {
                              const n = new Set(prev);
                              if (e.target.checked) n.add(item.id);
                              else n.delete(item.id);
                              return n;
                            });
                          }}
                        />
                        <span>
                          {item.productName} — approx ${orderLinePaidAmount(item).toFixed(2)}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })()}
          <ul
            style={{
              margin: 0,
              paddingLeft: '1.15rem',
              fontSize: '0.875rem',
              color: '#4b5563',
              lineHeight: 1.6,
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}
          >
            <li>Refunds are only for unused, undamaged items that can be resold. Packaging requirements follow store policy.</li>
            <li>Once approved, refunds typically take about one week to reach your bank or card provider.</li>
          </ul>
        </Modal>
        <button
          type="button"
          onClick={() => {
            setRefundConfirmOpen(false);
            setSelectedOrder(null);
          }}
          style={{
            marginBottom: '1rem',
            border: 'none',
            background: 'transparent',
            color: '#6b7280',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          ← Back to order history
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', marginBottom: '0.75rem' }}>
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151', flex: 1, minWidth: 0 }}>
            {selectedOrder.createdAt ? new Date(selectedOrder.createdAt).toLocaleString() : '-'}
          </span>
          <span
            style={{
              fontSize: '0.75rem',
              padding: '0.2rem 0.5rem',
              borderRadius: '4px',
              backgroundColor: selectedOrder.orderStatus === 'RefundRequested' ? '#fee2e2' : ['Paid', 'Preparing', 'Prepared', 'Completed'].includes(selectedOrder.orderStatus) ? '#dcfce7' : '#fef3c7',
              color: selectedOrder.orderStatus === 'RefundRequested' ? '#991b1b' : ['Paid', 'Preparing', 'Prepared', 'Completed'].includes(selectedOrder.orderStatus) ? '#166534' : '#92400e',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {selectedOrder.orderStatus}
          </span>
        </div>

        {error && <p style={{ color: '#dc2626', fontSize: '0.875rem', marginBottom: '1rem' }}>{error}</p>}

        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '0.9rem', marginBottom: '1rem' }}>
          <div style={{ display: 'grid', gap: '0.35rem', fontSize: '0.875rem' }}>
            <div><strong>Total:</strong> ${amount.toFixed(2)}</div>
            <div><strong>Refunded:</strong> ${(selectedOrder.refundAmount ?? 0).toFixed(2)}</div>
            <div><strong>Type:</strong> {selectedOrder.orderType || '-'}</div>
            {selectedOrder.orderType === 'Pickup' && <div><strong>Pickup code:</strong> {selectedOrder.pickupCode || '-'}</div>}
            {selectedOrder.orderType === 'Pickup' && <div><strong>Pickup time:</strong> {selectedOrder.pickupTime ? new Date(selectedOrder.pickupTime).toLocaleString() : '-'}</div>}
            {selectedOrder.orderType === 'Delivery' && <div><strong>Delivery address:</strong> {selectedOrder.deliveryAddress || '-'}</div>}
          </div>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <h4 style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>Products</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {items.map((item, index) => {
              const name = item.productName || 'Item';
              const quantity = Number(item.quantity);
              const line = orderLinePaidAmount(item);
              const done = Boolean(item.customerRefundCompletedAt);
              return (
                <div
                  key={item.id || index}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                    fontSize: '0.85rem',
                    borderBottom: '1px solid #f3f4f6',
                    paddingBottom: '0.45rem',
                    opacity: done ? 0.55 : 1,
                  }}
                >
                  <span>
                    {name}
                    {item.isWeighingRequired ? ` (${Number(item.expectedWeight ?? 0).toFixed(3)} kg est.)` : ` ×${quantity}`}
                    {done ? <em style={{ marginLeft: 6, color: '#64748b' }}>(refund processed)</em> : null}
                  </span>
                  <strong>${line.toFixed(2)}</strong>
                </div>
              );
            })}
          </div>
        </div>

        {selectedOrder.orderStatus === 'RefundRequested' ? (
          <div style={{ fontSize: '0.85rem', color: '#991b1b', background: '#fee2e2', padding: '0.75rem', borderRadius: 6 }}>
            <p style={{ margin: '0 0 0.5rem 0' }}>Your refund request has been submitted and will be reviewed by staff.</p>
            {selectedOrder.refundRequestReason ? (
              <p style={{ margin: 0, color: '#7f1d1d' }}>
                <strong>Your reason:</strong>
                {selectedOrder.refundRequestReason}
              </p>
            ) : null}
          </div>
        ) : selectedOrder.refundRejectionReason ? (
          <p style={{ fontSize: '0.85rem', color: '#92400e', background: '#fef3c7', padding: '0.75rem', borderRadius: 6 }}>
            Refund request denied: {selectedOrder.refundRejectionReason}
          </p>
        ) : (
          <button
            type="button"
            disabled={!canRequestRefund(selectedOrder) || refundRequesting}
            onClick={() => setRefundConfirmOpen(true)}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: 'none',
              borderRadius: '6px',
              backgroundColor: canRequestRefund(selectedOrder) && !refundRequesting ? '#dc2626' : '#9ca3af',
              color: 'white',
              fontWeight: 'bold',
              cursor: canRequestRefund(selectedOrder) && !refundRequesting ? 'pointer' : 'not-allowed',
            }}
          >
            {refundRequesting ? 'Submitting…' : 'Request refund'}
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', gap: '1rem' }}>
        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>Order History</h3>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {user?.role === 'Admin' ? (
            <>
              <Link
                to="/admin/products"
                title="Products, customers, and dashboard"
                style={{
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.8rem',
                  border: '1px solid #dc2626',
                  color: '#dc2626',
                  borderRadius: '6px',
                  backgroundColor: 'transparent',
                  textDecoration: 'none',
                }}
              >
                Admin
              </Link>
              <Link
                to="/staff/orders/to-accept"
                title="View and process orders (same view as staff)"
                style={{
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.8rem',
                  border: '1px solid #059669',
                  color: '#059669',
                  borderRadius: '6px',
                  backgroundColor: 'transparent',
                  textDecoration: 'none',
                }}
              >
                Orders
              </Link>
            </>
          ) : null}
          {user?.role === 'Staff' ? (
            <Link
              to="/staff/orders/to-accept"
              style={{
                padding: '0.35rem 0.75rem',
                fontSize: '0.8rem',
                border: '1px solid #059669',
                color: '#059669',
                borderRadius: '6px',
                backgroundColor: 'transparent',
                textDecoration: 'none',
              }}
            >
              Orders
            </Link>
          ) : null}
          <button
          onClick={handleLogout}
          style={{
            padding: '0.35rem 0.75rem',
            fontSize: '0.8rem',
            border: '1px solid #dc2626',
            color: '#dc2626',
            borderRadius: '6px',
            backgroundColor: 'transparent',
            cursor: 'pointer',
          }}
        >
          Sign Out
        </button>
        </div>
      </div>

      {error && (
        <p style={{ color: '#dc2626', fontSize: '0.875rem', marginBottom: '1rem' }}>{error}</p>
      )}

      {orders.length === 0 ? (
        <p style={{ textAlign: 'center', color: '#999', marginTop: '2rem' }}>No orders yet</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {orders.map((order) => (
            <div
              key={order.id}
              role="button"
              tabIndex={0}
              onClick={() => void openOrderDetail(order.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') void openOrderDetail(order.id);
              }}
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '1rem',
                backgroundColor: '#f9fafb',
                cursor: detailLoading ? 'wait' : 'pointer',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151', flex: 1, minWidth: 0 }}>
                  {order.createdAt ? new Date(order.createdAt).toLocaleString() : ''}
                </span>
                <span
                  style={{
                    fontSize: '0.75rem',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                    flexShrink: 0,
                    backgroundColor:
                      order.orderStatus === 'RefundRequested'
                        ? '#fee2e2'
                        : order.orderStatus === 'Refunded'
                          ? '#e0e7ff'
                          : ['Paid', 'Preparing', 'Prepared', 'Completed'].includes(order.orderStatus)
                            ? '#dcfce7'
                            : '#fef3c7',
                    color:
                      order.orderStatus === 'RefundRequested'
                        ? '#991b1b'
                        : order.orderStatus === 'Refunded'
                          ? '#3730a3'
                          : ['Paid', 'Preparing', 'Prepared', 'Completed'].includes(order.orderStatus)
                            ? '#166534'
                            : '#92400e',
                  }}
                >
                  {order.orderStatus}
                </span>
              </div>
              <div style={{ fontSize: '1rem', fontWeight: 'bold', color: '#dc2626' }}>
                ${order.totalAmount ? Number(order.totalAmount).toFixed(2) : '0.00'}
              </div>
              <div style={{ marginTop: '0.35rem', fontSize: '0.75rem', color: '#6b7280' }}>Click to view details</div>
              {order.items && order.items.length > 0 && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#6b7280' }}>
                  {order.items.slice(0, 3).map((item, i) => (
                    <div key={i}>{item.productName || 'Item'} x{item.quantity}</div>
                  ))}
                  {order.items.length > 3 && <div>+{order.items.length - 3} more</div>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

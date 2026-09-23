import { Button } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { formatDeliverySuburbDisplay } from '../../constants/deliveryZones';
import type { OrderRow } from './orderManagement';

interface OrderManagementColumnOptions {
  isAdmin: boolean;
  isRefundsOnlyPage: boolean;
  acceptingId: number | null;
  refundingId: number | null;
  rejectingId: number | null;
  readyId: number | null;
  pickedUpId: number | null;
  onOpenOrder: (orderId: number) => void;
  onApproveRefund: (orderId: number) => void;
  onRejectRefund: (orderId: number) => void;
  onAcceptOrder: (orderId: number) => void;
  onMarkReady: (orderId: number, orderType: string) => void;
  onMarkPickedUp: (orderId: number, orderType: string) => void;
}

export function buildOrderManagementColumns({
  isAdmin,
  isRefundsOnlyPage,
  acceptingId,
  refundingId,
  rejectingId,
  readyId,
  pickedUpId,
  onOpenOrder,
  onApproveRefund,
  onRejectRefund,
  onAcceptOrder,
  onMarkReady,
  onMarkPickedUp,
}: OrderManagementColumnOptions): ColumnsType<OrderRow> {
  return [
    {
      title: 'Order #',
      dataIndex: 'id',
      key: 'id',
      width: 90,
      render: (id: number) => (
        <Button type="link" onClick={() => onOpenOrder(id)} style={{ padding: 0 }}>
          #{id}
        </Button>
      ),
    },
    {
      title: 'Date',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (v: string) => (v ? new Date(v).toLocaleString() : '-'),
    },
    { title: 'Customer', key: 'user', render: (_, r) => (r.userName && r.userPhone ? `${r.userName} (${r.userPhone})` : (r.userName || r.userPhone || '-')) },
    {
      title: 'Type',
      key: 'orderType',
      width: 90,
      render: (_: unknown, r: OrderRow) => (r.orderType === 'Pickup' ? 'Pickup' : r.orderType === 'Delivery' ? 'Delivery' : r.orderType || '-'),
    },
    {
      title: 'Code / Area',
      key: 'codeOrArea',
      width: 100,
      render: (_: unknown, r: OrderRow) =>
        r.orderType === 'Pickup' ? (r.pickupCode || '—') : r.orderType === 'Delivery' ? formatDeliverySuburbDisplay(r.deliverySuburb) : '—',
    },
    {
      title: 'Pickup / Delivery',
      key: 'pickupOrDelivery',
      width: 160,
      render: (_: unknown, r: OrderRow) => {
        if (r.pickedUpAt) {
          const t = new Date(r.pickedUpAt).toLocaleString('en-AU', {
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          });
          return <span style={{ color: '#059669' }}>Done {t}</span>;
        }
        if (r.orderType === 'Pickup' && r.pickupTime) {
          return new Date(r.pickupTime).toLocaleString('zh-CN', {
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          });
        }
        if (r.orderType === 'Delivery' && r.deliveryAddress) {
          return r.deliveryAddress.length > 12 ? `${r.deliveryAddress.slice(0, 12)}…` : r.deliveryAddress;
        }
        return '-';
      },
    },
    {
      title: 'Total',
      dataIndex: 'totalAmount',
      key: 'totalAmount',
      width: 100,
      render: (v: number, r) => `$${(r.finalAmount ?? v ?? 0).toFixed(2)}`,
    },
    ...(isRefundsOnlyPage
      ? [
          {
            title: 'Status',
            key: 'status',
            width: 120,
            render: (_: unknown, r: OrderRow) => (
              <span
                style={{
                  fontSize: 12,
                  padding: '0.2rem 0.45rem',
                  borderRadius: 999,
                  backgroundColor:
                    r.orderStatus === 'RefundRequested'
                      ? '#fee2e2'
                      : r.orderStatus === 'Refunded'
                        ? '#dcfce7'
                        : r.orderStatus === 'Completed'
                          ? '#e0f2fe'
                          : '#f3f4f6',
                  color:
                    r.orderStatus === 'RefundRequested'
                      ? '#991b1b'
                      : r.orderStatus === 'Refunded'
                        ? '#166534'
                        : r.orderStatus === 'Completed'
                          ? '#075985'
                          : '#374151',
                }}
              >
                {r.orderStatus}
              </span>
            ),
          },
        ]
      : []),
    {
      title: 'Actions',
      key: 'action',
      width: 220,
      render: (_, r) => (
        <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {r.orderStatus === 'Pending' && (
            <span style={{ fontSize: 12, color: '#d97706' }}>Awaiting payment</span>
          )}
          {r.orderStatus === 'RefundRequested' && (
            <>
              {isAdmin && (
                <Button
                  danger
                  size="small"
                  loading={refundingId === r.id}
                  onClick={() => onApproveRefund(r.id)}
                >
                  Approve refund
                </Button>
              )}
              <Button
                size="small"
                loading={rejectingId === r.id}
                onClick={() => onRejectRefund(r.id)}
              >
                Reject refund
              </Button>
            </>
          )}
          {r.orderStatus === 'Paid' && (
            <Button
              type="primary"
              size="small"
              loading={acceptingId === r.id}
              onClick={() => onAcceptOrder(r.id)}
            >
              Accept
            </Button>
          )}
          {r.orderStatus === 'Preparing' && (
            <Button
              size="small"
              loading={readyId === r.id}
              onClick={() => onMarkReady(r.id, r.orderType)}
            >
              Ready
            </Button>
          )}
          {r.orderStatus === 'Prepared' && !r.pickedUpAt && (
            <Button
              size="small"
              loading={pickedUpId === r.id}
              onClick={() => onMarkPickedUp(r.id, r.orderType)}
            >
              {r.orderType === 'Delivery' ? 'Handed off' : 'Picked up'}
            </Button>
          )}
          {r.orderStatus === 'Prepared' && r.pickedUpAt && (
            <span style={{ fontSize: 12, color: '#059669', fontWeight: 600 }}>Completed</span>
          )}
        </span>
      ),
    },
  ];
}

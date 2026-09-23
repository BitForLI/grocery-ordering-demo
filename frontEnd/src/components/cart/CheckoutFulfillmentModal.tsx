import type { OrderType } from '../../context/OrderModeContext';
import { FulfillmentOptionsForm } from '../FulfillmentOptionsForm';

interface CheckoutFulfillmentModalProps {
  open: boolean;
  checkoutLoading: boolean;
  checkoutError: string;
  orderType: OrderType;
  onClose: () => void;
  onContinue: () => void;
}

export function CheckoutFulfillmentModal({
  open,
  checkoutLoading,
  checkoutError,
  orderType,
  onClose,
  onContinue,
}: CheckoutFulfillmentModalProps) {
  if (!open) return null;

  const fulfillmentModalScroll =
    orderType === 'Delivery'
      ? { overflowY: 'visible' as const, overflowX: 'visible' as const }
      : { overflowY: 'auto' as const, overflowX: 'hidden' as const };

  return (
<div
          role="dialog"
          aria-modal="true"
          aria-labelledby="checkout-fulfillment-title"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 12,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
          }}
          onClick={() => {
            if (!checkoutLoading) onClose();
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(420px, 100%)',
              maxHeight: 'min(90dvh, 640px)',
              backgroundColor: 'white',
              borderRadius: 12,
              boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '14px 16px',
                borderBottom: '1px solid #e5e7eb',
                flexShrink: 0,
              }}
            >
              <h2 id="checkout-fulfillment-title" style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: '#0f172a' }}>
                Pickup or delivery
              </h2>
              <button
                type="button"
                disabled={checkoutLoading}
                aria-label="Close"
                onClick={onClose}
                style={{
                  border: 'none',
                  background: 'transparent',
                  fontSize: '1.25rem',
                  cursor: checkoutLoading ? 'not-allowed' : 'pointer',
                  color: '#64748b',
                  lineHeight: 1,
                  padding: 4,
                }}
              >
                ✕
              </button>
            </div>
            <div
              style={{
                flex: 1,
                minHeight: 0,
                padding: '1rem 1.25rem',
                ...fulfillmentModalScroll,
              }}
            >
              <FulfillmentOptionsForm variant="checkoutModal" active={open} />
            </div>
            {checkoutError && (
              <p style={{ margin: 0, padding: '0 16px 8px', fontSize: '0.8rem', color: '#dc2626' }}>{checkoutError}</p>
            )}
            <div
              style={{
                display: 'flex',
                gap: 10,
                padding: '12px 16px',
                borderTop: '1px solid #e5e7eb',
                flexShrink: 0,
              }}
            >
              <button
                type="button"
                disabled={checkoutLoading}
                onClick={onClose}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid #e5e7eb',
                  background: 'white',
                  fontWeight: 600,
                  cursor: checkoutLoading ? 'not-allowed' : 'pointer',
                  color: '#334155',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={checkoutLoading}
                onClick={onContinue}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: 'none',
                  background: checkoutLoading ? '#fca5a5' : '#dc2626',
                  color: 'white',
                  fontWeight: 600,
                  cursor: checkoutLoading ? 'not-allowed' : 'pointer',
                }}
              >
                {checkoutLoading ? 'Redirecting…' : 'Continue to payment'}
              </button>
            </div>
          </div>
        </div>
  );
}

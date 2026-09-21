import { useState } from 'react';
import { message } from 'antd';
import { useRightDrawer, DRAWER_MS } from '../hooks/useRightDrawer';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useOrderMode } from '../context/OrderModeContext';
import { orderAPI, paymentAPI, ApiRequestError } from '../api';
import { useStorePublicSettings, computeDeliveryFeeAud } from '../context/StorePublicSettingsContext';
import { DELIVERY_SUBURBS, normalizeSuburbKey } from '../constants/deliveryZones';
import cartIcon from '../assets/images/cart.png';
import { CartItemList } from './cart/CartItemList';
import { CheckoutFulfillmentModal } from './cart/CheckoutFulfillmentModal';

export function CartSidebar({ compact = false }: { compact?: boolean }) {
  const iconPx = compact ? 24 : 32;
  const badgePx = compact ? 17 : 20;
  const { items, totalQuantity, removeItem, updateQuantity, updateExpectedWeightKg, total } = useCart();
  const hasWeighedItems = items.some((i) => i.isWeighingRequired);
  const { user } = useAuth();
  const { orderType, pickupTimeSlot, deliveryInfo, saveDeliveryAddress } = useOrderMode();
  const { settings: storeSettings } = useStorePublicSettings();
  const enabledDeliveryZones =
    storeSettings?.deliveryZones?.filter((zone) => zone.enabled) ??
    DELIVERY_SUBURBS.map((displayName) => ({ suburbKey: displayName.trim().toLowerCase(), displayName }));
  const isDeliverableSuburb = (suburb: string | undefined): boolean => {
    const key = normalizeSuburbKey(suburb);
    if (!key) return false;
    return enabledDeliveryZones.some((zone) => normalizeSuburbKey(zone.suburbKey) === key);
  };
  const deliveryFee =
    orderType === 'Delivery' ? computeDeliveryFeeAud(total, deliveryInfo.suburb, storeSettings) : 0;
  const freeShipMin = storeSettings?.freeShippingMinAud ?? 69;
  const grandTotal = total + deliveryFee;
  const {
    panelMounted,
    panelEnter,
    closePanel,
    onPanelTransitionEnd,
    toggleFromTrigger,
  } = useRightDrawer();
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [fulfillmentModalOpen, setFulfillmentModalOpen] = useState(false);

  const openCheckout = () => {
    if (!user) {
      const msg = 'Please sign in before checkout';
      setCheckoutError(msg);
      message.warning(msg);
      return;
    }
    setCheckoutError('');
    setFulfillmentModalOpen(true);
  };
  const continueToPayment = async () => {
    if (orderType === 'Pickup' && !pickupTimeSlot) {
      const msg = 'Please select a pickup time slot.';
      setCheckoutError(msg);
      message.warning(msg);
      return;
    }
    if (orderType === 'Delivery' && !deliveryInfo.address?.trim()) {
      const msg = 'Please enter your delivery address.';
      setCheckoutError(msg);
      message.warning(msg);
      return;
    }
    if (orderType === 'Delivery' && !isDeliverableSuburb(deliveryInfo.suburb)) {
      const msg = `Delivery is only available to these suburbs: ${enabledDeliveryZones
        .map((zone) => zone.displayName)
        .join(', ')}.`;
      setCheckoutError(msg);
      message.warning(msg);
      return;
    }
    if (!user) {
      message.warning('Please sign in before checkout');
      setFulfillmentModalOpen(false);
      return;
    }
    setCheckoutError('');
    setCheckoutLoading(true);
    try {
      if (orderType === 'Delivery') saveDeliveryAddress();
      const deliveryAddress =
        orderType === 'Delivery'
          ? [deliveryInfo.address, deliveryInfo.suburb, deliveryInfo.postcode].filter(Boolean).join(', ')
          : undefined;
      const orderRes = (await orderAPI.create({
        orderType,
        pickupTime: orderType === 'Pickup' ? pickupTimeSlot : undefined,
        deliveryAddress,
        deliverySuburb: orderType === 'Delivery' ? deliveryInfo.suburb : undefined,
        items: items.map((item) => ({
          productId: item.productId,
          quantity: item.isWeighingRequired ? 1 : item.quantity,
          expectedWeight: item.isWeighingRequired ? Number(item.expectedWeightKg ?? 0) : 0,
          selectedUnit: item.selectedUnit ?? (item.isWeighingRequired ? 'kg' : 'ea'),
        })),
      })) as { orderId?: number };
      const orderId = orderRes?.orderId;
      if (!orderId) throw new Error('Order creation failed');
      const checkoutRes = (await paymentAPI.createCheckout(orderId)) as { url?: string };
      const stripeUrl = checkoutRes?.url;
      if (!stripeUrl) throw new Error('Could not get payment link');
      window.location.href = stripeUrl;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (err instanceof ApiRequestError) {
        console.error(
          '[checkout] 服务器返回:',
          err.status,
          err.apiData,
          '（控制台里这一行才是原因；上面一长串 axios 堆栈没有说明文字）'
        );
      }
      setCheckoutError(errorMessage);
      message.error(errorMessage);
    } finally {
      setCheckoutLoading(false);
    }
  };
  return (
    <>
      {/* 购物车按钮 */}
      <button
        type="button"
        onClick={toggleFromTrigger}
        style={{
          position: 'relative',
          backgroundColor: 'transparent',
          border: 'none',
          cursor: 'pointer',
          width: iconPx,
          height: iconPx,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: compact ? 2 : 0,
          flexShrink: 0,
        }}
      >
        <img
          src={cartIcon}
          alt="cart"
          style={{ width: iconPx, height: iconPx, objectFit: 'contain' }}
        />
        {totalQuantity > 0 && (
          <span
            style={{
              position: 'absolute',
              top: compact ? -6 : -8,
              right: compact ? -6 : -8,
              backgroundColor: '#dc2626',
              color: 'white',
              borderRadius: totalQuantity > 9 ? 9999 : '50%',
              minWidth: badgePx,
              height: badgePx,
              padding: totalQuantity > 9 ? '0 5px' : 0,
              boxSizing: 'border-box',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: compact ? '0.65rem' : '0.75rem',
              fontWeight: 'bold',
            }}
          >
            {totalQuantity > 99 ? '99+' : totalQuantity}
          </span>
        )}
      </button>

      {/* 侧边栏 */}
      {panelMounted && (
        <div
          role="dialog"
          aria-modal="true"
          onTransitionEnd={onPanelTransitionEnd}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            right: 0,
            top: 0,
            width: 'min(100vw, 350px)',
            maxWidth: '100%',
            height: '100dvh',
            backgroundColor: 'white',
            boxShadow: '-2px 0 8px rgba(0,0,0,0.1)',
            zIndex: 1100,
            display: 'flex',
            flexDirection: 'column',
            transform: panelEnter ? 'translate3d(0,0,0)' : 'translate3d(100%,0,0)',
            transition: `transform ${DRAWER_MS}ms ease-out`,
            willChange: 'transform',
          }}
        >
          {/* 关闭按钮 */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '1rem',
              borderBottom: '1px solid #e5e7eb',
            }}
          >
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>Cart</h2>
            <button
              type="button"
              onClick={closePanel}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                fontSize: '1.5rem',
                cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </div>

          <CartItemList
            items={items}
            removeItem={removeItem}
            updateQuantity={updateQuantity}
            updateExpectedWeightKg={updateExpectedWeightKg}
          />

          {/* 结账区域 */}
          {items.length > 0 && (
            <div
              style={{
                borderTop: '1px solid #e5e7eb',
                padding: '1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
              }}
            >
              <div style={{ fontSize: '0.8rem', color: '#6b7280', lineHeight: 1.45 }}>
                <span>
                  {orderType === 'Pickup' ? 'Pickup' : 'Delivery'}
                  {orderType === 'Pickup' && pickupTimeSlot && (
                    <span style={{ color: '#64748b', marginLeft: 4 }}>— time selected</span>
                  )}
                  {orderType === 'Delivery' && deliveryInfo.address?.trim() && deliveryInfo.suburb && (
                    <span style={{ color: '#64748b', marginLeft: 4 }}>— address entered</span>
                  )}
                </span>
                <div style={{ marginTop: 4, fontSize: '0.75rem', color: '#94a3b8' }}>
                  After Checkout, confirm pickup time or delivery on the next step before payment.
                </div>
              </div>
              {hasWeighedItems && (
                <div
                  style={{
                    padding: '10px 12px',
                    backgroundColor: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    fontSize: '0.78rem',
                    color: '#475569',
                    lineHeight: 1.45,
                  }}
                >
                  <strong style={{ color: '#0f172a' }}>Weighed items:</strong> checkout uses your estimated weight and price per kg. If the actual weight is less, we refund the difference after packing (shown on your receipt / order confirmation).
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.9rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Subtotal:</span>
                  <span>${total.toFixed(2)}</span>
                </div>
                {orderType === 'Delivery' && deliveryFee > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Delivery fee:</span>
                    <span>${deliveryFee.toFixed(2)}</span>
                  </div>
                )}
                {orderType === 'Delivery' && deliveryFee === 0 && total >= freeShipMin && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#16a34a' }}>
                    <span>Delivery fee:</span>
                    <span>Free delivery</span>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.125rem', fontWeight: 'bold' }}>
                <span>Total:</span>
                <span style={{ color: '#dc2626', fontWeight: 'bold' }}>${grandTotal.toFixed(2)}</span>
              </div>
              {checkoutError && (
                <p style={{ color: '#dc2626', fontSize: '0.8rem', margin: 0 }}>{checkoutError}</p>
              )}
              <button
                type="button"
                onClick={openCheckout}
                disabled={checkoutLoading}
                style={{
                  width: '100%',
                  backgroundColor: checkoutLoading ? '#9ca3af' : '#dc2626',
                  color: 'white',
                  padding: '0.75rem',
                  borderRadius: '4px',
                  border: 'none',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  cursor: checkoutLoading ? 'not-allowed' : 'pointer',
                }}
              >
                {checkoutLoading ? 'Redirecting...' : 'Checkout'}
              </button>
            </div>
          )}
        </div>
      )}

      {panelMounted && (
        <div
          aria-hidden
          onClick={closePanel}
          style={{
            position: 'fixed',
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.3)',
            zIndex: 1099,
            opacity: panelEnter ? 1 : 0,
            transition: `opacity ${DRAWER_MS}ms ease-out`,
          }}
        />
      )}

      <CheckoutFulfillmentModal
        open={fulfillmentModalOpen}
        checkoutLoading={checkoutLoading}
        checkoutError={checkoutError}
        orderType={orderType}
        onClose={() => setFulfillmentModalOpen(false)}
        onContinue={continueToPayment}
      />
    </>
  );
}

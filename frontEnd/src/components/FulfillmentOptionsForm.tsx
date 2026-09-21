import { useCallback, useMemo } from 'react';
import { CarOutlined, EnvironmentOutlined } from '@ant-design/icons';
import { useOrderMode, type OrderType } from '../context/OrderModeContext';
import { DELIVERY_SUBURBS, normalizeSuburbKey, suburbToKey } from '../constants/deliveryZones';
import { useStorePublicSettings } from '../context/StorePublicSettingsContext';
import { DeliveryOptions, type DeliveryZone } from './fulfillment/DeliveryOptions';
import { PickupOptions } from './fulfillment/PickupOptions';

export { DELIVERY_SUBURBS } from '../constants/deliveryZones';

const PICKUP_ADDRESS = 'Beverly Hills IGA';
const MAP_LINK = 'https://www.google.com/maps/search/Beverly+Hills+IGA+Beverly+Hills+NSW';

export type FulfillmentOptionsVariant = 'sidebar' | 'checkoutModal';

export interface FulfillmentOptionsFormProps {
  variant: FulfillmentOptionsVariant;
  /** When false, slot lists stay empty (parent drawer closed or modal hidden). */
  active: boolean;
  onSidebarClose?: () => void;
}

export function FulfillmentOptionsForm({ variant, active, onSidebarClose }: FulfillmentOptionsFormProps) {
  const { orderType, setOrderType, deliveryInfo } = useOrderMode();
  const { settings: storeSettings } = useStorePublicSettings();

  const deliveryZones = useMemo<DeliveryZone[]>(() => {
    if (!storeSettings?.deliveryZones?.length) {
      return DELIVERY_SUBURBS.map((displayName) => ({ suburbKey: suburbToKey(displayName), displayName }));
    }
    return storeSettings.deliveryZones
      .filter((zone) => zone.enabled)
      .map((zone) => ({ suburbKey: zone.suburbKey, displayName: zone.displayName }));
  }, [storeSettings]);

  const isInDeliveryZone = useCallback((suburb: string): boolean => {
    const key = normalizeSuburbKey(suburb);
    return !!key && deliveryZones.some((zone) => normalizeSuburbKey(zone.suburbKey) === key);
  }, [deliveryZones]);

  const showSidebarActions = variant === 'sidebar' && typeof onSidebarClose === 'function';
  const handleOrderTypeChange = (nextOrderType: OrderType) => setOrderType(nextOrderType);

  return (
    <>
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.5rem' }}>
          {orderType === 'Pickup' ? (
            <EnvironmentOutlined style={{ fontSize: '1rem', color: '#dc2626', marginTop: 2 }} />
          ) : (
            <CarOutlined style={{ fontSize: '1rem', color: '#dc2626', marginTop: 2 }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: '0.75rem', color: '#6b7280' }}>
              {orderType === 'Pickup' ? 'Pickup from:' : 'Delivery to:'}
            </p>
            <p style={{ margin: '0.25rem 0 0 0', fontWeight: 600, fontSize: '1rem', color: '#0a0a0a' }}>
              {orderType === 'Pickup'
                ? PICKUP_ADDRESS
                : deliveryInfo.suburb
                  ? `${deliveryInfo.address}, ${deliveryInfo.suburb}`
                  : 'Please enter delivery address'}
            </p>
          </div>
          {orderType === 'Pickup' && (
            <a
              href={MAP_LINK}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: '0.35rem 0.75rem',
                border: '2px solid #dc2626',
                borderRadius: 6,
                color: '#dc2626',
                fontSize: '0.8rem',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              View Map
            </a>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', marginBottom: '1rem' }}>
        <button
          type="button"
          onClick={() => handleOrderTypeChange('Pickup')}
          style={{
            flex: 1,
            padding: '0.75rem 1rem',
            border: 'none',
            borderBottom: orderType === 'Pickup' ? '2px solid #dc2626' : '2px solid transparent',
            background: 'none',
            cursor: 'pointer',
            fontSize: '0.9rem',
            fontWeight: orderType === 'Pickup' ? 600 : 400,
            color: orderType === 'Pickup' ? '#dc2626' : '#6b7280',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.35rem',
          }}
        >
          <EnvironmentOutlined /> Pickup
        </button>
        <button
          type="button"
          onClick={() => handleOrderTypeChange('Delivery')}
          style={{
            flex: 1,
            padding: '0.75rem 1rem',
            border: 'none',
            borderBottom: orderType === 'Delivery' ? '2px solid #dc2626' : '2px solid transparent',
            background: 'none',
            cursor: 'pointer',
            fontSize: '0.9rem',
            fontWeight: orderType === 'Delivery' ? 600 : 400,
            color: orderType === 'Delivery' ? '#dc2626' : '#6b7280',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.35rem',
          }}
        >
          <CarOutlined /> Delivery
        </button>
      </div>

      <PickupOptions
        active={active}
        visible={orderType === 'Pickup'}
        showSidebarActions={showSidebarActions}
        onSidebarClose={onSidebarClose}
      />
      <DeliveryOptions
        active={active}
        visible={orderType === 'Delivery'}
        deliveryZones={deliveryZones}
        isInDeliveryZone={isInDeliveryZone}
        showSidebarActions={showSidebarActions}
        onSidebarClose={onSidebarClose}
      />
    </>
  );
}

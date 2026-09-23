import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOrderMode } from '../../context/OrderModeContext';
import { generateAllPickupSlots, generatePickupDayCards } from './pickupSlots';

interface PickupOptionsProps {
  active: boolean;
  visible: boolean;
  showSidebarActions: boolean;
  onSidebarClose?: () => void;
}

export function PickupOptions({ active, visible, showSidebarActions, onSidebarClose }: PickupOptionsProps) {
  const { pickupTimeSlot, setPickupTimeSlot } = useOrderMode();
  const [selectedDayKey, setSelectedDayKey] = useState('');
  const dayCards = useMemo(() => active ? generatePickupDayCards(new Date()) : [], [active]);
  const allPickupSlots = useMemo(() => active ? generateAllPickupSlots(new Date()) : [], [active]);

  useEffect(() => {
    if (!active || allPickupSlots.length === 0) return;
    if (pickupTimeSlot && !allPickupSlots.some((slot) => slot.value === pickupTimeSlot)) {
      setPickupTimeSlot('');
    }
  }, [active, allPickupSlots, pickupTimeSlot, setPickupTimeSlot]);

  const pickupDayKey = useMemo(() => {
    const savedSlotDay = allPickupSlots.find((slot) => slot.value === pickupTimeSlot)?.dayKey;
    if (savedSlotDay) return savedSlotDay;
    return dayCards.some((day) => day.key === selectedDayKey) ? selectedDayKey : '';
  }, [allPickupSlots, dayCards, pickupTimeSlot, selectedDayKey]);

  const handlePickupDayChange = useCallback((key: string) => {
    setSelectedDayKey(key);
    if (pickupTimeSlot && !allPickupSlots.some((slot) => slot.value === pickupTimeSlot && slot.dayKey === key)) {
      setPickupTimeSlot('');
    }
  }, [allPickupSlots, pickupTimeSlot, setPickupTimeSlot]);

  const slotsForSelectedDay = useMemo(
    () => allPickupSlots.filter((slot) => slot.dayKey === pickupDayKey),
    [allPickupSlots, pickupDayKey]
  );

  return (
    <div style={{ display: visible ? 'block' : 'none' }}>
      <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', fontWeight: 600, color: '#0a0a0a' }}>
        Select pickup time slot
      </p>
      {dayCards.length === 0 || allPickupSlots.length === 0 ? (
        <p style={{ margin: 0, padding: '12px 0', fontSize: 14, color: '#64748b' }}>
          No pickup slots in the current window. Please try again later.
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: pickupDayKey ? 12 : 0, flexWrap: 'wrap' }}>
            {dayCards.map((day) => {
              const selected = pickupDayKey === day.key;
              return (
                <button
                  key={day.key}
                  type="button"
                  onClick={() => handlePickupDayChange(day.key)}
                  style={{
                    flex: 1,
                    minWidth: 120,
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: selected ? '2px solid #dc2626' : '1px solid #e5e7eb',
                    background: 'white',
                    color: selected ? '#dc2626' : '#0a0a0a',
                    fontWeight: selected ? 600 : 500,
                    fontSize: 14,
                    cursor: 'pointer',
                    lineHeight: 1.25,
                  }}
                >
                  {day.dayTop} {day.dayBottom}
                </button>
              );
            })}
          </div>
          {pickupDayKey ? (
            <>
              <label style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280', marginBottom: 6 }}>Time</label>
              <select
                value={pickupTimeSlot}
                onChange={(event) => setPickupTimeSlot(event.target.value)}
                aria-label="Pickup time slot"
                style={{
                  width: '100%',
                  marginBottom: '0.75rem',
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: '1px solid #e5e7eb',
                  background: 'white',
                  fontSize: 15,
                  fontWeight: 500,
                  color: '#0a0a0a',
                  cursor: 'pointer',
                  boxSizing: 'border-box',
                }}
              >
                <option value="">Choose a time…</option>
                {slotsForSelectedDay.map((slot) => (
                  <option key={slot.value} value={slot.value}>{slot.displayTime}</option>
                ))}
              </select>
            </>
          ) : null}
        </>
      )}
      {showSidebarActions && (
        <button
          type="button"
          disabled={!pickupTimeSlot}
          onClick={() => pickupTimeSlot && onSidebarClose?.()}
          style={{
            marginTop: '0.75rem',
            width: '100%',
            padding: '0.5rem 1rem',
            backgroundColor: pickupTimeSlot ? '#dc2626' : '#e5e7eb',
            color: pickupTimeSlot ? 'white' : '#9ca3af',
            border: 'none',
            borderRadius: 6,
            fontSize: '0.875rem',
            fontWeight: 600,
            cursor: pickupTimeSlot ? 'pointer' : 'not-allowed',
          }}
        >
          Confirm
        </button>
      )}
    </div>
  );
}

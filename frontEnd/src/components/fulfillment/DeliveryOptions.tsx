import { useCallback, useEffect, useRef, useState } from 'react';
import { EnvironmentOutlined } from '@ant-design/icons';
import { API_BASE } from '../../config/apiEnv';
import { useOrderMode } from '../../context/OrderModeContext';

export interface DeliveryZone {
  suburbKey: string;
  displayName: string;
}

interface AddressSuggestion {
  id: string;
  placeName: string;
  streetAddress: string;
  suburb: string;
  postcode: string;
  state: string;
}

interface DeliveryOptionsProps {
  active: boolean;
  visible: boolean;
  deliveryZones: DeliveryZone[];
  isInDeliveryZone: (suburb: string) => boolean;
  showSidebarActions: boolean;
  onSidebarClose?: () => void;
}

async function fetchAddressSuggestions(query?: string): Promise<{ configured: boolean; suggestions: AddressSuggestion[] }> {
  const trimmedQuery = query?.trim() ?? '';
  const queryString = trimmedQuery.length >= 3 ? `?query=${encodeURIComponent(trimmedQuery)}` : '';
  const response = await fetch(`${API_BASE}/address/suggest${queryString}`);
  if (!response.ok) {
    let extra = '';
    try {
      const body = (await response.json()) as { error?: string };
      if (body?.error) extra = `: ${body.error}`;
    } catch {
      // Ignore non-JSON error bodies.
    }
    throw new Error(String(response.status) + extra);
  }
  const body = (await response.json()) as { configured?: boolean; suggestions?: AddressSuggestion[] };
  return {
    configured: !!body.configured,
    suggestions: Array.isArray(body.suggestions) ? body.suggestions : [],
  };
}

export function DeliveryOptions({
  active,
  visible,
  deliveryZones,
  isInDeliveryZone,
  showSidebarActions,
  onSidebarClose,
}: DeliveryOptionsProps) {
  const { deliveryInfo, setDeliveryInfo, saveDeliveryAddress } = useOrderMode();
  const [addressError, setAddressError] = useState('');
  const [addressInputDirty, setAddressInputDirty] = useState(false);
  const [backendConfigured, setBackendConfigured] = useState<boolean | null>(null);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [highlightedSuggestion, setHighlightedSuggestion] = useState(-1);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const suggestionsWrapRef = useRef<HTMLDivElement | null>(null);
  const deliveryZoneNames = deliveryZones.map((zone) => zone.displayName);

  useEffect(() => {
    if (!active) setBackendConfigured(null);
  }, [active]);

  useEffect(() => {
    if (!active || !visible) return;
    let cancelled = false;
    void fetchAddressSuggestions()
      .then(({ configured }) => {
        if (!cancelled) setBackendConfigured(configured);
      })
      .catch(() => {
        if (!cancelled) setBackendConfigured(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active, visible]);

  useEffect(() => {
    if (!active || !visible || backendConfigured !== true) return;
    const query = (deliveryInfo.address ?? '').trim();
    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      if (query.length < 3) {
        if (!cancelled) {
          setSuggestions([]);
          setSuggestionsOpen(false);
          setHighlightedSuggestion(-1);
          setSuggestionsLoading(false);
        }
        return;
      }
      setSuggestionsLoading(true);
      setAddressError('');
      try {
        const result = await fetchAddressSuggestions(query);
        if (!cancelled) {
          setSuggestions(result.suggestions);
          setHighlightedSuggestion(-1);
          setSuggestionsOpen(result.suggestions.length > 0);
        }
      } catch (error) {
        if (!cancelled) {
          const hint = error instanceof Error && error.message ? ` (${error.message})` : '';
          setAddressError(`Address search failed${hint}. Try again or use manual entry below.`);
          setSuggestions([]);
          setSuggestionsOpen(false);
          setHighlightedSuggestion(-1);
        }
      } finally {
        if (!cancelled) setSuggestionsLoading(false);
      }
    }, 320);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [active, visible, backendConfigured, deliveryInfo.address]);

  useEffect(() => {
    if (!suggestionsOpen) return;
    const closeSuggestions = (event: MouseEvent) => {
      const wrapper = suggestionsWrapRef.current;
      if (wrapper && !wrapper.contains(event.target as Node)) {
        setSuggestionsOpen(false);
        setHighlightedSuggestion(-1);
      }
    };
    document.addEventListener('mousedown', closeSuggestions);
    return () => document.removeEventListener('mousedown', closeSuggestions);
  }, [suggestionsOpen]);

  const applySuggestion = useCallback((suggestion: AddressSuggestion) => {
    const suburb = suggestion.suburb.trim();
    const address = suggestion.streetAddress.trim();
    const postcode = suggestion.postcode.trim();
    setAddressInputDirty(false);
    setSuggestionsOpen(false);
    setHighlightedSuggestion(-1);
    setSuggestions([]);
    setDeliveryInfo((previous) => ({ ...previous, address, suburb, postcode }));
    if (isInDeliveryZone(suburb)) {
      setAddressError('');
    } else {
      setAddressError(
        suburb
          ? `This address (${suburb}) is outside our delivery zone. We only deliver to: ${deliveryZoneNames.join(', ')}.`
          : 'Unable to verify delivery zone for this address. Please confirm it is within our delivery area'
      );
    }
  }, [deliveryZoneNames, isInDeliveryZone, setDeliveryInfo]);

  return (
    <div style={{ display: visible ? 'flex' : 'none', flexDirection: 'column', gap: '0.75rem' }}>
      <input
        type="text"
        placeholder="Contact name"
        value={deliveryInfo.contactName ?? ''}
        onChange={(event) => setDeliveryInfo({ ...deliveryInfo, contactName: event.target.value })}
        style={{
          padding: '0.5rem 0.75rem',
          border: '1px solid #d1d5db',
          borderRadius: 6,
          fontSize: '0.875rem',
          outline: 'none',
        }}
      />
      <input
        type="tel"
        placeholder="Contact phone"
        value={deliveryInfo.contactPhone ?? ''}
        onChange={(event) => setDeliveryInfo({ ...deliveryInfo, contactPhone: event.target.value })}
        style={{
          padding: '0.5rem 0.75rem',
          border: '1px solid #d1d5db',
          borderRadius: 6,
          fontSize: '0.875rem',
          outline: 'none',
        }}
      />

      {backendConfigured === null ? (
        <p style={{ margin: 0, fontSize: '0.8rem', color: '#6b7280' }}>Loading address search…</p>
      ) : backendConfigured ? (
        <>
          <form onSubmit={(event) => event.preventDefault()} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div
              ref={suggestionsWrapRef}
              style={{
                position: 'relative',
                width: '100%',
                border: '1px solid #d1d5db',
                borderRadius: 6,
                background: 'white',
              }}
            >
              <EnvironmentOutlined
                aria-hidden
                style={{
                  position: 'absolute',
                  left: 10,
                  top: 12,
                  color: '#9ca3af',
                  fontSize: '1rem',
                  pointerEvents: 'none',
                  zIndex: 1,
                }}
              />
              <input
                name="address"
                type="text"
                autoComplete="off"
                placeholder="Street address (type 3+ characters)…"
                data-lpignore="true"
                value={deliveryInfo.address ?? ''}
                onChange={(event) => {
                  setAddressInputDirty(true);
                  setAddressError('');
                  setHighlightedSuggestion(-1);
                  setDeliveryInfo({ ...deliveryInfo, address: event.target.value });
                }}
                onFocus={() => {
                  if (suggestions.length > 0) setSuggestionsOpen(true);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    setSuggestionsOpen(false);
                    setHighlightedSuggestion(-1);
                    return;
                  }
                  if (suggestions.length === 0) return;
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    setSuggestionsOpen(true);
                    setHighlightedSuggestion((index) => (index + 1) % suggestions.length);
                    return;
                  }
                  if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    setSuggestionsOpen(true);
                    setHighlightedSuggestion((index) => index <= 0 ? suggestions.length - 1 : index - 1);
                    return;
                  }
                  if (event.key === 'Enter' && suggestionsOpen) {
                    const index = highlightedSuggestion >= 0 ? highlightedSuggestion : 0;
                    const suggestion = suggestions[index];
                    if (suggestion) {
                      event.preventDefault();
                      applySuggestion(suggestion);
                    }
                  }
                }}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '0.5rem 0.75rem 0.5rem 2rem',
                  border: 'none',
                  fontSize: '0.875rem',
                  outline: 'none',
                  background: 'transparent',
                }}
              />
              {suggestionsLoading ? (
                <p style={{ margin: 0, padding: '4px 10px 8px', fontSize: '0.72rem', color: '#9ca3af' }}>Searching…</p>
              ) : null}
              {suggestionsOpen && suggestions.length > 0 ? (
                <ul
                  role="listbox"
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: '100%',
                    margin: '4px 0 0 0',
                    padding: 4,
                    listStyle: 'none',
                    background: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                    maxHeight: 220,
                    overflowY: 'auto',
                    zIndex: 1200,
                  }}
                >
                  {suggestions.map((suggestion, index) => (
                    <li key={suggestion.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={highlightedSuggestion === index}
                        onPointerDown={(event) => {
                          event.preventDefault();
                          applySuggestion(suggestion);
                        }}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: '8px 10px',
                          border: 'none',
                          borderRadius: 6,
                          background: highlightedSuggestion === index ? '#f3f4f6' : 'transparent',
                          cursor: 'pointer',
                          fontSize: '0.8rem',
                          lineHeight: 1.35,
                          color: '#0a0a0a',
                        }}
                      >
                        {suggestion.placeName || `${suggestion.streetAddress}, ${suggestion.suburb} ${suggestion.postcode}`.trim()}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <input
              name="suburb"
              type="text"
              autoComplete="address-level2"
              placeholder="Suburb"
              value={deliveryInfo.suburb ?? ''}
              readOnly
              style={{
                padding: '0.5rem 0.75rem',
                border: '1px solid #e5e7eb',
                borderRadius: 6,
                fontSize: '0.875rem',
                background: '#f9fafb',
                color: '#6b7280',
              }}
            />
            <input
              name="postcode"
              type="text"
              autoComplete="postal-code"
              placeholder="Postcode"
              value={deliveryInfo.postcode ?? ''}
              readOnly
              style={{
                padding: '0.5rem 0.75rem',
                border: '1px solid #e5e7eb',
                borderRadius: 6,
                fontSize: '0.875rem',
                background: '#f9fafb',
                color: '#6b7280',
              }}
            />
          </form>
          {addressError && <p style={{ margin: 0, fontSize: '0.8rem', color: '#dc2626' }}>{addressError}</p>}
          {!addressError && !addressInputDirty && deliveryInfo.suburb && (
            <p style={{ margin: 0, fontSize: '0.8rem', color: '#16a34a' }}>
              ✓ Within delivery zone ({deliveryInfo.suburb})
            </p>
          )}
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <p
            style={{
              margin: 0,
              fontSize: '0.8rem',
              color: '#92400e',
              background: '#fffbeb',
              padding: '8px 10px',
              borderRadius: 6,
              lineHeight: 1.4,
            }}
          >
            Address search is off until the server has a Mapbox token. Set <strong>Mapbox:AccessToken</strong> in backend
            settings or environment variable <strong>MAPBOX_ACCESS_TOKEN</strong>, then redeploy. You can still enter your
            street and suburb below.
          </p>
          <input
            type="text"
            placeholder="Street address"
            value={deliveryInfo.address ?? ''}
            onChange={(event) => {
              setAddressInputDirty(true);
              setAddressError('');
              setDeliveryInfo({ ...deliveryInfo, address: event.target.value });
            }}
            style={{
              padding: '0.5rem 0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              fontSize: '0.875rem',
              outline: 'none',
            }}
          />
          <label style={{ fontSize: '0.75rem', color: '#6b7280', display: 'flex', flexDirection: 'column', gap: 4 }}>
            Suburb (delivery area)
            <select
              value={deliveryInfo.suburb ?? ''}
              onChange={(event) => {
                const suburb = event.target.value;
                setAddressInputDirty(false);
                setDeliveryInfo({ ...deliveryInfo, suburb });
                if (!suburb || isInDeliveryZone(suburb)) setAddressError('');
                else setAddressError(`Please choose one of: ${deliveryZoneNames.join(', ')}.`);
              }}
              style={{
                padding: '0.5rem 0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: 6,
                fontSize: '0.875rem',
                background: 'white',
              }}
            >
              <option value="">Select suburb…</option>
              {deliveryZoneNames.map((suburb) => <option key={suburb} value={suburb}>{suburb}</option>)}
            </select>
          </label>
          <input
            type="text"
            inputMode="numeric"
            placeholder="Postcode"
            value={deliveryInfo.postcode ?? ''}
            onChange={(event) => setDeliveryInfo({ ...deliveryInfo, postcode: event.target.value })}
            style={{
              padding: '0.5rem 0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              fontSize: '0.875rem',
              outline: 'none',
            }}
          />
          {addressError ? <p style={{ margin: 0, fontSize: '0.8rem', color: '#dc2626' }}>{addressError}</p> : null}
          {!addressError && deliveryInfo.suburb && isInDeliveryZone(deliveryInfo.suburb) ? (
            <p style={{ margin: 0, fontSize: '0.8rem', color: '#16a34a' }}>✓ Delivery area: {deliveryInfo.suburb}</p>
          ) : null}
        </div>
      )}
      <input
        type="text"
        placeholder="Unit number (optional)"
        value={deliveryInfo.unitNumber ?? ''}
        onChange={(event) => setDeliveryInfo({ ...deliveryInfo, unitNumber: event.target.value })}
        style={{
          padding: '0.5rem 0.75rem',
          border: '1px solid #d1d5db',
          borderRadius: 6,
          fontSize: '0.875rem',
          outline: 'none',
        }}
      />
      {showSidebarActions && (
        <button
          type="button"
          onClick={() => {
            saveDeliveryAddress();
            onSidebarClose?.();
          }}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#dc2626',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            fontSize: '0.875rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Save address
        </button>
      )}
    </div>
  );
}

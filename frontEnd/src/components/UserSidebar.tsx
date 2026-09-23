import { useState } from 'react';
import { useRightDrawer, DRAWER_MS } from '../hooks/useRightDrawer';
import { useAuth } from '../context/AuthContext';
import { AuthForms } from './AuthForms';
import { OrderHistory } from './OrderHistory';
import userIcon from '../assets/images/user.png';

export function UserSidebar({ compact = false }: { compact?: boolean }) {
  const iconPx = compact ? 24 : 32;
  const { user, setUser, isLoggedIn } = useAuth();
  const {
    panelMounted,
    panelEnter,
    closePanel,
    onPanelTransitionEnd,
    toggleFromTrigger,
  } = useRightDrawer();
  const [tab, setTab] = useState<'login' | 'register'>('login');

  return (
    <>
      <button
        type="button"
        onClick={toggleFromTrigger}
        style={{
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
        <img src={userIcon} alt="user" style={{ width: iconPx, height: iconPx, objectFit: 'contain' }} />
      </button>

      {panelMounted && (
        <div
          onTransitionEnd={onPanelTransitionEnd}
          style={{
            position: 'fixed',
            right: 0,
            top: 0,
            width: 'min(380px, 100vw)',
            maxWidth: '100%',
            height: '100dvh',
            backgroundColor: 'white',
            boxShadow: '-2px 0 12px rgba(0,0,0,0.15)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            transform: panelEnter ? 'translate3d(0,0,0)' : 'translate3d(100%,0,0)',
            transition: `transform ${DRAWER_MS}ms ease-out`,
            willChange: 'transform',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              padding: '1rem',
              borderBottom: '1px solid #e5e7eb',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, minWidth: 0, flex: 1 }}>
              {isLoggedIn && user ? (
                <>
                  <h2
                    style={{
                      fontSize: '1.25rem',
                      fontWeight: 'bold',
                      margin: 0,
                      lineHeight: 1.2,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: '100%',
                    }}
                    title={user.name?.trim() || user.email}
                  >
                    {user.name?.trim() || user.email}
                  </h2>
                  {user.name?.trim() ? (
                    <span style={{ fontSize: '0.75rem', color: '#6b7280', wordBreak: 'break-all', lineHeight: 1.25 }}>
                      {user.email}
                    </span>
                  ) : null}
                </>
              ) : (
                <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: 0 }}>Account</h2>
              )}
            </div>
            <button
              type="button"
              onClick={closePanel}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                fontSize: '1.5rem',
                cursor: 'pointer',
                padding: '0.25rem',
              }}
            >
              ✕
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
            {isLoggedIn && user ? (
              <OrderHistory user={user} onClose={closePanel} />
            ) : (
              <AuthForms tab={tab} setTab={setTab} onSuccess={(u) => { setUser(u); closePanel(); }} />
            )}
          </div>
        </div>
      )}

      {panelMounted && (
        <div
          aria-hidden
          onClick={closePanel}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.3)',
            zIndex: 999,
            opacity: panelEnter ? 1 : 0,
            transition: `opacity ${DRAWER_MS}ms ease-out`,
          }}
        />
      )}
    </>
  );
}

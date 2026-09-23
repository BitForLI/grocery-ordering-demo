import { useState, type FormEvent } from 'react';
import { EyeInvisibleOutlined, EyeOutlined } from '@ant-design/icons';
import { authAPI } from '../api';
import { PasswordResetForm } from './PasswordResetForm';

export function AuthForms({
  tab,
  setTab,
  onSuccess,
}: {
  tab: 'login' | 'register';
  setTab: (t: 'login' | 'register') => void;
  onSuccess: (user: { id: number; name: string; email: string; phoneNumber: string; role?: string; token: string; expiresAtUtc: string }) => void;
}) {
  const [loginData, setLoginData] = useState({ Email: '', Password: '' });
  const [registerData, setRegisterData] = useState({
    Name: '',
    Email: '',
    Password: '',
  });
  const [registerStep, setRegisterStep] = useState<'form' | 'verify'>('form');
  const [verifyCode, setVerifyCode] = useState('');
  const [adminMfaEmail, setAdminMfaEmail] = useState('');
  const [adminMfaCode, setAdminMfaCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [passwordResetOpen, setPasswordResetOpen] = useState(false);
  const [authSuccessMessage, setAuthSuccessMessage] = useState('');

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setAuthSuccessMessage('');
    setLoading(true);
    try {
      const res = await authAPI.login({
        email: loginData.Email,
        password: loginData.Password,
      });
      if ('mfaRequired' in res) {
        setAdminMfaEmail(res.email);
        setAdminMfaCode('');
        setAuthSuccessMessage(res.message);
        return;
      }
      onSuccess({
        token: res.token,
        expiresAtUtc: res.expiresAtUtc,
        id: res.id,
        name: res.name,
        email: res.email,
        phoneNumber: res.phoneNumber || '',
        role: res.role || 'Customer',
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleAdminMfa = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await authAPI.verifyAdminLogin({
        email: adminMfaEmail,
        code: adminMfaCode.replace(/\D/g, '').slice(0, 6),
      });
      onSuccess({
        token: res.token,
        expiresAtUtc: res.expiresAtUtc,
        id: res.id,
        name: res.name,
        email: res.email,
        phoneNumber: res.phoneNumber || '',
        role: res.role || 'Admin',
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authAPI.register({
        name: registerData.Name,
        email: registerData.Email,
        password: registerData.Password,
      });
      setRegisterStep('verify');
      setVerifyCode('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyEmail = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const codeDigits = verifyCode.replace(/\D/g, '').slice(0, 6);
    try {
      await authAPI.verifyEmail({ email: registerData.Email, code: codeDigits });
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
      return;
    }
    try {
      const res = (await authAPI.login({
        email: registerData.Email,
        password: registerData.Password,
      }));
      if ('mfaRequired' in res) throw new Error('Unexpected administrator verification challenge.');
      onSuccess({
        token: res.token,
        expiresAtUtc: res.expiresAtUtc,
        id: res.id,
        name: res.name,
        email: res.email,
        phoneNumber: res.phoneNumber || '',
        role: res.role || 'Customer',
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setError('');
    setLoading(true);
    try {
      await authAPI.resendVerification({ email: registerData.Email });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {authSuccessMessage && (
        <div
          style={{
            backgroundColor: '#dcfce7',
            color: '#166534',
            padding: '0.75rem',
            borderRadius: '6px',
            marginBottom: '1rem',
            fontSize: '0.875rem',
          }}
        >
          {authSuccessMessage}
        </div>
      )}

      {!passwordResetOpen && (
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <button
          type="button"
          onClick={() => { setTab('login'); setError(''); setRegisterStep('form'); setAdminMfaEmail(''); setPasswordResetOpen(false); }}
          style={{
            flex: 1,
            padding: '0.5rem 1rem',
            border: 'none',
            borderRadius: '6px',
            backgroundColor: tab === 'login' ? '#dc2626' : '#f3f4f6',
            color: tab === 'login' ? 'white' : '#374151',
            fontWeight: 'bold',
            cursor: 'pointer',
          }}
        >
          Sign In
        </button>
        <button
          type="button"
          onClick={() => { setTab('register'); setError(''); setRegisterStep('form'); setAdminMfaEmail(''); setPasswordResetOpen(false); }}
          style={{
            flex: 1,
            padding: '0.5rem 1rem',
            border: 'none',
            borderRadius: '6px',
            backgroundColor: tab === 'register' ? '#dc2626' : '#f3f4f6',
            color: tab === 'register' ? 'white' : '#374151',
            fontWeight: 'bold',
            cursor: 'pointer',
          }}
        >
          Register
        </button>
      </div>
      )}

      {passwordResetOpen ? (
        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '1rem' }}>Change password</h3>
          <PasswordResetForm
            initialEmail={tab === 'login' ? loginData.Email : registerData.Email}
            onBack={() => { setPasswordResetOpen(false); setError(''); }}
            onSuccess={() => {
              setPasswordResetOpen(false);
              setAuthSuccessMessage('Your password has been updated. Please sign in with your new password.');
              setTab('login');
              setRegisterStep('form');
            }}
          />
        </div>
      ) : (
        <>
      {error && (
        <div
          style={{
            backgroundColor: '#fee2e2',
            color: '#dc2626',
            padding: '0.75rem',
            borderRadius: '6px',
            marginBottom: '1rem',
            fontSize: '0.875rem',
          }}
        >
          {error}
        </div>
      )}

      {tab === 'login' && adminMfaEmail ? (
        <form onSubmit={handleAdminMfa} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p style={{ fontSize: '0.875rem', color: '#4b5563' }}>
            Enter the 6-digit administrator code sent to <strong>{adminMfaEmail}</strong>.
          </p>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={adminMfaCode}
            onChange={(e) => setAdminMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            required
            style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: 6, letterSpacing: '0.2em', textAlign: 'center' }}
          />
          <button
            type="submit"
            disabled={loading || adminMfaCode.length !== 6}
            style={{ backgroundColor: loading || adminMfaCode.length !== 6 ? '#9ca3af' : '#dc2626', color: 'white', padding: '0.75rem', borderRadius: 6, border: 'none', fontWeight: 'bold' }}
          >
            {loading ? 'Verifying...' : 'Verify administrator sign-in'}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => { setAdminMfaEmail(''); setAdminMfaCode(''); setAuthSuccessMessage(''); setError(''); }}
            style={{ border: 'none', background: 'none', color: '#6b7280', cursor: 'pointer' }}
          >
            Back to sign in
          </button>
        </form>
      ) : tab === 'login' ? (
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.875rem', fontWeight: 500 }}>Email</label>
            <input
              type="email"
              value={loginData.Email}
              onChange={(e) => setLoginData({ ...loginData, Email: e.target.value })}
              required
              style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.875rem', fontWeight: 500 }}>Password</label>
            <div style={{ position: 'relative', width: '100%' }}>
              <input
                type={showLoginPassword ? 'text' : 'password'}
                value={loginData.Password}
                onChange={(e) => setLoginData({ ...loginData, Password: e.target.value })}
                required
                autoComplete="current-password"
                style={{
                  width: '100%',
                  padding: '0.5rem 2.25rem 0.5rem 0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  boxSizing: 'border-box',
                }}
              />
              <button
                type="button"
                tabIndex={-1}
                aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowLoginPassword((v) => !v)}
                style={{
                  position: 'absolute',
                  right: 4,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  padding: '0.35rem',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: '#6b7280',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {showLoginPassword ? (
                  <EyeInvisibleOutlined style={{ fontSize: 18 }} />
                ) : (
                  <EyeOutlined style={{ fontSize: 18 }} />
                )}
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            style={{
              backgroundColor: loading ? '#9ca3af' : '#dc2626',
              color: 'white',
              padding: '0.75rem',
              borderRadius: '6px',
              border: 'none',
              fontWeight: 'bold',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
          <button
            type="button"
            onClick={() => {
              setAuthSuccessMessage('');
              setPasswordResetOpen(true);
              setError('');
            }}
            style={{
              alignSelf: 'flex-start',
              border: 'none',
              background: 'none',
              color: '#6b7280',
              cursor: 'pointer',
              fontSize: '0.8125rem',
              textDecoration: 'underline',
              padding: 0,
            }}
          >
            Change password
          </button>
        </form>
      ) : registerStep === 'verify' ? (
        <form onSubmit={handleVerifyEmail} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p style={{ fontSize: '0.875rem', color: '#4b5563' }}>
            Enter the 6-digit code sent to <strong>{registerData.Email}</strong>
          </p>
          <div>
            <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.875rem', fontWeight: 500 }}>Code</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required
              style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px', letterSpacing: '0.2em', textAlign: 'center' }}
            />
          </div>
          <button
            type="submit"
            disabled={loading || verifyCode.length !== 6}
            style={{
              backgroundColor: loading || verifyCode.length !== 6 ? '#9ca3af' : '#dc2626',
              color: 'white',
              padding: '0.75rem',
              borderRadius: '6px',
              border: 'none',
              fontWeight: 'bold',
              cursor: loading || verifyCode.length !== 6 ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Verifying...' : 'Verify & sign in'}
          </button>
          <button
            type="button"
            onClick={handleResendCode}
            disabled={loading}
            style={{
              padding: '0.5rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              background: 'white',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            Resend code
          </button>
          <button
            type="button"
            onClick={() => { setRegisterStep('form'); setError(''); }}
            style={{ border: 'none', background: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '0.875rem' }}
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => {
              setAuthSuccessMessage('');
              setPasswordResetOpen(true);
              setError('');
            }}
            style={{
              alignSelf: 'flex-start',
              border: 'none',
              background: 'none',
              color: '#6b7280',
              cursor: 'pointer',
              fontSize: '0.8125rem',
              textDecoration: 'underline',
              padding: 0,
            }}
          >
            Change password
          </button>
        </form>
      ) : (
        <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.875rem', fontWeight: 500 }}>Name</label>
            <input
              type="text"
              value={registerData.Name}
              onChange={(e) => setRegisterData({ ...registerData, Name: e.target.value })}
              required
              style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.875rem', fontWeight: 500 }}>Email</label>
            <input
              type="email"
              value={registerData.Email}
              onChange={(e) => setRegisterData({ ...registerData, Email: e.target.value })}
              required
              style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '6px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.875rem', fontWeight: 500 }}>Password</label>
            <div style={{ position: 'relative', width: '100%' }}>
              <input
                type={showRegisterPassword ? 'text' : 'password'}
                value={registerData.Password}
                onChange={(e) => setRegisterData({ ...registerData, Password: e.target.value })}
                required
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                style={{
                  width: '100%',
                  padding: '0.5rem 2.25rem 0.5rem 0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  boxSizing: 'border-box',
                }}
              />
              <button
                type="button"
                tabIndex={-1}
                aria-label={showRegisterPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowRegisterPassword((v) => !v)}
                style={{
                  position: 'absolute',
                  right: 4,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  padding: '0.35rem',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: '#6b7280',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {showRegisterPassword ? (
                  <EyeInvisibleOutlined style={{ fontSize: 18 }} />
                ) : (
                  <EyeOutlined style={{ fontSize: 18 }} />
                )}
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            style={{
              backgroundColor: loading ? '#9ca3af' : '#dc2626',
              color: 'white',
              padding: '0.75rem',
              borderRadius: '6px',
              border: 'none',
              fontWeight: 'bold',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Sending...' : 'Send verification code'}
          </button>
          <button
            type="button"
            onClick={() => {
              setAuthSuccessMessage('');
              setPasswordResetOpen(true);
              setError('');
            }}
            style={{
              alignSelf: 'flex-start',
              border: 'none',
              background: 'none',
              color: '#6b7280',
              cursor: 'pointer',
              fontSize: '0.8125rem',
              textDecoration: 'underline',
              padding: 0,
            }}
          >
            Change password
          </button>
        </form>
      )}
        </>
      )}
    </div>
  );
}

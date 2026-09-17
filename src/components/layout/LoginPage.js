import { useCallback, useEffect, useRef, useState } from 'react';
import './LoginPage.css';
import Icon from '../ui/Icon';

// Decorative washes only. Alternating neutral / accent, both far below
// the threshold where they read as colour.
const ORB_COLORS = [
  'var(--wash-neutral)', 'var(--wash-accent)', 'var(--wash-neutral)', 'var(--wash-accent)',
  'var(--wash-neutral)', 'var(--wash-accent)', 'var(--wash-neutral)', 'var(--wash-accent)',
];

export default function LoginPage({
  loginForm,
  loginError,
  authNotice,
  authLoading,
  onLoginChange,
  onSubmit,
  onOpenSignup,
  signUpModalOpen,
  onCloseSignup,
}) {
  const sceneRef = useRef(null);
  const mouse = useRef({ x: 0, y: 0 });
  const animRef = useRef(null);
  const orbsRef = useRef([]);
  const [typed, setTyped] = useState({ email: false, password: false });

  // ── Mouse parallax ──────────────────────────────────────────
  const handleMouseMove = useCallback((e) => {
    mouse.current = {
      x: (e.clientX / window.innerWidth - 0.5) * 2,
      y: (e.clientY / window.innerHeight - 0.5) * 2,
    };
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    const animate = () => {
      if (sceneRef.current) {
        orbsRef.current.forEach((orb, i) => {
          if (!orb) return;
          const depth = 0.02 + i * 0.015;
          const tx = mouse.current.x * 80 * depth;
          const ty = mouse.current.y * 60 * depth;
          orb.style.transform = `translate(${tx}px, ${ty}px)`;
        });
      }
      animRef.current = requestAnimationFrame(animate);
    };
    animate();
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animRef.current);
    };
  }, [handleMouseMove]);

  // ── Close modal on Escape ───────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && signUpModalOpen) onCloseSignup();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [signUpModalOpen, onCloseSignup]);

  // ── Signup submit – set intent then call onSubmit ───────────
  return (
    <>
      {/* ── Dark scene with parallax orbs ── */}
      <div className="lp-root" ref={sceneRef}>
        {[...Array(8)].map((_, i) => (
          <div
            key={i}
            className={`lp-orb lp-orb--${i}`}
            ref={(el) => (orbsRef.current[i] = el)}
            style={{ '--orb-color': ORB_COLORS[i] }}
          />
        ))}
        <div className="lp-grid" />

        {/* ── Login card ── */}
        <div className="lp-card">
          <div className="lp-card__glow" />

          <header className="lp-card__header">
            <p className="lp-card__eyebrow">DineFlow OS</p>
            <h1 className="lp-card__title">Welcome Back</h1>
            <p className="lp-card__sub">Sign in to your account to continue</p>
          </header>

          <form
            className="lp-form"
            onSubmit={(e) => onSubmit(e, 'login')}
          >
            <div className={`lp-field ${typed.email ? 'lp-field--filled' : ''}`}>
              <label className="lp-field__label" htmlFor="login-email">Email</label>
              <input
                id="login-email"
                className="lp-field__input"
                type="email"
                value={loginForm.email}
                autoComplete="email"
                placeholder="admin@gmail.com"
                onChange={(e) => {
                  onLoginChange('email', e.target.value);
                  setTyped((p) => ({ ...p, email: true }));
                }}
              />
            </div>

            <div className={`lp-field ${typed.password ? 'lp-field--filled' : ''}`}>
              <label className="lp-field__label" htmlFor="login-password">Password</label>
              <input
                id="login-password"
                className="lp-field__input"
                type="password"
                value={loginForm.password}
                autoComplete="current-password"
                placeholder="••••••••"
                onChange={(e) => {
                  onLoginChange('password', e.target.value);
                  setTyped((p) => ({ ...p, password: true }));
                }}
              />
            </div>

            {/* Only show errors for login attempts, not signup */}
            {loginError && loginForm.intent !== 'signup' && (
              <p className="lp-error">{loginError}</p>
            )}

            <button type="submit" className="lp-submit" disabled={authLoading}>
              {authLoading && loginForm.intent !== 'signup'
                ? <span className="lp-spinner" />
                : <>Sign in <Icon name="arrowRight" /></>}
            </button>

            <button type="button" className="lp-ghost" onClick={onOpenSignup}>
              New customer? Create account
            </button>
          </form>
        </div>
      </div>

      {/* ── Sign-Up Modal ── */}
      {signUpModalOpen && (
        <div
          className="lp-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="signup-title"
          onClick={(e) => { if (e.target === e.currentTarget) onCloseSignup(); }}
        >
          <div className="lp-modal">
            <header>
              <h2 id="signup-title">Create account</h2>
              <p>New customers can self-register. Staff accounts are created by the admin.</p>
            </header>

            <form className="lp-form" onSubmit={(e) => onSubmit(e, 'signup')}>
              {/* Full Name */}
              <label>
                Full Name <span className="lp-req">*</span>
                <input
                  type="text"
                  placeholder="e.g. Juan dela Cruz"
                  value={loginForm.name || ''}
                  autoComplete="name"
                  required
                  onChange={(e) => onLoginChange('name', e.target.value)}
                />
              </label>

              {/* Email */}
              <label>
                Email <span className="lp-req">*</span>
                <input
                  type="email"
                  placeholder="e.g. juan@email.com"
                  value={loginForm.email || ''}
                  autoComplete="email"
                  required
                  onChange={(e) => onLoginChange('email', e.target.value)}
                />
              </label>

              {/* Password */}
              <label>
                Password <span className="lp-req">*</span>
                <input
                  type="password"
                  placeholder="At least 6 characters"
                  value={loginForm.password}
                  autoComplete="new-password"
                  required
                  minLength={6}
                  onChange={(e) => onLoginChange('password', e.target.value)}
                />
              </label>

              {/* Show all errors inside the modal */}
              {loginError && <p className="lp-error">{loginError}</p>}
              {authNotice && <p className="lp-notice">{authNotice}</p>}

              <div className="lp-modal-footer">
                <button
                  type="button"
                  className="lp-ghost"
                  onClick={onCloseSignup}
                  disabled={authLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="lp-submit"
                  disabled={authLoading}
                >
                  {authLoading ? <span className="lp-spinner" /> : <>Register <Icon name="arrowRight" /></>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

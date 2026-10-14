'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext.js';

type Tab = 'signin' | 'signup' | 'recover';

export function AuthModal() {
  const { isAuthModalOpen, closeAuthModal, signIn, signUp, recoverPassword, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('signin');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const modalRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Reset form when modal opens
  useEffect(() => {
    if (isAuthModalOpen) {
      setErrorMsg(null);
      setSuccessMsg(null);
      setTimeout(() => firstInputRef.current?.focus(), 50);
    }
  }, [isAuthModalOpen, activeTab]);

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isAuthModalOpen) {
        closeAuthModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAuthModalOpen, closeAuthModal]);

  if (!isAuthModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (activeTab === 'signin') {
      const res = await signIn(email, password);
      if (!res.success) {
        setErrorMsg(res.error || 'Failed to sign in. Please verify your credentials.');
      }
    } else if (activeTab === 'signup') {
      const res = await signUp(email, password, displayName || undefined);
      if (!res.success) {
        setErrorMsg(res.error || 'Failed to create account.');
      } else {
        setSuccessMsg(res.message || 'Account created successfully.');
        if (!res.requiresVerification) {
          // If auto-confirmed in local mode, automatically sign in
          await signIn(email, password);
        }
      }
    } else if (activeTab === 'recover') {
      const res = await recoverPassword(email);
      if (!res.success) {
        setErrorMsg(res.error || 'Recovery request failed.');
      } else {
        setSuccessMsg(res.message || 'Recovery email sent.');
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={closeAuthModal}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl p-6 relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-100 dark:border-zinc-800">
          <h2
            id="auth-modal-title"
            className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50"
          >
            {activeTab === 'signin' && 'Sign In to Daynori'}
            {activeTab === 'signup' && 'Create Your Account'}
            {activeTab === 'recover' && 'Recover Password'}
          </h2>
          <button
            type="button"
            onClick={closeAuthModal}
            aria-label="Close authentication modal"
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-xl font-medium w-8 h-8 rounded-full flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
          >
            &times;
          </button>
        </div>

        {/* Tab switchers */}
        <div className="flex gap-2 my-4 border-b border-zinc-100 dark:border-zinc-800 pb-2">
          <button
            type="button"
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition ${
              activeTab === 'signin'
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            }`}
            onClick={() => {
              setActiveTab('signin');
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition ${
              activeTab === 'signup'
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            }`}
            onClick={() => {
              setActiveTab('signup');
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
          >
            Sign Up
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition ${
              activeTab === 'recover'
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            }`}
            onClick={() => {
              setActiveTab('recover');
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
          >
            Forgot Password
          </button>
        </div>

        {/* Alert banners */}
        {errorMsg && (
          <div
            role="alert"
            className="mb-4 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 rounded-lg text-sm"
          >
            {errorMsg}
          </div>
        )}
        {successMsg && (
          <div
            role="status"
            className="mb-4 p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 rounded-lg text-sm"
          >
            {successMsg}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="auth-email-input"
              className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-1"
            >
              Email Address
            </label>
            <input
              ref={firstInputRef}
              id="auth-email-input"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@domain.com"
              className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>

          {activeTab === 'signup' && (
            <div>
              <label
                htmlFor="auth-name-input"
                className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-1"
              >
                Display Name (Optional)
              </label>
              <input
                id="auth-name-input"
                type="text"
                autoComplete="name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Alex Morgan"
                className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
          )}

          {activeTab !== 'recover' && (
            <div>
              <label
                htmlFor="auth-password-input"
                className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-1"
              >
                Password
              </label>
              <input
                id="auth-password-input"
                type="password"
                autoComplete={activeTab === 'signin' ? 'current-password' : 'new-password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={activeTab === 'signup' ? 'At least 8 characters' : 'Enter password'}
                className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={isLoading}
              aria-busy={isLoading}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-sm shadow transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {isLoading ? (
                <span>Processing...</span>
              ) : activeTab === 'signin' ? (
                'Sign In'
              ) : activeTab === 'signup' ? (
                'Create Account'
              ) : (
                'Send Recovery Link'
              )}
            </button>
          </div>
        </form>

        <p className="mt-4 text-xs text-center text-zinc-500 dark:text-zinc-400">
          Daynori guarantees zero credential leakage. Refresh tokens are never stored in browser
          storage.
        </p>
      </div>
    </div>
  );
}

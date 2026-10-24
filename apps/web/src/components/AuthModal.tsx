'use client';

import React, { useEffect, useState } from 'react';
import { Button, Dialog, Feedback, TextField } from '@daynori/ui-web';
import { useAuth } from './AuthContext.js';
import { useShell } from './ShellContext.js';

type Tab = 'signin' | 'signup' | 'recover';

export function AuthModal() {
  const { isAuthModalOpen, closeAuthModal, signIn, signUp, recoverPassword, isLoading } = useAuth();
  const { themeMode } = useShell();
  const [activeTab, setActiveTab] = useState<Tab>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setPassword('');
  }, [isAuthModalOpen, activeTab]);

  const handleClose = () => {
    setPassword('');
    closeAuthModal();
  };

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
    <Dialog
      isOpen={isAuthModalOpen}
      onClose={handleClose}
      title={
        activeTab === 'signin'
          ? 'Sign In to Daynori'
          : activeTab === 'signup'
            ? 'Create Your Account'
            : 'Recover Password'
      }
      description="Sign in to synchronize your organizer across devices."
      themeMode={themeMode}
    >
      <div
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}
        aria-label="Account actions"
      >
        {(
          [
            { id: 'signin', label: 'Sign In' },
            { id: 'signup', label: 'Sign Up' },
            { id: 'recover', label: 'Forgot Password' },
          ] as const
        ).map((tab) => (
          <Button
            key={tab.id}
            type="button"
            variant={activeTab === tab.id ? 'primary' : 'secondary'}
            aria-pressed={activeTab === tab.id}
            themeMode={themeMode}
            onClick={() => setActiveTab(tab.id)}
            disabled={isLoading}
          >
            {tab.label}
          </Button>
        ))}
      </div>
      {errorMsg && <Feedback severity="danger" message={errorMsg} themeMode={themeMode} />}
      {successMsg && <Feedback severity="success" message={successMsg} themeMode={themeMode} />}
      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 16, marginTop: 16 }}>
        <TextField
          label="Email Address"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@domain.com"
          themeMode={themeMode}
          disabled={isLoading}
        />
        {activeTab === 'signup' && (
          <TextField
            label="Display Name (Optional)"
            autoComplete="name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            themeMode={themeMode}
            disabled={isLoading}
          />
        )}
        {activeTab !== 'recover' && (
          <TextField
            label="Password"
            type="password"
            required
            autoComplete={activeTab === 'signin' ? 'current-password' : 'new-password'}
            minLength={activeTab === 'signup' ? 8 : undefined}
            maxLength={128}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            themeMode={themeMode}
            disabled={isLoading}
          />
        )}
        <Button type="submit" loading={isLoading} themeMode={themeMode}>
          {activeTab === 'signin'
            ? 'Sign In'
            : activeTab === 'signup'
              ? 'Create Account'
              : 'Send Recovery Link'}
        </Button>
      </form>
    </Dialog>
  );
}

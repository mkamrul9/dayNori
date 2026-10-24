import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { colors, spacing, type ThemeMode } from '@daynori/design-tokens';
import { MobileButton, MobileModalSheet, MobileTextField } from '@daynori/ui-mobile';
import { defaultAuthAdapter } from '../auth/authAdapter.js';
import type { MobileProviderAuthAdapter } from '../auth/providerAdapter.js';

export interface AccountSheetProps {
  themeMode: ThemeMode;
  onClose: () => void;
  adapter?: Pick<
    MobileProviderAuthAdapter,
    'signInWithPassword' | 'signUp' | 'recoverPassword' | 'provisionPersonalWorkspace'
  >;
}

/** The production account entry uses provider-verified sessions, including in phone test builds. */
export function AccountSheet({
  themeMode,
  onClose,
  adapter = defaultAuthAdapter,
}: AccountSheetProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup' | 'recover'>('signin');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const palette = colors[themeMode];

  async function submit() {
    if (inFlight.current) return;
    if (!email.trim() || (mode !== 'recover' && !password)) {
      setMessage('Enter your email and password.');
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setMessage('');
    try {
      const params = { email: email.trim(), password };
      const result =
        mode === 'recover'
          ? await adapter.recoverPassword(params.email)
          : mode === 'signup'
            ? await adapter.signUp(params)
            : await adapter.signInWithPassword(params);
      if (!result.success) {
        setMessage(result.error ?? 'Authentication failed. Please retry.');
        return;
      }
      setPassword('');
      if (mode === 'signin') {
        const workspace = await adapter.provisionPersonalWorkspace();
        if (workspace) onClose();
        else
          setMessage(
            'Signed in. Workspace setup is unavailable; retry Provision Personal Workspace in Settings.'
          );
      } else setMessage(result.message ?? 'Check your email, then return here to sign in.');
    } catch {
      setMessage('Authentication is unavailable. Please retry.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <MobileModalSheet
      visible
      onClose={onClose}
      title="Your account"
      themeMode={themeMode}
      testID="account-sheet"
    >
      <MobileTextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        themeMode={themeMode}
        testID="account-email"
      />
      {mode !== 'recover' && (
        <MobileTextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          themeMode={themeMode}
          testID="account-password"
        />
      )}
      {!!message && (
        <Text
          accessibilityRole="alert"
          style={{ color: palette.text.primary, marginBottom: spacing.sm }}
        >
          {message}
        </Text>
      )}
      <MobileButton
        themeMode={themeMode}
        disabled={busy}
        onPress={() => void submit()}
        testID="account-submit"
      >
        {busy
          ? 'Please wait…'
          : mode === 'signin'
            ? 'Sign in'
            : mode === 'signup'
              ? 'Create account'
              : 'Send recovery email'}
      </MobileButton>
      <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
        {(['signin', 'signup', 'recover'] as const)
          .filter((m) => m !== mode)
          .map((m) => (
            <MobileButton
              key={m}
              variant="subtle"
              themeMode={themeMode}
              disabled={busy}
              onPress={() => {
                setMode(m);
                setMessage('');
                setPassword('');
              }}
            >
              {m === 'signin'
                ? 'Sign in instead'
                : m === 'signup'
                  ? 'Create an account'
                  : 'Forgot password?'}
            </MobileButton>
          ))}
      </View>
    </MobileModalSheet>
  );
}

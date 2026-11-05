import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { colors, spacing, type ThemeMode } from '@daynori/design-tokens';
import { MobileButton, MobileModalSheet, MobileTextField } from '@daynori/ui-mobile';
import { defaultAuthAdapter } from '../auth/authAdapter.js';
import type {
  AuthResult,
  MobileProviderAuthAdapter,
  WorkspaceProvisionResult,
} from '../auth/providerAdapter.js';

export interface AccountSheetProps {
  themeMode: ThemeMode;
  onClose: () => void;
  adapter?: Pick<
    MobileProviderAuthAdapter,
    'signInWithPassword' | 'signUp' | 'recoverPassword' | 'getSessionGeneration'
  > &
    Partial<
      Pick<
        MobileProviderAuthAdapter,
        'provisionPersonalWorkspaceDetailed' | 'provisionPersonalWorkspace'
      >
    >;
}

async function resolveWorkspace(
  adapter: NonNullable<AccountSheetProps['adapter']>
): Promise<WorkspaceProvisionResult> {
  if (adapter.provisionPersonalWorkspaceDetailed) {
    return adapter.provisionPersonalWorkspaceDetailed();
  }
  if (adapter.provisionPersonalWorkspace) {
    const id = await adapter.provisionPersonalWorkspace();
    return id
      ? { status: 'ready', workspaceId: id }
      : {
          status: 'unavailable',
          workspaceId: null,
          message: 'Signed in. Workspace setup is unavailable; retry below without signing out.',
        };
  }
  return { status: 'unavailable', workspaceId: null, message: 'Workspace setup is unavailable.' };
}

/**
 * Provider-verified account entry. Sign-in success is distinct from workspace readiness;
 * provisioning retries must not discard a valid session or invent duplicate workspaces.
 */
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
  /** Signed in but personal workspace not ready — show retry without re-entering password. */
  const [awaitingWorkspace, setAwaitingWorkspace] = useState(false);
  const inFlight = useRef(false);
  const submitGeneration = useRef(0);
  const palette = colors[themeMode];

  function mapAuthFailure(result: AuthResult): string {
    switch (result.failureCode) {
      case 'unavailable':
        return 'Authentication is temporarily unavailable. Your previous session was not erased.';
      case 'rate_limited':
        return result.error ?? 'Too many attempts. Wait and retry.';
      case 'verification_required':
        return result.error ?? 'Verify your email, then return here to sign in.';
      case 'invalid_input':
        return result.error ?? 'Enter your email and password.';
      case 'invalid_credentials':
        return 'Invalid email or password.';
      default:
        return result.error ?? 'Authentication failed. Please retry.';
    }
  }

  function mapProvisionFailure(result: WorkspaceProvisionResult): string {
    switch (result.status) {
      case 'rate_limited':
        return result.message ?? 'Too many workspace setup attempts. Wait and retry.';
      case 'unauthenticated':
        return result.message ?? 'Session expired. Sign in again.';
      case 'conflict':
        return result.message ?? 'Workspace setup conflict. Retry.';
      default:
        return (
          result.message ??
          'Signed in. Workspace setup is unavailable; retry below without signing out.'
        );
    }
  }

  async function retryProvision() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage('');
    const generationAtStart =
      typeof adapter.getSessionGeneration === 'function'
        ? adapter.getSessionGeneration()
        : submitGeneration.current;
    try {
      const workspace = await resolveWorkspace(adapter);
      if (
        typeof adapter.getSessionGeneration === 'function' &&
        adapter.getSessionGeneration() !== generationAtStart
      ) {
        return;
      }
      if (workspace.status === 'ready' && workspace.workspaceId) {
        setAwaitingWorkspace(false);
        setPassword('');
        onClose();
        return;
      }
      if (workspace.status === 'unauthenticated') {
        setAwaitingWorkspace(false);
      }
      setMessage(mapProvisionFailure(workspace));
    } catch {
      setMessage('Workspace setup is temporarily unavailable. Your sign-in was kept.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function submit() {
    if (inFlight.current) return;
    if (awaitingWorkspace && mode === 'signin') {
      await retryProvision();
      return;
    }
    if (!email.trim() || (mode !== 'recover' && !password)) {
      setMessage('Enter your email and password.');
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setMessage('');
    const generationAtStart =
      typeof adapter.getSessionGeneration === 'function'
        ? adapter.getSessionGeneration()
        : ++submitGeneration.current;
    try {
      const params = { email: email.trim(), password };
      const result =
        mode === 'recover'
          ? await adapter.recoverPassword(params.email)
          : mode === 'signup'
            ? await adapter.signUp(params)
            : await adapter.signInWithPassword(params);

      if (!result.success) {
        // Drop stale failures if a newer sign-out/sign-in already replaced the session.
        if (
          typeof adapter.getSessionGeneration === 'function' &&
          adapter.getSessionGeneration() !== generationAtStart
        ) {
          return;
        }
        setMessage(mapAuthFailure(result));
        return;
      }

      setPassword('');
      if (mode === 'signin') {
        // Successful sign-in bumps sessionGeneration itself — capture post-sign-in
        // generation so we only ignore provision results from a *later* transition.
        const generationAfterSignIn =
          typeof adapter.getSessionGeneration === 'function'
            ? adapter.getSessionGeneration()
            : generationAtStart;
        const workspace = await resolveWorkspace(adapter);
        if (
          typeof adapter.getSessionGeneration === 'function' &&
          adapter.getSessionGeneration() !== generationAfterSignIn
        ) {
          return;
        }
        if (workspace.status === 'ready' && workspace.workspaceId) {
          setAwaitingWorkspace(false);
          onClose();
          return;
        }
        setAwaitingWorkspace(true);
        setMessage(mapProvisionFailure(workspace));
      } else {
        setMessage(result.message ?? 'Check your email, then return here to sign in.');
      }
    } catch {
      setMessage('Authentication is temporarily unavailable. Please retry.');
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
        // Keep paste/password-manager friendly types on web-shaped attrs, but disable
        // Android Autofill overwrite during account switch (previous account credentials).
        textContentType="none"
        autoComplete="off"
        importantForAutofill="no"
        themeMode={themeMode}
        testID="account-email"
        editable={!busy}
      />
      {mode !== 'recover' && (
        <MobileTextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType={mode === 'signup' ? 'newPassword' : 'password'}
          autoComplete={mode === 'signup' ? 'password-new' : 'password'}
          // Avoid OS Autofill swapping the previous account while typing a peer login.
          importantForAutofill="no"
          themeMode={themeMode}
          testID="account-password"
          editable={!busy && !awaitingWorkspace}
        />
      )}
      {!!message && (
        <Text
          accessibilityRole="alert"
          testID="account-message"
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
        accessibilityLabel={
          busy
            ? 'Please wait'
            : awaitingWorkspace && mode === 'signin'
              ? 'Retry workspace setup'
              : mode === 'signin'
                ? 'Sign in'
                : mode === 'signup'
                  ? 'Create account'
                  : 'Send recovery email'
        }
      >
        {busy
          ? 'Please wait…'
          : awaitingWorkspace && mode === 'signin'
            ? 'Retry workspace setup'
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
                setAwaitingWorkspace(false);
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

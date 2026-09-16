/**
 * Create an account, or sign back into one.
 *
 * Shared by Settings and the paywall so the two cannot drift — the paywall's
 * copy of this is the one a reviewer sees on the way to a purchase, and it
 * must behave identically to the one in Settings.
 *
 * Two modes, one form. Creating *links* the email to the anonymous user that
 * already exists, so the uid survives and nothing has to migrate. Signing in
 * replaces the uid, which is why it warns first and why it fires
 * `notifyAccountSwitched` afterwards — RevenueCat is configured with the old
 * uid and will keep reporting the wrong entitlement until it is told.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { haptic } from '@/components/primitives/usePressScale';
import { curve, font, gutter, radius, sage, text } from '@/theme/sage';
import {
  MIN_PASSWORD_LENGTH,
  isPlausibleEmail,
  linkEmailAccount,
  notifyAccountSwitched,
  passwordProblem,
  resetPassword,
  signInExisting,
} from '@/app/accountService';
import { legal, openLegal } from '@/app/legal';

export type AuthMode = 'create' | 'signin';

interface Props {
  /** Null closes the sheet. */
  mode: AuthMode | null;
  onClose: () => void;
  onDone: () => void | Promise<void>;
  /** Shown above the form — lets the paywall explain why it is asking. */
  reason?: string;
}

export function AuthSheet({ mode, onClose, onDone, reason }: Props) {
  const [current, setCurrent] = useState<AuthMode>('create');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mode) {
      setCurrent(mode);
      setError(null);
      setPassword('');
      setBusy(false);
    }
  }, [mode]);

  const submit = useCallback(async () => {
    if (busy) return;
    setError(null);

    if (!isPlausibleEmail(email)) {
      setError("That doesn't look like an email address.");
      return;
    }
    if (current === 'create') {
      const problem = passwordProblem(password);
      if (problem) {
        setError(problem);
        return;
      }
    } else if (!password) {
      setError('Enter your password.');
      return;
    }

    setBusy(true);
    try {
      if (current === 'create') {
        await linkEmailAccount(email, password);
      } else {
        const account = await signInExisting(email, password);
        // The uid just changed under everything. Tell the listeners before the
        // caller refreshes entitlement, or RevenueCat answers for the old user.
        await notifyAccountSwitched(account.uid);
      }
      haptic('success');
      await onDone();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong.';
      setError(message);
      // A guest who tries to create an account with an email they already used
      // has picked the wrong mode, not made a mistake. Move them across.
      if (message.includes('already an account')) setCurrent('signin');
    } finally {
      setBusy(false);
    }
  }, [busy, email, password, current, onDone]);

  const forgot = useCallback(async () => {
    if (!isPlausibleEmail(email)) {
      setError('Enter your email first, then tap this again.');
      return;
    }
    try {
      await resetPassword(email);
      Alert.alert('Check your inbox', `We've sent a reset link to ${email.trim()}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send a reset email.');
    }
  }, [email]);

  const creating = current === 'create';

  return (
    <Modal visible={mode !== null} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.sheet}>
          <View style={styles.grab} />
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={[text.title, { fontSize: 20 }]}>
              {creating ? 'Keep your account' : 'Welcome back'}
            </Text>
            <Text style={[text.body, { marginTop: 6, marginBottom: 16 }]}>
              {reason ??
                (creating
                  ? 'An email and a password, so your tasks and your subscription can follow you to a new phone.'
                  : 'Sign in and everything comes back.')}
            </Text>

            {!creating && (
              <Text style={styles.switchWarning}>
                Signing in swaps this device to that account. Anything you made as a guest stays on
                this phone but won&apos;t be part of it.
              </Text>
            )}

            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
              placeholderTextColor={sage.fgFaint}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              editable={!busy}
              returnKeyType="next"
            />
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder={creating ? `Password (${MIN_PASSWORD_LENGTH}+ characters)` : 'Password'}
              placeholderTextColor={sage.fgFaint}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              // Tells the OS password manager to offer a strong one on create
              // and to autofill on sign-in.
              textContentType={creating ? 'newPassword' : 'password'}
              editable={!busy}
              returnKeyType="go"
              onSubmitEditing={submit}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable
              onPress={submit}
              disabled={busy}
              style={[styles.cta, busy && { opacity: 0.6 }]}
              accessibilityRole="button"
            >
              {busy ? (
                <ActivityIndicator color={sage.onPrimary} />
              ) : (
                <Text style={text.button}>{creating ? 'Create account' : 'Sign in'}</Text>
              )}
            </Pressable>

            <Pressable
              onPress={() => {
                setCurrent(creating ? 'signin' : 'create');
                setError(null);
              }}
              disabled={busy}
              style={{ paddingVertical: 14 }}
            >
              <Text style={[text.meta, { textAlign: 'center' }]}>
                {creating ? 'I already have an account' : 'Create one instead'}
              </Text>
            </Pressable>

            {!creating && (
              <Pressable onPress={forgot} disabled={busy} style={{ paddingBottom: 10 }}>
                <Text style={[text.meta, { textAlign: 'center' }]}>I&apos;ve forgotten my password</Text>
              </Pressable>
            )}

            {creating && (
              <Text style={styles.legal}>
                By creating an account you agree to our{' '}
                <Text style={styles.legalLink} onPress={() => void openLegal(legal.terms)}>
                  Terms of Use
                </Text>{' '}
                and{' '}
                <Text style={styles.legalLink} onPress={() => void openLegal(legal.privacy)}>
                  Privacy Policy
                </Text>
                .
              </Text>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(55,81,74,0.28)' },
  sheet: {
    backgroundColor: sage.bg,
    borderTopLeftRadius: radius.cardLg,
    borderTopRightRadius: radius.cardLg,
    paddingHorizontal: gutter,
    paddingTop: 10,
    paddingBottom: 30,
    maxHeight: '88%',
    ...curve,
  },
  grab: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: sage.ruleStrong,
    alignSelf: 'center',
    marginBottom: 14,
  },
  switchWarning: {
    fontFamily: font.body,
    fontSize: 12.5,
    lineHeight: 18,
    color: sage.clay,
    backgroundColor: sage.clayFill,
    borderRadius: radius.sm,
    padding: 12,
    marginBottom: 14,
  },
  input: {
    height: 50,
    borderRadius: radius.md,
    backgroundColor: sage.surface,
    borderWidth: 1,
    borderColor: sage.ruleStrong,
    paddingHorizontal: 16,
    fontFamily: font.body,
    fontSize: 15,
    color: sage.fgBody,
    marginBottom: 10,
  },
  error: {
    fontFamily: font.body,
    fontSize: 13,
    lineHeight: 19,
    color: sage.danger,
    marginTop: 2,
    marginBottom: 6,
  },
  cta: {
    marginTop: 8,
    height: 50,
    borderRadius: radius.md,
    backgroundColor: sage.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...curve,
  },
  legal: {
    fontFamily: font.body,
    fontSize: 11.5,
    lineHeight: 17,
    color: sage.fgMuted,
    textAlign: 'center',
    marginTop: 4,
  },
  legalLink: { color: sage.primaryInk, textDecorationLine: 'underline' },
});

import { Component, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Txt } from '@/components/ui';
import { logError } from '@/lib/diagnostics';
import { colors, spacing } from '@/theme';

// Filet de sécurité : si un écran plante au rendu, on journalise l'erreur (diagnostics) et on
// affiche un repli propre au lieu d'un écran blanc. « Réessayer » remonte le composant.
type Props = { children: ReactNode };
type State = { hasError: boolean };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: { componentStack?: string }) {
    logError(error, `render${info?.componentStack ? `:${info.componentStack.slice(0, 200)}` : ''}`);
  }

  reset = () => this.setState({ hasError: false });

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <View style={styles.wrap}>
        <Txt variant="h2" style={{ textAlign: 'center' }}>
          Oups, un souci est survenu
        </Txt>
        <Txt variant="muted" style={{ textAlign: 'center', marginTop: spacing.sm }}>
          On a été prévenu automatiquement. Réessaie — si ça persiste, ferme et rouvre l'application.
        </Txt>
        <View style={{ marginTop: spacing.lg }}>
          <Button label="Réessayer" icon="refresh" onPress={this.reset} />
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, backgroundColor: colors.bg },
});

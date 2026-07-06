import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SkeletonLines } from '@/components/Skeleton';
import { Card, StatTile, Txt } from '@/components/ui';
import { fetchDiagSummary, fetchRecentErrors, type DiagSummary, type RecentError } from '@/lib/diagnostics';
import { colors, spacing } from '@/theme';

// Carte « Santé de l’app » : lit les diagnostics self-hosted (app_errors / app_events, 33)
// via les RPC réservés à l’opérateur (39) — le porteur, sans terminal, surveille l’état de
// santé DANS l’app au lieu d’ouvrir le Dashboard Supabase. Lecture seule, anonyme.
export function DiagnosticsCard() {
  // undefined = chargement ; null = indisponible (hors-ligne / RPC 39 pas encore collé).
  const [summary, setSummary] = useState<DiagSummary | null | undefined>(undefined);
  const [errors, setErrors] = useState<RecentError[]>([]);

  useEffect(() => {
    let alive = true;
    void fetchDiagSummary().then((s) => alive && setSummary(s));
    void fetchRecentErrors(5).then((e) => alive && e && setErrors(e));
    return () => {
      alive = false;
    };
  }, []);

  if (summary === undefined) {
    return (
      <Card>
        <SkeletonLines lines={3} />
      </Card>
    );
  }
  if (summary === null) {
    return (
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Ionicons name="cloud-offline-outline" size={18} color={colors.textFaint} />
        <Txt variant="muted" style={{ flex: 1 }}>
          Diagnostics indisponibles — vérifie ta connexion (ou colle la migration 39 si ce n’est pas encore fait).
        </Txt>
      </Card>
    );
  }

  const healthy = summary.errors7d === 0;
  return (
    <Card>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <StatTile
          value={summary.errors7d}
          label="Erreurs (7 j)"
          color={healthy ? colors.green : colors.coral}
          bg={healthy ? colors.greenSoft : colors.coralSoft}
        />
        <StatTile value={summary.events7d} label="Événements (7 j)" color={colors.green} bg={colors.greenSoft} />
      </View>
      {summary.topContext ? (
        <Txt variant="small" color={colors.textMuted} style={{ marginTop: spacing.sm }}>
          Écran le plus touché :{' '}
          <Txt variant="small" style={{ fontWeight: '700' }}>
            {summary.topContext}
          </Txt>
        </Txt>
      ) : null}
      {errors.length > 0 ? (
        <View style={{ marginTop: spacing.md, gap: spacing.xs }}>
          <Txt variant="label">Dernières erreurs (anonymes)</Txt>
          {errors.map((e, i) => (
            <View key={`${e.createdAt}-${i}`} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
              <Ionicons name="bug-outline" size={13} color={colors.coral} style={{ marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Txt variant="small" numberOfLines={2}>
                  {e.message}
                </Txt>
                <Txt variant="small" color={colors.textFaint}>
                  {[e.context, e.platform, e.appVersion].filter(Boolean).join(' · ')}
                </Txt>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
          Aucune erreur enregistrée — tout roule 🎾
        </Txt>
      )}
    </Card>
  );
}

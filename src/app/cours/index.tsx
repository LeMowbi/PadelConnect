import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Screen } from '@/components/Screen';
import { SkeletonCard } from '@/components/Skeleton';
import { Button, Card, Divider, EmptyState, IconCircle, SectionHeader, Tag, Txt } from '@/components/ui';
import { activeClubs } from '@/data/clubs';
import { fetchBookableCoaches, type ServerCoach } from '@/lib/coachesServer';
import { fcfa } from '@/lib/format';
import { usePullToRefresh } from '@/lib/usePullToRefresh';
import { useApp } from '@/store/AppContext';
import { colors, spacing } from '@/theme';

type BookableCoach = ServerCoach & { clubId: string };

// RÉSERVER UN COURS — annuaire des coachs réservables de TOUS les clubs (44), groupés par
// club. Un tap ouvre le tunnel de demande de cours (le terrain n'est réservé qu'à
// l'acceptation du coach — même parcours que depuis la fiche club). Seul annuaire des coachs :
// l'ancienne adresse /coachs renvoie ici (T-19).
export default function CoursScreen() {
  const router = useRouter();
  const { state } = useApp();
  // undefined = chargement ; null = échec réseau (≠ [] = aucun coach), convention §8.
  const [coaches, setCoaches] = useState<BookableCoach[] | null | undefined>(undefined);
  const load = async () => {
    const cs = await fetchBookableCoaches();
    setCoaches((cur) => cs ?? (cur === undefined ? null : cur)); // échec → on garde l'existant
  };
  const { refreshControl } = usePullToRefresh(load);
  // « Réessayer » après un échec du premier chargement : squelette réaffiché pendant la relance
  // (même motif que retryCoaches de cours/[coachId].tsx) — jamais un bouton inerte.
  const retry = () => {
    setCoaches(undefined);
    void load();
  };
  useEffect(() => {
    let alive = true;
    void fetchBookableCoaches().then((cs) => alive && setCoaches(cs));
    return () => {
      alive = false;
    };
  }, []);

  // Groupement par club, dans l'ORDRE des listes joueurs (activeClubs est trié par compareClubs :
  // Padelta d'abord, §9). Seuls les clubs VISIBLES et RÉSERVABLES comptent : un coach d'un club
  // masqué par l'opérateur ou « Bientôt » n'est pas proposé (le tunnel y est fermé).
  const groups = activeClubs(state.customClubs, state.clubInfo)
    .filter((club) => !club.comingSoon)
    .map((club) => ({ clubId: club.id, clubName: club.name, items: (coaches ?? []).filter((c) => c.clubId === club.id) }))
    .filter((g) => g.items.length > 0);

  return (
    <Screen back title="Réserver un cours" subtitle="Avec un coach déclaré par son club" refreshControl={refreshControl}>
      {coaches === undefined ? (
        <View style={{ marginTop: spacing.lg, gap: spacing.md }}>
          <SkeletonCard banner={false} />
          <SkeletonCard banner={false} />
        </View>
      ) : coaches === null ? (
        <Card style={{ marginTop: spacing.lg, alignItems: 'center', paddingVertical: spacing.lg }}>
          <Ionicons name="cloud-offline-outline" size={24} color={colors.textFaint} />
          <Txt variant="muted" style={{ marginTop: spacing.sm, textAlign: 'center' }}>
            Impossible de charger les coachs — vérifie ta connexion.
          </Txt>
          <View style={{ marginTop: spacing.md }}>
            <Button size="sm" label="Réessayer" icon="refresh" variant="secondary" onPress={retry} />
          </View>
        </Card>
      ) : groups.length === 0 ? (
        <EmptyState
          icon="school-outline"
          title="Aucun coach réservable pour l’instant"
          text="Les clubs déclarent leurs coachs au fil de l’eau — repasse bientôt, ou regarde directement la fiche de ton club."
          actionLabel="Voir les clubs"
          onAction={() => router.push('/clubs')}
        />
      ) : (
        groups.map((g) => (
          <View key={g.clubId} style={{ marginTop: spacing.lg }}>
            <SectionHeader title={g.clubName} />
            <Card>
              {g.items.map((c, i) => (
                <View key={c.userId}>
                  {i > 0 ? <Divider style={{ marginVertical: spacing.sm }} /> : null}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                    <IconCircle icon="school" color={colors.purple} bg={colors.purpleSoft} size={38} />
                    <View style={{ flex: 1 }}>
                      <Txt variant="body" numberOfLines={1} style={{ fontWeight: '600' }}>
                        {c.name}
                      </Txt>
                      <Txt variant="muted" numberOfLines={1}>
                        {c.specialty || 'Coach du club'}
                        {c.price ? ` · cours ${fcfa(c.price)}` : ''}
                      </Txt>
                    </View>
                    {/* Ma propre fiche de coach : pas de cours avec soi-même (le serveur le refuse). */}
                    {c.userId === state.serverUserId ? (
                      <Tag label="Toi" tone="signature" />
                    ) : c.slots.length === 0 ? (
                      <Tag label="Bientôt dispo" tone="neutral" />
                    ) : (
                      <Button
                        size="sm"
                        label="Réserver"
                        icon="calendar-outline"
                        onPress={() => router.push(`/cours/${c.userId}?clubId=${g.clubId}`)}
                      />
                    )}
                  </View>
                </View>
              ))}
            </Card>
          </View>
        ))
      )}
      <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.lg }}>
        Le terrain n’est réservé que lorsque le coach accepte ta demande. Le tarif du cours se règle au coach, sur place.
      </Txt>
    </Screen>
  );
}

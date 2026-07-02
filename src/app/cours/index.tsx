import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Screen } from '@/components/Screen';
import { SkeletonCard } from '@/components/Skeleton';
import { Button, Card, Divider, EmptyState, IconCircle, SectionHeader, Tag, Txt } from '@/components/ui';
import { findClub } from '@/data/clubs';
import { fetchBookableCoaches, type ServerCoach } from '@/lib/coachesServer';
import { fcfa } from '@/lib/format';
import { usePullToRefresh } from '@/lib/usePullToRefresh';
import { useApp } from '@/store/AppContext';
import { colors, spacing } from '@/theme';

type BookableCoach = ServerCoach & { clubId: string };

// RÉSERVER UN COURS — annuaire des coachs réservables de TOUS les clubs (44), groupés par
// club. Un tap ouvre le tunnel de demande de cours (le terrain n'est réservé qu'à
// l'acceptation du coach — même parcours que depuis la fiche club).
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
  useEffect(() => {
    let alive = true;
    void fetchBookableCoaches().then((cs) => alive && setCoaches(cs));
    return () => {
      alive = false;
    };
  }, []);

  // Groupement par club (l'ordre serveur est déjà par club) — nom résolu côté app.
  const groups: { clubId: string; clubName: string; items: BookableCoach[] }[] = [];
  for (const c of coaches ?? []) {
    const g = groups.find((x) => x.clubId === c.clubId);
    if (g) g.items.push(c);
    else {
      const club = findClub(c.clubId, state.customClubs, state.clubInfo);
      groups.push({ clubId: c.clubId, clubName: club?.name ?? 'Club', items: [c] });
    }
  }

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
            <Button size="sm" label="Réessayer" icon="refresh" variant="secondary" onPress={() => void load()} />
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
                    {c.slots.length === 0 ? (
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

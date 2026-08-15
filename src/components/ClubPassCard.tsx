import { useEffect, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { Card, IconCircle, Txt } from '@/components/ui';
import { fetchMyPasses, type MyPass } from '@/lib/passes';
import { useApp } from '@/store/AppContext';
import { colors, spacing } from '@/theme';

// MON CARNET DANS CE CLUB (17, fiche club) : le gérant crédite N séances à un joueur (par
// téléphone) et les décompte à la main, une réservation à la fois. Le joueur voit ici son solde
// — carte entièrement MASQUÉE s'il n'a aucun carnet en cours dans ce club (jamais de « 0 séance »).
// Convention §8 : un échec réseau ne vide jamais le solde déjà affiché.
export function ClubPassCard({ clubId }: { clubId: string }) {
  const { state } = useApp();
  const userId = state.serverUserId;
  // null = pas encore chargé (ou échec réseau) — indistinguable ici, et sans conséquence :
  // dans les deux cas la carte reste masquée plutôt que d'annoncer un solde inventé.
  const [passes, setPasses] = useState<MyPass[] | null>(null);

  useEffect(() => {
    if (!userId) return; // hors session : aucun carnet à lire
    let alive = true;
    // setState APRÈS await (règle React Compiler) : jamais de setState synchrone dans l'effet.
    const load = () =>
      void fetchMyPasses().then((rows) => {
        if (alive && rows) setPasses(rows); // null = échec réseau → on garde l'existant
      });
    load();
    // Retour au premier plan : le club a pu décompter (ou créditer) entre-temps.
    const sub = AppState.addEventListener('change', (st) => st === 'active' && load());
    return () => {
      alive = false;
      sub.remove();
    };
  }, [userId]);

  const mine = (passes ?? []).filter((p) => p.clubId === clubId && p.remaining > 0);
  if (mine.length === 0) return null;
  const remaining = mine.reduce((s, p) => s + p.remaining, 0);
  const plural = remaining > 1 ? 's' : '';

  return (
    <Card style={{ marginTop: spacing.lg }}>
      <View style={styles.row}>
        <IconCircle icon="ticket" color={colors.purple} bg={colors.purpleSoft} size={38} />
        <View style={{ flex: 1 }}>
          <Txt variant="body" style={{ fontWeight: '700' }}>
            Carnet : {remaining} séance{plural} restante{plural}
          </Txt>
          <Txt variant="small" color={colors.textMuted}>
            Le club décompte une séance à chaque partie jouée ici.
          </Txt>
          {/* Plusieurs carnets dans le même club : le détail, sinon le total suffit. */}
          {mine.length > 1
            ? mine.map((p) => (
                <Txt key={p.id} variant="small" color={colors.textFaint} numberOfLines={1} style={{ marginTop: 2 }}>
                  {p.label || 'Carnet'} · {p.remaining}/{p.total}
                </Txt>
              ))
            : null}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});

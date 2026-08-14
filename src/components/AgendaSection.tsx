import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { AppState, Linking, Pressable, StyleSheet, View } from 'react-native';
import { useToast } from '@/components/Toast';
import { Card, SectionHeader, Txt } from '@/components/ui';
import { fetchEvents, type AgendaEvent } from '@/lib/agenda';
import { alertAsync } from '@/lib/confirm';
import { dateKeyLabel } from '@/lib/days';
import { hapticLight } from '@/lib/haptics';
import {
  canRemindEvent,
  cancelEventReminder,
  scheduleEventReminder,
  scheduledEventReminderIds,
  sweepEventReminders,
} from '@/lib/notifications';
import { useTodayKey } from '@/lib/useTodayKey';
import { colors, radius, spacing } from '@/theme';

const PREVIEW = 3; // liste repliée par défaut (l'accueil reste centré sur la réservation)

// AGENDA DU PADEL IVOIRIEN (82) : les événements de la scène locale (FIP Gold, soirées club,
// stages…) écrits par l'opérateur. Section entièrement MASQUÉE tant qu'il n'y a rien à venir —
// pas d'en-tête suivi de vide, même règle que « Tournois à venir » sur l'accueil.
// « Me rappeler » pose une notification LOCALE la veille à 18 h (mécanique des rappels de match,
// identifiant stable `event-{id}` — cf. src/lib/notifications.ts).
export function AgendaSection() {
  const toast = useToast();
  const todayKey = useTodayKey();
  // undefined = chargement ; null = échec réseau (≠ [] = aucun événement), convention §8.
  const [events, setEvents] = useState<AgendaEvent[] | null | undefined>(undefined);
  const [showAll, setShowAll] = useState(false);
  // Événements ayant DÉJÀ un rappel programmé (lu depuis le système au montage). null = lecture
  // impossible (web / pas de notifications) → aucun bouton ne s'affiche de toute façon.
  const [remindedIds, setRemindedIds] = useState<string[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null); // garde anti double-tap

  useEffect(() => {
    let alive = true;
    // Échec réseau → on garde la liste existante (jamais de section qui disparaît hors-ligne).
    const load = () =>
      void fetchEvents(todayKey).then((rows) => {
        if (!alive) return;
        setEvents((cur) => rows ?? (cur === undefined ? null : cur));
        // Rappels ORPHELINS (événement supprimé par l'opérateur) : balayés UNIQUEMENT sur une
        // liste fraîche ET complète (< 20 = non tronquée) — jamais sur un échec réseau (§8).
        if (rows && rows.length < 20) {
          void sweepEventReminders(rows.map((r) => r.id)).then(() =>
            scheduledEventReminderIds().then((ids) => alive && ids && setRemindedIds(ids)),
          );
        }
      });
    load();
    // Retour au premier plan : l'opérateur peut avoir publié un événement entre-temps.
    const sub = AppState.addEventListener('change', (st) => st === 'active' && load());
    return () => {
      alive = false;
      sub.remove();
    };
  }, [todayKey]);

  // État des rappels déjà posés (au montage) : le bouton doit refléter le système, pas une
  // mémoire locale — un rappel survit à la fermeture de l'app.
  useEffect(() => {
    let alive = true;
    void scheduledEventReminderIds().then((ids) => {
      if (alive && ids) setRemindedIds(ids);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Poser / retirer le rappel de la veille 18 h.
  const toggleReminder = async (ev: AgendaEvent) => {
    if (busyId) return;
    hapticLight();
    setBusyId(ev.id);
    const already = (remindedIds ?? []).includes(ev.id);
    if (already) {
      await cancelEventReminder(ev.id);
      setBusyId(null);
      setRemindedIds((cur) => (cur ?? []).filter((id) => id !== ev.id));
      toast.show('Rappel retiré');
      return;
    }
    const res = await scheduleEventReminder(ev);
    setBusyId(null);
    if (res === 'full') {
      // Budget de rappels d'agenda atteint (plafond iOS de 64 notifications locales partagé
      // avec les rappels de match) : message honnête plutôt qu'un rappel silencieusement jeté.
      toast.show('Trop de rappels posés — retire-en un pour en ajouter un nouveau.', { icon: 'alert-circle' });
      return;
    }
    if (!res) {
      toast.show('Rappel impossible — autorise les notifications dans les réglages.', { icon: 'alert-circle' });
      return;
    }
    setRemindedIds((cur) => [...(cur ?? []), ev.id]);
    toast.show('Rappel posé — on te prévient la veille à 18 h 🔔');
  };

  // Repli web-safe : `Linking.openURL` rejette si le lien est invalide / aucune app pour l'ouvrir.
  const openLink = (link: string) => {
    hapticLight();
    void Linking.openURL(link).catch(() => alertAsync('Lien indisponible', 'Impossible d’ouvrir ce lien pour le moment.'));
  };

  if (!events || events.length === 0) return null;
  const shown = showAll ? events : events.slice(0, PREVIEW);

  return (
    <View style={styles.section}>
      <SectionHeader
        title="Agenda du padel 🇨🇮"
        actionLabel={events.length > PREVIEW ? (showAll ? 'Réduire' : `Voir tout (${events.length})`) : undefined}
        onAction={events.length > PREVIEW ? () => setShowAll((v) => !v) : undefined}
      />
      <View style={{ gap: spacing.sm }}>
        {shown.map((ev) => {
          const reminded = (remindedIds ?? []).includes(ev.id);
          // Rappel proposé seulement si la veille 18 h est encore devant nous (et en natif) :
          // sinon le bouton promettrait une notification qui ne partirait jamais.
          const canRemind = canRemindEvent(ev.dateKey);
          return (
            <Card key={ev.id}>
              <View style={styles.head}>
                <View style={styles.icon}>
                  <Ionicons name="calendar" size={18} color={colors.amberDark} />
                </View>
                <View style={{ flex: 1 }}>
                  <Txt variant="body" style={{ fontWeight: '700' }} numberOfLines={2}>
                    {ev.title}
                  </Txt>
                  <Txt variant="small" color={colors.textMuted} numberOfLines={1}>
                    {dateKeyLabel(ev.dateKey)}
                    {ev.place ? ` · ${ev.place}` : ''}
                  </Txt>
                </View>
              </View>
              {ev.link || canRemind ? (
                <View style={styles.actions}>
                  {ev.link ? (
                    <Pressable
                      onPress={() => openLink(ev.link)}
                      style={({ pressed }) => [styles.action, { backgroundColor: colors.surfaceAlt }, pressed && { opacity: 0.75 }]}
                      accessibilityRole="link"
                      accessibilityLabel={`En savoir plus sur ${ev.title}`}
                    >
                      <Ionicons name="open-outline" size={14} color={colors.signature} />
                      <Txt variant="small" color={colors.signature} style={{ fontWeight: '700' }}>
                        En savoir plus
                      </Txt>
                    </Pressable>
                  ) : null}
                  {canRemind ? (
                    <Pressable
                      onPress={() => void toggleReminder(ev)}
                      disabled={busyId === ev.id}
                      style={({ pressed }) => [
                        styles.action,
                        { backgroundColor: reminded ? colors.greenSoft : colors.amberSoft },
                        pressed && { opacity: 0.75 },
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: reminded, disabled: busyId === ev.id }}
                      accessibilityLabel={reminded ? `Retirer le rappel de ${ev.title}` : `Me rappeler ${ev.title} la veille à 18 h`}
                    >
                      <Ionicons
                        name={reminded ? 'notifications' : 'notifications-outline'}
                        size={14}
                        color={reminded ? colors.signatureDark : colors.amberDark}
                      />
                      <Txt variant="small" color={reminded ? colors.signatureDark : colors.amberDark} style={{ fontWeight: '700' }}>
                        {reminded ? 'Rappel posé ✓' : 'Me rappeler'}
                      </Txt>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </Card>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Placée entre l'actu opérateur (marginBottom md) et le héros : seule la marge BASSE est à
  // porter ici, sinon les cartes colleraient à la carte verte « Réserve ton prochain match ».
  section: { marginBottom: spacing.lg },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.amberSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  // minHeight 44 : cible tactile confortable (a11y), même règle que les actions de l'accueil.
  action: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
});

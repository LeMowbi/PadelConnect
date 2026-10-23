import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useToast } from '@/components/Toast';
import { Button, Card, Divider, Tag, Txt } from '@/components/ui';
import { type Competition } from '@/data/competitions';
import { fetchRefundsDue, markRefunded, type RefundDue } from '@/lib/competitionsServer';
import { confirmAsync } from '@/lib/confirm';
import { openWhatsApp } from '@/lib/contact';
import { dateKeyLabel } from '@/lib/days';
import { fcfa } from '@/lib/format';
import { colors, spacing } from '@/theme';

// Frais à encaisser sur les tournois JOUEURS : l’opérateur voit chaque tournoi publié, son
// montant et le contact de l’organisateur → il le relance par WhatsApp (règlement Wave via le
// lien), puis confirme la réception. Le paiement est SERVEUR (payment_status, v2) : dès que
// l’opérateur confirme, l’organisateur voit « frais réglés ✓ » dans sa fiche tournoi.
// « Paiement reçu » efface une créance : on le fait CONFIRMER, et un tap erroné s’annule
// (« Annuler » → le tournoi repasse « à régler », 97 / R-68).
// Tournoi ANNULÉ par son club hôte ou par l’opérateur (T-12, 98) : frais annulés, et le tournoi
// n’est plus jamais renvoyé par fetch_competitions — il quitte donc cette liste. Des frais déjà
// encaissés passent « à rembourser » (RefundsDue, ci-dessous). La carte le DIT (CANCELLED_NOTE),
// sans quoi une créance qui disparaît ressemblerait à une perte de donnée.
const CANCELLED_NOTE =
  'Tournoi annulé par son club (ou par toi) : il quitte cette liste, ses frais sont annulés. S’ils étaient déjà réglés, le tournoi passe dans « À rembourser » : rembourse l’organisateur par Wave puis touche « Remboursé ✓ ».';

export function TournamentFees({
  comps,
  onConfirm,
  onUnconfirm,
}: {
  comps: Competition[];
  onConfirm: (compId: string) => Promise<void>;
  onUnconfirm: (compId: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null); // anti double-tap (déclaré avant le return anticipé)
  const run = async (id: string, action: (compId: string) => Promise<void>) => {
    if (busy) return;
    setBusy(id);
    try {
      await action(id);
    } finally {
      setBusy(null);
    }
  };
  const confirm = async (c: Competition) => {
    if (busy) return;
    const yes = await confirmAsync(
      'Paiement reçu ?',
      `Confirme que tu as bien reçu ${fcfa(c.commission ?? 0)} de ${c.organizer} pour « ${c.title} ». L’organisateur verra « frais réglés ✓ » dans sa fiche.`,
      { confirmLabel: 'Oui, reçu' },
    );
    if (yes) await run(c.id, onConfirm);
  };
  if (comps.length === 0) {
    return (
      <Card>
        <Txt variant="small" color={colors.textMuted}>
          Aucun tournoi joueur à encaisser. Dès qu’un joueur organise un tournoi validé par son club, il apparaît ici avec son montant et le
          contact de l’organisateur pour le règlement par Wave.
        </Txt>
        <Txt variant="small" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
          {CANCELLED_NOTE}
        </Txt>
      </Card>
    );
  }
  return (
    <Card>
      {comps.map((c, i) => {
        const paid = c.paymentStatus === 'paid';
        const contact = () =>
          c.organizerPhone
            ? openWhatsApp(
                c.organizerPhone,
                `Bonjour ${c.organizer}, pour ton tournoi « ${c.title} » sur PadelConnect, les frais d’organisation sont de ${fcfa(c.commission ?? 0)} à régler par Wave. Merci !`,
              )
            : undefined;
        return (
          <View key={c.id}>
            {i > 0 ? <Divider style={{ marginVertical: spacing.sm }} /> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Txt variant="body" style={{ fontWeight: '600' }} numberOfLines={1}>
                  {c.title}
                </Txt>
                <Txt variant="muted">
                  {c.organizer} · {fcfa(c.commission ?? 0)}
                  {c.organizerPhone ? ` · ${c.organizerPhone}` : ''}
                </Txt>
              </View>
              {paid ? (
                <>
                  <Tag label="Réglé" tone="green" icon="checkmark" />
                  <Button
                    size="sm"
                    label={busy === c.id ? '…' : 'Annuler'}
                    icon="arrow-undo"
                    variant="ghost"
                    onPress={() => void run(c.id, onUnconfirm)}
                    disabled={busy !== null}
                    accessibilityLabel={`Annuler le paiement reçu — ${c.title}`}
                  />
                </>
              ) : null}
            </View>
            {!paid ? (
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
                {c.organizerPhone ? (
                  <Button size="sm" label="Relancer (Wave)" icon="logo-whatsapp" variant="secondary" onPress={contact} />
                ) : null}
                <View style={{ flex: 1 }}>
                  <Button
                    size="sm"
                    label={busy === c.id ? '…' : 'Paiement reçu'}
                    icon="checkmark"
                    onPress={() => void confirm(c)}
                    disabled={busy !== null}
                    accessibilityLabel={`Paiement reçu — ${c.title}`}
                    full
                  />
                </View>
              </View>
            ) : null}
          </View>
        );
      })}
      <Divider style={{ marginVertical: spacing.sm }} />
      <Txt variant="small" color={colors.textFaint}>
        {CANCELLED_NOTE}
      </Txt>
    </Card>
  );
}

// Frais À REMBOURSER (98) : tournois annulés dont les frais étaient déjà encaissés. Sans cette
// liste, la dette ne vivait que dans un push (absent sur le web, sans rattrapage). L’opérateur
// rembourse l’organisateur par Wave, puis solde la ligne (« Remboursé ✓ », confirmé : il efface
// une dette). Lecture au montage et à chaque pull-to-refresh (refreshKey) ; un échec réseau garde
// la liste déjà affichée (§8).
export function RefundsDue({ refreshKey, toast }: { refreshKey: number; toast: ReturnType<typeof useToast> }) {
  // undefined = chargement, null = échec réseau (aucune liste encore lue).
  const [rows, setRows] = useState<RefundDue[] | null | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null); // anti double-tap
  useEffect(() => {
    let alive = true;
    void fetchRefundsDue().then((r) => alive && setRows((cur) => r ?? (cur === undefined ? null : cur)));
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  const refund = async (r: RefundDue) => {
    if (busy) return;
    const yes = await confirmAsync(
      'Remboursement effectué ?',
      `Confirme que tu as bien remboursé ${fcfa(r.commission)} à ${r.organizer || 'l’organisateur'} pour « ${r.title} ». La ligne quittera cette liste.`,
      { confirmLabel: 'Oui, remboursé' },
    );
    if (!yes) return;
    setBusy(r.id);
    const res = await markRefunded(r.id);
    // On RELIT dans tous les cas : un refus (déjà soldé ailleurs) se lit dans la liste fraîche.
    const fresh = await fetchRefundsDue();
    setBusy(null);
    if (fresh) setRows(fresh);
    if (res === true) toast.show('Remboursement enregistré ✅');
    else if (res === 'unsupported')
      toast.show('Fonction bientôt disponible — la base n’est pas encore à jour (SQL 98)', { icon: 'alert-circle' });
    else if (fresh && !fresh.some((x) => x.id === r.id)) toast.show('Déjà soldé — liste mise à jour.', { icon: 'information-circle' });
    else toast.show('Action impossible — vérifie ta connexion et réessaie', { icon: 'cloud-offline-outline' });
  };

  if (rows === undefined) return null;
  if (rows === null) {
    return (
      <Card>
        <Txt variant="small" color={colors.textMuted}>
          Liste des remboursements indisponible — vérifie ta connexion puis tire pour rafraîchir.
        </Txt>
      </Card>
    );
  }
  if (rows.length === 0) {
    return (
      <Card>
        <Txt variant="small" color={colors.textMuted}>
          Aucun frais à rembourser. Si un tournoi aux frais déjà réglés est annulé, il apparaît ici avec le contact de l’organisateur.
        </Txt>
      </Card>
    );
  }
  return (
    <Card>
      {rows.map((r, i) => (
        <View key={r.id}>
          {i > 0 ? <Divider style={{ marginVertical: spacing.sm }} /> : null}
          <Txt variant="body" style={{ fontWeight: '600' }} numberOfLines={1}>
            {r.title}
          </Txt>
          <Txt variant="muted">
            {r.organizer || 'Organisateur'} · {fcfa(r.commission)}
            {r.clubName ? ` · ${r.clubName}` : ''} · {dateKeyLabel(r.dateKey)}
          </Txt>
          {r.reason ? (
            <Txt variant="small" color={colors.textFaint}>
              Motif : {r.reason}
            </Txt>
          ) : null}
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
            {r.organizerPhone ? (
              <Button
                size="sm"
                label="Contacter (WhatsApp)"
                icon="logo-whatsapp"
                variant="secondary"
                onPress={() =>
                  r.organizerPhone
                    ? openWhatsApp(
                        r.organizerPhone,
                        `Bonjour ${r.organizer}, ton tournoi « ${r.title} » sur PadelConnect a été annulé : nous te remboursons les ${fcfa(r.commission)} de frais par Wave.`,
                      )
                    : undefined
                }
              />
            ) : null}
            <View style={{ flex: 1 }}>
              <Button
                size="sm"
                label={busy === r.id ? '…' : 'Remboursé ✓'}
                icon="checkmark"
                onPress={() => void refund(r)}
                disabled={busy !== null}
                accessibilityLabel={`Remboursé — ${r.title}`}
                full
              />
            </View>
          </View>
        </View>
      ))}
    </Card>
  );
}

// PadelConnect — Edge Function « notify-club » (Supabase Functions, runtime Deno).
// Déclenchée par un Database Webhook sur INSERT dans public.reservations : elle envoie une
// notification push au GÉRANT du club concerné (et, en option, une notif sociale à l'auteur
// quand un invité accepte). L'envoi passe par l'API Push d'Expo (pas besoin de gérer APNs
// soi-même : Expo route vers Apple/Google).
//
// Déploiement : voir docs/PUSH-SETUP.md. Aucune clé secrète ici — on lit les jetons en base
// via la SERVICE ROLE (injectée par Supabase dans les variables d'environnement de la fonction).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH = 'https://exp.host/--/api/v2/push/send';

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    // Webhook Supabase : { type, table, record, old_record }
    const record = payload.record ?? {};
    const table = payload.table ?? '';

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, // accès complet, réservé au serveur
    );

    // Cible + message selon la table à l'origine du webhook.
    let targets: string[] = [];
    let title = '';
    let body = '';

    if (table === 'reservations') {
      // Nouvelle réservation → prévenir le(s) gérant(s) du club.
      const clubId = record.club_id;
      const { data: managers } = await supabase
        .from('profiles')
        .select('expo_push_token')
        .eq('managed_club_id', clubId)
        .not('expo_push_token', 'is', null);
      targets = (managers ?? []).map((m: { expo_push_token: string }) => m.expo_push_token).filter(Boolean);
      title = 'Nouvelle réservation 🎾';
      body = `${record.booked_by_name ?? 'Un joueur'} — ${record.date_label ?? ''} à ${record.time ?? ''} (${record.court ?? ''}).`;
    } else if (table === 'reservation_participants' && record.status === 'accepted') {
      // Un invité a accepté → prévenir l'AUTEUR de la réservation (notif sociale).
      const { data: resa } = await supabase
        .from('reservations')
        .select('user_id')
        .eq('id', record.reservation_id)
        .maybeSingle();
      if (resa?.user_id) {
        const { data: owner } = await supabase
          .from('profiles')
          .select('expo_push_token')
          .eq('id', resa.user_id)
          .maybeSingle();
        if (owner?.expo_push_token) targets = [owner.expo_push_token];
      }
      title = 'Invitation acceptée ✅';
      body = 'Un ami a accepté de jouer avec toi.';
    }

    if (targets.length === 0) return new Response('no targets', { status: 200 });

    const messages = targets.map((to) => ({ to, title, body, sound: 'default' }));
    await fetch(EXPO_PUSH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });

    return new Response('ok', { status: 200 });
  } catch (e) {
    return new Response(`error: ${e}`, { status: 500 });
  }
});

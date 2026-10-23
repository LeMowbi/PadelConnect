import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { dayKey, msUntilNextUtcMidnight } from './days';

// Clé du jour d’Abidjan (AAAA-MM-JJ), RÉACTIVE : recalculée à chaque retour au premier plan ET
// au passage de minuit (R-69). À mettre en dépendance des listes de jours (`nextDays`) : un écran
// laissé monté pendant la nuit voyait sinon sa pastille « Aujourd’hui » rester collée à la VEILLE
// au réveil (créneaux tous filtrés comme passés → journée à tort « terminée », 7ᵉ jour réel
// absent) — et un onglet web (Espace Club) resté OUVERT ne repasse jamais par le premier plan.
export function useTodayKey(): string {
  const [key, setKey] = useState(() => dayKey(new Date()));
  useEffect(() => {
    // setState dans un callback (minuterie / événement), jamais dans le corps de l'effet — règle
    // React Compiler respectée ; même valeur → pas de re-rendu.
    const refresh = () =>
      setKey((cur) => {
        const next = dayKey(new Date());
        return next === cur ? cur : next;
      });
    // Minuterie jusqu'au prochain minuit d'Abidjan (+1 s), ré-armée à chaque réveil.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        refresh();
        arm();
      }, msUntilNextUtcMidnight(Date.now()));
    };
    arm();
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') return;
      refresh();
      arm(); // l'OS a pu geler la minuterie en arrière-plan : on la recale sur l'heure réelle
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, []);
  return key;
}

// Moyens de paiement proposés (Côte d'Ivoire) : Wave et espèces uniquement.
// Paiement SIMULÉ dans le prototype — à brancher plus tard sur Wave (et un agrégateur).

import type { IconName } from '@/components/ui';

export type PaymentMethod = {
  id: string;
  label: string;
  hint: string;
  icon: IconName;
  accent: string;
};

export const paymentMethods: PaymentMethod[] = [
  { id: 'wave', label: 'Wave', hint: 'Mobile money', icon: 'phone-portrait', accent: '#1DC4FF' },
  { id: 'espece', label: 'Payer au club', hint: 'Espèces sur place', icon: 'cash', accent: '#1FB57A' },
];

export function paymentLabel(id: string | null): string {
  return paymentMethods.find((m) => m.id === id)?.label ?? '—';
}

// Constantes PARTAGÉES de l'Espace Club — dédupliquées (CLAUDE.md §3, « pas de doublons inutiles »).
// Elles vivaient à l'identique dans plusieurs écrans/composants (club-admin/index, QuickBlock,
// ClubInfoCard) ; on les centralise ici pour qu'un ajout de motif ou de type ne se fasse qu'à un
// seul endroit.

import { type Club } from '@/data/clubs';

// Motifs de blocage d'un créneau hors app (bottom sheet de détail créneau + « Bloquer un créneau »).
export const BLOCK_REASONS = ['Résa téléphone/WhatsApp', 'Entretien', 'Privatisé', 'Autre'];

// Types de club proposés à la saisie des infos club.
export const CLUB_TYPES: Club['type'][] = ['Couvert', 'Extérieur', 'Mixte'];

// Constantes PARTAGÉES autour des clubs — dédupliquées (CLAUDE.md §3, « pas de doublons inutiles »).
// Elles vivaient à l'identique dans plusieurs écrans/composants (Espace Club : club-admin/index,
// QuickBlock, ClubInfoCard ; inscription : inscrire-club, onboarding ; filtre joueur : clubs/index) ;
// on les centralise ici pour qu'un ajout de motif ou de type ne se fasse qu'à un seul endroit.
// (data/clubs.ts garde sa propre garde de parsing : l'importer d'ici créerait un cycle de modules.)

import { type Club } from '@/data/clubs';

// Motifs de blocage d'un créneau hors app (bottom sheet de détail créneau + « Bloquer un créneau »).
export const BLOCK_REASONS = ['Résa téléphone/WhatsApp', 'Entretien', 'Privatisé', 'Autre'];

// Types de club (valeurs du modèle Club) : saisie des infos club, inscription, filtre joueur.
export const CLUB_TYPES: Club['type'][] = ['Couvert', 'Extérieur', 'Mixte'];

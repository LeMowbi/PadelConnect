// Coordonnées de contact de PadelConnect (l'opérateur = Moustapha).
// 👉 Renseigne ici TON numéro WhatsApp au format international SANS « + » ni espaces
//    (ex. Côte d'Ivoire : 225XXXXXXXXXX). Laisse vide tant que tu ne veux pas l'exposer :
//    le bouton « Contacter PadelConnect » disparaît alors et seul l'envoi de demande
//    (via le serveur) reste proposé.
export const OPERATOR_WHATSAPP = '';

export const hasOperatorContact = OPERATOR_WHATSAPP.replace(/\D/g, '').length >= 8;

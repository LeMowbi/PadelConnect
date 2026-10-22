// Pile des SURFACES qui peuvent dessiner le toast (pur, testé : tests/toastStack.test.ts).
// Une feuille modale (BottomSheet, BookingSheet, BookingConfirmation) s'affiche dans sa propre
// fenêtre native, AU-DESSUS du toast racine : un message montré pendant qu'elle est ouverte
// restait invisible. Chaque feuille ouverte s'enregistre ici (identifiant stable `useId`) ; seule
// la plus HAUTE — la dernière enregistrée encore active — dessine le message, la racine
// reprenant la main quand la pile est vide.

/** Enregistre une surface en tête de pile ; idempotent (effet rejoué en mode strict). */
export function pushSurface(stack: readonly string[], id: string): readonly string[] {
  return stack.includes(id) ? stack : [...stack, id];
}

/** Retire une surface (fermeture commencée ou démontage), où qu'elle soit dans la pile. */
export function removeSurface(stack: readonly string[], id: string): readonly string[] {
  return stack.includes(id) ? stack.filter((x) => x !== id) : stack;
}

/** Surface qui dessine le message ; `null` = la racine (aucune feuille ouverte). */
export function topSurface(stack: readonly string[]): string | null {
  return stack.length > 0 ? stack[stack.length - 1] : null;
}

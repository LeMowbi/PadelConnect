// Les tests de logique s'exécutent sous Node (node --experimental-strip-types). On déclare le
// minimum de l'API `process` qu'ils utilisent (exit / exitCode) pour le type-check DÉDIÉ aux tests
// (tsconfig.tests.json), sans charger tout @types/node dans le type-check de l'app. Ce fichier vit
// sous tests/ (exclu du tsconfig principal) → aucun risque de conflit avec les types de l'app.
declare const process: {
  exitCode?: number;
  exit(code?: number): never;
};

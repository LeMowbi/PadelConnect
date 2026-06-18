import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';
import { colors } from '@/theme';

// Document HTML racine de la version web (démo). Définit le titre, la description et le viewport.
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="fr">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <title>PadelConnect — Réserver un terrain de padel à Abidjan</title>
        <meta
          name="description"
          content="PadelConnect — l'app qui réunit tous les clubs de padel d'Abidjan : réserve un terrain, trouve des partenaires, joue des tournois."
        />
        <meta name="theme-color" content={colors.signature} />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: `#root,body,html{background:${colors.bg}}` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

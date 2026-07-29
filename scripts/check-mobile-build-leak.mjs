#!/usr/bin/env node
/**
 * Vérifie que le mode SPA mobile ne s'active pas sur un build web.
 *
 * Le build de production doit rester en SSR. Si `MOBILE_BUILD=1` fuitait dans
 * l'environnement de build web — variable héritée d'un shell, d'un secret CI mal
 * nommé, d'un Dockerfile — le Worker servirait un shell statique à la place du
 * rendu serveur, sans que rien n'échoue bruyamment.
 *
 * PORTÉE RÉELLE — à ne pas surestimer : la production est déployée par Lovable,
 * hors GitHub Actions. Ce script ne s'exécute donc PAS sur le chemin de
 * déploiement réel ; il ne protège que les builds locaux et la CI, où il sert
 * surtout de documentation exécutable.
 *
 * La seule garantie qui compte reste que l'environnement de build de Lovable ne
 * définisse jamais `MOBILE_BUILD`. Si Lovable expose un hook de pre-build, c'est
 * là qu'il faut brancher ce script pour qu'il ait une valeur de garde-fou.
 */

const value = process.env.MOBILE_BUILD;

if (value !== undefined && value !== "" && value !== "0") {
  console.error(
    [
      "",
      "  ✗ MOBILE_BUILD est défini alors qu'un build web est attendu.",
      `    Valeur trouvée : ${JSON.stringify(value)}`,
      "",
      "    Le mode SPA basculerait le build en shell statique et supprimerait",
      "    le rendu serveur en production.",
      "",
      "    Pour un build mobile volontaire, utiliser `bun run build:mobile`.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

console.log("✓ MOBILE_BUILD absent — le build web reste en SSR.");

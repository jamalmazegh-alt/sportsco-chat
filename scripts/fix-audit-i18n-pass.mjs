#!/usr/bin/env node
/**
 * Audit fix pass: ghost keys + leftover FR tournaments + obvious EN residuals.
 */
import fs from "node:fs";

const LOCALES = ["fr", "en", "de", "es", "it", "nl", "pt"];

function deepSet(obj, dotted, value) {
  const parts = dotted.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cur[parts[i]] || typeof cur[parts[i]] !== "object" || Array.isArray(cur[parts[i]])) {
      cur[parts[i]] = {};
    }
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

function load(ns, loc) {
  return JSON.parse(fs.readFileSync(`src/locales/${loc}/${ns}.json`, "utf8"));
}
function save(ns, loc, data) {
  fs.writeFileSync(`src/locales/${loc}/${ns}.json`, JSON.stringify(data, null, 2) + "\n");
}

function apply(ns, map) {
  let n = 0;
  for (const loc of LOCALES) {
    const data = load(ns, loc);
    for (const [key, byLoc] of Object.entries(map)) {
      if (typeof byLoc[loc] !== "string") throw new Error(`Missing ${loc} for ${ns}.${key}`);
      deepSet(data, key, byLoc[loc]);
      n++;
    }
    save(ns, loc, data);
  }
  console.log(`✓ ${ns}: ${n} leaves`);
}

// 1) Ghost marketing keys
apply("marketing", {
  "features.learnMore": {
    fr: "En savoir plus",
    en: "Learn more",
    de: "Mehr erfahren",
    es: "Saber más",
    it: "Scopri di più",
    nl: "Meer informatie",
    pt: "Saber mais",
  },
  "features.modulesCount": {
    fr: "modules",
    en: "modules",
    de: "Module",
    es: "módulos",
    it: "moduli",
    nl: "modules",
    pt: "módulos",
  },
  "features.includedV1": {
    fr: "Inclus dans V1",
    en: "Included in V1",
    de: "In V1 enthalten",
    es: "Incluido en V1",
    it: "Incluso in V1",
    nl: "Inbegrepen in V1",
    pt: "Incluído na V1",
  },
  "home.v2.social.soonBadge": {
    fr: "Bientôt",
    en: "Coming soon",
    de: "Demnächst",
    es: "Próximamente",
    it: "Presto",
    nl: "Binnenkort",
    pt: "Em breve",
  },
  "home.v2.social.soonNote": {
    fr: "Fonctionnalités sociales en cours de déploiement.",
    en: "Social features are rolling out soon.",
    de: "Soziale Funktionen werden bald eingeführt.",
    es: "Las funciones sociales se desplegarán pronto.",
    it: "Le funzionalità social saranno disponibili a breve.",
    nl: "Sociale functies worden binnenkort uitgerold.",
    pt: "As funcionalidades sociais serão disponibilizadas em breve.",
  },
});

// 2) Ghost auth keys (code uses auth.*, errors.* already exist)
apply("common", {
  "auth.inviteExpired": {
    fr: "Cette invitation a expiré.",
    en: "This invitation has expired.",
    de: "Diese Einladung ist abgelaufen.",
    es: "Esta invitación ha caducado.",
    it: "Questo invito è scaduto.",
    nl: "Deze uitnodiging is verlopen.",
    pt: "Este convite expirou.",
  },
  "auth.inviteUsed": {
    fr: "Cette invitation a déjà été utilisée.",
    en: "This invitation has already been used.",
    de: "Diese Einladung wurde bereits verwendet.",
    es: "Esta invitación ya ha sido utilizada.",
    it: "Questo invito è già stato utilizzato.",
    nl: "Deze uitnodiging is al gebruikt.",
    pt: "Este convite já foi utilizado.",
  },
  "wall.postDeleted": {
    fr: "Publication supprimée",
    en: "Post deleted",
    de: "Beitrag gelöscht",
    es: "Publicación eliminada",
    it: "Post eliminato",
    nl: "Bericht verwijderd",
    pt: "Publicação eliminada",
  },
  "wall.commentDeleted": {
    fr: "Commentaire supprimé",
    en: "Comment deleted",
    de: "Kommentar gelöscht",
    es: "Comentario eliminado",
    it: "Commento eliminato",
    nl: "Reactie verwijderd",
    pt: "Comentário eliminado",
  },
  "nav.signup": {
    fr: "S'inscrire",
    en: "Sign up",
    de: "Registrieren",
    es: "Registrarse",
    it: "Registrati",
    nl: "Registreren",
    pt: "Registar",
  },
  "common.moreActions": {
    fr: "Plus d'actions",
    en: "More actions",
    de: "Weitere Aktionen",
    es: "Más acciones",
    it: "Altre azioni",
    nl: "Meer acties",
    pt: "Mais ações",
  },
  "search.placeholder": {
    fr: "Rechercher joueurs, équipes, événements…",
    en: "Search players, teams, events…",
    de: "Spieler, Teams, Ereignisse suchen…",
    es: "Buscar jugadores, equipos, eventos…",
    it: "Cerca giocatori, squadre, eventi…",
    nl: "Zoek spelers, teams, evenementen…",
    pt: "Pesquisar jogadores, equipas, eventos…",
  },
  "search.empty": {
    fr: "Aucun résultat.",
    en: "No results.",
    de: "Keine Ergebnisse.",
    es: "Sin resultados.",
    it: "Nessun risultato.",
    nl: "Geen resultaten.",
    pt: "Sem resultados.",
  },
  "search.open": {
    fr: "Recherche",
    en: "Search",
    de: "Suche",
    es: "Buscar",
    it: "Cerca",
    nl: "Zoeken",
    pt: "Pesquisar",
  },
});

// 3) Remaining tournament FR clones + typo
apply("tournaments", {
  "cockpit.averageDelay": {
    fr: "Retard moyen {{minutes}} min",
    en: "Average delay {{minutes}} min",
    de: "Durchschnittliche Verspätung {{minutes}} Min.",
    es: "Retraso medio {{minutes}} min",
    it: "Ritardo medio {{minutes}} min",
    nl: "Gemiddelde vertraging {{minutes}} min",
    pt: "Atraso médio {{minutes}} min",
  },
  "createChooser.quickTitle": {
    fr: "Mode rapide",
    en: "Quick mode",
    de: "Schnellmodus",
    es: "Modo rápido",
    it: "Modalità rapida",
    nl: "Snelle modus",
    pt: "Modo rápido",
  },
  "simulator.title": {
    fr: "Simulateur de tournoi",
    en: "Tournament simulator",
    de: "Turniersimulator",
    es: "Simulador de torneo",
    it: "Simulatore di torneo",
    nl: "Toernooisimulator",
    pt: "Simulador de torneio",
  },
  "simulator.margin": {
    fr: "Marge avant 18h",
    en: "Buffer before 6 PM",
    de: "Puffer vor 18 Uhr",
    es: "Margen antes de las 18:00",
    it: "Margine prima delle 18:00",
    nl: "Marge vóór 18:00",
    pt: "Margem antes das 18:00",
  },
  "rulesAi.generate": {
    fr: "Générer un règlement avec l'IA",
    en: "Generate rules with AI",
    de: "Reglement mit KI generieren",
    es: "Generar reglamento con IA",
    it: "Genera regolamento con l'IA",
    nl: "Reglement genereren met AI",
    pt: "Gerar regulamento com IA",
  },
  "rulesAi.modalDescription": {
    fr: "Prévisualise, puis insère ou régénère. Tu pourras toujours le modifier ensuite.",
    en: "Preview, then insert or regenerate. You can still edit it afterwards.",
    de: "Vorschau anzeigen, dann einfügen oder neu generieren. Du kannst es danach noch bearbeiten.",
    es: "Previsualiza, luego inserta o regenera. Podrás editarlo después.",
    it: "Anteprima, poi inserisci o rigenera. Potrai sempre modificarlo dopo.",
    nl: "Bekijk een voorbeeld, voeg in of genereer opnieuw. Je kunt het daarna nog bewerken.",
    pt: "Pré-visualize, depois inserir ou gerar novamente. Ainda poderá editar depois.",
  },
  "rulesAi.close": {
    fr: "Fermer",
    en: "Close",
    de: "Schließen",
    es: "Cerrar",
    it: "Chiudi",
    nl: "Sluiten",
    pt: "Fechar",
  },
  "rulesAi.rateLimited": {
    fr: "Limite quotidienne atteinte (5 générations / jour). Voici un modèle de base.",
    en: "Daily limit reached (5 generations / day). Here's a basic template.",
    de: "Tageslimit erreicht (5 Generierungen / Tag). Hier ist eine Basisvorlage.",
    es: "Límite diario alcanzado (5 generaciones / día). Aquí tienes un modelo básico.",
    it: "Limite giornaliero raggiunto (5 generazioni / giorno). Ecco un modello di base.",
    nl: "Daglimiet bereikt (5 generaties / dag). Hier is een basissjabloon.",
    pt: "Limite diário atingido (5 gerações / dia). Eis um modelo básico.",
  },
});

// 4) buildClubero empty subtitle — give a short helper string
apply("buildClubero", {
  "questions.currenttool.subtitle": {
    fr: "WhatsApp, Excel, autre logiciel…",
    en: "WhatsApp, Excel, another tool…",
    de: "WhatsApp, Excel, anderes Tool…",
    es: "WhatsApp, Excel, otra herramienta…",
    it: "WhatsApp, Excel, un altro strumento…",
    nl: "WhatsApp, Excel, een andere tool…",
    pt: "WhatsApp, Excel, outra ferramenta…",
  },
});

console.log("Done audit pass.");

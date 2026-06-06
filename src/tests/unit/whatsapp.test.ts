import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildConvocationMessage,
  buildCancellationMessage,
  buildRescheduleMessage,
  buildReminderMessage,
  waShareUrl,
  normalizeGroupUrl,
} from "@/lib/whatsapp";

// Mock i18n to avoid module resolution issues in test env
vi.mock("@/lib/i18n", () => ({
  default: { language: "fr" },
}));

const MATCH_FR = {
  locale: "fr" as const,
  clubName: "AS Monaco",
  teamName: "U17",
  type: "match",
  title: "U17 vs PSG",
  opponent: "PSG",
  isHome: true,
  competitionLabel: "Championnat National",
  startsAt: "2026-06-15T14:30:00.000Z",
  endsAt: "2026-06-15T16:30:00.000Z",
  convocationTime: "2026-06-15T13:30:00.000Z",
  location: "Stade Louis II",
  locationUrl: "https://maps.google.com/?q=Stade+Louis+II",
  meetingPoint: "Entrée principale",
  description: "Match de championnat important",
  selectedPlayers: ["Jean Dupont", "Pierre Martin", "Ali Hassan"],
};

const MATCH_EN = {
  ...MATCH_FR,
  locale: "en" as const,
  isHome: false,
};

const TRAINING_FR = {
  locale: "fr" as const,
  teamName: "U17",
  type: "training",
  title: "Entraînement tactique",
  startsAt: "2026-06-10T18:00:00.000Z",
  location: "Terrain annexe",
};

describe("buildConvocationMessage — FR", () => {
  it("contient le nom de l'équipe et l'adversaire pour un match", () => {
    const msg = buildConvocationMessage(MATCH_FR);
    expect(msg).toContain("U17");
    expect(msg).toContain("PSG");
  });

  it("affiche l'emoji match pour un match", () => {
    const msg = buildConvocationMessage(MATCH_FR);
    expect(msg).toContain("⚽");
  });

  it("affiche Domicile pour isHome=true en FR", () => {
    const msg = buildConvocationMessage(MATCH_FR);
    expect(msg).toContain("Domicile");
    expect(msg).not.toContain("Extérieur");
  });

  it("affiche la compétition", () => {
    const msg = buildConvocationMessage(MATCH_FR);
    expect(msg).toContain("Championnat National");
  });

  it("affiche le lieu et les liens de navigation", () => {
    const msg = buildConvocationMessage(MATCH_FR);
    expect(msg).toContain("Stade Louis II");
    expect(msg).toContain("maps.google.com");
    expect(msg).toContain("waze.com");
  });

  it("utilise locationUrl fourni plutôt que de le construire", () => {
    const msg = buildConvocationMessage(MATCH_FR);
    expect(msg).toContain("https://maps.google.com/?q=Stade+Louis+II");
  });

  it("affiche le point de rendez-vous", () => {
    const msg = buildConvocationMessage(MATCH_FR);
    expect(msg).toContain("Entrée principale");
  });

  it("affiche la liste des joueurs convoqués avec le bon count", () => {
    const msg = buildConvocationMessage(MATCH_FR);
    expect(msg).toContain("Convoqués (3)");
    expect(msg).toContain("Jean Dupont");
    expect(msg).toContain("Pierre Martin");
    expect(msg).toContain("Ali Hassan");
  });

  it("affiche la description", () => {
    const msg = buildConvocationMessage(MATCH_FR);
    expect(msg).toContain("Match de championnat important");
  });

  it("affiche le club et l'équipe", () => {
    const msg = buildConvocationMessage(MATCH_FR);
    expect(msg).toContain("AS Monaco");
    expect(msg).toContain("U17");
  });

  it("termine par la signature Clubero", () => {
    const msg = buildConvocationMessage(MATCH_FR);
    expect(msg).toContain("envoyé via Clubero");
  });

  it("affiche l'heure de convocation", () => {
    const msg = buildConvocationMessage(MATCH_FR);
    expect(msg).toContain("Convocation");
    expect(msg).toContain("h");
  });

  it("affiche la composition si fournie", () => {
    const withLineup = {
      ...MATCH_FR,
      lineup: {
        formation: "4-3-3",
        starting: [
          { name: "Mbappé", jersey: 7, role: "FWD", isCaptain: true },
          { name: "Hakimi", jersey: 2, role: "DEF", isGK: false },
        ],
        bench: [{ name: "Diallo", jersey: 12 }],
      },
    };
    const msg = buildConvocationMessage(withLineup);
    expect(msg).toContain("Composition prévue");
    expect(msg).toContain("4-3-3");
    expect(msg).toContain("Mbappé");
    expect(msg).toContain("(C)");
    expect(msg).toContain("#7");
    expect(msg).toContain("Remplaçants");
    expect(msg).toContain("Diallo");
  });

  it("affiche les pièces jointes si présentes", () => {
    const withAttachments = {
      ...MATCH_FR,
      attachments: [
        { name: "Feuille de match", url: "https://example.com/feuille.pdf" },
        { name: "Plan tactique", url: "https://example.com/plan.png" },
      ],
    };
    const msg = buildConvocationMessage(withAttachments);
    expect(msg).toContain("Documents");
    expect(msg).toContain("Feuille de match");
    expect(msg).toContain("https://example.com/feuille.pdf");
  });

  it("ne plante pas avec un input minimal", () => {
    const minimal = { locale: "fr" as const, title: "Entraînement" };
    const msg = buildConvocationMessage(minimal);
    expect(msg).toContain("Entraînement");
    expect(msg).toContain("Clubero");
  });

  it("affiche l'entraînement sans adversaire", () => {
    const msg = buildConvocationMessage(TRAINING_FR);
    expect(msg).toContain("🏋️");
    expect(msg).toContain("Entraînement tactique");
    expect(msg).not.toContain("vs");
  });

  it("n'affiche pas les blocs vides quand aucun joueur", () => {
    const noPlayers = { ...MATCH_FR, selectedPlayers: [] };
    const msg = buildConvocationMessage(noPlayers);
    expect(msg).not.toContain("Convoqués");
  });
});

describe("buildConvocationMessage — EN", () => {
  it("affiche Away pour isHome=false en EN", () => {
    const msg = buildConvocationMessage(MATCH_EN);
    expect(msg).toContain("Away");
    expect(msg).not.toContain("Home");
  });

  it("affiche Squad en anglais", () => {
    const msg = buildConvocationMessage(MATCH_EN);
    expect(msg).toContain("Squad");
  });

  it("termine par la signature anglaise", () => {
    const msg = buildConvocationMessage(MATCH_EN);
    expect(msg).toContain("sent via Clubero");
    expect(msg).not.toContain("envoyé");
  });

  it("affiche Meeting time en anglais", () => {
    const msg = buildConvocationMessage(MATCH_EN);
    expect(msg).toContain("Meeting time");
  });

  it("affiche la composition en anglais", () => {
    const withLineup = {
      ...MATCH_EN,
      lineup: {
        formation: "4-4-2",
        starting: [{ name: "Rashford", jersey: 10, isGK: false, isCaptain: false }],
        bench: [],
      },
    };
    const msg = buildConvocationMessage(withLineup);
    expect(msg).toContain("Planned line-up");
    expect(msg).toContain("Starting XI");
  });
});

describe("buildCancellationMessage", () => {
  it("affiche le titre annulé en FR", () => {
    const msg = buildCancellationMessage({
      locale: "fr",
      title: "Match vs PSG",
      startsAt: "2026-06-15T14:30:00.000Z",
      cancellationReason: "Terrain indisponible",
      clubName: "AS Monaco",
    });
    expect(msg).toContain("Annulé");
    expect(msg).toContain("Match vs PSG");
    expect(msg).toContain("Terrain indisponible");
    expect(msg).toContain("Motif");
    expect(msg).toContain("AS Monaco");
    expect(msg).toContain("❌");
  });

  it("affiche le titre annulé en EN", () => {
    const msg = buildCancellationMessage({
      locale: "en",
      title: "Match vs PSG",
      cancellationReason: "Pitch unavailable",
    });
    expect(msg).toContain("Cancelled");
    expect(msg).toContain("Reason");
    expect(msg).toContain("sent via Clubero");
  });

  it("fonctionne sans raison d'annulation", () => {
    const msg = buildCancellationMessage({
      locale: "fr",
      title: "Entraînement",
    });
    expect(msg).toContain("Annulé");
    expect(msg).not.toContain("Motif");
  });
});

describe("buildRescheduleMessage", () => {
  it("affiche les deux dates en FR", () => {
    const msg = buildRescheduleMessage({
      locale: "fr",
      title: "Match vs Lyon",
      previousStart: "2026-06-15T14:30:00.000Z",
      startsAt: "2026-06-22T14:30:00.000Z",
      location: "Stade Gerland",
    });
    expect(msg).toContain("Reporté");
    expect(msg).toContain("Match vs Lyon");
    expect(msg).toContain("Ancienne date");
    expect(msg).toContain("Nouvelle date");
    expect(msg).toContain("Stade Gerland");
    expect(msg).toContain("🔁");
  });

  it("affiche les deux dates en EN", () => {
    const msg = buildRescheduleMessage({
      locale: "en",
      title: "Match vs Lyon",
      previousStart: "2026-06-15T14:30:00.000Z",
      startsAt: "2026-06-22T14:30:00.000Z",
    });
    expect(msg).toContain("Rescheduled");
    expect(msg).toContain("Previous date");
    expect(msg).toContain("New date");
  });
});

describe("buildReminderMessage", () => {
  it("affiche les répondants en FR", () => {
    const msg = buildReminderMessage({
      locale: "fr",
      title: "Match vs Nice",
      startsAt: "2026-06-15T14:30:00.000Z",
      respondents: {
        present: ["Dupont", "Martin"],
        absent: ["Hassan"],
        uncertain: ["Diallo"],
        pending: ["Gomez", "Lee"],
      },
    });
    expect(msg).toContain("Rappel");
    expect(msg).toContain("Réponses");
    expect(msg).toContain("Présents (2)");
    expect(msg).toContain("Absents (1)");
    expect(msg).toContain("Incertains (1)");
    expect(msg).toContain("Pas encore répondu (2)");
    expect(msg).toContain("Gomez");
    expect(msg).toContain("Merci de confirmer");
    expect(msg).toContain("🔔");
  });

  it("affiche les répondants en EN", () => {
    const msg = buildReminderMessage({
      locale: "en",
      title: "Training",
      respondents: {
        present: ["Smith"],
        absent: [],
        uncertain: [],
        pending: ["Jones"],
      },
    });
    expect(msg).toContain("Reminder");
    expect(msg).toContain("Responses");
    expect(msg).toContain("Present (1)");
    expect(msg).toContain("Not yet responded (1)");
    expect(msg).toContain("Please confirm");
  });

  it("affiche juste le merci quand pas de répondants", () => {
    const msg = buildReminderMessage({
      locale: "fr",
      title: "Entraînement",
    });
    expect(msg).toContain("Merci de confirmer");
    expect(msg).not.toContain("Réponses");
  });

  it("n'affiche pas les sections vides de répondants", () => {
    const msg = buildReminderMessage({
      locale: "fr",
      title: "Match",
      respondents: {
        present: ["Dupont"],
        absent: [],
        uncertain: [],
        pending: [],
      },
    });
    expect(msg).toContain("Présents (1)");
    expect(msg).not.toContain("Absents");
    expect(msg).not.toContain("Incertains");
    expect(msg).not.toContain("Pas encore répondu");
  });
});

describe("waShareUrl", () => {
  it("génère une URL wa.me valide", () => {
    const url = waShareUrl("Hello world");
    expect(url).toMatch(/^https:\/\/wa\.me\/\?text=/);
    expect(url).toContain(encodeURIComponent("Hello world"));
  });

  it("encode correctement les caractères spéciaux", () => {
    const msg = "Bonjour & résumé # test";
    const url = waShareUrl(msg);
    expect(url).not.toContain("&résumé");
    expect(url).toContain(encodeURIComponent(msg));
  });
});

describe("normalizeGroupUrl", () => {
  it("retourne null si vide", () => {
    expect(normalizeGroupUrl(null)).toBeNull();
    expect(normalizeGroupUrl(undefined)).toBeNull();
    expect(normalizeGroupUrl("")).toBeNull();
    expect(normalizeGroupUrl("   ")).toBeNull();
  });

  it("laisse passer les URLs https complètes", () => {
    const url = "https://chat.whatsapp.com/ABC123";
    expect(normalizeGroupUrl(url)).toBe(url);
  });

  it("préfixe les raccourcis chat.whatsapp.com", () => {
    expect(normalizeGroupUrl("chat.whatsapp.com/ABC123")).toBe(
      "https://chat.whatsapp.com/ABC123"
    );
  });

  it("laisse passer les autres valeurs telles quelles", () => {
    expect(normalizeGroupUrl("https://example.com")).toBe("https://example.com");
  });
});

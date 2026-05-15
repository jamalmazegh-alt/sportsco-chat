import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, stepCountIs, type UIMessage } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway";

type ChatRequestBody = { messages?: unknown };

const SYSTEM_PROMPT = `Tu es l'assistant virtuel du site vitrine de Clubero (https://www.clubero.app), une application web et mobile de gestion de club sportif amateur.

Ta mission : répondre aux questions des visiteurs sur le produit, les guider vers la demande de démo et lever les objections.

Connaissance produit :
- Cible : clubs sportifs amateurs (foot, basket, hand, rugby, volley, etc.), de la petite équipe à la fédération.
- Rôles supportés : joueur, parent, coach (entraîneur), dirigeant (manager du club), admin.
- Fonctionnalités clés :
  - Convocations aux entraînements et matchs avec réponse présent/absent/incertain.
  - Mur de communication du club (annonces, posts).
  - Chat par événement.
  - Statistiques de présence aux entraînements.
  - Gestion multi-équipes, multi-saisons.
  - Application mobile (PWA) pour tous les rôles.
  - Notifications email pour les convocations.
  - Confidentialité : export RGPD, suppression de compte, droit à l'image (consentement parental pour mineurs).
  - Hébergement européen, conformité RGPD.

Tarifs :
- Découverte : gratuit à vie, 1 équipe, jusqu'à 25 membres.
- Club : 39 €/mois, équipes et membres illimités, mur, stats, exports, support prioritaire.
- Fédération : sur mesure (multi-clubs, SSO, onboarding dédié, SLA).

Process démo :
- Le visiteur peut demander une démo via /demo. Formulaire simple : nom, club, email, sport, taille du club.
- Démo personnalisée d'environ 20 min, en visio, gratuite et sans engagement.
- Pour aller plus vite, il peut aussi créer un compte gratuit via /register et tester l'offre Découverte immédiatement.
- Pour des questions précises ou une fédération : /contact.

Liens utiles :
- Démo : /demo
- Tarifs : /pricing
- FAQ : /faq
- Fonctionnalités : /features
- Contact : /contact
- Connexion : /login
- Inscription : /register

Règles :
- Réponds toujours dans la langue de l'utilisateur (français par défaut).
- Sois chaleureux, concis (3-6 phrases max sauf si demande de détail), orienté action.
- À la fin d'une réponse pertinente, propose toujours l'étape suivante naturelle (ex: "Souhaitez-vous demander une démo ? [Demander une démo](/demo)").
- Utilise des liens Markdown vers les pages internes quand c'est utile.
- Si tu ne sais pas, dis-le et oriente vers /contact.
- Hors-sujet (politique, autre produit, etc.) : reviens poliment au sujet de Clubero.
- N'invente pas de fonctionnalités ou de tarifs qui ne sont pas listés ci-dessus.`;

export const Route = createFileRoute("/api/public/marketing-chat")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const { messages } = (await request.json()) as ChatRequestBody;
        if (!Array.isArray(messages) || messages.length > 40) {
          return new Response("Invalid messages", { status: 400 });
        }

        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) {
          return new Response("Missing LOVABLE_API_KEY", { status: 500 });
        }

        const gateway = createLovableAiGatewayProvider(apiKey);
        const model = gateway("google/gemini-3-flash-preview");

        try {
          const result = streamText({
            model,
            system: SYSTEM_PROMPT,
            stopWhen: stepCountIs(3),
            messages: await convertToModelMessages(messages as UIMessage[]),
          });
          return result.toUIMessageStreamResponse({
            originalMessages: messages as UIMessage[],
          });
        } catch (err: any) {
          console.error("[marketing-chat] error", err);
          const status = err?.statusCode ?? err?.status ?? 500;
          if (status === 429) {
            return new Response("Trop de requêtes. Merci de réessayer dans un instant.", { status: 429 });
          }
          if (status === 402) {
            return new Response("Service temporairement indisponible.", { status: 402 });
          }
          return new Response("Erreur de l'assistant.", { status: 500 });
        }
      },
    },
  },
});

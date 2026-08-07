import { supabase } from "@/integrations/supabase/client";
import { apiUrl } from "@/lib/native-platform";

export interface SendTransactionalEmailParams {
  templateName: string;
  recipientEmail: string;
  idempotencyKey?: string;
  templateData?: Record<string, any>;
  fromName?: string;
  // Anti-doublon / traçabilité métier
  dispatchId?: string;
  eventId?: string;
  recipientId?: string;
  notificationType?: string;
}

export async function sendTransactionalEmail(params: SendTransactionalEmailParams) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");
  // `apiUrl` absolutise en natif : dans la WebView Capacitor, un chemin relatif
  // viserait le bundle embarqué et l'envoi échouerait silencieusement.
  const response = await fetch(apiUrl("/lovable/email/transactional/send"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      templateName: params.templateName,
      recipientEmail: params.recipientEmail,
      idempotencyKey: params.idempotencyKey,
      templateData: params.templateData,
      fromName: params.fromName,
      dispatchId: params.dispatchId,
      eventId: params.eventId,
      recipientId: params.recipientId,
      notificationType: params.notificationType,
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Email send failed: ${response.status} ${text}`);
  }
  return response.json();
}

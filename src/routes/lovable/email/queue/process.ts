import { sendLovableEmail } from "@lovable.dev/email-js";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";
import {
  getRetryAfterSeconds,
  isForbidden,
  isRateLimited,
  isTransientRunRecipientMismatch,
} from "@/lib/email/queue-error-classify";

const MAX_RETRIES = 5;
// recipient_mismatch has its own budget: transient burst-window collision on the
// provider's auto-created run. It must not eat the 5-attempt failure budget, but
// "never DLQ" is unsafe (would loop forever if the burst never disperses).
// Cap it at MAX_MISMATCH_ATTEMPTS deferrals, then DLQ.
const MAX_MISMATCH_ATTEMPTS = 8;
const MISMATCH_COOLDOWN_SECS = 45;
const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_SEND_DELAY_MS = 200;
const DEFAULT_AUTH_TTL_MINUTES = 15;
const DEFAULT_TRANSACTIONAL_TTL_MINUTES = 60;

// email_send_log.status is a free-form text column, so we use string literals.
const STATUS_MISMATCH_DEFERRED = "mismatch_deferred";

// Short build identifier written to every email_send_log row so we can prove
// which code version processed a given message when investigating deployment
// drift or stale workers.
const WORKER_BUILD: string =
  process.env.BUILD_SHA ??
  process.env.VITE_BUILD_SHA ??
  process.env.CF_PAGES_COMMIT_SHA ??
  process.env.CLOUDFLARE_DEPLOYMENT_ID ??
  "unknown";

type QueuePayload = {
  message_id?: string;
  to?: string;
  from?: string;
  sender_domain?: string;
  subject?: string;
  html?: string;
  text?: string;
  purpose?: string;
  label?: string;
  idempotency_key?: string;
  unsubscribe_token?: string;
  queued_at?: string;
  run_id?: string;
  dispatch_id?: string;
  event_id?: string;
  recipient_id?: string;
  notification_type?: string;
};

/**
 * Build the common metadata fields written to every email_send_log row.
 * Centralizes propagation of dispatch_id / event_id / recipient_id /
 * notification_type / worker_build from the queue payload to the log so no
 * insert site can forget them.
 */
function baseLogRow(payload: QueuePayload, queue: string) {
  return {
    message_id: payload.message_id,
    template_name: payload.label || queue,
    recipient_email: payload.to,
    dispatch_id: payload.dispatch_id ?? null,
    event_id: payload.event_id ?? null,
    recipient_id: payload.recipient_id ?? null,
    notification_type: payload.notification_type ?? null,
    worker_build: WORKER_BUILD,
  };
}

async function moveToDlq(
  supabase: SupabaseClient<any, any>,
  queue: string,
  msg: { msg_id: number; message: QueuePayload },
  reason: string,
): Promise<void> {
  const payload = msg.message;
  await supabase.from("email_send_log").insert({
    ...baseLogRow(payload, queue),
    status: "dlq",
    error_message: reason,
  });
  const { error } = await supabase.rpc("move_to_dlq", {
    source_queue: queue,
    dlq_name: `${queue}_dlq`,
    message_id: msg.msg_id,
    payload,
  });
  if (error) {
    console.error("email_queue.dlq_move_failed", {
      queue,
      msg_id: msg.msg_id,
      reason,
      error,
      worker_build: WORKER_BUILD,
    });
  }
}

export const Route = createFileRoute("/lovable/email/queue/process")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.LOVABLE_API_KEY;
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!apiKey || !supabaseUrl || !supabaseServiceKey) {
          console.error("email_queue.missing_env", { worker_build: WORKER_BUILD });
          return Response.json({ error: "Server configuration error" }, { status: 500 });
        }

        const authHeader = request.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const token = authHeader.slice("Bearer ".length).trim();
        if (token !== supabaseServiceKey) {
          return Response.json({ error: "Forbidden" }, { status: 403 });
        }

        const supabase: SupabaseClient<any, any> = createClient(supabaseUrl, supabaseServiceKey);

        // Read queue config + BOTH cooldown gates.
        //   - retry_after_until: provider-wide 429 (applies to both queues)
        //   - transactional_retry_after_until: transactional-queue-only backoff
        //     (recipient_mismatch bursts) so auth emails like password reset
        //     keep flowing while this queue backs off.
        // Per-queue batch_size / send_delay_ms overrides let us serialize the
        // transactional queue (Étape 6 of the anti-burst plan) without touching
        // auth queue throughput.
        const { data: state } = await supabase
          .from("email_send_state")
          .select(
            "retry_after_until, transactional_retry_after_until, batch_size, send_delay_ms, transactional_batch_size, transactional_send_delay_ms, auth_email_ttl_minutes, transactional_email_ttl_minutes",
          )
          .single();

        const now = new Date();
        const globalCooldownActive =
          state?.retry_after_until && new Date(state.retry_after_until) > now;
        const transactionalCooldownActive =
          state?.transactional_retry_after_until &&
          new Date(state.transactional_retry_after_until) > now;

        if (globalCooldownActive) {
          return Response.json({
            skipped: true,
            reason: "rate_limited",
            worker_build: WORKER_BUILD,
          });
        }

        const defaultBatchSize = state?.batch_size ?? DEFAULT_BATCH_SIZE;
        const defaultSendDelayMs = state?.send_delay_ms ?? DEFAULT_SEND_DELAY_MS;
        const paramsByQueue: Record<string, { batchSize: number; sendDelayMs: number }> = {
          auth_emails: {
            batchSize: defaultBatchSize,
            sendDelayMs: defaultSendDelayMs,
          },
          transactional_emails: {
            batchSize: state?.transactional_batch_size ?? defaultBatchSize,
            sendDelayMs: state?.transactional_send_delay_ms ?? defaultSendDelayMs,
          },
        };
        const ttlMinutes: Record<string, number> = {
          auth_emails: state?.auth_email_ttl_minutes ?? DEFAULT_AUTH_TTL_MINUTES,
          transactional_emails:
            state?.transactional_email_ttl_minutes ?? DEFAULT_TRANSACTIONAL_TTL_MINUTES,
        };

        let totalProcessed = 0;

        for (const queue of ["auth_emails", "transactional_emails"]) {
          if (queue === "transactional_emails" && transactionalCooldownActive) {
            continue;
          }

          const { batchSize, sendDelayMs } = paramsByQueue[queue];

          const { data: messages, error: readError } = await supabase.rpc("read_email_batch", {
            queue_name: queue,
            batch_size: batchSize,
            vt: 30,
          });

          if (readError) {
            console.error("email_queue.read_batch_failed", {
              queue,
              error: readError,
              worker_build: WORKER_BUILD,
            });
            continue;
          }

          if (!messages?.length) continue;

          // Retry budget is based on real send failures, not pgmq read_ct.
          const messageIds = Array.from(
            new Set(
              messages
                .map((msg: any) =>
                  msg?.message?.message_id && typeof msg.message.message_id === "string"
                    ? msg.message.message_id
                    : null,
                )
                .filter((id: string | null): id is string => Boolean(id)),
            ),
          );
          const failedAttemptsByMessageId = new Map<string, number>();
          const mismatchAttemptsByMessageId = new Map<string, number>();
          if (messageIds.length > 0) {
            const { data: attemptRows, error: attemptRowsError } = await supabase
              .from("email_send_log")
              .select("message_id, status")
              .in("message_id", messageIds)
              .in("status", ["failed", STATUS_MISMATCH_DEFERRED]);

            if (attemptRowsError) {
              console.error("email_queue.attempt_counter_load_failed", {
                queue,
                error: attemptRowsError,
                worker_build: WORKER_BUILD,
              });
            } else {
              for (const row of attemptRows ?? []) {
                const messageId = row?.message_id;
                if (typeof messageId !== "string" || !messageId) continue;
                if (row.status === STATUS_MISMATCH_DEFERRED) {
                  mismatchAttemptsByMessageId.set(
                    messageId,
                    (mismatchAttemptsByMessageId.get(messageId) ?? 0) + 1,
                  );
                } else {
                  failedAttemptsByMessageId.set(
                    messageId,
                    (failedAttemptsByMessageId.get(messageId) ?? 0) + 1,
                  );
                }
              }
            }
          }

          for (let i = 0; i < messages.length; i++) {
            const msg = messages[i] as { msg_id: number; message: QueuePayload; read_ct?: number; enqueued_at?: string };
            const payload = msg.message;
            const failedAttempts =
              payload?.message_id && typeof payload.message_id === "string"
                ? (failedAttemptsByMessageId.get(payload.message_id) ?? 0)
                : (msg.read_ct ?? 0);
            const mismatchAttempts =
              payload?.message_id && typeof payload.message_id === "string"
                ? (mismatchAttemptsByMessageId.get(payload.message_id) ?? 0)
                : 0;

            // Drop expired messages (TTL exceeded).
            const queuedAt = payload.queued_at ?? msg.enqueued_at;
            if (queuedAt) {
              const ageMs = Date.now() - new Date(queuedAt).getTime();
              const maxAgeMs = ttlMinutes[queue] * 60 * 1000;
              if (ageMs > maxAgeMs) {
                console.warn("email_queue.ttl_exceeded", {
                  queue,
                  msg_id: msg.msg_id,
                  queued_at: queuedAt,
                  ttl_minutes: ttlMinutes[queue],
                  worker_build: WORKER_BUILD,
                  dispatch_id: payload.dispatch_id,
                  event_id: payload.event_id,
                });
                await moveToDlq(
                  supabase,
                  queue,
                  msg,
                  `TTL exceeded (${ttlMinutes[queue]} minutes)`,
                );
                continue;
              }
            }

            if (failedAttempts >= MAX_RETRIES) {
              await moveToDlq(
                supabase,
                queue,
                msg,
                `Max retries (${MAX_RETRIES}) exceeded (attempted ${failedAttempts} times)`,
              );
              continue;
            }

            if (mismatchAttempts >= MAX_MISMATCH_ATTEMPTS) {
              await moveToDlq(
                supabase,
                queue,
                msg,
                `recipient_mismatch persisted after ${mismatchAttempts} cooldown cycles`,
              );
              continue;
            }

            // Duplicate protection #1: skip if this exact message_id already succeeded
            // (VT-expired race on the pgmq layer).
            if (payload.message_id) {
              const { data: alreadySent } = await supabase
                .from("email_send_log")
                .select("id")
                .eq("message_id", payload.message_id)
                .in("status", ["sent", "delivered"])
                .maybeSingle();

              if (alreadySent) {
                console.warn("email_queue.skip_already_sent", {
                  queue,
                  msg_id: msg.msg_id,
                  message_id: payload.message_id,
                  worker_build: WORKER_BUILD,
                });
                const { error: dupDelError } = await supabase.rpc("delete_email", {
                  queue_name: queue,
                  message_id: msg.msg_id,
                });
                if (dupDelError) {
                  console.error("email_queue.duplicate_delete_failed", {
                    queue,
                    msg_id: msg.msg_id,
                    error: dupDelError,
                    worker_build: WORKER_BUILD,
                  });
                }
                continue;
              }
            }

            // Duplicate protection #2: idempotence par (dispatch_id, recipient_id,
            // notification_type). Empêche un doublon lors d'un replay où le message_id
            // est différent mais où le destinataire a déjà été livré pour la même
            // notification métier. Best-effort côté worker; l'index unique en base est
            // le vrai garde-fou.
            if (
              payload.dispatch_id &&
              payload.recipient_id &&
              payload.notification_type
            ) {
              const { data: alreadyForDispatch } = await supabase
                .from("email_send_log")
                .select("id")
                .eq("dispatch_id", payload.dispatch_id)
                .eq("recipient_id", payload.recipient_id)
                .eq("notification_type", payload.notification_type)
                .in("status", ["sent", "delivered"])
                .maybeSingle();

              if (alreadyForDispatch) {
                console.warn("email_queue.skip_duplicate_dispatch", {
                  queue,
                  msg_id: msg.msg_id,
                  dispatch_id: payload.dispatch_id,
                  recipient_id: payload.recipient_id,
                  worker_build: WORKER_BUILD,
                });
                await supabase.from("email_send_log").insert({
                  ...baseLogRow(payload, queue),
                  status: "skipped_duplicate",
                  error_message:
                    "Recipient already delivered for this dispatch/notification_type",
                });
                const { error: dedupDelError } = await supabase.rpc("delete_email", {
                  queue_name: queue,
                  message_id: msg.msg_id,
                });
                if (dedupDelError) {
                  console.error("email_queue.duplicate_dispatch_delete_failed", {
                    queue,
                    msg_id: msg.msg_id,
                    error: dedupDelError,
                    worker_build: WORKER_BUILD,
                  });
                }
                continue;
              }
            }

            try {
              await sendLovableEmail(
                {
                  run_id: payload.run_id,
                  to: payload.to as string,
                  from: payload.from as string,
                  sender_domain: payload.sender_domain as string,
                  subject: payload.subject as string,
                  html: payload.html as string,
                  text: payload.text as string,
                  purpose: payload.purpose as string,
                  label: payload.label as string,
                  idempotency_key: payload.idempotency_key as string,
                  unsubscribe_token: payload.unsubscribe_token as string,
                  message_id: payload.message_id as string,
                },
                { apiKey, sendUrl: process.env.LOVABLE_SEND_URL },
              );

              // Log success. If the unique partial index fires (concurrent replay of
              // an already-delivered dispatch/recipient/notification_type), the insert
              // fails proprement — we log and continue without deleting the message so
              // it can be examined; but the standard case is a clean insert.
              const { error: insertSuccessError } = await supabase
                .from("email_send_log")
                .insert({
                  ...baseLogRow(payload, queue),
                  status: "sent",
                });

              if (insertSuccessError) {
                console.error("email_queue.insert_sent_failed", {
                  queue,
                  msg_id: msg.msg_id,
                  error: insertSuccessError,
                  worker_build: WORKER_BUILD,
                });
              }

              const { error: delError } = await supabase.rpc("delete_email", {
                queue_name: queue,
                message_id: msg.msg_id,
              });
              if (delError) {
                console.error("email_queue.delete_sent_failed", {
                  queue,
                  msg_id: msg.msg_id,
                  error: delError,
                  worker_build: WORKER_BUILD,
                });
              }
              totalProcessed++;
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : String(error);
              console.error("email_queue.send_failed", {
                queue,
                msg_id: msg.msg_id,
                read_ct: msg.read_ct,
                failed_attempts: failedAttempts,
                mismatch_attempts: mismatchAttempts,
                dispatch_id: payload.dispatch_id,
                event_id: payload.event_id,
                error: errorMsg,
                worker_build: WORKER_BUILD,
              });

              if (isRateLimited(error)) {
                await supabase.from("email_send_log").insert({
                  ...baseLogRow(payload, queue),
                  status: "failed",
                  error_message: errorMsg.slice(0, 1000),
                });

                const retryAfterSecs = getRetryAfterSeconds(error);
                await supabase
                  .from("email_send_state")
                  .update({
                    retry_after_until: new Date(Date.now() + retryAfterSecs * 1000).toISOString(),
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", 1);

                return Response.json({
                  processed: totalProcessed,
                  stopped: "rate_limited",
                  worker_build: WORKER_BUILD,
                });
              }

              // 403s are permanent EXCEPT `recipient_mismatch` which is transient
              // (burst-window collision on the provider's auto-created run).
              if (isForbidden(error) && !isTransientRunRecipientMismatch(error)) {
                await moveToDlq(supabase, queue, msg, errorMsg.slice(0, 1000));
                return Response.json({
                  processed: totalProcessed,
                  stopped: "forbidden",
                  worker_build: WORKER_BUILD,
                });
              }

              // recipient_mismatch: transient. Log as mismatch_deferred (NOT counted
              // toward MAX_RETRIES), set per-queue cooldown, stop the batch.
              if (isTransientRunRecipientMismatch(error)) {
                await supabase.from("email_send_log").insert({
                  ...baseLogRow(payload, queue),
                  status: STATUS_MISMATCH_DEFERRED,
                  error_message: errorMsg.slice(0, 1000),
                });
                if (payload?.message_id && typeof payload.message_id === "string") {
                  mismatchAttemptsByMessageId.set(
                    payload.message_id,
                    mismatchAttempts + 1,
                  );
                }
                await supabase
                  .from("email_send_state")
                  .update({
                    transactional_retry_after_until: new Date(
                      Date.now() + MISMATCH_COOLDOWN_SECS * 1000,
                    ).toISOString(),
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", 1);
                return Response.json({
                  processed: totalProcessed,
                  stopped: "recipient_mismatch_cooldown",
                  mismatch_attempts: mismatchAttempts + 1,
                  worker_build: WORKER_BUILD,
                });
              }

              await supabase.from("email_send_log").insert({
                ...baseLogRow(payload, queue),
                status: "failed",
                error_message: errorMsg.slice(0, 1000),
              });
              if (payload?.message_id && typeof payload.message_id === "string") {
                failedAttemptsByMessageId.set(payload.message_id, failedAttempts + 1);
              }
            }

            if (i < messages.length - 1) {
              await new Promise((r) => setTimeout(r, sendDelayMs));
            }
          }
        }

        return Response.json({ processed: totalProcessed, worker_build: WORKER_BUILD });
      },
    },
  },
});

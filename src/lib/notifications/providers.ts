import { getBrevoEmailConfig } from './email-config';
import type { DeliveryStatus, NotificationChannel } from '../domain/types';

/**
 * External Messaging Provider Integration Points (Section 13)
 *
 * HONEST DELIVERY RULE:
 * Messages are ONLY marked `sent` when a configured external provider returns
 * HTTP 2xx with a confirmed message identifier. When no external provider is
 * connected, notifications are stored in-app (`in_app_only` / `not_connected`)
 * and surfaced with manual WhatsApp/Email links — never falsely reported as sent.
 */

export interface DispatchAttemptResult {
  status: DeliveryStatus;
  providerMessageId: string | null;
  detail: string;
}

export async function dispatchExternalNotification(input: {
  channel: NotificationChannel;
  recipientContact: string;
  title: string;
  body: string;
  htmlBody?: string;
}): Promise<DispatchAttemptResult> {
  if (input.channel === 'in_app') {
    return {
      status: 'in_app_only',
      providerMessageId: null,
      detail: 'Delivered to in-app notification centre.',
    };
  }

  // 1. WhatsApp Cloud API Integration Point
  if (input.channel === 'whatsapp') {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!token || !phoneId) {
      return {
        status: 'not_connected',
        providerMessageId: null,
        detail:
          'WhatsApp Business Cloud API is not configured. Notification saved in-app; use WhatsApp link for manual handset dispatch.',
      };
    }
    try {
      const to = input.recipientContact.replace(/[^0-9]/g, '');
      const res = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: `${input.title}\n\n${input.body}` },
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        messages?: { id?: string }[];
        error?: { message?: string };
      };
      if (res.ok && data.messages?.[0]?.id) {
        return {
          status: 'sent',
          providerMessageId: data.messages[0].id,
          detail: `WhatsApp Cloud API confirmed delivery (${data.messages[0].id}).`,
        };
      }
      return {
        status: 'failed',
        providerMessageId: null,
        detail: data.error?.message || `WhatsApp API returned HTTP ${res.status}.`,
      };
    } catch (err) {
      return {
        status: 'failed',
        providerMessageId: null,
        detail: err instanceof Error ? err.message : 'WhatsApp dispatch network error.',
      };
    }
  }

  // 2. SMS Webhook / Aggregator Integration Point
  if (input.channel === 'sms') {
    const url = process.env.SMS_WEBHOOK_URL;
    const apiKey = process.env.SMS_API_KEY;
    if (!url || !apiKey) {
      return {
        status: 'not_connected',
        providerMessageId: null,
        detail: 'SMS provider is not configured. Notification recorded in-app.',
      };
    }
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: input.recipientContact,
          message: `${input.title}: ${input.body}`,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; messageId?: string; error?: string };
      const msgId = data.id || data.messageId;
      if (res.ok && msgId) {
        return {
          status: 'sent',
          providerMessageId: msgId,
          detail: `SMS gateway confirmed message (${msgId}).`,
        };
      }
      return {
        status: 'failed',
        providerMessageId: null,
        detail: data.error || `SMS gateway returned HTTP ${res.status}.`,
      };
    } catch (err) {
      return {
        status: 'failed',
        providerMessageId: null,
        detail: err instanceof Error ? err.message : 'SMS gateway network error.',
      };
    }
  }

  // 3. Brevo transactional email. Provider acceptance is not inbox delivery.
  if (input.channel === 'email') {
    const config = getBrevoEmailConfig();
    if (!config) {
      return {
        status: 'not_connected',
        providerMessageId: null,
        detail: 'Brevo requires BREVO_API_KEY and a valid, verified EMAIL_FROM sender.',
      };
    }
    try {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': config.apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          sender: config.sender,
          to: [{ email: input.recipientContact }],
          subject: input.title,
          textContent: input.body,
          htmlContent: input.htmlBody || buildBrandedEmailHtml({ subject: input.title, body: input.body }),
        }),
        signal: AbortSignal.timeout(8000),
      });
      const data = (await res.json().catch(() => ({}))) as { messageId?: unknown };
      if (res.ok && typeof data.messageId === 'string' && data.messageId.trim()) {
        return {
          status: 'sent',
          providerMessageId: data.messageId,
          detail: 'Brevo accepted the message for dispatch; delivery is not confirmed.',
        };
      }
      return {
        status: 'failed',
        providerMessageId: null,
        detail: res.ok ? 'Brevo returned no message ID.' : `Brevo rejected the request (HTTP ${res.status}).`,
      };
    } catch {
      return {
        status: 'failed',
        providerMessageId: null,
        detail: 'Brevo request failed or timed out; dispatch could not be confirmed.',
      };
    }
  }

  return {
    status: 'in_app_only',
    providerMessageId: null,
    detail: 'Recorded in-app.',
  };
}

export async function sendEmailNotification(input: {
  to: string;
  subject: string;
  textBody: string;
  htmlBody?: string;
}): Promise<{ ok: boolean; deliveryStatus: DeliveryStatus; detail: string }> {
  const res = await dispatchExternalNotification({
    channel: 'email',
    recipientContact: input.to,
    title: input.subject,
    body: input.textBody,
    htmlBody: input.htmlBody,
  });
  return {
    ok: res.status === 'sent',
    deliveryStatus: res.status,
    detail: res.detail,
  };
}

export function buildBrandedEmailHtml(opts: {
  subject?: string;
  heading?: string;
  body?: string;
  bodyLines?: string[];
  businessName?: string;
  propertyName?: string;
  address?: string;
  phone?: string;
  ctaLabel?: string;
  ctaUrl?: string;
}): string {
  const businessName = opts.businessName || opts.propertyName || 'Lemma Apartments';
  const subjectText = opts.subject || opts.heading || businessName;
  const bodyContent = opts.body || (opts.bodyLines ?? []).join('\n');
  const address = opts.address || 'Plot 2144B, Chainama Lands, Great East Road, Lusaka, Zambia';
  const phone = opts.phone || '+260 211 470 662';
  const paragraphs = bodyContent
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map(
      (line) =>
        `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#212832;">${escapeHtml(line)}</p>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><title>${escapeHtml(subjectText)}</title></head>
<body style="margin:0;padding:24px;background-color:#F7F8FA;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto;background:#FFFFFF;border:1px solid #E3E7ED;border-radius:6px;overflow:hidden;">
    <tr>
      <td style="background:#1E2530;padding:20px 28px;border-bottom:3px solid #707E91;">
        <div style="font-size:16px;font-weight:700;letter-spacing:0.12em;color:#FFFFFF;text-transform:uppercase;">${escapeHtml(businessName)}</div>
        <div style="font-size:11px;letter-spacing:0.14em;color:#CFD6E0;text-transform:uppercase;margin-top:4px;">Lusaka, Zambia</div>
      </td>
    </tr>
    <tr>
      <td style="padding:28px;">
        <h1 style="margin:0 0 18px 0;font-size:18px;font-weight:600;color:#161B22;">${escapeHtml(subjectText)}</h1>
        ${paragraphs}
        ${
          opts.ctaLabel && opts.ctaUrl
            ? `<div style="margin:24px 0 8px 0;"><a href="${escapeHtml(opts.ctaUrl)}" style="display:inline-block;background:#566476;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:6px;">${escapeHtml(opts.ctaLabel)}</a></div>`
            : ''
        }
      </td>
    </tr>
    <tr>
      <td style="padding:18px 28px;background:#F7F8FA;border-top:1px solid #E3E7ED;font-size:12px;color:#68717D;line-height:1.5;">
        <strong>${escapeHtml(businessName)}</strong><br/>
        ${escapeHtml(address)}<br/>
        Tel: ${escapeHtml(phone)}
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

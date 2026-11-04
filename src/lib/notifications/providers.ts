import { getBrevoEmailConfig } from './email-config';
import { normalizeBusinessName } from '../brand';
import type { DeliveryStatus, NotificationChannel } from '../domain/types';

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
      detail: 'Delivered to guest updates.',
    };
  }

  if (input.channel === 'whatsapp') {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!token || !phoneId) {
      return {
        status: 'not_connected',
        providerMessageId: null,
        detail: 'Saved to message log; open in WhatsApp to send directly.',
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
          detail: 'WhatsApp message sent.',
        };
      }
      return {
        status: 'failed',
        providerMessageId: null,
        detail: 'WhatsApp message could not be sent automatically.',
      };
    } catch {
      return {
        status: 'failed',
        providerMessageId: null,
        detail: 'WhatsApp message could not be sent automatically.',
      };
    }
  }

  if (input.channel === 'sms') {
    const url = process.env.SMS_WEBHOOK_URL;
    const apiKey = process.env.SMS_API_KEY;
    if (!url || !apiKey) {
      return {
        status: 'not_connected',
        providerMessageId: null,
        detail: 'Saved to message log for reception follow-up.',
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
      const data = (await res.json().catch(() => ({}))) as { id?: string; messageId?: string };
      const msgId = data.id || data.messageId;
      if (res.ok && msgId) {
        return {
          status: 'sent',
          providerMessageId: msgId,
          detail: 'Text message sent.',
        };
      }
      return {
        status: 'failed',
        providerMessageId: null,
        detail: 'Text message could not be sent automatically.',
      };
    } catch {
      return {
        status: 'failed',
        providerMessageId: null,
        detail: 'Text message could not be sent automatically.',
      };
    }
  }

  if (input.channel === 'email') {
    const config = getBrevoEmailConfig();
    if (!config) {
      return {
        status: 'not_connected',
        providerMessageId: null,
        detail: 'Saved to message log; automatic email dispatch is off.',
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
          detail: 'Email accepted for dispatch; inbox delivery is not confirmed.',
        };
      }
      return {
        status: 'failed',
        providerMessageId: null,
        detail: res.ok
          ? 'Email service returned no message reference.'
          : `Email dispatch declined (HTTP ${res.status}).`,
      };
    } catch {
      return {
        status: 'failed',
        providerMessageId: null,
        detail: 'Email dispatch timed out; delivery could not be confirmed.',
      };
    }
  }

  return {
    status: 'in_app_only',
    providerMessageId: null,
    detail: 'Recorded in guest updates.',
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
  const businessName = normalizeBusinessName(opts.businessName || opts.propertyName);
  const subjectText = opts.subject || opts.heading || businessName;
  const bodyContent = opts.body || (opts.bodyLines ?? []).join('\n');
  const address = opts.address || 'Barlaston Park, Lusaka, Zambia';
  const phone = opts.phone || '+260 574 556 207';
  const paragraphs = bodyContent
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map(
      (line) =>
        `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.65;color:#1E2530;">${escapeHtml(line)}</p>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><title>${escapeHtml(subjectText)}</title></head>
<body style="margin:0;padding:24px;background-color:#FAF8F5;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto;background:#FFFFFF;border:1px solid #E6E0D6;border-radius:10px;overflow:hidden;">
    <tr>
      <td style="background:#171B22;padding:22px 28px;border-bottom:3px solid #B88746;">
        <div style="font-size:18px;font-weight:600;color:#FAF8F5;font-family:Georgia,serif;">${escapeHtml(businessName)}</div>
        <div style="font-size:12px;color:#D6CEC0;margin-top:3px;">Barlaston Park · Lusaka, Zambia</div>
      </td>
    </tr>
    <tr>
      <td style="padding:28px;">
        <h1 style="margin:0 0 18px 0;font-size:19px;font-weight:600;color:#171B22;">${escapeHtml(subjectText)}</h1>
        ${paragraphs}
        ${
          opts.ctaLabel && opts.ctaUrl
            ? `<div style="margin:24px 0 8px 0;"><a href="${escapeHtml(opts.ctaUrl)}" style="display:inline-block;background:#4A586B;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:600;padding:11px 20px;border-radius:8px;">${escapeHtml(opts.ctaLabel)}</a></div>`
            : ''
        }
      </td>
    </tr>
    <tr>
      <td style="padding:18px 28px;background:#FAF8F5;border-top:1px solid #E6E0D6;font-size:12px;color:#6E6659;line-height:1.55;">
        <strong>${escapeHtml(businessName)}</strong><br/>
        ${escapeHtml(address)}<br/>
        Tel / WhatsApp: ${escapeHtml(phone)}
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

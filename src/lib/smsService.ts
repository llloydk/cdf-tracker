import { API_BASE_URL } from './apiBase';

interface SendDecisionSmsParams {
  toPhone: string;
  toName: string;
  refId: string;
  itemLabel: string;
  status: string;
  kind: 'application' | 'request' | 'report';
}

/**
 * Strips everything except leading '+' and digits so free-text phone fields
 * ("0977 123 456", "+260-97-712-3456") still resolve to a usable MSISDN.
 */
function normalizePhone(raw: string): string {
  const trimmed = (raw || '').trim();
  const plus = trimmed.startsWith('+') ? '+' : '';
  const digits = trimmed.replace(/[^0-9]/g, '');
  if (!digits) return '';
  // Local Zambian numbers (0XXXXXXXXX) -> +260XXXXXXXXX
  if (!plus && digits.length === 10 && digits.startsWith('0')) {
    return `+260${digits.slice(1)}`;
  }
  if (!plus && digits.startsWith('260')) {
    return `+${digits}`;
  }
  return `${plus}${digits}`;
}

/**
 * Sends an SMS via the backend /api/sms/send endpoint (server.ts), which
 * talks to the configured SMS gateway (Africa's Talking by default — see
 * README for setup). Mirrors sendDecisionEmail's shape so the two can be
 * fired together whenever a submission's status changes.
 *
 * Never throws — a failed/unconfigured SMS gateway should never block the
 * admin action or the decision email that goes alongside it.
 */
export async function sendDecisionSms({
  toPhone, toName, refId, itemLabel, status, kind,
}: SendDecisionSmsParams): Promise<boolean> {
  const phone = normalizePhone(toPhone);
  if (!phone) return false;

  const label =
    kind === 'application' ? 'application' :
    kind === 'request' ? 'project request' :
    'report';

  let message = `CDF Tracker: Hello ${toName || 'Citizen'}, your ${label} "${itemLabel}" (Ref ${refId}) status is now: ${status}.`;
  if (status === 'Approved') {
    message = `CDF Tracker: Good news ${toName || 'Citizen'}! Your ${label} "${itemLabel}" (Ref ${refId}) has been APPROVED. A CDF officer will contact you with next steps.`;
  } else if (status === 'Rejected') {
    message = `CDF Tracker: Hello ${toName || 'Citizen'}, your ${label} "${itemLabel}" (Ref ${refId}) was NOT approved this cycle. You may re-apply with more details.`;
  }
  // Keep it inside a single SMS segment where possible.
  if (message.length > 160) message = message.slice(0, 157) + '...';

  try {
    const res = await fetch(`${API_BASE_URL}/api/sms/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toPhone: phone, message }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn('SMS send failed:', data);
      return false;
    }
    console.log('SMS queued:', data);
    return true;
  } catch (err) {
    console.warn('SMS send error (non-blocking):', err);
    return false;
  }
}

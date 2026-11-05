import emailjs from '@emailjs/browser';

// EmailJS Configuration provided by the user
export const EJS_CONFIG = {
  publicKey: 'adyboht6l9p8svkgW',
  serviceId: 'service_oes5mtu',
  templateId: 'template_o5plcyg',
  adminEmail: 'kabandak3@gmail.com'
};

// Initialize EmailJS with the public key
emailjs.init({
  publicKey: EJS_CONFIG.publicKey,
});

interface SendOtpParams {
  toEmail: string;
  toName: string;
  otp: string;
  purpose: 'Admin Login' | 'Citizen Registration' | 'Citizen Login';
}

/**
 * Sends a verification OTP email using EmailJS.
 * Maps multiple common parameter keys to ensure compatibility with various template designs.
 */
export async function sendOtpEmail({ toEmail, toName, otp, purpose }: SendOtpParams): Promise<boolean> {
  const templateParams = {
    // Recipient fields
    to_email: toEmail,
    email: toEmail,
    user_email: toEmail,
    to_name: toName,
    user_name: toName,
    
    // OTP fields
    otp: otp,
    code: otp,
    otp_code: otp,
    verification_code: otp,
    
    // Subject and general message fields
    subject: `Your ${purpose} OTP Code - Zambia CDF Tracker`,
    purpose: purpose,
    message: `Your verification code is ${otp}. This code is valid for 10 minutes. Please do not share it with anyone.`,
    body: `Your verification code is ${otp}. This code is valid for 10 minutes. Please do not share it with anyone.`,
  };

  try {
    const response = await emailjs.send(
      EJS_CONFIG.serviceId,
      EJS_CONFIG.templateId,
      templateParams
    );
    console.log('EmailJS Success:', response.status, response.text);
    return true;
  } catch (error) {
    console.error('EmailJS Error:', error);
    return false;
  }
}

interface SendReportParams {
  reportId: string;
  constituency: string;
  type: string;
  project: string;
  amount: string;
  contact: string;
  desc: string;
}

interface SendDecisionParams {
  toEmail: string;
  toName: string;
  refId: string;
  itemLabel: string;
  status: string;
  kind: 'application' | 'request' | 'report';
  category?: string; // for applications: Grant / Bursary / Agricultural Support
}

/**
 * Emails the applicant / requester / reporter when an admin changes the
 * status of their submission. Works for all three kinds:
 *  - application  (Grant, Bursary, Agricultural Support)
 *  - request      (Community project request)
 *  - report       (Whistleblower report)
 */
export async function sendDecisionEmail({
  toEmail, toName, refId, itemLabel, status, kind, category,
}: SendDecisionParams): Promise<boolean> {
  if (!toEmail || !toEmail.trim()) return false;

  // Build clear, unambiguous status wording
  let headline = '';
  let body = '';

  const label =
    kind === 'application'
      ? `${category || ''} application`
      : kind === 'request'
      ? 'community project request'
      : 'whistleblower report';

  switch (status) {
    case 'Approved':
      headline = `Your ${label} has been APPROVED ✅`;
      body = `Good news! Your ${label} "${itemLabel}" (Ref: ${refId}) has been reviewed and APPROVED by the Constituency Development Fund administration. A local CDF officer will contact you with the next steps.`;
      break;
    case 'Rejected':
      headline = `Your ${label} has been REJECTED ❌`;
      body = `We regret to inform you that your ${label} "${itemLabel}" (Ref: ${refId}) has been reviewed and REJECTED by the Constituency Development Fund administration. You may re-apply in the next cycle with additional supporting information.`;
      break;
    case 'Under Review':
    case 'Under review':
      headline = `Your ${label} is now UNDER REVIEW 🔍`;
      body = `Your ${label} "${itemLabel}" (Ref: ${refId}) is currently UNDER REVIEW by the Constituency Development Fund administration. You will receive a final decision by email once the evaluation is complete.`;
      break;
    case 'Escalated to ACC':
      headline = `Your report has been ESCALATED TO THE ACC 🚨`;
      body = `Your whistleblower report (Ref: ${refId}) has been ESCALATED to the Anti-Corruption Commission (ACC) for further investigation. Thank you for helping protect public funds.`;
      break;
    case 'Closed':
      headline = `Your report has been CLOSED`;
      body = `Your whistleblower report (Ref: ${refId}) has been marked as CLOSED by the administration.`;
      break;
    default:
      headline = `Update on your ${label} [${refId}]`;
      body = `Your ${label} "${itemLabel}" (Ref: ${refId}) has been updated to status: ${status}.`;
  }

  const fullMessage =
    `Dear ${toName || 'Applicant'},\n\n${body}\n\nReference: ${refId}\nStatus: ${status}\n\nIf you have any questions, please visit your nearest CDF office or contact your Constituency Development Fund officer.\n\n— CDF Fund Tracker\nZambia Constituency Development Fund`;

  // Mirror the OTP email params exactly — the EmailJS template is built around
  // these field names. Decision content goes into every slot so it renders
  // regardless of which placeholder the template uses.
  const templateParams = {
    // Recipient — same as OTP
    to_email: toEmail,
    email: toEmail,
    user_email: toEmail,
    to_name: toName || 'Applicant',
    user_name: toName || 'Applicant',
    // ✅ KEY FIX: put the decision text into 'otp' — the field the template actually renders
    otp: fullMessage,
    code: fullMessage,
    otp_code: fullMessage,
    verification_code: fullMessage,
    // Extra fields in case the template uses them
    subject: `${headline} [${refId}]`,
    purpose: headline,
    message: fullMessage,
    body: fullMessage,
    from_name: 'CDF Fund Tracker',
  };

  try {
    const response = await emailjs.send(
      EJS_CONFIG.serviceId,
      EJS_CONFIG.templateId,
      templateParams
    );
    console.log('EmailJS Decision Email Success:', response.status, response.text);
    return true;
  } catch (error) {
    console.error('EmailJS Decision Email Error:', error);
    return false;
  }
}

/**
 * Sends an email notification to the administrator when a corruption report is submitted.
 */
export async function sendReportNotification(params: SendReportParams): Promise<boolean> {
  const templateParams = {
    to_email: EJS_CONFIG.adminEmail,
    to_name: 'Administrator',
    subject: `🚨 New Corruption Report [${params.reportId}] Submitted`,
    message: `A new report has been submitted.\n\n` +
             `Report ID: ${params.reportId}\n` +
             `Constituency: ${params.constituency}\n` +
             `Type: ${params.type}\n` +
             `Project: ${params.project}\n` +
             `Estimated Amount: ${params.amount}\n` +
             `Contact Info: ${params.contact}\n` +
             `Description:\n${params.desc}`,
    // Alternate field names for flexibility
    email: EJS_CONFIG.adminEmail,
    otp: params.reportId, // Fallback if template expects an 'otp' placeholder
  };

  try {
    const response = await emailjs.send(
      EJS_CONFIG.serviceId,
      EJS_CONFIG.templateId,
      templateParams
    );
    console.log('EmailJS Report Notification Success:', response.status, response.text);
    return true;
  } catch (error) {
    console.error('EmailJS Report Notification Error:', error);
    return false;
  }
}

import nodemailer from 'nodemailer';

function getTransport() {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : undefined;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !port || !user || !pass) return null;
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

export async function sendSlotAvailableEmail(uid: string, toEmail: string) {
  const transporter = getTransport();
  const from = process.env.SMTP_FROM || 'no-reply@smartqueue.local';
  const subject = 'Your slot is now available';
  const text = `Hello,\n\nYour queue position reached the front and a slot is now available.\nCard UID: ${uid}\n\nPlease proceed to the library entrance.\n`;
  const html = `<p>Hello,</p><p>Your queue position reached the front and a slot is now available.</p><p><b>Card UID:</b> ${uid}</p><p>Please proceed to the library entrance.</p>`;

  if (!transporter) {
    console.log('[notify] SMTP not configured; would send to', toEmail, 'for UID', uid);
    return { ok: true, simulated: true };
  }

  await transporter.sendMail({ from, to: toEmail, subject, text, html });
  return { ok: true, simulated: false };
}



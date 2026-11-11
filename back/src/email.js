// Sends emails over SMTP with Nodemailer.
//
// Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and MAIL_FROM in .env to
// send real emails (see .env.example). Without SMTP_HOST, emails are printed
// in the server console instead, so password reset can be tested locally.
import nodemailer from 'nodemailer'

const smtpConfigured = Boolean(process.env.SMTP_HOST)

const transport = smtpConfigured
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      // true for port 465; port 587 upgrades to TLS on its own
      secure: process.env.SMTP_SECURE === 'true' || Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    })
  : null

const from = process.env.MAIL_FROM || 'Preply <no-reply@localhost>'

export async function sendEmail({ to, subject, text, html }) {
  if (!transport) {
    console.log(`\n📧 Email (not sent: SMTP_HOST isn't set)\nTo: ${to}\nSubject: ${subject}\n\n${text}\n`)
    return
  }
  await transport.sendMail({ from, to, subject, text, html })
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]
  )
}

export function sendPasswordResetEmail({ to, firstName, link }) {
  const name = firstName ? ` ${firstName}` : ''
  return sendEmail({
    to,
    subject: 'Reset your Preply password',
    text:
      `Hi${name},\n\nSomeone asked to reset the password for your Preply account. ` +
      `To choose a new password, open this link:\n\n${link}\n\n` +
      `This link works once and expires in 1 hour. If you didn't ask for this, you can ignore this email; ` +
      `your password won't change.`,
    html: `
      <div style="font-family: system-ui, sans-serif; color: #1F2328; max-width: 480px;">
        <p>Hi${escapeHtml(name)},</p>
        <p>Someone asked to reset the password for your Preply account.</p>
        <p>
          <a href="${escapeHtml(link)}"
             style="display: inline-block; padding: 12px 20px; background: #D4552A; color: #fff;
                    border-radius: 999px; text-decoration: none; font-weight: 600;">
            Choose a new password
          </a>
        </p>
        <p style="color: #5B6068; font-size: 14px;">
          This link works once and expires in 1 hour. If you didn't ask for this, you can ignore this
          email; your password won't change.
        </p>
      </div>`,
  })
}

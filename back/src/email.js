// Sends emails over SMTP with Nodemailer.
//
// Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and MAIL_FROM in .env to
// send real emails (see .env.example). Without SMTP_HOST, emails are printed
// in the server console instead, so signup can be tested locally.
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

const from = process.env.MAIL_FROM || 'Meal Planner <no-reply@localhost>'

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

export function sendVerificationEmail({ to, firstName, link }) {
  const name = firstName ? ` ${firstName}` : ''
  return sendEmail({
    to,
    subject: 'Verify your Meal Planner account',
    text:
      `Hi${name},\n\nConfirm your email to finish creating your Meal Planner account:\n\n${link}\n\n` +
      `This link works once and expires in 24 hours. If you didn't sign up, you can ignore this email.`,
    html: `
      <div style="font-family: system-ui, sans-serif; color: #1F2328; max-width: 480px;">
        <p>Hi${escapeHtml(name)},</p>
        <p>Confirm your email to finish creating your Meal Planner account.</p>
        <p>
          <a href="${escapeHtml(link)}"
             style="display: inline-block; padding: 12px 20px; background: #D4552A; color: #fff;
                    border-radius: 999px; text-decoration: none; font-weight: 600;">
            Verify my email
          </a>
        </p>
        <p style="color: #5B6068; font-size: 14px;">
          This link works once and expires in 24 hours. If you didn't sign up, you can ignore this email.
        </p>
      </div>`,
  })
}

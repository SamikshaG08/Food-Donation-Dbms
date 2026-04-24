let nodemailer = null;

try {
  // Keep email support optional so the app still works without SMTP setup.
  nodemailer = require('nodemailer');
} catch (error) {
  nodemailer = null;
}

function getTransportConfig() {
  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASS,
    SMTP_SECURE
  } = process.env;

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !nodemailer) {
    return null;
  }

  return {
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: String(SMTP_SECURE || '').toLowerCase() === 'true',
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  };
}

async function sendEmail({ from, to, subject, text, replyTo, sender }) {
  const transportConfig = getTransportConfig();

  if (!transportConfig || !to) {
    return { sent: false, reason: 'smtp_not_configured' };
  }

  const transporter = nodemailer.createTransport(transportConfig);

  await transporter.sendMail({
    from,
    replyTo,
    sender,
    to,
    subject,
    text
  });

  return { sent: true };
}

module.exports = {
  sendEmail
};

import FormData from 'form-data';
import Mailgun from 'mailgun.js';
import { config } from '../config.js';

export async function sendEmail({ to, subject, text, html }) {
  const { apiKey, domain, from } = config.mailgun;
  if (!apiKey || !domain) {
    console.warn('Mailgun not configured — skipping email to', to);
    return;
  }
  const mg = new Mailgun(FormData).client({ username: 'api', key: apiKey });
  await mg.messages.create(domain, { from, to, subject, text, html });
}

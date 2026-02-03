type SendEmailArgs = { to: string; subject: string; html: string };

export async function sendEmail({ to, subject, html }: SendEmailArgs) {
  const from = process.env.EMAIL_FROM!;
  const emailMatch = from.match(/<(.*)>/);
  const fromEmail = emailMatch?.[1] ?? from;

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": process.env.BREVO_API_KEY!,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({
      sender: { name: "Fuel Alerts", email: fromEmail },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Email failed: ${res.status} ${text}`);
  }
}

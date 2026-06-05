export type MailTemplateType = 'reset_password' | 'create_account' | 'notification';

interface MailTemplateOptions {
  prenom: string;
  nom: string;
  actionUrl: string;
  type: MailTemplateType;
  customMessage?: string;
}

const configs: Record<MailTemplateType, { subject: string; title: string; intro: string; btnLabel: string; note: string }> = {
  reset_password: {
    subject: 'Réinitialisation de votre mot de passe — Biograf AI',
    title: 'Réinitialisation de votre mot de passe',
    intro: "Nous avons reçu une demande de réinitialisation du mot de passe associé à votre compte. Cliquez sur le bouton ci-dessous pour définir un nouveau mot de passe.",
    btnLabel: 'Réinitialiser mon mot de passe',
    note: "Ce lien est valable <strong>1 heure</strong>. Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email.",
  },
  create_account: {
    subject: 'Bienvenue sur Biograf AI',
    title: 'Bienvenue sur Biograf AI',
    intro: "Votre compte a été créé avec succès. Cliquez sur le bouton ci-dessous pour vérifier votre adresse email et accéder à votre espace.",
    btnLabel: 'Vérifier mon adresse email',
    note: "Si vous rencontrez des difficultés, contactez notre équipe support.",
  },
  notification: {
    subject: 'Vous avez une nouvelle notification',
    title: 'Vous avez une nouvelle notification',
    intro: "Une action requiert votre attention sur votre compte GNA CI. Consultez votre espace personnel pour en savoir plus.",
    btnLabel: 'Voir la notification',
    note: "Si cette notification ne vous concerne pas, vous pouvez l'ignorer sans aucune conséquence.",
  },
};

export function buildMailTemplate(options: MailTemplateOptions): { subject: string; html: string } {
  const { prenom, nom, actionUrl, type, customMessage } = options;
  const c = configs[type];
  const intro = customMessage ?? c.intro;

  const html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0; padding:0; background:#f4f5f7; font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7; padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:6px; overflow:hidden; border:1px solid #e5e7eb;">
        
        <!-- Header -->
        <tr>
          <td style="background:#1a2332; padding:24px 32px;">
            <span style="color:#ffffff; font-size:18px; font-weight:bold; letter-spacing:0.5px;">Biograf AI</span>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px 32px 32px;">
            <p style="font-size:14px; color:#666; margin:0 0 8px;">Bonjour <strong>${prenom} ${nom}</strong>,</p>
            <h1 style="font-size:22px; font-weight:600; color:#1a2332; margin:0 0 16px;">${c.title}</h1>
            <p style="font-size:14px; color:#444; line-height:1.7; margin:0 0 28px;">${intro}</p>

            <!-- CTA -->
            <table cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
              <tr>
                <td style="background:#1a2332; border-radius:4px;">
                  <a href="${actionUrl}" style="display:inline-block; padding:12px 32px; color:#ffffff; text-decoration:none; font-size:14px; font-weight:500;">${c.btnLabel}</a>
                </td>
              </tr>
            </table>

            <!-- Note -->
            <table cellpadding="0" cellspacing="0" width="100%" style="background:#f7f8fa; border-left:3px solid #1a2332; border-radius:0 4px 4px 0;">
              <tr>
                <td style="padding:12px 16px; font-size:12px; color:#666; line-height:1.6;">${c.note}</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="border-top:1px solid #e5e7eb; padding:20px 32px; background:#f9fafb; text-align:center;">
            <p style="font-size:12px; color:#999; margin:0; line-height:1.6;">
              Cet email a été envoyé automatiquement. Merci de ne pas y répondre.<br>
              &copy; ${new Date().getFullYear()} Biograf AI
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject: c.subject, html };
}
const sgMail = require('@sendgrid/mail');

const sendEmail = async ({ to, subject, html }) => {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);

    return sgMail.send({
      from: 'siddiqui4203500@cloud.neduet.edu.pk', // sender address
      to,
      subject,
      html,
    });
  };

module.exports = sendEmail;
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class MessagingService {
  private readonly logger = new Logger('Messaging');

  /**
   * Normalises a Tunisian phone number to international format.
   */
  private normalizePhone(raw: string): string {
    const digits = raw.replace(/\D/g, '');
    if (digits.startsWith('216')) return `+${digits}`;
    if (digits.length === 8) return `+216${digits}`;
    return raw.startsWith('+') ? raw : `+${digits}`;
  }

  async sendSms(phone: string, message: string, sender?: string): Promise<boolean> {
    const apiKey = process.env.SMS_API_KEY;
    const from = sender ?? process.env.SMS_SENDER ?? '';
    const to = this.normalizePhone(phone).replace('+', '');

    if (!apiKey) {
      this.logger.warn(`[SMS simulé] ${to} : ${message}`);
      return false;
    }

    try {
      const params = new URLSearchParams({
        fct: 'sms',
        key: apiKey,
        mobile: to,
        sms: message,
      });
      if (from) params.set('sender', from);

      const res = await fetch(`https://api.l2t.io/tn/v0/api/api.aspx?${params}`);
      const body = await res.text();
      const code = body.match(/<status_code>(\d+)<\/status_code>/)?.[1];

      if (code !== '200') {
        this.logger.warn(`SMS failed for ${to}: code ${code ?? 'inconnu'}`);
        return false;
      }
      return true;
    } catch (e: any) {
      this.logger.error(`SMS error for ${to}: ${e?.message}`);
      return false;
    }
  }

  async sendWhatsApp(phone: string, message: string): Promise<boolean> {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_ID;
    const to = this.normalizePhone(phone);

    if (!token || !phoneId) {
      this.logger.warn(`[WhatsApp simulé] ${to} : ${message}`);
      return false;
    }

    try {
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${phoneId}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: to.replace('+', ''),
            type: 'text',
            text: { body: message },
          }),
        },
      );

      if (!res.ok) {
        const body = await res.text();
        this.logger.warn(`WhatsApp failed for ${to}: ${body.slice(0, 200)}`);
      }
      return res.ok;
    } catch (e: any) {
      this.logger.error(`WhatsApp error for ${to}: ${e?.message}`);
      return false;
    }
  }

  async send(
    channel: string,
    phone: string,
    message: string,
    sender?: string,
  ): Promise<boolean> {
    return channel === 'whatsapp'
      ? this.sendWhatsApp(phone, message)
      : this.sendSms(phone, message, sender);
  }
}
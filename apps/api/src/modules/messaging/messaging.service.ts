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

  async sendSms(phone: string, message: string): Promise<boolean> {
    const apiKey = process.env.SMS_API_KEY;
    const apiUrl = process.env.SMS_API_URL;
    const to = this.normalizePhone(phone);

    if (!apiKey || !apiUrl) {
      this.logger.warn(`[SMS simulé] ${to} : ${message}`);
      return false;
    }

    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ to, message }),
      });

      if (!res.ok) {
        this.logger.warn(`SMS failed for ${to}: HTTP ${res.status}`);
      }
      return res.ok;
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

  async send(channel: string, phone: string, message: string): Promise<boolean> {
    return channel === 'whatsapp'
      ? this.sendWhatsApp(phone, message)
      : this.sendSms(phone, message);
  }
}
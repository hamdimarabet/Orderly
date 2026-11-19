import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { MessagingService } from '../messaging/messaging.service';

export interface SegmentRules {
  minOrders?: number;
  maxOrders?: number;
  minLtv?: number;
  maxLtv?: number;
  inactiveDays?: number;
  activeDays?: number;
  maxReturnRate?: number;
  minConfirmationRate?: number;
  cities?: string[];
  products?: string[];
  tags?: string[];
}

@Injectable()
export class MarketingService {
  constructor(
    private prisma: PrismaService,
    private orders: OrdersService,
    private messaging: MessagingService,
  ) {}

  // ---------- SEGMENTS ----------

  /** storeIds vide = tous les magasins. Un segment sans magasin est global. */
  async listSegments(storeIds?: string[]) {
    const all = await this.prisma.segment.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const segments = storeIds?.length
      ? all.filter((s) => {
          const ids = ((s as any).storeIds ?? []) as string[];
          return ids.length === 0 || ids.some((id) => storeIds.includes(id));
        })
      : all;

    // La taille est calculee dans le perimetre choisi
    const customers = await this.orders.getCustomers(
      storeIds?.length ? { storeIds } : {},
    );

    return segments.map((s) => ({
      ...s,
      size: this.matchCustomers(customers, s.rules as SegmentRules).length,
    }));
  }

  async createSegment(data: {
    name: string;
    description?: string;
    rules: SegmentRules;
    storeIds?: string[];
  }) {
    return this.prisma.segment.create({
      data: {
        name: data.name,
        description: data.description ?? null,
        rules: data.rules as any,
        storeIds: data.storeIds ?? [],
      },
    });
  }

  async updateSegment(id: string, data: {
    name?: string;
    description?: string;
    rules?: SegmentRules;
    storeIds?: string[];
  }) {
    return this.prisma.segment.update({
      where: { id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.rules && { rules: data.rules as any }),
        ...(data.storeIds !== undefined && { storeIds: data.storeIds }),
      },
    });
  }

  async deleteSegment(id: string) {
    return this.prisma.segment.delete({ where: { id } });
  }

  async previewSegment(rules: SegmentRules, storeIds?: string[]) {
    const customers = await this.orders.getCustomers(
      storeIds?.length ? { storeIds } : {},
    );
    const matched = this.matchCustomers(customers, rules);
    return {
      size: matched.length,
      totalValue: matched.reduce((s: number, c: any) => s + c.lifetimeValue, 0),
      sample: matched.slice(0, 10).map((c: any) => ({
        name: c.name,
        phone: c.displayPhone,
        city: c.city,
        totalOrders: c.totalOrders,
        lifetimeValue: c.lifetimeValue,
      })),
    };
  }

  private matchCustomers(customers: any[], rules: SegmentRules): any[] {
    return customers.filter((c) => {
      if (rules.minOrders !== undefined && c.totalOrders < rules.minOrders) return false;
      if (rules.maxOrders !== undefined && c.totalOrders > rules.maxOrders) return false;
      if (rules.minLtv !== undefined && c.lifetimeValue < rules.minLtv) return false;
      if (rules.maxLtv !== undefined && c.lifetimeValue > rules.maxLtv) return false;
      if (rules.inactiveDays !== undefined && c.daysSinceLast < rules.inactiveDays) return false;
      if (rules.activeDays !== undefined && c.daysSinceLast > rules.activeDays) return false;
      if (rules.maxReturnRate !== undefined && c.returnRate > rules.maxReturnRate) return false;
      if (rules.minConfirmationRate !== undefined && c.confirmationRate < rules.minConfirmationRate) return false;
      if (rules.cities?.length && !rules.cities.includes(c.city)) return false;
      if (rules.tags?.length && !rules.tags.some((t) => (c.tags ?? []).includes(t))) return false;
      if (rules.products?.length) {
        const bought = (c.topProducts ?? []).map((p: any) => p.title);
        if (!rules.products.some((p) => bought.includes(p))) return false;
      }
      return true;
    });
  }

  // ---------- CAMPAIGNS ----------

  async listCampaigns(storeIds?: string[]) {
    return this.prisma.campaign.findMany({
      where: storeIds?.length
        ? { OR: [{ storeId: { in: storeIds } }, { storeId: null }] }
        : {},
      include: { segment: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createCampaign(data: {
    name: string;
    message: string;
    segmentId?: string;
    storeId?: string;
    recipients?: { phone: string; name?: string }[];
    channel?: string;
    scheduledAt?: string;
  }) {
    const manual = (data.recipients ?? []).filter((r) => r?.phone?.trim());
    let recipientCount = manual.length;

    if (!manual.length && data.segmentId) {
      const segment = await this.prisma.segment.findUnique({
        where: { id: data.segmentId },
      });
      if (segment) {
        const segStores = ((segment as any).storeIds ?? []) as string[];
        const scope = data.storeId ? [data.storeId] : segStores;
        const customers = await this.orders.getCustomers(
          scope.length ? { storeIds: scope } : {},
        );
        recipientCount = this.matchCustomers(
          customers,
          segment.rules as SegmentRules,
        ).length;
      }
    }

    return this.prisma.campaign.create({
      data: {
        name: data.name,
        message: data.message,
        segmentId: manual.length ? null : data.segmentId ?? null,
        storeId: data.storeId ?? null,
        recipients: manual.length ? (manual as any) : undefined,
        channel: data.channel ?? 'SMS',
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
        status: data.scheduledAt ? 'SCHEDULED' : 'DRAFT',
        recipientCount,
      },
    });
  }

  async sendCampaign(id: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      include: { segment: true },
    });
    if (!campaign) throw new Error('Campaign not found');

    const campaignStoreId = (campaign as any).storeId as string | null;
    const manual = (((campaign as any).recipients ?? []) as {
      phone: string;
      name?: string;
    }[]).filter((r) => r?.phone?.trim());

    let matched: any[];

    if (manual.length) {
      // Numeros saisis a la main ou importes d'un fichier
      matched = manual.map((r) => ({
        displayPhone: r.phone.trim(),
        name: r.name ?? 'Client',
        storeId: campaignStoreId,
      }));
    } else {
      if (!campaign.segmentId || !campaign.segment) {
        throw new Error('No segment selected');
      }
      const segStores = ((campaign.segment as any).storeIds ?? []) as string[];
      const scope = campaignStoreId ? [campaignStoreId] : segStores;
      const customers = await this.orders.getCustomers(
        scope.length ? { storeIds: scope } : {},
      );
      matched = this.matchCustomers(
        customers,
        campaign.segment.rules as SegmentRules,
      );
    }

    // Sender name per store
    const stores = await this.prisma.store.findMany({
      select: { id: true, credentials: true },
    });
    const senderByStore: Record<string, string> = {};
    stores.forEach((s) => {
      const sender = (s.credentials as any)?.smsSender;
      if (sender) senderByStore[s.id] = sender;
    });

    await this.prisma.campaign.update({
      where: { id },
      data: { status: 'SENDING', recipientCount: matched.length },
    });

    let sent = 0;
    let failed = 0;

    for (const c of matched) {
      const personalized = this.renderTemplate(campaign.message, c);
      try {
        const sender = c.storeId ? senderByStore[c.storeId] : undefined;
        const ok = await this.messaging.sendSms(c.displayPhone, personalized, sender);
        await this.prisma.campaignSend.create({
          data: {
            campaignId: id,
            phone: c.displayPhone,
            name: c.name,
            message: personalized,
            status: ok ? 'SENT' : 'FAILED',
            error: ok ? null : 'SMS provider not configured',
            sentAt: ok ? new Date() : null,
          },
        });
        if (ok) sent++; else failed++;
      } catch (e: any) {
        failed++;
        await this.prisma.campaignSend.create({
          data: {
            campaignId: id,
            phone: c.displayPhone,
            name: c.name,
            message: personalized,
            status: 'FAILED',
            error: e?.message ?? 'unknown',
          },
        });
      }
    }

    return this.prisma.campaign.update({
      where: { id },
      data: {
        status: failed === matched.length ? 'FAILED' : 'SENT',
        sentAt: new Date(),
        sentCount: sent,
        failedCount: failed,
      },
    });
  }

  async getCampaignSends(id: string) {
    return this.prisma.campaignSend.findMany({
      where: { campaignId: id },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async deleteCampaign(id: string) {
    return this.prisma.campaign.delete({ where: { id } });
  }

  private renderTemplate(template: string, customer: any): string {
    return template
      .replace(/\{\{nom\}\}/gi, customer.name ?? 'Client')
      .replace(/\{\{ville\}\}/gi, customer.city ?? '')
      .replace(/\{\{commandes\}\}/gi, String(customer.totalOrders ?? 0))
      .replace(/\{\{valeur\}\}/gi, String(Math.round(customer.lifetimeValue ?? 0)))
      .replace(/\{\{produit\}\}/gi, customer.topProducts?.[0]?.title ?? '');
  }

  private async sendSms(phone: string, message: string): Promise<boolean> {
    return this.messaging.sendSms(phone, message);
  }

  // ---------- TEST ----------

  /** Etat reel du fournisseur SMS, pour que l'interface dise la verite. */
  async smsStatus() {
    return {
      configured: !!process.env.SMS_API_KEY,
      defaultSender: process.env.SMS_SENDER ?? null,
    };
  }

  /** Envoi immediat vers un seul numero, avec l'expediteur du magasin choisi. */
  async sendTest(data: { phone: string; message: string; storeId?: string }) {
    const phone = String(data.phone ?? '').trim();
    if (!phone) return { ok: false, error: 'Numero manquant' };
    if (!data.message?.trim()) return { ok: false, error: 'Message vide' };

    let sender: string | undefined;
    let storeName: string | null = null;

    if (data.storeId) {
      const store = await this.prisma.store.findUnique({
        where: { id: data.storeId },
        select: { name: true, credentials: true },
      });
      sender = (store?.credentials as any)?.smsSender || undefined;
      storeName = store?.name ?? null;
    }

    const configured = !!process.env.SMS_API_KEY;
    const ok = await this.messaging.sendSms(phone, data.message, sender);

    return {
      ok,
      configured,
      simulated: !configured,
      phone,
      storeName,
      sender: sender ?? process.env.SMS_SENDER ?? null,
      message: data.message,
      error: ok ? null : configured ? 'Refus du fournisseur SMS' : null,
    };
  }

  // ---------- FLOWS ----------

  async listFlows(storeIds?: string[]) {
    const all = await this.prisma.automationFlow.findMany({
      include: { segment: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    if (!storeIds?.length) return all;
    return all.filter((f) => {
      const ids = ((f as any).storeIds ?? []) as string[];
      return ids.length === 0 || ids.some((id) => storeIds.includes(id));
    });
  }

  async createFlow(data: {
    name: string;
    description?: string;
    trigger: string;
    triggerConfig?: any;
    segmentId?: string;
    storeIds?: string[];
    message: string;
    delayHours?: number;
  }) {
    return this.prisma.automationFlow.create({
      data: {
        name: data.name,
        description: data.description ?? null,
        trigger: data.trigger,
        triggerConfig: data.triggerConfig ?? {},
        segmentId: data.segmentId ?? null,
        storeIds: data.storeIds ?? [],
        message: data.message,
        delayHours: data.delayHours ?? 0,
      },
    });
  }

  async toggleFlow(id: string) {
    const flow = await this.prisma.automationFlow.findUnique({ where: { id } });
    if (!flow) throw new Error('Flow not found');
    return this.prisma.automationFlow.update({
      where: { id },
      data: { isActive: !flow.isActive },
    });
  }

  async deleteFlow(id: string) {
    return this.prisma.automationFlow.delete({ where: { id } });
  }

  async seedDefaultSegments() {
    const defaults = [
      {
        name: 'Clients fidèles',
        description: '2 commandes ou plus',
        rules: { minOrders: 2 },
      },
      {
        name: 'VIP',
        description: 'Plus de 500 TND dépensés',
        rules: { minLtv: 500 },
      },
      {
        name: 'Clients inactifs',
        description: 'Pas de commande depuis 30 jours',
        rules: { inactiveDays: 30, minOrders: 1 },
      },
      {
        name: 'Nouveaux clients',
        description: 'Une seule commande',
        rules: { minOrders: 1, maxOrders: 1 },
      },
      {
        name: 'Clients fiables',
        description: 'Taux de confirmation élevé, peu de retours',
        rules: { minConfirmationRate: 70, maxReturnRate: 20 },
      },
    ];

    const created: any[] = [];
    for (const d of defaults) {
      const exists = await this.prisma.segment.findFirst({ where: { name: d.name } });
      if (exists) continue;
      created.push(
        await this.prisma.segment.create({
          data: { name: d.name, description: d.description, rules: d.rules as any, isSystem: true },
        }),
      );
    }
    return { created: created.length };
  }
  async getSegmentCustomers(id: string) {
    const segment = await this.prisma.segment.findUnique({ where: { id } });
    if (!segment) return { customers: [] };

    const storeIds = (segment as any).storeIds ?? [];
    const customers = await this.orders.getCustomers(
      storeIds.length ? { storeIds } : {},
    );

    const matched = this.matchCustomers(
      customers,
      segment.rules as SegmentRules,
    );

    return {
      name: segment.name,
      total: matched.length,
      customers: matched.map((c: any) => ({
        name: c.name,
        phone: c.displayPhone,
        city: c.city,
        totalOrders: c.totalOrders,
        lifetimeValue: c.lifetimeValue,
        daysSinceLast: c.daysSinceLast,
        storeName: c.storeName,
      })),
    };
  }
}
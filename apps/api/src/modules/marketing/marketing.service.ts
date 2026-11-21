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

    let legacyCustomers: any[] | null = null;

    const sizes = await Promise.all(
      segments.map(async (s) => {
        const rules = s.rules as SegmentRules;
        const segStores = ((s as any).storeIds ?? []) as string[];
        const scope = storeIds?.length ? storeIds : segStores;

        if (this.needsLegacyMatch(rules)) {
          if (!legacyCustomers) {
            legacyCustomers = await this.orders.getCustomers(
              scope.length ? { storeIds: scope } : {},
            );
          }
          return this.matchCustomers(legacyCustomers, rules).length;
        }

        return this.prisma.customer.count({
          where: this.buildCustomerWhere(rules, scope.length ? scope : undefined),
        });
      }),
    );

    return segments.map((s, i) => ({ ...s, size: sizes[i] }));
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
    if (this.needsLegacyMatch(rules)) {
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

    const where = this.buildCustomerWhere(rules, storeIds);

    const [size, agg, sample] = await Promise.all([
      this.prisma.customer.count({ where }),
      this.prisma.customer.aggregate({ where, _sum: { lifetimeValue: true } }),
      this.prisma.customer.findMany({
        where,
        take: 10,
        orderBy: { lifetimeValue: 'desc' },
        select: {
          name: true,
          displayPhone: true,
          city: true,
          totalOrders: true,
          lifetimeValue: true,
        },
      }),
    ]);

    return {
      size,
      totalValue: Number(agg._sum.lifetimeValue ?? 0),
      sample: sample.map((c) => ({
        name: c.name,
        phone: c.displayPhone,
        city: c.city,
        totalOrders: c.totalOrders,
        lifetimeValue: Number(c.lifetimeValue),
      })),
    };
  }
   /** Traduit les regles en filtre Prisma sur la table Customer (instantane). */
   private buildCustomerWhere(rules: SegmentRules, storeIds?: string[]): any {
    const where: any = {};
    if (storeIds?.length) where.storeIds = { hasSome: storeIds };

    if (rules.minOrders !== undefined || rules.maxOrders !== undefined) {
      where.totalOrders = {};
      if (rules.minOrders !== undefined) where.totalOrders.gte = rules.minOrders;
      if (rules.maxOrders !== undefined) where.totalOrders.lte = rules.maxOrders;
    }

    if (rules.minLtv !== undefined || rules.maxLtv !== undefined) {
      where.lifetimeValue = {};
      if (rules.minLtv !== undefined) where.lifetimeValue.gte = rules.minLtv;
      if (rules.maxLtv !== undefined) where.lifetimeValue.lte = rules.maxLtv;
    }

    if (rules.inactiveDays !== undefined) {
      where.lastOrderAt = {
        lte: new Date(Date.now() - rules.inactiveDays * 86_400_000),
      };
    }
    if (rules.activeDays !== undefined) {
      where.lastOrderAt = {
        ...(where.lastOrderAt ?? {}),
        gte: new Date(Date.now() - rules.activeDays * 86_400_000),
      };
    }

    if (rules.maxReturnRate !== undefined) {
      where.returnRate = { lte: rules.maxReturnRate };
    }
    if (rules.minConfirmationRate !== undefined) {
      where.confirmationRate = { gte: rules.minConfirmationRate };
    }
    if (rules.cities?.length) where.city = { in: rules.cities };

    return where;
  }

  /** Produits et tags ne sont pas dans la table Customer : calcul lent. */
  private needsLegacyMatch(rules: SegmentRules): boolean {
    return !!(rules.products?.length || rules.tags?.length);
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

    console.warn(`[marketing] CREATE campaign "${data.name}" store=${data.storeId ?? 'none'}`);

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
      // Numeros saisis a la main ou importes d'un fichier,
      // completes avec les donnees client quand le numero est connu
      const enriched = await this.enrichRecipients(manual);
      matched = enriched.map((r) => ({
        displayPhone: r.phone.trim(),
        name: r.name ?? r.customer?.name ?? 'Client',
        city: r.customer?.city ?? '',
        totalOrders: r.customer?.totalOrders,
        lifetimeValue: r.customer?.lifetimeValue,
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
    console.warn(`[marketing] DELETE BLOQUE pour ${id}`);
    throw new Error('Suppression de campagne desactivee temporairement');
  }

  private renderTemplate(template: string, customer: any): string {
    const num = (v: any) =>
      v === undefined || v === null || v === ''
        ? ''
        : String(Math.round(Number(v)));

    return template
      .replace(/\{\{nom\}\}/gi, customer.name ?? 'Client')
      .replace(/\{\{ville\}\}/gi, customer.city ?? '')
      .replace(/\{\{commandes\}\}/gi, num(customer.totalOrders))
      .replace(/\{\{valeur\}\}/gi, num(customer.lifetimeValue))
      .replace(/\{\{produit\}\}/gi, customer.topProducts?.[0]?.title ?? '');
  }

  /** Complete une liste de numeros avec les donnees client connues. */
  private async enrichRecipients(list: { phone: string; name?: string }[]) {
    const norm = (p: string) => {
      const d = String(p ?? '').replace(/\D/g, '');
      return d.length > 8 ? d.slice(-8) : d;
    };

    const keys = Array.from(
      new Set(list.map((r) => norm(r.phone)).filter((p) => p.length >= 6)),
    );
    if (!keys.length) return list.map((r) => ({ ...r, customer: null as any }));

    const found = await this.prisma.customer.findMany({
      where: { phone: { in: keys } },
      select: {
        phone: true,
        name: true,
        city: true,
        totalOrders: true,
        lifetimeValue: true,
      },
    });
    const byPhone = new Map(found.map((c) => [c.phone, c]));

    return list.map((r) => ({
      ...r,
      customer: byPhone.get(norm(r.phone)) ?? null,
    }));
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
   /** Envoi immediat vers un ou plusieurs numeros, sans creer de campagne. */
   async sendTest(data: {
    phone?: string;
    recipients?: { phone: string; name?: string }[];
    message: string;
    storeId?: string;
  }) {
    const list = [
      ...(data.phone?.trim() ? [{ phone: data.phone.trim() }] : []),
      ...(data.recipients ?? []),
    ].filter((r) => r?.phone?.trim());

    if (!list.length) return { ok: false, error: 'Aucun numero' };
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
    const results: { phone: string; name: string | null; ok: boolean }[] = [];
    let sent = 0;

    const enriched = await this.enrichRecipients(list);

    for (const r of enriched) {
      const phone = r.phone.trim();
      const c = r.customer;
      const msg = this.renderTemplate(data.message, {
        name: r.name ?? c?.name ?? 'Client',
        city: c?.city ?? '',
        totalOrders: c?.totalOrders,
        lifetimeValue: c?.lifetimeValue,
      });
      const ok = await this.messaging.sendSms(phone, msg, sender);
      if (ok) sent++;
      results.push({ phone, name: r.name ?? null, ok });
    }

    return {
      ok: sent > 0,
      configured,
      simulated: !configured,
      sender: sender ?? process.env.SMS_SENDER ?? null,
      storeName,
      total: list.length,
      sent,
      failed: list.length - sent,
      results,
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
  async getSegmentCustomers(id: string, storeIds?: string[]) {
    const segment = await this.prisma.segment.findUnique({ where: { id } });
    if (!segment) return { customers: [], total: 0 };

    const rules = segment.rules as SegmentRules;
    const segStores = ((segment as any).storeIds ?? []) as string[];
    const scope = storeIds?.length ? storeIds : segStores;

    if (this.needsLegacyMatch(rules)) {
      const customers = await this.orders.getCustomers(
        scope.length ? { storeIds: scope } : {},
      );
      const matched = this.matchCustomers(customers, rules);
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
        })),
      };
    }

    const where = this.buildCustomerWhere(rules, scope.length ? scope : undefined);

    const [total, rows] = await Promise.all([
      this.prisma.customer.count({ where }),
      this.prisma.customer.findMany({
        where,
        take: 500,
        orderBy: { lifetimeValue: 'desc' },
        select: {
          name: true,
          displayPhone: true,
          city: true,
          totalOrders: true,
          lifetimeValue: true,
          lastOrderAt: true,
        },
      }),
    ]);

    return {
      name: segment.name,
      total,
      customers: rows.map((c) => ({
        name: c.name,
        phone: c.displayPhone,
        city: c.city,
        totalOrders: c.totalOrders,
        lifetimeValue: Number(c.lifetimeValue),
        daysSinceLast: c.lastOrderAt
          ? Math.floor((Date.now() - new Date(c.lastOrderAt).getTime()) / 86_400_000)
          : null,
      })),
    };
  }
    /** Commandes passees par les destinataires dans les jours suivant l'envoi. */
    async getCampaignStats(id: string, windowDays = 7) {
      const campaign = await this.prisma.campaign.findUnique({ where: { id } });
      if (!campaign) return null;
  
      const norm = (p?: string | null) => {
        const d = String(p ?? '').replace(/\D/g, '');
        return d.length > 8 ? d.slice(-8) : d;
      };
  
      const sends = await this.prisma.campaignSend.findMany({
        where: { campaignId: id, status: 'SENT' },
        select: { phone: true },
      });
  
      const phones = new Set(
        sends.map((s) => norm(s.phone)).filter((p) => p.length >= 6),
      );
  
      const base = {
        sent: sends.length,
        recipients: phones.size,
        windowDays,
        orders: 0,
        revenue: 0,
        rate: 0,
        list: [] as any[],
      };
  
      if (!campaign.sentAt || phones.size === 0) return base;
  
      const from = campaign.sentAt;
      const to = new Date(from.getTime() + windowDays * 86_400_000);
      const storeId = (campaign as any).storeId as string | null;
  
      const orders = await this.prisma.order.findMany({
        where: {
          ...(storeId ? { storeId } : {}),
          sourceCreatedAt: { gte: from, lte: to },
          orderStatus: {
            notIn: ['ANNULE', 'ARCHIVE', 'DUPLIQUE', 'PANIER_ABANDONNE'],
          },
        },
        select: {
          id: true,
          orderNumber: true,
          total: true,
          orderStatus: true,
          customerName: true,
          customerPhone: true,
          sourceCreatedAt: true,
        },
        orderBy: { sourceCreatedAt: 'desc' },
      });
  
      const attributed = orders.filter((o) => phones.has(norm(o.customerPhone)));
      const revenue = attributed.reduce((s, o) => s + Number(o.total), 0);
      const delivered = attributed.filter((o) =>
        ['LIVRE', 'PAYE'].includes(o.orderStatus as string),
      );
  
      return {
        ...base,
        orders: attributed.length,
        revenue: Math.round(revenue),
        delivered: delivered.length,
        deliveredRevenue: Math.round(
          delivered.reduce((s, o) => s + Number(o.total), 0),
        ),
        rate: phones.size
          ? Math.round((attributed.length / phones.size) * 1000) / 10
          : 0,
        storeOrdersInWindow: orders.length,
        list: attributed.slice(0, 200).map((o) => ({
          orderNumber: o.orderNumber,
          name: o.customerName,
          phone: o.customerPhone,
          total: Number(o.total),
          status: o.orderStatus,
          date: o.sourceCreatedAt,
        })),
      };
    }
}
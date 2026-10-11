import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DispatchService {
  private readonly logger = new Logger('Dispatch');

  constructor(private prisma: PrismaService) {}

  // ---------- AVAILABILITY ----------

  async listAgents(stage = 'CONFIRMATION', from?: string, to?: string) {
    const users = await this.prisma.user.findMany({
      where: { isActive: true, role: { not: 'SUPER_ADMIN' } },
      include: {
        availability: { where: { stage } },
        dispatchRules: { where: { isActive: true, stage } },
      },
      orderBy: { name: 'asc' },
    });

    const dateFilter: any = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);

    const agentField =
      stage === 'PREPARATION' ? 'prepAgentId'
      : stage === 'SCAN' ? 'scanAgentId'
      : 'assignedAgentId';

    const orders = await this.prisma.order.findMany({
      where: {
        [agentField]: { not: null },
        ...(Object.keys(dateFilter).length > 0 && { sourceCreatedAt: dateFilter }),
      } as any,
      select: {
        assignedAgentId: true,
        prepAgentId: true,
        scanAgentId: true,
        orderStatus: true,
        callAttempts: true,
        total: true,
      },
    });

    const stats: Record<string, any> = {};

    for (const o of orders) {
      const id = (o as any)[agentField];
      if (!id) continue;

      if (!stats[id]) {
        stats[id] = { total: 0, confirmed: 0, refused: 0, pending: 0, revenue: 0 };
      }

      const s = stats[id];
      s.total++;

      if (stage === 'CONFIRMATION') {
        const attempts = (o.callAttempts as any[]) ?? [];
        const isConfirmed = attempts.some((a) => a.result === 'ANSWERED_CONFIRMED');
        const isRefused =
          attempts.some((a) => a.result === 'ANSWERED_REFUSED') ||
          o.orderStatus === 'ANNULE';

        if (isConfirmed) { s.confirmed++; s.revenue += Number(o.total); }
        else if (isRefused) s.refused++;
        else s.pending++;
      } else if (stage === 'PREPARATION') {
        if (['EMBALLE', 'AU_DEPOT_LIVREUR', 'EN_COURS_DE_LIVRAISON', 'LIVRE', 'PAYE'].includes(o.orderStatus)) {
          s.confirmed++;
        } else s.pending++;
      } else {
        if (['RETOUR_RECU'].includes(o.orderStatus)) s.confirmed++;
        else s.pending++;
      }
    }

    return users.map((u) => {
      const s = stats[u.id] ?? { total: 0, confirmed: 0, refused: 0, pending: 0, revenue: 0 };
      const availability = u.availability[0];

      return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        isAvailable: availability
        ? availability.isActive
        : stage === 'CONFIRMATION',
        note: availability?.note ?? null,
        rules: u.dispatchRules,
        stats: {
          ...s,
          revenue: Math.round(s.revenue),
          treatedRate: s.total > 0
            ? Math.round(((s.confirmed + s.refused) / s.total) * 100)
            : 0,
        },
      };
    });
  }
  async redistributePending() {
    // Orders assigned to paused agents, still untreated
    const pausedAgents = await this.prisma.agentAvailability.findMany({
      where: { isActive: false },
      select: { userId: true },
    });
    const pausedIds = pausedAgents.map((a) => a.userId);

    if (pausedIds.length === 0) return { ok: true, moved: 0 };

    const orders = await this.prisma.order.findMany({
      where: {
        assignedAgentId: { in: pausedIds },
        orderStatus: { in: ['NOUVEAU', 'CONFIRMATION_EN_COURS'] },
      },
      include: { lineItems: { select: { sku: true } } },
    });

    let moved = 0;
    for (const o of orders) {
      const agent = await this.pickAgent({
        storeId: o.storeId,
        total: Number(o.total),
        city: (o.shippingAddress as any)?.city ?? null,
        skus: o.lineItems.map((li) => li.sku).filter(Boolean) as string[],
      });

      if (!agent) continue;

      await this.prisma.order.update({
        where: { id: o.id },
        data: {
          assignedAgentId: agent.id,
          assignedAgentName: agent.name,
        },
      });
      moved++;
    }

    return { ok: true, moved };
  }
  async assignBulk(orderIds: string[], userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    if (!user) return { ok: false, error: 'Agent introuvable' };

    const result = await this.prisma.order.updateMany({
      where: { id: { in: orderIds } },
      data: {
        assignedAgentId: userId,
        assignedAgentName: user.name,
      },
    });

    return { ok: true, assigned: result.count, agent: user.name };
  }
  async setAvailability(userId: string, isActive: boolean, stage = 'CONFIRMATION', note?: string) {
    return this.prisma.agentAvailability.upsert({
      where: { userId_stage: { userId, stage } },
      create: {
        userId,
        stage,
        isActive,
        note: note ?? null,
        pausedAt: isActive ? null : new Date(),
      },
      update: {
        isActive,
        note: note ?? null,
        pausedAt: isActive ? null : new Date(),
      },
    });
  }

  // ---------- RULES ----------

  async addRule(data: {
    userId: string;
    stage?: string;
    storeId?: string;
    productSku?: string;
    minTotal?: number;
    maxTotal?: number;
    city?: string;
  }) {
    return this.prisma.dispatchRule.create({
      data: {
        userId: data.userId,
        stage: data.stage ?? 'CONFIRMATION',
        storeId: data.storeId ?? null,
        productSku: data.productSku ?? null,
        minTotal: data.minTotal ?? null,
        maxTotal: data.maxTotal ?? null,
        city: data.city ?? null,
      },
    });
  }
  async removeRule(id: string) {
    return this.prisma.dispatchRule.delete({ where: { id } });
  }

  // ---------- DISPATCH ENGINE ----------

  /**
   * Picks the best agent for an order.
   * Returns null when nothing matches.
   */
  async pickAgent(
    order: {
      storeId: string;
      total: number;
      city?: string | null;
      skus: string[];
    },
    stage = 'CONFIRMATION',
  ): Promise<{ id: string; name: string } | null> {
    // Active agents only
    const agents = await this.prisma.user.findMany({
      where: {
        isActive: true,
        role: { not: 'SUPER_ADMIN' },
        ...(stage === 'CONFIRMATION'
          ? {
              OR: [
                { availability: { some: { stage, isActive: true } } },
                { availability: { none: { stage } } },
              ],
            }
          : {
              availability: { some: { stage, isActive: true } },
            }),
      },
      include: { dispatchRules: { where: { isActive: true } } },
    });

    if (agents.length === 0) return null;

    // Today's load per agent
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const counts = await this.prisma.order.groupBy({
        by: ['assignedAgentId'],
        where: {
          assignedAgentId: { not: null },
          orderStatus: { in: ['NOUVEAU', 'CONFIRMATION_EN_COURS'] },
          sourceCreatedAt: { gte: today },
        },
        _count: { id: true },
      });
    const load = Object.fromEntries(
      counts.map((c) => [c.assignedAgentId, c._count.id]),
    );

    // Agents whose rule matches this order
    const matching = agents.filter((a) =>
      a.dispatchRules.some((r) => this.ruleMatches(r, order)),
    );

    // Agents with no rule at all act as catch-all
    const catchAll = agents.filter((a) => a.dispatchRules.length === 0);

    const pool = matching.length > 0 ? matching : catchAll;
    if (pool.length === 0) return null;

    // Least loaded wins
    pool.sort((a, b) => (load[a.id] ?? 0) - (load[b.id] ?? 0));
    const chosen = pool[0];

    return { id: chosen.id, name: chosen.name };
  }

  private ruleMatches(rule: any, order: any): boolean {
    if (rule.storeId && rule.storeId !== order.storeId) return false;
    if (rule.productSku && !order.skus.includes(rule.productSku)) return false;
    if (rule.minTotal && order.total < Number(rule.minTotal)) return false;
    if (rule.maxTotal && order.total > Number(rule.maxTotal)) return false;
    if (rule.city && rule.city !== order.city) return false;
    return true;
  }

  /**
   * Assigns every unassigned order waiting for confirmation.
   */
  async dispatchPending(storeIds?: string[]) {
    const orders = await this.prisma.order.findMany({
      where: {
        assignedAgentId: null,
        orderStatus: { in: ['NOUVEAU', 'CONFIRMATION_EN_COURS'] },
        ...(storeIds?.length && { storeId: { in: storeIds } }),
      },
      include: { lineItems: { select: { sku: true } } },
      orderBy: { sourceCreatedAt: 'asc' },
    });

       // Load agents and their current load once
       const agents = await this.prisma.user.findMany({
        where: {
          isActive: true,
          role: { not: 'SUPER_ADMIN' },
          OR: [
            { availability: { some: { stage: 'CONFIRMATION', isActive: true } } },
            { availability: { none: { stage: 'CONFIRMATION' } } },
          ],
        },
        include: { dispatchRules: { where: { isActive: true, stage: 'CONFIRMATION' } } },
      });
  
      if (agents.length === 0) {
        return { ok: true, assigned: 0, unassigned: orders.length, orders: [] };
      }
  
      const today = new Date();
      today.setHours(0, 0, 0, 0);
  
      const counts = await this.prisma.order.groupBy({
        by: ['assignedAgentId'],
        where: {
          assignedAgentId: { not: null },
          orderStatus: { in: ['NOUVEAU', 'CONFIRMATION_EN_COURS'] },
          sourceCreatedAt: { gte: today },
        },
        _count: { id: true },
      });
  
      const load: Record<string, number> = {};
      agents.forEach((a) => { load[a.id] = 0; });
      counts.forEach((c) => {
        if (c.assignedAgentId) load[c.assignedAgentId] = c._count.id;
      });
  
      let assigned = 0;
      const unassigned: string[] = [];
      const updates: { id: string; agentId: string; agentName: string }[] = [];
  
      for (const o of orders) {
        const payload = {
          storeId: o.storeId,
          total: Number(o.total),
          city: (o.shippingAddress as any)?.city ?? null,
          skus: o.lineItems.map((li) => li.sku).filter(Boolean) as string[],
        };
  
        const matching = agents.filter((a) =>
          a.dispatchRules.some((r) => this.ruleMatches(r, payload)),
        );
        const catchAll = agents.filter((a) => a.dispatchRules.length === 0);
        const pool = matching.length > 0 ? matching : catchAll;
  
        if (pool.length === 0) {
          unassigned.push(o.orderNumber);
          continue;
        }
  
        pool.sort((a, b) => (load[a.id] ?? 0) - (load[b.id] ?? 0));
        const chosen = pool[0];
  
        load[chosen.id] = (load[chosen.id] ?? 0) + 1;
        updates.push({ id: o.id, agentId: chosen.id, agentName: chosen.name });
        assigned++;
      }
  
      // Write in batches
      for (const u of updates) {
        await this.prisma.order.update({
          where: { id: u.id },
          data: { assignedAgentId: u.agentId, assignedAgentName: u.agentName },
        });
      }

    return { ok: true, assigned, unassigned: unassigned.length, orders: unassigned };
  }

  /**
   * Assigns a single order right after it arrives.
   */
  async dispatchOne(orderId: string, stage = 'CONFIRMATION') {
    const o = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { lineItems: { select: { sku: true } } },
    });
    if (!o) return { ok: false };

    const agentField =
      stage === 'PREPARATION' ? 'prepAgentId'
      : stage === 'SCAN' ? 'scanAgentId'
      : 'assignedAgentId';
    const nameField =
      stage === 'PREPARATION' ? 'prepAgentName'
      : stage === 'SCAN' ? 'scanAgentName'
      : 'assignedAgentName';

    if ((o as any)[agentField]) return { ok: false, reason: 'Déjà assignée' };

    const agent = await this.pickAgent({
      storeId: o.storeId,
      total: Number(o.total),
      city: (o.shippingAddress as any)?.city ?? null,
      skus: o.lineItems.map((li) => li.sku).filter(Boolean) as string[],
    }, stage);

    if (!agent) return { ok: false, reason: 'Aucun agent disponible' };

    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        [agentField]: agent.id,
        [nameField]: agent.name,
      } as any,
    });

    return { ok: true, agent };
  }

  async reassign(orderId: string, userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    if (!user) return { ok: false, error: 'Agent introuvable' };

    await this.prisma.order.update({
      where: { id: orderId },
      data: { assignedAgentId: userId, assignedAgentName: user.name },
    });

    return { ok: true };
  }
}
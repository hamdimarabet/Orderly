import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DispatchService {
  private readonly logger = new Logger('Dispatch');

  constructor(private prisma: PrismaService) {}

  // ---------- AVAILABILITY ----------

  async listAgents() {
    const users = await this.prisma.user.findMany({
      where: { isActive: true, role: { not: 'SUPER_ADMIN' } },
      include: {
        availability: true,
        dispatchRules: true,
      },
      orderBy: { name: 'asc' },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const counts = await this.prisma.order.groupBy({
      by: ['assignedAgentId'],
      where: { confirmedAt: { gte: today } },
      _count: { id: true },
    });

    const countMap = Object.fromEntries(
      counts.map((c) => [c.assignedAgentId, c._count.id]),
    );

    return users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      isAvailable: u.availability?.isActive ?? true,
      note: u.availability?.note ?? null,
      todayCount: countMap[u.id] ?? 0,
      rules: u.dispatchRules.filter((r) => r.isActive),
    }));
  }

  async setAvailability(userId: string, isActive: boolean, note?: string) {
    return this.prisma.agentAvailability.upsert({
      where: { userId },
      create: {
        userId,
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
    storeId?: string;
    productSku?: string;
    minTotal?: number;
    maxTotal?: number;
    city?: string;
  }) {
    return this.prisma.dispatchRule.create({
      data: {
        userId: data.userId,
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
  async pickAgent(order: {
    storeId: string;
    total: number;
    city?: string | null;
    skus: string[];
  }): Promise<{ id: string; name: string } | null> {
    // Active agents only
    const agents = await this.prisma.user.findMany({
      where: {
        isActive: true,
        role: { not: 'SUPER_ADMIN' },
        OR: [
          { availability: { isActive: true } },
          { availability: null },
        ],
      },
      include: { dispatchRules: { where: { isActive: true } } },
    });

    if (agents.length === 0) return null;

    // Today's load per agent
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const counts = await this.prisma.order.groupBy({
      by: ['assignedAgentId'],
      where: { confirmedAt: { gte: today } },
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
      take: 200,
    });

    let assigned = 0;
    const unassigned: string[] = [];

    for (const o of orders) {
      const agent = await this.pickAgent({
        storeId: o.storeId,
        total: Number(o.total),
        city: (o.shippingAddress as any)?.city ?? null,
        skus: o.lineItems.map((li) => li.sku).filter(Boolean) as string[],
      });

      if (!agent) {
        unassigned.push(o.orderNumber);
        continue;
      }

      await this.prisma.order.update({
        where: { id: o.id },
        data: {
          assignedAgentId: agent.id,
          assignedAgentName: agent.name,
        },
      });
      assigned++;
    }

    return { ok: true, assigned, unassigned: unassigned.length, orders: unassigned };
  }

  /**
   * Assigns a single order right after it arrives.
   */
  async dispatchOne(orderId: string) {
    const o = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { lineItems: { select: { sku: true } } },
    });
    if (!o || o.assignedAgentId) return { ok: false };

    const agent = await this.pickAgent({
      storeId: o.storeId,
      total: Number(o.total),
      city: (o.shippingAddress as any)?.city ?? null,
      skus: o.lineItems.map((li) => li.sku).filter(Boolean) as string[],
    });

    if (!agent) return { ok: false, reason: 'Aucun agent disponible' };

    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        assignedAgentId: agent.id,
        assignedAgentName: agent.name,
      },
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
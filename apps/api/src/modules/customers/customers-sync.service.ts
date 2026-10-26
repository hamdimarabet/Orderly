import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { CustomersService } from './customers.service';

/**
 * Keeps the Customer table in step with the orders, without touching
 * orders.service.ts.
 *
 *  - every 2 min : any order with no customer gets one (new orders, new people)
 *  - every hour  : customers who ordered in the last 14 days are recalculated
 *                  (that is where status changes happen — old orders rarely move)
 *
 * nextDueAt does not drift on its own: it is a stored date, and "due" is decided
 * by comparing it to now() at query time. So nothing else needs a nightly pass.
 */
@Injectable()
export class CustomersSyncService {
  private readonly logger = new Logger('CustomersSync');
  private running = false;

  constructor(
    private prisma: PrismaService,
    private customers: CustomersService,
  ) {}

  // =========================================================================
  // NEW ORDERS  ->  link / create the customer
  // =========================================================================

  @Cron('*/2 * * * *')
  async linkNewOrders() {
    if (this.running) return;
    this.running = true;

    try {
      const orphans = await this.prisma.order.findMany({
        where: { customerId: null, customerPhone: { not: null } },
        select: { id: true },
        take: 500,
        orderBy: { createdAt: 'desc' },
      });

      if (!orphans.length) return;

      const touched = new Set<string>();
      for (const o of orphans) {
        try {
          const c = await this.customers.syncFromOrder(o.id);
          if (c) touched.add(c.id);
        } catch (e: any) {
          this.logger.warn(`order ${o.id}: ${e.message}`);
        }
      }

      this.logger.log(`linked ${orphans.length} orders -> ${touched.size} customers`);
    } catch (e: any) {
      this.logger.error(`linkNewOrders: ${e.message}`);
    } finally {
      this.running = false;
    }
  }

  // =========================================================================
  // STATUS CHANGES  ->  recompute recently active customers
  // =========================================================================

  @Cron(CronExpression.EVERY_HOUR)
  async refreshRecent() {
    try {
      const since = new Date(Date.now() - 14 * 86_400_000);

      const recent = await this.prisma.customer.findMany({
        where: { lastOrderAt: { gte: since } },
        select: { id: true },
      });

      let ok = 0;
      for (const c of recent) {
        try {
          await this.customers.recompute(c.id);
          ok++;
        } catch { /* skip and carry on */ }
      }

      this.logger.log(`refreshed ${ok}/${recent.length} recent customers`);
    } catch (e: any) {
      this.logger.error(`refreshRecent: ${e.message}`);
    }
  }

  // =========================================================================
  // manual trigger, for when you don't want to wait for the cron
  // =========================================================================

  async runNow() {
    await this.linkNewOrders();
    await this.refreshRecent();
    return { ok: true };
  }
}
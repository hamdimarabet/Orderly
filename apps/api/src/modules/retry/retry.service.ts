import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DispatchService } from '../dispatch/dispatch.service';

@Injectable()
export class RetryService {
  private readonly logger = new Logger('Retry');

  constructor(
    private prisma: PrismaService,
    private dispatch: DispatchService,
  ) {}

  // ---------- CONFIG ----------

  async getConfig(storeId?: string) {
    const config = await this.prisma.retryConfig.findFirst({
      where: { storeId: storeId ?? null },
    });

    return config ?? {
      id: null,
      storeId: storeId ?? null,
      isActive: false,
      attemptsPerDay: 3,
      maxAttempts: 9,
      minGapMinutes: 120,
      cancelAfterMax: true,
    };
  }

  async saveConfig(data: {
    storeId?: string | null;
    isActive?: boolean;
    attemptsPerDay?: number;
    maxAttempts?: number;
    minGapMinutes?: number;
    cancelAfterMax?: boolean;
  }) {
    const storeId = data.storeId ?? null;
    const existing = await this.prisma.retryConfig.findFirst({ where: { storeId } });

    if (existing) {
      return this.prisma.retryConfig.update({
        where: { id: existing.id },
        data: {
          ...(data.isActive !== undefined && { isActive: data.isActive }),
          ...(data.attemptsPerDay !== undefined && { attemptsPerDay: data.attemptsPerDay }),
          ...(data.maxAttempts !== undefined && { maxAttempts: data.maxAttempts }),
          ...(data.minGapMinutes !== undefined && { minGapMinutes: data.minGapMinutes }),
          ...(data.cancelAfterMax !== undefined && { cancelAfterMax: data.cancelAfterMax }),
        },
      });
    }

    return this.prisma.retryConfig.create({
      data: {
        storeId,
        isActive: data.isActive ?? false,
        attemptsPerDay: data.attemptsPerDay ?? 3,
        maxAttempts: data.maxAttempts ?? 9,
        minGapMinutes: data.minGapMinutes ?? 120,
        cancelAfterMax: data.cancelAfterMax ?? true,
      },
    });
  }

  // ---------- WORKING HOURS ----------

  /**
   * Returns the shift windows for a given day, as minutes from midnight.
   */
  private async getShiftWindows(date: Date): Promise<{ start: number; end: number }[]> {
    const day = date.getDay();

    const shifts = await this.prisma.shift.findMany({
      where: { isActive: true },
    });

    return shifts
      .filter((s) => s.days.includes(day))
      .map((s) => {
        const [sh, sm] = s.startTime.split(':').map(Number);
        const [eh, em] = s.endTime.split(':').map(Number);
        return { start: sh * 60 + sm, end: eh * 60 + em };
      })
      .sort((a, b) => a.start - b.start);
  }

  /**
   * Finds the next moment inside working hours, at least `gapMinutes` from now.
   */
  async computeNextRetry(from: Date, gapMinutes: number): Promise<Date | null> {
    let candidate = new Date(from.getTime() + gapMinutes * 60000);

    // Look up to 14 days ahead
    for (let i = 0; i < 14; i++) {
      const windows = await this.getShiftWindows(candidate);

      if (windows.length > 0) {
        const minutes = candidate.getHours() * 60 + candidate.getMinutes();

        // Inside a window already
        const inside = windows.find((w) => minutes >= w.start && minutes < w.end);
        if (inside) return candidate;

        // Before the first window of the day
        const next = windows.find((w) => minutes < w.start);
        if (next) {
          const d = new Date(candidate);
          d.setHours(Math.floor(next.start / 60), next.start % 60, 0, 0);
          return d;
        }
      }

      // Move to the start of the next day
      candidate = new Date(candidate);
      candidate.setDate(candidate.getDate() + 1);
      candidate.setHours(0, 0, 0, 0);
    }

    return null;
  }

  /**
   * Schedules the next retry for an order after a failed call.
   */
  async scheduleRetry(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        storeId: true,
        callAttempts: true,
        orderStatus: true,
      },
    });
    if (!order) return { ok: false };

    const config = await this.getConfig(order.storeId);
    if (!config.isActive) {
      const global = await this.getConfig(undefined);
      if (!global.isActive) return { ok: false, reason: 'Relances désactivées' };
      Object.assign(config, global);
    }

    const attempts = (order.callAttempts as any[]) ?? [];

    // Already settled
    const settled =
      attempts.some((a) =>
        ['ANSWERED_CONFIRMED', 'ANSWERED_REFUSED'].includes(a.result),
      ) || !['NOUVEAU', 'CONFIRMATION_EN_COURS'].includes(order.orderStatus);

    if (settled) {
      await this.prisma.order.update({
        where: { id: orderId },
        data: { nextRetryAt: null },
      });
      return { ok: false, reason: 'Commande déjà traitée' };
    }

    // Max attempts reached
    if (attempts.length >= config.maxAttempts) {
      if (config.cancelAfterMax) {
        await this.prisma.order.update({
          where: { id: orderId },
          data: {
            orderStatus: 'ANNULE',
            cancellationReason: 'Injoignable',
            cancellationNote: `${attempts.length} tentatives sans réponse`,
            nextRetryAt: null,
          },
        });

        await this.prisma.orderEvent.create({
          data: {
            orderId,
            eventType: 'auto_cancelled',
            payload: { attempts: attempts.length },
            actor: 'system',
          },
        });
      }
      return { ok: true, cancelled: config.cancelAfterMax };
    }

    const next = await this.computeNextRetry(new Date(), config.minGapMinutes);
    if (!next) return { ok: false, reason: 'Aucun créneau trouvé' };

    await this.prisma.order.update({
      where: { id: orderId },
      data: { nextRetryAt: next, retryCount: attempts.length },
    });

    return { ok: true, nextRetryAt: next };
  }

  /**
   * Puts due orders back into the dispatch cycle.
   */
  async processDueRetries() {
    const due = await this.prisma.order.findMany({
      where: {
        nextRetryAt: { lte: new Date() },
        orderStatus: { in: ['NOUVEAU', 'CONFIRMATION_EN_COURS'] },
      },
      select: { id: true, storeId: true, callAttempts: true },
      take: 200,
    });

    let requeued = 0;
    let cancelled = 0;

    for (const o of due) {
      const config = await this.getConfig(o.storeId);
      const attempts = (o.callAttempts as any[]) ?? [];

      if (attempts.length >= config.maxAttempts) {
        if (config.cancelAfterMax) {
          await this.prisma.order.update({
            where: { id: o.id },
            data: {
              orderStatus: 'ANNULE',
              cancellationReason: 'Injoignable',
              cancellationNote: `${attempts.length} tentatives sans réponse`,
              nextRetryAt: null,
            },
          });
          cancelled++;
        }
        continue;
      }

      // Clear the assignment so it goes back into the pool
      await this.prisma.order.update({
        where: { id: o.id },
        data: {
          nextRetryAt: null,
          assignedAgentId: null,
          assignedAgentName: null,
        },
      });

      await this.dispatch.dispatchOne(o.id).catch(() => {});
      requeued++;
    }

    return { ok: true, requeued, cancelled };
  }
    /**
   * Moves orders left untouched for too long back into the pool.
   */
    async reassignIdle() {
        const config = await this.getConfig(undefined);
        if (!config.isActive || !config.reassignAfterMin || config.reassignAfterMin <= 0) {
          return { ok: false, reason: 'Réassignation désactivée' };
        }
    
        const cutoff = new Date(Date.now() - config.reassignAfterMin * 60000);
    
        const idle = await this.prisma.order.findMany({
          where: {
            assignedAgentId: { not: null },
            assignedAt: { lte: cutoff },
            orderStatus: { in: ['NOUVEAU', 'CONFIRMATION_EN_COURS'] },
          },
          select: { id: true, assignedAgentId: true },
          take: 100,
        });
    
        let moved = 0;
    
        for (const o of idle) {
          const previous = o.assignedAgentId;
    
          await this.prisma.order.update({
            where: { id: o.id },
            data: {
              assignedAgentId: null,
              assignedAgentName: null,
              assignedAt: null,
            },
          });
    
          const result = await this.dispatch.dispatchOne(o.id).catch(() => null);
    
          // Give it back when nobody else is available
          if (!result?.ok) {
            await this.prisma.order.update({
              where: { id: o.id },
              data: { assignedAgentId: previous, assignedAt: new Date() },
            });
            continue;
          }
    
          moved++;
        }
    
        return { ok: true, moved };
      }
}
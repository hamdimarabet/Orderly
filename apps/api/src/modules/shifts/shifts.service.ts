import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ShiftsService {
  private readonly logger = new Logger('Shifts');

  constructor(private prisma: PrismaService) {}

  // ---------- SHIFTS ----------

  async listShifts() {
    return this.prisma.shift.findMany({
      include: {
        assignments: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
      orderBy: { startTime: 'asc' },
    });
  }

  async createShift(data: {
    name: string;
    startTime: string;
    endTime: string;
    days: number[];
    userIds?: string[];
  }) {
    return this.prisma.shift.create({
      data: {
        name: data.name,
        startTime: data.startTime,
        endTime: data.endTime,
        days: data.days,
        ...(data.userIds?.length && {
          assignments: {
            create: data.userIds.map((userId) => ({ userId })),
          },
        }),
      },
      include: {
        assignments: { include: { user: { select: { id: true, name: true } } } },
      },
    });
  }

  async updateShift(id: string, data: any) {
    if (data.userIds) {
      await this.prisma.shiftAssignment.deleteMany({ where: { shiftId: id } });
      await this.prisma.shiftAssignment.createMany({
        data: data.userIds.map((userId: string) => ({ shiftId: id, userId })),
        skipDuplicates: true,
      });
    }

    return this.prisma.shift.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.startTime !== undefined && { startTime: data.startTime }),
        ...(data.endTime !== undefined && { endTime: data.endTime }),
        ...(data.days !== undefined && { days: data.days }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
      include: {
        assignments: { include: { user: { select: { id: true, name: true } } } },
      },
    });
  }

  async removeShift(id: string) {
    return this.prisma.shift.delete({ where: { id } });
  }

  // ---------- CLOCK ----------

  async clockIn(userId: string) {
    const open = await this.prisma.clockEntry.findFirst({
      where: { userId, clockOut: null },
    });
    if (open) return { ok: false, error: 'Déjà pointé' };

    const entry = await this.prisma.clockEntry.create({
      data: { userId },
    });

    // Make the agent available for dispatch
    await this.prisma.agentAvailability.upsert({
      where: { userId_stage: { userId, stage: 'CONFIRMATION' } },
      create: { userId, stage: 'CONFIRMATION', isActive: true },
      update: { isActive: true, pausedAt: null },
    });

    return { ok: true, entry };
  }

  async clockOut(userId: string, auto = false) {
    const open = await this.prisma.clockEntry.findFirst({
      where: { userId, clockOut: null },
      orderBy: { clockIn: 'desc' },
    });
    if (!open) return { ok: false, error: 'Aucun pointage ouvert' };

    await this.prisma.clockEntry.update({
      where: { id: open.id },
      data: { clockOut: new Date(), autoClosed: auto },
    });

    // Pause the agent on every stage
    await this.prisma.agentAvailability.updateMany({
      where: { userId },
      data: { isActive: false, pausedAt: new Date() },
    });

    return { ok: true };
  }

  async getStatus(userId: string) {
    const open = await this.prisma.clockEntry.findFirst({
      where: { userId, clockOut: null },
      orderBy: { clockIn: 'desc' },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const entries = await this.prisma.clockEntry.findMany({
      where: { userId, clockIn: { gte: today } },
      orderBy: { clockIn: 'asc' },
    });

    const totalMinutes = entries.reduce((s, e) => {
      const end = e.clockOut ?? new Date();
      return s + Math.round((end.getTime() - e.clockIn.getTime()) / 60000);
    }, 0);

    return {
      clockedIn: !!open,
      since: open?.clockIn ?? null,
      todayMinutes: totalMinutes,
      entries,
    };
  }

  async listToday() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const entries = await this.prisma.clockEntry.findMany({
      where: { clockIn: { gte: today } },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { clockIn: 'desc' },
    });

    return entries.map((e) => ({
      id: e.id,
      userId: e.userId,
      userName: e.user.name,
      clockIn: e.clockIn,
      clockOut: e.clockOut,
      autoClosed: e.autoClosed,
      minutes: Math.round(
        ((e.clockOut ?? new Date()).getTime() - e.clockIn.getTime()) / 60000,
      ),
    }));
  }

  // ---------- AUTO CLOSE ----------

  /**
   * Closes entries whose shift has ended.
   */
  async autoCloseExpired() {
    const open = await this.prisma.clockEntry.findMany({
      where: { clockOut: null },
      include: {
        user: {
          include: {
            shiftAssignments: { include: { shift: true } },
          },
        },
      },
    });

    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const today = now.getDay();

    let closed = 0;

    for (const entry of open) {
      const shifts = entry.user.shiftAssignments
        .map((a) => a.shift)
        .filter((s) => s.isActive && s.days.includes(today));

      if (shifts.length === 0) continue;

      // Latest end time among the agent's shifts today
      const latestEnd = Math.max(
        ...shifts.map((s) => {
          const [h, m] = s.endTime.split(':').map(Number);
          return h * 60 + m;
        }),
      );

      if (nowMinutes >= latestEnd) {
        await this.clockOut(entry.userId, true);
        closed++;
      }
    }

    return { ok: true, closed };
  }
}
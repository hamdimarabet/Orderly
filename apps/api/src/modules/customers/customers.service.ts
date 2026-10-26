import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// --- matched to the OrderStatus enum ---------------------------------------
const REFUSED   = ['ANNULE'];
const DELIVERED = ['LIVRE', 'PAYE'];
const RETURNED  = ['RETOUR', 'RETOUR_DEPOT', 'RETOUR_RECU'];
const IGNORED   = ['ARCHIVE'];
const CONFIRMED = [
  'CONFIRME', 'ECHANGE', 'A_PREPARER', 'EN_PREPARATION', 'IMPRIME', 'EMBALLE',
  'A_EXPEDIER', 'AU_DEPOT_LIVREUR', 'EN_COURS_DE_LIVRAISON', 'A_VERIFIER',
  ...DELIVERED, ...RETURNED,
];

/** the worklist buckets — people with a reason to be called today */
export const BUCKETS = ['due', 'birthdays', 'lost', 'sleeping', 'newbie'] as const;
export type Bucket = (typeof BUCKETS)[number];

export interface CustomerFilters {
  bucket?: Bucket | string;
  search?: string;
  storeIds?: string[];
  tier?: string;
  city?: string;
  minOrders?: number;
  maxOrders?: number;
  minLtv?: number;
  maxLtv?: number;
  maxReturnRate?: number;
  minConfirmationRate?: number;
  lastOrderFrom?: string;
  lastOrderTo?: string;
  dueOnly?: boolean;          // nextDueAt <= today  -> "to call back today"
  birthdayMonth?: number;     // 1-12
  birthdayInDays?: number;    // birthday within the next N days
  neverOrderedProduct?: string;
  custom?: Record<string, string>;   // { skin_type: 'grasse' }
  sortBy?: 'value' | 'orders' | 'recent' | 'rate' | 'due';
  page?: number;
  pageSize?: number;
}

@Injectable()
export class CustomersService {
  private readonly logger = new Logger('Customers');

  constructor(private prisma: PrismaService) {}

  // =========================================================================
  // HELPERS
  // =========================================================================

  /** digits only -> last 8 if longer. Same rule as the backfill. */
  normalizePhone(raw?: string | null): string | null {
    if (!raw) return null;
    const d = String(raw).replace(/\D/g, '');
    if (!d) return null;
    const n = d.length > 8 ? d.slice(-8) : d;
    return n.length >= 6 ? n : null;
  }

  private medianGap(datesAsc: Date[]): number | null {
    if (datesAsc.length < 2) return null;
    const gaps: number[] = [];
    for (let i = 1; i < datesAsc.length; i++) {
      const days = Math.round(
        (datesAsc[i].getTime() - datesAsc[i - 1].getTime()) / 86_400_000,
      );
      if (days > 0 && days < 400) gaps.push(days);
    }
    if (!gaps.length) return null;
    gaps.sort((a, b) => a - b);
    const mid = Math.floor(gaps.length / 2);
    return gaps.length % 2 ? gaps[mid] : Math.round((gaps[mid - 1] + gaps[mid]) / 2);
  }

  /**
   * Tiers are about delivery behaviour, not spend.
   * A return in the LAST 3 orders drops her — an old one from two years ago
   * does not condemn her forever.
   */
  /** delivered parcels only — LIVRE / PAYE */
  private tierOf(delivered: number, returnRate: number, recent: string[]): string {
    const last3 = recent.slice(-3);
    if (last3.some((s) => RETURNED.includes(s))) return 'WATCH';
    if (returnRate > 30) return 'WATCH';
    if (delivered >= 5) return 'GOLD';
    if (delivered >= 2) return 'SILVER';
    return 'NEW';
  }

  // =========================================================================
  // WORKLIST BUCKETS
  // =========================================================================

  /** the where-clause behind each bucket */
  bucketWhere(bucket: string): any {
    const now = new Date();
    const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

    switch (bucket) {
      // past her own buying cycle
      case 'due':
        return { nextDueAt: { not: null, lte: now }, isBlocked: false };

      // birthday today or in the next 7 days
      case 'birthdays': {
        const pairs: any[] = [];
        for (let i = 0; i <= 7; i++) {
          const x = new Date(Date.now() + i * 86_400_000);
          pairs.push({ birthdayMonth: x.getMonth() + 1, birthdayDay: x.getDate() });
        }
        return { OR: pairs, isBlocked: false };
      }

      // received one parcel, took it, never came back
      case 'lost':
        return {
          delivered: 1,
          lastDeliveredAt: { lte: daysAgo(60) },
          isBlocked: false,
        };

      // good customers more than 30 days past due
      case 'sleeping':
        return {
          tier: { in: ['GOLD', 'SILVER'] },
          nextDueAt: { not: null, lte: daysAgo(30) },
          isBlocked: false,
        };

      // first parcel delivered recently — the cheapest second sale there is
      case 'newbie':
        return {
          delivered: 1,
          lastDeliveredAt: { gte: daysAgo(21) },
          isBlocked: false,
        };

      default:
        return {};
    }
  }

  /** counts for the cards at the top of the Aujourd'hui tab */
  async worklist(storeIds?: string[]) {
    const base = storeIds?.length ? { storeIds: { hasSome: storeIds } } : {};
    const counts = await Promise.all(
      BUCKETS.map((b) =>
        this.prisma.customer.count({ where: { AND: [base, this.bucketWhere(b)] } }),
      ),
    );
    return Object.fromEntries(BUCKETS.map((b, i) => [b, counts[i]])) as Record<Bucket, number>;
  }

  // =========================================================================
  // LIST  (server-side filtering, sorting, pagination)
  // =========================================================================

  async list(f: CustomerFilters = {}) {
    const page = Math.max(1, f.page ?? 1);
    const pageSize = Math.min(200, f.pageSize ?? 50);
    const AND: any[] = [];

    if (f.bucket) AND.push(this.bucketWhere(String(f.bucket)));

    if (f.search?.trim()) {
      const q = f.search.trim();
      AND.push({
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q.replace(/\D/g, '') } },
          { displayPhone: { contains: q } },
          { city: { contains: q, mode: 'insensitive' } },
        ],
      });
    }

    if (f.storeIds?.length) AND.push({ storeIds: { hasSome: f.storeIds } });
    if (f.tier) AND.push({ tier: f.tier });
    if (f.city) AND.push({ city: { equals: f.city, mode: 'insensitive' } });

    if (f.minOrders != null) AND.push({ totalOrders: { gte: f.minOrders } });
    if (f.maxOrders != null) AND.push({ totalOrders: { lte: f.maxOrders } });
    if (f.minLtv != null) AND.push({ lifetimeValue: { gte: f.minLtv } });
    if (f.maxLtv != null) AND.push({ lifetimeValue: { lte: f.maxLtv } });
    if (f.maxReturnRate != null) AND.push({ returnRate: { lte: f.maxReturnRate } });
    if (f.minConfirmationRate != null)
      AND.push({ confirmationRate: { gte: f.minConfirmationRate } });

    if (f.lastOrderFrom) AND.push({ lastOrderAt: { gte: new Date(f.lastOrderFrom) } });
    if (f.lastOrderTo) AND.push({ lastOrderAt: { lte: new Date(f.lastOrderTo) } });

    if (f.dueOnly) AND.push({ nextDueAt: { not: null, lte: new Date() } });

    if (f.birthdayMonth) AND.push({ birthdayMonth: f.birthdayMonth });

    if (f.birthdayInDays) {
      // build the (month, day) pairs for the next N days — works across year end
      const pairs: any[] = [];
      const d = new Date();
      for (let i = 0; i <= f.birthdayInDays; i++) {
        const x = new Date(d.getTime() + i * 86_400_000);
        pairs.push({ birthdayMonth: x.getMonth() + 1, birthdayDay: x.getDate() });
      }
      AND.push({ OR: pairs });
    }

    // custom fields:  ?custom[skin_type]=grasse
    if (f.custom) {
      for (const [key, value] of Object.entries(f.custom)) {
        if (value === '' || value == null) continue;
        AND.push({ custom: { path: [key], equals: value } });
      }
    }

    const where = AND.length ? { AND } : {};

    const orderBy =
      f.sortBy === 'orders' ? { totalOrders: 'desc' as const }
      : f.sortBy === 'recent' ? { lastOrderAt: 'desc' as const }
      : f.sortBy === 'rate'   ? { confirmationRate: 'desc' as const }
      : f.sortBy === 'due'    ? { nextDueAt: 'asc' as const }
      : { lifetimeValue: 'desc' as const };

    const [customers, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.customer.count({ where }),
    ]);

    return { customers, total, page, pageSize, pages: Math.ceil(total / pageSize) };
  }

  /** headline numbers for the cards at the top of the Clients page */
  async stats(storeIds?: string[]) {
    const where = storeIds?.length ? { storeIds: { hasSome: storeIds } } : {};
    const [total, repeat, due, agg] = await Promise.all([
      this.prisma.customer.count({ where }),
      this.prisma.customer.count({ where: { ...where, totalOrders: { gte: 2 } } }),
      this.prisma.customer.count({
        where: { ...where, nextDueAt: { not: null, lte: new Date() } },
      }),
      this.prisma.customer.aggregate({ where, _sum: { lifetimeValue: true } }),
    ]);
    return {
      total,
      repeat,
      due,
      lifetimeValue: Number(agg._sum.lifetimeValue ?? 0),
    };
  }

  // =========================================================================
  // ONE FICHE
  // =========================================================================

  async getOne(id: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException('Client introuvable');

    const [orders, notes, stores] = await Promise.all([
      this.prisma.order.findMany({
        where: { customerId: id },
        select: {
          id: true,
          orderNumber: true,
          orderStatus: true,
          total: true,
          storeId: true,
          sourceCreatedAt: true,
          createdAt: true,
          assignedAgentName: true,
        },
        orderBy: { sourceCreatedAt: 'desc' },
        take: 100,
      }),
      this.prisma.customerNote.findMany({
        where: { customerId: id },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.store.findMany({ select: { id: true, name: true } }),
    ]);

    const storeName = new Map(stores.map((s) => [s.id, s.name]));

    // what she has never bought — the upsell suggestion
    const boughtIds = await this.prisma.orderLineItem
      .findMany({
        where: { order: { customerId: id } },
        select: { productId: true },
        distinct: ['productId'],
      })
      .catch(() => [] as { productId: string | null }[]);

    const bought = boughtIds.map((b) => b.productId).filter(Boolean) as string[];

    const neverTried = await this.prisma.product
      .findMany({
        where: {
          id: { notIn: bought.length ? bought : ['-'] },
          ...(customer.storeIds.length ? { storeId: { in: customer.storeIds } } : {}),
        },
        select: { id: true, name: true, imageUrl: true },
        take: 6,
      })
      .catch(() => [] as { id: string; name: string; imageUrl: string | null }[]);

    return {
      ...customer,
      orders: orders.map((o) => ({
        ...o,
        storeName: storeName.get(o.storeId) ?? '',
        date: o.sourceCreatedAt ?? o.createdAt,
        isDelivered: DELIVERED.includes(o.orderStatus as string),
        isReturned: RETURNED.includes(o.orderStatus as string),
        isRefused: REFUSED.includes(o.orderStatus as string),
      })),
      notes,
      neverTried: neverTried.map((p: any) => ({
        id: p.id,
        title: p.name,
        imageUrl: p.imageUrl ?? null,
      })),
    };
  }

  /** by phone — so the confirmation drawer can show the fiche from an order */
  async getByPhone(rawPhone: string) {
    const phone = this.normalizePhone(rawPhone);
    if (!phone) return null;
    const c = await this.prisma.customer.findUnique({ where: { phone } });
    return c ? this.getOne(c.id) : null;
  }

  // =========================================================================
  // EDIT
  // =========================================================================

  async update(id: string, body: any) {
    const data: any = {};

    for (const k of ['name', 'phone2', 'email', 'city', 'address',
                     'gender', 'language', 'callFrom', 'callTo']) {
      if (body[k] !== undefined) data[k] = body[k] || null;
    }

    if (body.birthday !== undefined) {
      if (body.birthday) {
        const d = new Date(body.birthday);
        data.birthday = d;
        data.birthdayDay = d.getDate();
        data.birthdayMonth = d.getMonth() + 1;
      } else {
        data.birthday = null;
        data.birthdayDay = null;
        data.birthdayMonth = null;
      }
    }

    if (body.isBlocked !== undefined) data.isBlocked = !!body.isBlocked;

    // merge custom fields instead of replacing the whole object
    if (body.custom && typeof body.custom === 'object') {
      const current = await this.prisma.customer.findUnique({
        where: { id },
        select: { custom: true },
      });
      data.custom = { ...((current?.custom as any) ?? {}), ...body.custom };
      for (const [k, v] of Object.entries(data.custom)) {
        if (v === '' || v === null) delete data.custom[k];
      }
    }

    return this.prisma.customer.update({ where: { id }, data });
  }

  // =========================================================================
  // NOTES  (append-only)
  // =========================================================================

  addNote(customerId: string, body: string, user?: { id?: string; name?: string }, kind = 'NOTE') {
    return this.prisma.customerNote.create({
      data: {
        customerId,
        body,
        kind,
        authorId: user?.id ?? null,
        authorName: user?.name ?? null,
      },
    });
  }

  deleteNote(id: string) {
    return this.prisma.customerNote.delete({ where: { id } });
  }

  // =========================================================================
  // CUSTOM FIELD DEFINITIONS
  // =========================================================================

  listFields(onlyActive = true) {
    return this.prisma.customerField.findMany({
      where: onlyActive ? { isActive: true } : {},
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
  }

  createField(body: any) {
    const key =
      (body.key || body.label || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '') || `field_${Date.now()}`;

    return this.prisma.customerField.create({
      data: {
        key,
        label: body.label ?? key,
        type: body.type ?? 'TEXT',
        options: body.options ?? [],
        helpText: body.helpText ?? null,
        storeIds: body.storeIds ?? [],
        position: body.position ?? 0,
        showInList: !!body.showInList,
        showOnOrder: !!body.showOnOrder,
        askOnConfirm: !!body.askOnConfirm,
        isFilterable: body.isFilterable !== false,
      },
    });
  }

  updateField(id: string, body: any) {
    const data: any = {};
    for (const k of ['label', 'type', 'options', 'helpText', 'storeIds', 'position',
                     'showInList', 'showOnOrder', 'askOnConfirm', 'isFilterable', 'isActive']) {
      if (body[k] !== undefined) data[k] = body[k];
    }
    return this.prisma.customerField.update({ where: { id }, data });
  }

  /** soft delete — the values stay in Customer.custom in case it comes back */
  deactivateField(id: string) {
    return this.prisma.customerField.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // =========================================================================
  // KEEPING THE ROLLUPS FRESH
  // =========================================================================

  /**
   * Call this whenever an order is created or changes status.
   * Creates the customer if she does not exist yet, links the order, recomputes.
   */
  async syncFromOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true, customerId: true, customerPhone: true, customerName: true,
        customerEmail: true, shippingAddress: true, storeId: true,
      },
    });
    if (!order) return null;

    let customerId = order.customerId;

    if (!customerId) {
      const phone = this.normalizePhone(order.customerPhone);
      if (!phone) return null;

      const addr: any = order.shippingAddress ?? {};
      const customer = await this.prisma.customer.upsert({
        where: { phone },
        create: {
          phone,
          displayPhone: order.customerPhone ?? phone,
          name: order.customerName ?? phone,
          email: order.customerEmail ?? null,
          city: addr.city ?? addr.province ?? null,
          address: addr.address1 ?? addr.address ?? null,
          storeIds: order.storeId ? [order.storeId] : [],
        },
        update: {},
      });

      customerId = customer.id;
      await this.prisma.order.update({
        where: { id: order.id },
        data: { customerId },
      });
    }

    return this.recompute(customerId);
  }

  /** recalculate one customer from her orders */
  async recompute(customerId: string) {
    const orders = await this.prisma.order.findMany({
      where: { customerId },
      select: {
        orderStatus: true, total: true, storeId: true,
        sourceCreatedAt: true, createdAt: true,
      },
      orderBy: { sourceCreatedAt: 'asc' },
    });
    if (!orders.length) return null;

    const statuses = orders.map((o) => o.orderStatus as string);
    const delivered = statuses.filter((s) => DELIVERED.includes(s)).length;
    const returned  = statuses.filter((s) => RETURNED.includes(s)).length;
    const refused   = statuses.filter((s) => REFUSED.includes(s)).length;
    const confirmed = statuses.filter((s) => CONFIRMED.includes(s)).length;
    const archived  = statuses.filter((s) => IGNORED.includes(s)).length;

    const totalOrders = orders.length;
    const rateBase = totalOrders - archived;
    const finished = delivered + returned;
    const num = (v: any) => Number(v ?? 0);

    const lifetimeValue = orders
      .filter((o) => DELIVERED.includes(o.orderStatus as string))
      .reduce((s, o) => s + num(o.total), 0);
    const totalOrdered = orders.reduce((s, o) => s + num(o.total), 0);

    const dateOf = (o: any) => (o.sourceCreatedAt ?? o.createdAt) as Date;

    // every order — used for "silent since"
    const dates = orders
      .map(dateOf)
      .filter(Boolean)
      .sort((a, b) => a.getTime() - b.getTime());

    // ONLY parcels she actually received — LIVRE / PAYE.
    // A confirmed order is not a delivered one: she has nothing in her hands,
    // so it says nothing about when she runs out.
    const deliveredDates = orders
      .filter((o) => DELIVERED.includes(o.orderStatus as string))
      .map(dateOf)
      .filter(Boolean)
      .sort((a, b) => a.getTime() - b.getTime());

    const lastOrderAt = dates[dates.length - 1] ?? null;
    const lastDeliveredAt = deliveredDates[deliveredDates.length - 1] ?? null;
    const rhythmDays = this.medianGap(deliveredDates);

    return this.prisma.customer.update({
      where: { id: customerId },
      data: {
        storeIds: [...new Set(orders.map((o) => o.storeId).filter(Boolean))] as string[],
        totalOrders,
        confirmed,
        refused,
        delivered,
        returned,
        confirmationRate: rateBase ? Math.round((confirmed / rateBase) * 100) : 0,
        deliveryRate: finished ? Math.round((delivered / finished) * 100) : 0,
        returnRate:   finished ? Math.round((returned  / finished) * 100) : 0,
        lifetimeValue: lifetimeValue.toFixed(3),
        totalOrdered:  totalOrdered.toFixed(3),
        avgBasket: totalOrders ? (totalOrdered / totalOrders).toFixed(3) : '0',
        firstOrderAt: dates[0] ?? null,
        lastOrderAt,
        firstDeliveredAt: deliveredDates[0] ?? null,
        lastDeliveredAt,
        rhythmDays,
        nextDueAt: rhythmDays && lastDeliveredAt
          ? new Date(lastDeliveredAt.getTime() + rhythmDays * 86_400_000)
          : null,
        tier: this.tierOf(
          delivered,
          finished ? Math.round((returned / finished) * 100) : 0,
          statuses,
        ),
      },
    });
  }

  // =========================================================================
  // THE CALL LIST  —  who is due to re-order today
  // =========================================================================

  async dueToday(storeIds?: string[], limit = 200) {
    return this.prisma.customer.findMany({
      where: {
        nextDueAt: { not: null, lte: new Date() },
        isBlocked: false,
        ...(storeIds?.length ? { storeIds: { hasSome: storeIds } } : {}),
      },
      orderBy: [{ lifetimeValue: 'desc' }, { nextDueAt: 'asc' }],
      take: limit,
    });
  }

  async birthdaysComing(days = 7, storeIds?: string[]) {
    const pairs: any[] = [];
    const now = new Date();
    for (let i = 0; i <= days; i++) {
      const x = new Date(now.getTime() + i * 86_400_000);
      pairs.push({ birthdayMonth: x.getMonth() + 1, birthdayDay: x.getDate() });
    }
    return this.prisma.customer.findMany({
      where: {
        OR: pairs,
        isBlocked: false,
        ...(storeIds?.length ? { storeIds: { hasSome: storeIds } } : {}),
      },
      orderBy: { birthdayDay: 'asc' },
    });
  }
}
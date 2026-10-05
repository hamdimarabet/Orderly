import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ShippingService {
  constructor(private prisma: PrismaService) {}

  async list(storeIds?: string[]) {
    const where: any = {};
    if (storeIds?.length) where.storeId = { in: storeIds };

    return this.prisma.shippingRule.findMany({
      where,
      include: { store: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getForStore(storeId: string) {
    return this.prisma.shippingRule.findFirst({
      where: { storeId, isActive: true },
    });
  }

  async create(data: {
    storeId: string;
    name?: string;
    basePrice: number;
    freeThreshold?: number | null;
    cityOverrides?: Record<string, number> | null;
    tiers?: any[] | null;
    productRules?: any[] | null;
  }) {
    return this.prisma.shippingRule.create({
      data: {
        storeId: data.storeId,
        name: data.name ?? 'Livraison standard',
        basePrice: data.basePrice,
        freeThreshold: data.freeThreshold ?? null,
        cityOverrides: data.cityOverrides ?? undefined,
        tiers: data.tiers ?? undefined,
        productRules: data.productRules ?? undefined,
      },
    });
  }

  async update(
    id: string,
    data: {
      name?: string;
      basePrice?: number;
      freeThreshold?: number | null;
      cityOverrides?: Record<string, number> | null;
      isActive?: boolean;
    },
  ) {
    return this.prisma.shippingRule.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.basePrice !== undefined && { basePrice: data.basePrice }),
        ...(data.freeThreshold !== undefined && { freeThreshold: data.freeThreshold }),
        ...(data.cityOverrides !== undefined && { cityOverrides: data.cityOverrides ?? undefined }),
        ...((data as any).tiers !== undefined && { tiers: (data as any).tiers ?? undefined }),
        ...((data as any).productRules !== undefined && { productRules: (data as any).productRules ?? undefined }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });
  }

  async remove(id: string) {
    return this.prisma.shippingRule.delete({ where: { id } });
  }

  // Compute shipping cost for a given subtotal and city
  async calculate(
    storeId: string,
    subtotal: number,
    city?: string,
    skus?: string[],
  ) {
    const rule = await this.getForStore(storeId);
    if (!rule) return { cost: 0, isFree: false, reason: 'Aucune règle définie' };

    if (subtotal <= 0) {
      return { cost: 0, isFree: false, reason: 'Commande vide' };
    }

    // 1. Product rules win over everything
    const productRules = (rule.productRules as any[]) ?? []; 
    if (skus?.length && productRules.length > 0) {
      for (const pr of productRules) {
        const required: string[] = pr.skus ?? [];
        if (required.length === 0) continue;

        const matchAll = pr.matchAll !== false;
        const matches = matchAll
          ? required.every((s) => skus.includes(s))
          : required.some((s) => skus.includes(s));

        if (matches) {
          const cost = Number(pr.price ?? 0);
          return {
            cost,
            isFree: cost === 0,
            reason: pr.label ?? 'Règle produit',
          };
        }
      }
    }

    // 2. City override
    const overrides = (rule.cityOverrides as Record<string, number>) ?? {};
    if (city && overrides[city] !== undefined) {
      const cost = Number(overrides[city]);
      return { cost, isFree: cost === 0, reason: `Tarif ${city}` };
    }

    // 3. Amount tiers
    const tiers = (rule.tiers as any[]) ?? [];
    if (tiers.length > 0) {
      const sorted = [...tiers].sort((a, b) => Number(a.from ?? 0) - Number(b.from ?? 0));
      for (const t of sorted) {
        const from = Number(t.from ?? 0);
        const to = t.to !== null && t.to !== undefined ? Number(t.to) : Infinity;

        if (subtotal >= from && subtotal < to) {
          const cost = Number(t.price ?? 0);
          return {
            cost,
            isFree: cost === 0,
            reason: t.label ?? `De ${from} à ${to === Infinity ? '∞' : to} TND`,
          };
        }
      }
    }

    // 4. Free threshold
    if (rule.freeThreshold && subtotal >= Number(rule.freeThreshold)) {
      return {
        cost: 0,
        isFree: true,
        reason: `Gratuite au-dessus de ${Number(rule.freeThreshold)} TND`,
      };
    }

    // 5. Base price
    return {
      cost: Number(rule.basePrice),
      isFree: false,
      reason: 'Tarif standard',
    };
  }
}
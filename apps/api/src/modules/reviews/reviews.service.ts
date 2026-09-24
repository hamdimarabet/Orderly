import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FlowsService } from '../flows/flows.service';

@Injectable()
export class ReviewsService {
  constructor(
    private prisma: PrismaService,
    private flows: FlowsService,
  ) {}

  async list(storeId?: string) {
    return this.prisma.review.findMany({
      where: {
        ...(storeId && { storeId }),
        respondedAt: { not: null },
      },
      orderBy: { respondedAt: 'desc' },
      take: 200,
    });
  }

  async stats(storeId?: string) {
    const reviews = await this.prisma.review.findMany({
      where: {
        ...(storeId && { storeId }),
        respondedAt: { not: null },
      },
      select: { rating: true },
    });

    const total = reviews.length;
    const sum = reviews.reduce((s, r) => s + r.rating, 0);
    const distribution = [1, 2, 3, 4, 5].map((n) => ({
      rating: n,
      count: reviews.filter((r) => r.rating === n).length,
    }));

    return {
      total,
      average: total > 0 ? Number((sum / total).toFixed(2)) : 0,
      distribution,
      promoters: reviews.filter((r) => r.rating >= 4).length,
      detractors: reviews.filter((r) => r.rating <= 2).length,
    };
  }

  // Public: get the review form data
  async getByToken(token: string) {
    const review = await this.prisma.review.findUnique({
      where: { token },
    });
    if (!review) return null;

    const order = await this.prisma.order.findUnique({
      where: { id: review.orderId },
      select: {
        orderNumber: true,
        lineItems: {
          select: { title: true, quantity: true },
        },
        store: { select: { name: true } },
      },
    });

    return {
      alreadyAnswered: !!review.respondedAt,
      rating: review.rating,
      customerName: review.customerName,
      orderNumber: order?.orderNumber ?? null,
      storeName: order?.store?.name ?? null,
      items: order?.lineItems ?? [],
    };
  }

  // Public: submit a rating
  async submit(token: string, rating: number, comment?: string) {
    const review = await this.prisma.review.findUnique({ where: { token } });
    if (!review) return { ok: false, error: 'Lien invalide' };
    if (review.respondedAt) return { ok: false, error: 'Déjà répondu' };

    const clean = Math.max(1, Math.min(5, Math.round(rating)));

    const updated = await this.prisma.review.update({
      where: { token },
      data: {
        rating: clean,
        comment: comment?.trim() || null,
        respondedAt: new Date(),
      },
    });

    // Trigger flows listening to reviews
    this.flows.emit('review_received', {
      storeId: updated.storeId,
      orderId: updated.orderId,
      customerPhone: updated.customerPhone,
      customerName: updated.customerName,
      rating: clean,
      comment: updated.comment,
    }).catch(() => {});

    return { ok: true, rating: clean };
  }
}
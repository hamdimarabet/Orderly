import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderStatus, FinancialStatus, FulfillmentStatus, Prisma } from '@prisma/client';

@Injectable()
export class OrdersService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: {
    storeIds?: string[];
    orderStatus?: OrderStatus[];
    financialStatus?: FinancialStatus[];
    fulfillmentStatus?: FulfillmentStatus[];
    search?: string;
    page?: number;
    pageSize?: number;
  }) {
    const {
      storeIds,
      orderStatus,
      financialStatus,
      fulfillmentStatus,
      search,
      page = 1,
      pageSize = 25,
    } = query;

    const where: Prisma.OrderWhereInput = {
      ...(storeIds?.length && { storeId: { in: storeIds } }),
      ...(orderStatus?.length && { orderStatus: { in: orderStatus } }),
      ...(financialStatus?.length && { financialStatus: { in: financialStatus } }),
      ...(fulfillmentStatus?.length && { fulfillmentStatus: { in: fulfillmentStatus } }),
      ...(search && {
        OR: [
          { orderNumber: { contains: search, mode: 'insensitive' } },
          { customerName: { contains: search, mode: 'insensitive' } },
          { customerEmail: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: {
          lineItems: true,
          fulfillments: { orderBy: { createdAt: 'desc' }, take: 1 },
          store: { select: { name: true } },
        },
        orderBy: { sourceCreatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      orders: orders.map((o) => ({
        ...o,
        storeName: o.store.name,
        trackingNumber: o.fulfillments[0]?.trackingNumber ?? null,
        carrier: o.fulfillments[0]?.carrier ?? null,
        itemCount: o.lineItems.reduce((s, li) => s + li.quantity, 0),
        callAttempts: (o.callAttempts as any[]) ?? [],
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findOne(id: string) {
    const o = await this.prisma.order.findUnique({
      where: { id },
      include: {
        lineItems: true,
        fulfillments: true,
        refunds: true,
        events: { orderBy: { createdAt: 'desc' } },
        store: { select: { name: true } },
      },
    });
    if (!o) return null;
    return {
      ...o,
      storeName: o.store.name,
      callAttempts: (o.callAttempts as any[]) ?? [],
    };
  }

  async updateStatus(
    orderId: string,
    status: OrderStatus,
    actorId: string,
    extra?: { reason?: string; note?: string },
  ) {
    const order = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        orderStatus: status,
        ...(extra?.reason && { cancellationReason: extra.reason }),
        ...(extra?.note && { cancellationNote: extra.note }),
      },
    });

    await this.prisma.orderEvent.create({
      data: {
        orderId,
        eventType: 'status_changed',
        payload: { to: status, reason: extra?.reason },
        actor: actorId,
      },
    });

    return order;
  }

  async updateOrder(
    orderId: string,
    data: {
      customerName?: string;
      customerPhone?: string;
      customerPhone2?: string;
      shippingAddress?: any;
      internalNote?: string;
      deliveryCompany?: string;
      scheduledDeliveryDate?: string;
      tags?: string[];
      lineItems?: { id?: string; title: string; sku?: string; quantity: number; price: number; variantTitle?: string }[];
    },
    actorId: string,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { lineItems: true },
    });
    if (!order) throw new Error('Order not found');

    // Recalculate total if line items changed
    let subtotal = Number(order.subtotal);
    if (data.lineItems) {
      subtotal = data.lineItems.reduce((s, li) => s + li.price * li.quantity, 0);
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        ...(data.customerName && { customerName: data.customerName }),
        ...(data.customerPhone && { customerPhone: data.customerPhone }),
        ...(data.customerPhone2 !== undefined && { customerPhone2: data.customerPhone2 }),
        ...(data.shippingAddress && { shippingAddress: data.shippingAddress }),
        ...(data.internalNote !== undefined && { internalNote: data.internalNote }),
        ...(data.deliveryCompany !== undefined && { deliveryCompany: data.deliveryCompany }),
        ...(data.scheduledDeliveryDate !== undefined && {
          scheduledDeliveryDate: data.scheduledDeliveryDate ? new Date(data.scheduledDeliveryDate) : null,
        }),
        ...(data.tags && { tags: data.tags }),
        ...(data.lineItems && {
          subtotal,
          total: subtotal + Number(order.taxTotal) + Number(order.shippingTotal),
          lineItems: {
            deleteMany: {},
            create: data.lineItems.map((li) => ({
              title: li.title,
              sku: li.sku ?? null,
              variantTitle: li.variantTitle ?? null,
              quantity: li.quantity,
              price: li.price,
              fulfilledQty: 0,
              refundedQty: 0,
            })),
          },
        }),
      },
      include: { lineItems: true },
    });

    await this.prisma.orderEvent.create({
      data: {
        orderId,
        eventType: 'order_edited',
        payload: { fields: Object.keys(data) },
        actor: actorId,
      },
    });

    return updated;
  }

  async updateCallAttempts(orderId: string, callAttempts: any[]) {
    return this.prisma.order.update({
      where: { id: orderId },
      data: { callAttempts },
    });
  }

  async updateTags(orderId: string, tags: string[], actorId: string) {
    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { tags },
    });

    await this.prisma.orderEvent.create({
      data: {
        orderId,
        eventType: 'tags_updated',
        payload: { tags },
        actor: actorId,
      },
    });

    return updated;
  }

  async bulkUpdateStatus(orderIds: string[], status: OrderStatus, actorId: string) {
    await this.prisma.order.updateMany({
      where: { id: { in: orderIds } },
      data: { orderStatus: status },
    });

    await this.prisma.orderEvent.createMany({
      data: orderIds.map((orderId) => ({
        orderId,
        eventType: 'status_changed',
        payload: { to: status },
        actor: actorId,
      })),
    });

    return { updated: orderIds.length };
  }

  async refund(orderId: string, amount: number, reason: string, actorId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new Error('Order not found');

    const totalRefunded = Number(order.totalRefunded) + amount;
    const financialStatus: FinancialStatus =
      totalRefunded >= Number(order.total) ? 'REFUNDED' : 'PARTIALLY_REFUNDED';

    const [updatedOrder, refund] = await this.prisma.$transaction([
      this.prisma.order.update({
        where: { id: orderId },
        data: { totalRefunded, financialStatus },
      }),
      this.prisma.refund.create({
        data: { orderId, amount, reason },
      }),
    ]);

    await this.prisma.orderEvent.create({
      data: {
        orderId,
        eventType: 'refund_issued',
        payload: { amount, reason },
        actor: actorId,
      },
    });

    return { order: updatedOrder, refund };
  }
}
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

type NodeType =
  | 'trigger'
  | 'delay'
  | 'condition'
  | 'sms'
  | 'whatsapp'
  | 'tag'
  | 'status'
  | 'review'
  | 'notify'
  | 'promo';

interface FlowNode {
  id: string;
  type: NodeType;
  data: any;
  position?: { x: number; y: number };
}

interface FlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

@Injectable()
export class FlowsService {
  private readonly logger = new Logger('Flows');

  constructor(private prisma: PrismaService) {}

  // ---------- CRUD ----------

  async list(storeId?: string) {
    return this.prisma.flow.findMany({
      where: storeId ? { OR: [{ storeId }, { storeId: null }] } : {},
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: { select: { runs: true } },
      },
    });
  }

  async getOne(id: string) {
    return this.prisma.flow.findUnique({
      where: { id },
      include: {
        runs: {
          orderBy: { startedAt: 'desc' },
          take: 20,
          include: { logs: { orderBy: { createdAt: 'asc' } } },
        },
      },
    });
  }

  async create(data: {
    storeId?: string;
    name: string;
    description?: string;
    triggerType: string;
    triggerConfig?: any;
    nodes?: FlowNode[];
    edges?: FlowEdge[];
  }) {
    return this.prisma.flow.create({
      data: {
        storeId: data.storeId ?? null,
        name: data.name,
        description: data.description ?? null,
        triggerType: data.triggerType,
        triggerConfig: data.triggerConfig ?? {},
        nodes: (data.nodes ?? []) as any,
        edges: (data.edges ?? []) as any,
      },
    });
  }

  async update(id: string, data: any) {
    return this.prisma.flow.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.triggerType !== undefined && { triggerType: data.triggerType }),
        ...(data.triggerConfig !== undefined && { triggerConfig: data.triggerConfig }),
        ...(data.nodes !== undefined && { nodes: data.nodes }),
        ...(data.edges !== undefined && { edges: data.edges }),
      },
    });
  }

  async remove(id: string) {
    return this.prisma.flow.delete({ where: { id } });
  }

  // ---------- TRIGGERING ----------

  /**
   * Called whenever something happens in the app.
   * Starts every active flow listening to this event.
   */
  async emit(
    triggerType: string,
    payload: {
      storeId?: string;
      orderId?: string;
      customerPhone?: string;
      customerName?: string;
      [key: string]: any;
    },
  ) {
    const flows = await this.prisma.flow.findMany({
      where: {
        triggerType,
        isActive: true,
        ...(payload.storeId && {
          OR: [{ storeId: payload.storeId }, { storeId: null }],
        }),
      },
    });

    for (const flow of flows) {
      if (!this.matchesTriggerConfig(flow.triggerConfig as any, payload)) continue;

      try {
        await this.startRun(flow.id, payload);
      } catch (e: any) {
        this.logger.warn(`Flow ${flow.name} failed to start: ${e?.message}`);
      }
    }
  }

  private matchesTriggerConfig(config: any, payload: any): boolean {
    if (!config || Object.keys(config).length === 0) return true;

    // Status filter
    if (config.statuses?.length && !config.statuses.includes(payload.status)) {
      return false;
    }
    // Rating filter
    if (config.minRating && payload.rating < config.minRating) return false;
    if (config.maxRating && payload.rating > config.maxRating) return false;
    // Amount filter
    if (config.minTotal && Number(payload.total ?? 0) < config.minTotal) return false;

    return true;
  }

  async startRun(flowId: string, context: any) {
    const flow = await this.prisma.flow.findUnique({ where: { id: flowId } });
    if (!flow) return null;

    const nodes = (flow.nodes as any as FlowNode[]) ?? [];
    const triggerNode = nodes.find((n) => n.type === 'trigger');
    if (!triggerNode) return null;

    const run = await this.prisma.flowRun.create({
      data: {
        flowId,
        orderId: context.orderId ?? null,
        customerPhone: context.customerPhone ?? null,
        status: 'RUNNING',
        currentNode: triggerNode.id,
        context,
      },
    });

    // Execute from the trigger's first child
    this.execute(run.id).catch((e) =>
      this.logger.error(`Run ${run.id} failed: ${e?.message}`),
    );

    return run;
  }

  // ---------- EXECUTION ----------

  async execute(runId: string) {
    const run = await this.prisma.flowRun.findUnique({
      where: { id: runId },
      include: { flow: true },
    });
    if (!run || run.status === 'COMPLETED' || run.status === 'FAILED') return;

    const nodes = (run.flow.nodes as any as FlowNode[]) ?? [];
    const edges = (run.flow.edges as any as FlowEdge[]) ?? [];
    const context = (run.context as any) ?? {};

    let currentId: string | null = run.currentNode;
    let guard = 0;

    while (currentId && guard < 100) {
      guard++;

      const node = nodes.find((n) => n.id === currentId);
      if (!node) break;

      // Trigger node: just move on
      if (node.type === 'trigger') {
        currentId = this.nextNode(edges, node.id);
        continue;
      }

      // Delay: pause and resume later
      if (node.type === 'delay') {
        const minutes = this.delayToMinutes(node.data);
        const resumeAt = new Date(Date.now() + minutes * 60000);
        const next = this.nextNode(edges, node.id);

        await this.prisma.flowRun.update({
          where: { id: runId },
          data: {
            status: 'WAITING',
            currentNode: next,
            resumeAt,
          },
        });

        await this.log(runId, node, 'WAITING', `Reprise le ${resumeAt.toLocaleString('fr-FR')}`);
        return;
      }

      // Condition: pick a branch
      if (node.type === 'condition') {
        const result = await this.evaluateCondition(node.data, context);
        await this.log(runId, node, 'OK', result ? 'Condition vraie' : 'Condition fausse');
        currentId = this.nextNode(edges, node.id, result ? 'yes' : 'no');
        continue;
      }

      // Action nodes
      try {
        await this.runAction(node, context, runId);
        await this.log(runId, node, 'OK', null);
      } catch (e: any) {
        await this.log(runId, node, 'ERROR', e?.message);
      }

      currentId = this.nextNode(edges, node.id);
    }

    await this.prisma.flowRun.update({
      where: { id: runId },
      data: {
        status: 'COMPLETED',
        currentNode: null,
        completedAt: new Date(),
      },
    });
  }

  private nextNode(edges: FlowEdge[], fromId: string, label?: string): string | null {
    const candidates = edges.filter((e) => e.source === fromId);
    if (candidates.length === 0) return null;
    if (label) {
      const match = candidates.find((e) => e.label === label);
      return match?.target ?? null;
    }
    return candidates[0].target;
  }

  private delayToMinutes(data: any): number {
    const value = Number(data?.value ?? 1);
    const unit = data?.unit ?? 'hours';
    if (unit === 'minutes') return value;
    if (unit === 'hours') return value * 60;
    if (unit === 'days') return value * 60 * 24;
    return value * 60;
  }

  private async evaluateCondition(data: any, context: any): Promise<boolean> {
    const { field, operator, value } = data ?? {};
    if (!field) return true;

    let actual: any;

    if (field === 'rating') actual = context.rating;
    else if (field === 'total') actual = Number(context.total ?? 0);
    else if (field === 'city') actual = context.city;
    else if (field === 'orderCount') {
      if (!context.customerPhone) return false;
      const phone = context.customerPhone.replace(/\s|\+216/g, '');
      actual = await this.prisma.order.count({
        where: { customerPhone: { contains: phone } },
      });
    } else if (field === 'status') actual = context.status;
    else actual = context[field];

    switch (operator) {
      case 'eq': return String(actual) === String(value);
      case 'ne': return String(actual) !== String(value);
      case 'gt': return Number(actual) > Number(value);
      case 'gte': return Number(actual) >= Number(value);
      case 'lt': return Number(actual) < Number(value);
      case 'lte': return Number(actual) <= Number(value);
      case 'contains': return String(actual ?? '').includes(String(value));
      default: return true;
    }
  }

  private async runAction(node: FlowNode, context: any, runId: string) {
    const d = node.data ?? {};

    switch (node.type) {
      case 'sms':
      case 'whatsapp': {
        const message = this.renderTemplate(d.message ?? '', context);
        // TODO: plug real SMS/WhatsApp provider here
        this.logger.log(`[${node.type}] to ${context.customerPhone}: ${message}`);
        break;
      }

      case 'tag': {
        if (!context.orderId) break;
        const order = await this.prisma.order.findUnique({
          where: { id: context.orderId },
          select: { tags: true },
        });
        const tags = new Set(order?.tags ?? []);
        tags.add(d.tag);
        await this.prisma.order.update({
          where: { id: context.orderId },
          data: { tags: Array.from(tags) },
        });
        break;
      }

      case 'status': {
        if (!context.orderId) break;
        await this.prisma.order.update({
          where: { id: context.orderId },
          data: { orderStatus: d.status },
        });
        break;
      }

      case 'review': {
        if (!context.orderId || !context.customerPhone) break;
        const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
        await this.prisma.review.create({
          data: {
            orderId: context.orderId,
            storeId: context.storeId,
            customerPhone: context.customerPhone,
            customerName: context.customerName ?? null,
            rating: 0,
            token,
          },
        });
        const link = `${process.env.FRONTEND_URL}/avis/${token}`;
        this.logger.log(`[review] link for ${context.customerPhone}: ${link}`);
        break;
      }

      case 'notify': {
        await this.prisma.notification.create({
          data: {
            userId: d.userId ?? null,
            type: 'flow',
            title: d.title ?? 'Alerte flow',
            message: this.renderTemplate(d.message ?? '', context),
            link: context.orderId ? '/confirmation' : null,
            orderId: context.orderId ?? null,
          } as any,
        });
        break;
      }

      default:
        break;
    }
  }

  private renderTemplate(tpl: string, context: any): string {
    return tpl.replace(/\{\{(\w+)\}\}/g, (_, key) => String(context[key] ?? ''));
  }

  // ---------- RESUME WAITING RUNS ----------

  async resumeDueRuns() {
    const due = await this.prisma.flowRun.findMany({
      where: {
        status: 'WAITING',
        resumeAt: { lte: new Date() },
      },
      take: 50,
    });

    for (const run of due) {
      await this.prisma.flowRun.update({
        where: { id: run.id },
        data: { status: 'RUNNING' },
      });
      this.execute(run.id).catch(() => {});
    }

    return { resumed: due.length };
  }

  private async log(runId: string, node: FlowNode, status: string, message: string | null) {
    await this.prisma.flowLog.create({
      data: {
        runId,
        nodeId: node.id,
        nodeType: node.type,
        status,
        message,
      },
    });
  }
}
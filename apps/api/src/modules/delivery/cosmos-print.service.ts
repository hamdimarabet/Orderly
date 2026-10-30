import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { CosmosService } from './cosmos.service';

/**
 * Marque chez Cosmos les colis dont le bordereau a déjà été imprimé dans
 * Orderly, via PUT /orders/printed.
 *
 * Le bordereau est imprimé au moment du bouton « Imprimer » (EN_PREPARATION),
 * donc dès cet instant le colis ne doit plus apparaître « à imprimer » chez eux.
 *
 * Cosmos n'accepte le changement que sur les commandes encore en "pending" ou
 * "to-be-picked" : une fois ramassées elles reviennent dans notPending, ce qui
 * est normal et sans conséquence.
 */
@Injectable()
export class CosmosPrintService {
  private readonly logger = new Logger('CosmosPrint');
  private running = false;

  constructor(
    private prisma: PrismaService,
    private cosmos: CosmosService,
  ) {}

  @Cron('*/2 * * * *')
  async markPrinted() {
    if (this.running) return;
    this.running = true;

    try {
      const candidates = await this.prisma.fulfillment.findMany({
        where: {
          carrier: 'COSMOS',
          deliveryPartnerRef: { not: null },
          order: {
            orderStatus: { in: ['EN_PREPARATION', 'IMPRIME', 'EMBALLE'] },
          },
        },
        select: {
          orderId: true,
          deliveryPartnerRef: true,
          order: { select: { storeId: true } },
        },
        take: 400,
      });

      if (!candidates.length) return;

      // on ne repasse pas sur celles déjà marquées
      const done = await this.prisma.orderEvent.findMany({
        where: {
          orderId: { in: candidates.map((c) => c.orderId) },
          eventType: 'cosmos_marked_printed',
        },
        select: { orderId: true },
      });
      const doneSet = new Set(done.map((e) => e.orderId));

      const todo = candidates.filter((c) => !doneSet.has(c.orderId));
      if (!todo.length) return;

      // Cosmos résout les barcodes par compte : on groupe par magasin
      const byStore = new Map<string, typeof todo>();
      for (const c of todo) {
        const key = c.order.storeId;
        if (!byStore.has(key)) byStore.set(key, []);
        byStore.get(key)!.push(c);
      }

      let ok = 0;

      for (const [storeId, list] of byStore) {
        // 100 barcodes maximum par appel
        for (let i = 0; i < list.length; i += 100) {
          const batch = list.slice(i, i + 100);
          const barcodes = batch.map((c) => String(c.deliveryPartnerRef));

          const res: any = await this.cosmos.markPrinted(storeId, barcodes);

          if (!res.ok) {
            this.logger.warn(`store ${storeId}: ${res.error}`);
            continue;
          }

          // updated + unchanged + notPending = traité, inutile d'y revenir.
          // notFound = le colis n'existe pas chez eux, on ne marque pas pour
          // pouvoir réessayer si le parcel est recréé plus tard.
          const settled = new Set<string>([
            ...(res.updated ?? []),
            ...(res.unchanged ?? []),
            ...(res.notPending ?? []),
          ].map(String));

          const toRecord = batch.filter((c) =>
            settled.has(String(c.deliveryPartnerRef)),
          );

          if (toRecord.length) {
            await this.prisma.orderEvent.createMany({
              data: toRecord.map((c) => ({
                orderId: c.orderId,
                eventType: 'cosmos_marked_printed',
                payload: { barcode: c.deliveryPartnerRef },
                actor: 'system',
              })),
            });
          }

          ok += (res.updated ?? []).length;

          if ((res.notFound ?? []).length) {
            this.logger.warn(
              `introuvables chez Cosmos : ${(res.notFound ?? []).join(', ')}`,
            );
          }
        }
      }

      this.logger.log(`marqués imprimés chez Cosmos : ${ok}/${todo.length}`);
    } catch (e: any) {
      this.logger.error(`markPrinted: ${e.message}`);
    } finally {
      this.running = false;
    }
  }

  /** Pour tester sans attendre le cron. */
  async runNow() {
    await this.markPrinted();
    return { ok: true };
  }
}
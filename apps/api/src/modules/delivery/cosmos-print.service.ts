import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { CosmosService } from './cosmos.service';

/**
 * Cosmos n'expose aucun endpoint pour changer le statut d'une commande.
 * Le seul geste qui touche une étiquette est GET /labels.
 *
 * Hypothèse : leur tableau de bord considère un colis comme imprimé une fois
 * son étiquette générée. On génère donc l'étiquette dès que le colis passe en
 * EMBALLE, et on jette le PDF — l'équipe continue d'imprimer le bordereau
 * Orderly, mais Cosmos enregistre l'impression de son côté.
 *
 * Si après test le tableau de bord affiche toujours "à imprimer", c'est que
 * leur règle est ailleurs et seul Cosmos peut la changer.
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
          order: { orderStatus: 'EMBALLE' },
        },
        select: {
          orderId: true,
          deliveryPartnerRef: true,
          order: { select: { storeId: true, orderNumber: true } },
        },
        take: 50,
      });

      if (!candidates.length) return;

      // celles dont l'étiquette a déjà été générée
      const alreadyDone = await this.prisma.orderEvent.findMany({
        where: {
          orderId: { in: candidates.map((c) => c.orderId) },
          eventType: 'cosmos_label_fetched',
        },
        select: { orderId: true },
      });
      const doneSet = new Set(alreadyDone.map((e) => e.orderId));

      const todo = candidates.filter((c) => !doneSet.has(c.orderId));
      if (!todo.length) return;

      let ok = 0;
      for (const c of todo) {
        try {
          const res = await this.cosmos.fetchLabel(
            c.order.storeId,
            String(c.deliveryPartnerRef),
            'pdf',
          );

          await this.prisma.orderEvent.create({
            data: {
              orderId: c.orderId,
              eventType: res.ok ? 'cosmos_label_fetched' : 'cosmos_label_error',
              payload: {
                barcode: c.deliveryPartnerRef,
                ok: res.ok,
                error: res.ok ? null : (res as any).error ?? null,
              },
              actor: 'system',
            },
          });

          if (res.ok) ok++;
        } catch (e: any) {
          this.logger.warn(`${c.order.orderNumber}: ${e.message}`);
        }
      }

      this.logger.log(`étiquettes générées chez Cosmos : ${ok}/${todo.length}`);
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
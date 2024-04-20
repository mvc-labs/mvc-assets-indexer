import { IsNull, Not, Repository } from 'typeorm';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  NotifyStatus,
  TransactionEntity,
} from '../../entities/transaction.entity';
import { sleep } from '../../lib/utils';
import { PromisePool } from '@supercharge/promise-pool';
import axios from 'axios';
import { AdminService } from '../../routes/admin/admin.service';
import { GlobalConfigKey } from '../../constants/Global';

@Injectable()
export class NotifyService implements OnApplicationBootstrap {
  private readonly logger = new Logger(NotifyService.name);

  constructor(
    @InjectRepository(TransactionEntity)
    private transactionEntityRepository: Repository<TransactionEntity>,
    private adminService: AdminService,
  ) {}

  onApplicationBootstrap() {
    // daemonProcessNotifyTx
    this.daemonProcessNotifyTx().then();
  }

  private async daemonProcessNotifyTx() {
    while (true) {
      try {
        await this.processNotifyTx();
      } catch (e) {
        console.log('daemonProcessNotifyTx error', e);
      }
      await sleep(5000);
    }
  }

  private async processNotifyTx() {
    // notify on in block
    const pendingNotifyTxList = await this.transactionEntityRepository.find({
      where: {
        block_hash: Not(IsNull()),
        is_completed_check: true,
        notify_status: NotifyStatus.shouldNotify,
      },
      select: ['txid', 'notify_status'],
      take: 2000,
    });
    const callbackUrl = await this.adminService.getConfigValueByKey(
      GlobalConfigKey.callbackUrl,
    );
    const { errors } = await PromisePool.withConcurrency(5)
      .for(pendingNotifyTxList)
      .process(async (transactionEntity) => {
        transactionEntity.notify_status = NotifyStatus.completed;
        const data = {
          txid: transactionEntity.txid,
        };
        const resp = await axios.post(callbackUrl, data);
        if (resp.data && resp.data.success === true) {
          this.logger.debug(
            `notify callback url ${callbackUrl} txid ${transactionEntity.txid}`,
          );
          await this.transactionEntityRepository.update(
            {
              txid: transactionEntity.txid,
            },
            {
              notify_status: NotifyStatus.completed,
            },
          );
        }
      });
    if (errors.length > 0) {
      console.log('processNotifyTx errors:', errors);
    }
  }
}

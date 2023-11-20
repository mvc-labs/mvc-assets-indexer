import { Injectable, Logger } from '@nestjs/common';
import { commonResponse } from '../../lib/commonResponse';
import { RpcService } from '../../service/rpc/rpc.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BlockEntity } from '../../entities/block.entity';
import { TransactionEntity } from '../../entities/transaction.entity';

@Injectable()
export class DefaultService {
  private readonly logger = new Logger(DefaultService.name);
  constructor(
    @InjectRepository(BlockEntity)
    private blockEntityRepository: Repository<BlockEntity>,
    @InjectRepository(TransactionEntity)
    private transactionEntityRepository: Repository<TransactionEntity>,
    private readonly rpcService: RpcService,
  ) {}

  async blockchainInfo() {
    const resp = await this.rpcService.getBlockChainInfo();
    const respData = resp.data;
    const data = {
      chain: respData.result.chain,
      blocks: respData.result.blocks,
      headers: respData.result.headers,
      bestBlockHash: respData.result.bestblockhash,
      difficulty: respData.result.difficulty,
      medianTime: respData.result.mediantime,
      chainwork: respData.result.chainwork,
    };
    return commonResponse(0, 'ok', data);
  }

  async getRawMempool() {
    const resp = await this.rpcService.getRawMempool();
    const data = resp.data.result;
    return commonResponse(0, 'ok', data);
  }

  async mempoolInfo() {
    const resp = await this.rpcService.getMempoolInfo();
    const data = {
      ntx: resp.data.result.size,
    };
    return commonResponse(0, 'ok', data);
  }

  async pushTx(txHex: string) {
    this.logger.debug('pushTx', txHex);
    try {
      const resp = await this.rpcService.pushTx(txHex);
      return commonResponse(0, 'ok', resp.data.result);
    } catch (e) {
      return commonResponse(-1, e.response.data.error.message, null);
    }
  }

  async blockTxPage(q: string, cursor: number, size: number) {
    q = q.trim();
    const blockRecords = await this.blockEntityRepository.find({
      where: [{ hash: q }, { height: q as any }],
    });
    if (blockRecords.length > 0) {
      const blockRecord = blockRecords[0];
      const txList = await this.transactionEntityRepository.find({
        where: {
          block_hash: blockRecord.hash,
        },
        skip: cursor,
        take: size,
      });
      const tx = txList.map((value) => {
        return value.txid;
      });
      const data = {
        num_tx: blockRecord.num_tx,
        tx,
      };
      return commonResponse(0, 'ok', data);
    } else {
      return commonResponse(-1, '', null);
    }
  }
}

import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { BlockEntity, BlockProcessStatus } from '../../entities/block.entity';
import { In, IsNull, LessThan, Repository } from 'typeorm';
import { RpcService } from '../rpc/rpc.service';
import { TransactionEntity } from '../../entities/transaction.entity';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as fs from 'fs';
import { TransactionService } from '../transaction/transaction.service';
import { ZmqService } from '../zmq/zmq.service';
import * as mvc from 'mvc-lib';
import { sleep } from '../../lib/utils';
import { PromisePool } from '@supercharge/promise-pool';
import { TxInEntity } from '../../entities/txIn.entity';
import { TxOutEntity } from '../../entities/txOut.entity';
import { verifyMerkle } from '../../lib/merkle';
import { Interval } from '@nestjs/schedule';

@Injectable()
export class BlockService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BlockService.name);
  private readonly blockCacheNumber: number;
  private readonly blockCacheFolder: string;
  private readonly blockTimeMS: number;
  private readonly blockDownloadMS: number;

  constructor(
    @InjectRepository(BlockEntity)
    private blockEntityRepository: Repository<BlockEntity>,
    @InjectRepository(TransactionEntity)
    private transactionEntityRepository: Repository<TransactionEntity>,
    @InjectRepository(TxInEntity)
    private txInEntityRepository: Repository<TxInEntity>,
    @InjectRepository(TxOutEntity)
    private txOutEntityRepository: Repository<TxOutEntity>,
    private rpcService: RpcService,
    private configService: ConfigService,
    @Inject(forwardRef(() => TransactionService))
    private transactionService: TransactionService,
    private zmqService: ZmqService,
  ) {
    this.blockCacheNumber = this.configService.get('blockCacheNumber');
    const _folder = this.configService.get('blockCacheFolder');
    this.blockCacheFolder = path.resolve(_folder);
    if (!fs.existsSync(this.blockCacheFolder)) {
      // recursive make dir
      fs.mkdirSync(this.blockCacheFolder, { recursive: true });
    }
    this.zmqService.onHashBlock(this.hashBlockFromZmq.bind(this));
    this.blockTimeMS = this.configService.get('blockTimeMS');
    this.blockDownloadMS = this.configService.get('blockDownloadMS');
  }

  onApplicationBootstrap(): any {
    // chainTips daemon
    this.daemonForwardBlock().then();
    // download daemon
    this.daemonDownloadBlock().then();
    // double check block, check tx
    this.daemonDoubleCheckBlock().then();
    // clearProcessingBlock -> process daemon
    this.clearProcessingBlock().then();
  }

  private async hashBlockFromZmq(message: Buffer) {
    this.logger.debug(`newBlock: ${message.toString('hex')}`);
  }

  @Interval(10 * 60 * 1000)
  async progressSyncInfo() {
    const totalBlock = await this.blockEntityRepository.count({
      where: {
        is_reorg: false,
      },
    });
    const doubleCheckBlock = await this.blockEntityRepository.count({
      where: {
        processStatus: BlockProcessStatus.doubleCheck,
        is_reorg: false,
      },
    });
    const percent = ((doubleCheckBlock / totalBlock) * 100).toFixed(2);
    const needSyncBlock = totalBlock - doubleCheckBlock;
    this.logger.debug(`block sync percent: ${percent}%`);
    this.logger.debug(`need sync block number: ${needSyncBlock}`);
  }

  @Interval(10 * 60 * 1000)
  async progressTxIn() {
    const noProgressCount = await this.txInEntityRepository.count({
      where: {
        is_processed: false,
      },
    });
    if (noProgressCount > 4000) {
      const totalInputCount = await this.txInEntityRepository.count({});
      const percent = (
        ((totalInputCount - noProgressCount) / totalInputCount) *
        100
      ).toFixed(2);
      this.logger.debug(`txIn sync percent: ${percent}%`);
      this.logger.debug(`need sync txIn number: ${noProgressCount}`);
    } else {
      this.logger.debug(`indexer sync all completed`);
    }
  }

  async lastNostartRowArray(): Promise<BlockEntity[]> {
    // download
    const lastNostartHeightRowArray = await this.blockEntityRepository.find({
      where: {
        processStatus: BlockProcessStatus.downloaded,
      },
      order: {
        cursor_id: 'asc',
      },
      take: 100,
    });
    if (lastNostartHeightRowArray.length > 0) {
      return lastNostartHeightRowArray;
    }
    // before completed
    const maxCompletedRow = await this.blockEntityRepository.findOne({
      where: {
        processStatus: BlockProcessStatus.completed,
      },
      order: {
        cursor_id: 'desc',
      },
    });
    if (maxCompletedRow) {
      // before process
      const beforeProcess = await this.blockEntityRepository.find({
        where: {
          cursor_id: LessThan(maxCompletedRow.cursor_id),
          processStatus: BlockProcessStatus.processing,
        },
        order: {
          cursor_id: 'asc',
        },
        take: 100,
      });
      if (beforeProcess.length > 0) {
        return beforeProcess;
      }
    }
    // error completed
    const errorCompleted = await this.blockEntityRepository
      .createQueryBuilder('block')
      .where(
        ' block.processStatus = :status and block.num_tx != block.process_count',
        { status: BlockProcessStatus.completed },
      )
      .getMany();
    if (errorCompleted.length > 0) {
      return errorCompleted;
    }
    return [];
  }

  async downloadFile(downloadBlockRow: BlockEntity) {
    const blockCacheHexFilePath = `${this.blockCacheFolder}/${downloadBlockRow.hash}.bin`;
    downloadBlockRow.processStatus = BlockProcessStatus.downloading;
    await this.blockEntityRepository.update(
      {
        hash: downloadBlockRow.hash,
      },
      {
        processStatus: BlockProcessStatus.downloading,
      },
    );
    await this.rpcService.getRawBlockByRest(
      downloadBlockRow.hash,
      blockCacheHexFilePath,
    );
    downloadBlockRow.processStatus = BlockProcessStatus.downloaded;
    await this.blockEntityRepository.update(
      {
        hash: downloadBlockRow.hash,
      },
      {
        processStatus: BlockProcessStatus.downloaded,
      },
    );
    this.logger.debug(`downloadBlock ${blockCacheHexFilePath}`);
  }

  async clearFile(downloadBlockRow: BlockEntity) {
    const blockCacheHexFilePath = `${this.blockCacheFolder}/${downloadBlockRow.hash}.bin`;
    fs.rmSync(blockCacheHexFilePath);
  }

  async downloadBlock() {
    const downloadedCount = await this.blockEntityRepository.count({
      where: {
        processStatus: BlockProcessStatus.downloaded,
      },
    });
    const completedCount = await this.blockEntityRepository.count({
      where: {
        processStatus: BlockProcessStatus.completed,
      },
    });
    if (completedCount > 200) {
      await this.blockEntityRepository.update(
        {
          processStatus: BlockProcessStatus.completed,
        },
        {
          processStatus: BlockProcessStatus.nostart,
        },
      );
    }
    const willCacheNumber = this.blockCacheNumber - downloadedCount;
    if (willCacheNumber <= 0) {
      return;
    }
    const downloadBlockRows: BlockEntity[] =
      await this.blockEntityRepository.find({
        where: {
          processStatus: In([
            BlockProcessStatus.nostart,
            BlockProcessStatus.downloading,
          ]),
        },
        order: {
          height: 'asc',
        },
        take: willCacheNumber,
      });
    const step = 20;
    for (let i = 0; i < downloadBlockRows.length; i += step) {
      const items = downloadBlockRows.slice(i, i + step);
      try {
        await Promise.all(
          items.map(async (value) => {
            try {
              await this.downloadFile(value);
            } catch (e) {
              console.log('downloadBlock e', value, e);
              await this.clearFile(value);
            }
          }),
        );
      } catch (e) {}
    }
  }

  async getBlockDataHexByCache(blockHash: string) {
    const blockCacheHexFilePath = `${this.blockCacheFolder}/${blockHash}.bin`;
    try {
      const content = fs.readFileSync(blockCacheHexFilePath);
      this.logger.debug(`load block from ${blockCacheHexFilePath}`);
      return content;
    } catch (e) {
      return;
    }
  }

  async clearBlockDataCache(blockHash: string) {
    const blockCacheFileHexPath = `${this.blockCacheFolder}/${blockHash}.bin`;
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    fs.rm(blockCacheFileHexPath, () => {});
  }
  //
  async processOneBlock(nostartRow: BlockEntity) {
    return await this._processOneBlock(nostartRow);
  }
  async _processOneBlock(nostartRow: BlockEntity) {
    if (this.transactionService.isFull()) {
      return;
    }
    if (!nostartRow) {
      return;
    }
    const blockRawData = await this.getBlockDataHexByCache(nostartRow.hash);
    if (!blockRawData || blockRawData.length === 0) {
      // block data not
      this.logger.debug(`update block from ${nostartRow.hash} to nostart`);
      await this.blockEntityRepository.update(
        {
          hash: nostartRow.hash,
        },
        {
          processStatus: BlockProcessStatus.nostart,
        },
      );
      return;
    }
    let block: any;
    try {
      block = new mvc.Block(blockRawData);
    } catch (e) {
      console.log('new mvc.Block', e);
    }
    if (!(block && verifyMerkle(block))) {
      // verify tx not pass, change status to nostart
      this.logger.debug(
        `update block from ${nostartRow.hash} to nostart, verifyMerkle not pass`,
      );
      await this.blockEntityRepository.update(
        {
          hash: nostartRow.hash,
        },
        {
          processStatus: BlockProcessStatus.nostart,
        },
      );
      return;
    }

    const txIdIndexMap = {};
    await this.blockEntityRepository.update(
      { hash: nostartRow.hash },
      {
        processStatus: BlockProcessStatus.processing,
      },
    );

    const txIdList = block.transactions.map(function (value: any) {
      return value.hash;
    });
    {
      const step = 300;
      for (let i = 0; i < txIdList.length; i += step) {
        const start = i;
        const end = i + step;
        const sub = txIdList.slice(start, end);
        await this.transactionEntityRepository.update(
          {
            txid: In(sub),
            is_deleted: true,
          },
          {
            is_deleted: false,
          },
        );
        await this.txInEntityRepository.update(
          {
            txid: In(sub),
            is_deleted: true,
          },
          {
            is_deleted: false,
          },
        );
        await this.txOutEntityRepository.update(
          {
            txid: In(sub),
            is_deleted: true,
          },
          {
            is_deleted: false,
          },
        );
      }
    }
    for (let i = 0; i < txIdList.length; i++) {
      txIdIndexMap[txIdList[i]] = i;
    }
    const _hasTxIdList: {
      TransactionEntity_txid: string;
      TransactionEntity_block_hash: string;
      TransactionEntity_is_completed_check: boolean;
      TransactionEntity_tx_in_num: number;
      TransactionEntity_tx_in_coinbase: number;
      TransactionEntity_tx_out_num: number;
      TransactionEntity_tx_out_0_satoshi: number;
    }[] = [];
    // Todo use _subHasTxIdList check completed
    let dbCountStatusMap = {};
    if (!(nostartRow.processStatus !== BlockProcessStatus.downloaded)) {
      const step = 1000;
      for (let i = 0; i < txIdList.length; i += step) {
        const start = i;
        const end = i + step;
        const sub = txIdList.slice(start, end);
        const _subHasTxIdList = await this.transactionEntityRepository
          .createQueryBuilder('TransactionEntity')
          .select([
            'TransactionEntity.txid',
            'TransactionEntity.block_hash',
            'TransactionEntity.is_completed_check',
            'TransactionEntity.tx_in_num',
            'TransactionEntity.tx_in_coinbase',
            'TransactionEntity.tx_out_num',
            'TransactionEntity.tx_out_0_satoshi',
          ])
          .where(
            'TransactionEntity.txid in (:...txIdList) and is_deleted = false',
            {
              txIdList: sub,
            },
          )
          .distinct(true)
          .getRawMany();
        _hasTxIdList.push(..._subHasTxIdList);
      }
      dbCountStatusMap = await this.transactionService.transactionInOutCount(
        _hasTxIdList.map((value) => value.TransactionEntity_txid),
      );
    }
    const existTxIdMap = {};
    const hasTxIdList = [];
    _hasTxIdList.map((value) => {
      const dbCountStatus = dbCountStatusMap[value.TransactionEntity_txid];
      if (dbCountStatus) {
        const value_tx_in_num =
          value.TransactionEntity_tx_in_num -
          value.TransactionEntity_tx_in_coinbase;
        const value_tx_out_num =
          value.TransactionEntity_tx_out_num -
          value.TransactionEntity_tx_out_0_satoshi;
        if (
          dbCountStatus.tx_in_num == value_tx_in_num &&
          dbCountStatus.tx_out_num == value_tx_out_num &&
          value.TransactionEntity_block_hash == nostartRow.hash
        ) {
          existTxIdMap[value.TransactionEntity_txid] = true;
          hasTxIdList.push(value.TransactionEntity_txid);
        }
      }
    });
    const notExistsTxIdList = [];
    let notExistsCount = 0;
    for (let i = 0; i < txIdList.length; i++) {
      const _id = txIdList[i];
      if (!existTxIdMap[_id]) {
        notExistsTxIdList.push(_id);
        notExistsCount += 1;
      }
    }
    nostartRow.processStatus = BlockProcessStatus.processing;
    nostartRow.process_count = txIdList.length - notExistsCount;
    if (txIdList.length > 0) {
      const step = 100;
      for (let i = 0; i < txIdList.length; i += step) {
        const start = i;
        const end = i + step;
        const subTxIdList = txIdList.slice(start, end);
        this.transactionEntityRepository
          .createQueryBuilder()
          .update(TransactionEntity)
          .set({ block_hash: nostartRow.hash, is_completed_check: true })
          .where(' txid in (:...hasTxIdList)', { hasTxIdList: subTxIdList })
          .execute()
          .then()
          .catch();
      }
    }
    this.logger.debug(
      `notExistsCount ${notExistsCount} allTxCount ${nostartRow.num_tx}`,
    );
    let lastRow: any;
    if (notExistsCount === 0) {
      nostartRow.process_count = nostartRow.num_tx;
      nostartRow.processStatus = BlockProcessStatus.completed;
      await this.clearBlockDataCache(nostartRow.hash);
    } else {
      for (let i = 0; i < notExistsTxIdList.length - 1; i++) {
        const _txid = notExistsTxIdList[i];
        const _txidIndex = txIdIndexMap[_txid];
        const tx = block.transactions[_txidIndex];
        this.transactionService.txFromBlock(
          nostartRow.height,
          nostartRow.hash,
          nostartRow.num_tx,
          false,
          _txid,
          tx,
          this.clearBlockDataCache.bind(this),
        );
      }
      const _txid = notExistsTxIdList[notExistsTxIdList.length - 1];
      const _txidIndex = txIdIndexMap[_txid];
      const tx = block.transactions[_txidIndex];
      lastRow = [
        nostartRow.height,
        nostartRow.hash,
        nostartRow.num_tx,
        true,
        _txid,
        tx,
        this.clearBlockDataCache.bind(this),
      ];
    }
    try {
      await this.blockEntityRepository.save(nostartRow);
    } catch (e) {}
    return lastRow;
  }
  //
  async processBlock() {
    if (this.transactionService.isFull()) {
      return 0;
    }
    const noStartRowArray = await this.lastNostartRowArray();
    const selectArray = [];
    let txNumber = this.transactionService.txCacheNumber();
    for (const block of noStartRowArray) {
      txNumber += Number(block.num_tx);
      selectArray.push(block);
      if (txNumber > this.transactionService.txMempoolQueueMax) {
        break;
      }
    }
    const { results } = await PromisePool.withConcurrency(5)
      .for(selectArray)
      .process(async (blockEntity) => {
        return await this.processOneBlock(blockEntity);
      });
    for (const lastRow of results) {
      if (lastRow) {
        const [
          blockHeight,
          blockHash,
          txCount,
          isLast,
          txid,
          txHex,
          clearBlockDataCache,
        ] = lastRow;
        this.transactionService.txFromBlock(
          blockHeight,
          blockHash,
          txCount,
          isLast,
          txid,
          txHex,
          clearBlockDataCache,
        );
      }
    }
    return selectArray.length;
  }

  async processPendingBlock() {
    const pendingBlockList = await this.blockEntityRepository.find({
      where: {
        processStatus: BlockProcessStatus.processing,
      },
      order: {
        cursor_id: 'asc',
      },
    });
    for (const pendingBlock of pendingBlockList) {
      const lastRow = await this.processOneBlock(pendingBlock);
      if (lastRow) {
        const [
          blockHeight,
          blockHash,
          txCount,
          isLast,
          txid,
          txHex,
          clearBlockDataCache,
        ] = lastRow;
        this.transactionService.txFromBlock(
          blockHeight,
          blockHash,
          txCount,
          isLast,
          txid,
          txHex,
          clearBlockDataCache,
        );
      }
    }
  }

  private async getBlockHeaderResult(blockHash: string) {
    const resp = await this.rpcService.getBlockHeader(blockHash);
    return resp.data.result;
  }

  private async forwardGetBlockInfo(blockHash: string, size: number) {
    const list = [];
    let i = 0;
    let beforeInfo = await this.getBlockHeaderResult(blockHash);
    list.push(beforeInfo);
    while (i < size) {
      if (beforeInfo.previousblockhash) {
        beforeInfo = await this.getBlockHeaderResult(
          beforeInfo.previousblockhash,
        );
        list.push(beforeInfo);
      } else {
        break;
      }
      i += 1;
    }
    return list;
  }

  private updateTail(blockHeaderList: any[]) {
    for (let i = 0; i < blockHeaderList.length; i++) {
      const item = blockHeaderList[i];
      item.is_tail = false;
    }
    blockHeaderList[blockHeaderList.length - 1].is_tail = true;
    return blockHeaderList;
  }

  private updateChainTips(blockHeaderList: any[]) {
    for (let i = 0; i < blockHeaderList.length; i++) {
      const item = blockHeaderList[i];
      item.is_reorg = false;
      item.is_chaintips = false;
    }
    this.logger.debug(
      `update chaintips ${
        blockHeaderList[blockHeaderList.length - 1].hash
      } true in updateChainTips`,
    );
    blockHeaderList[blockHeaderList.length - 1].is_chaintips = true;
    return blockHeaderList;
  }

  private updateReorgChainTips(blockHeaderList: any[]) {
    for (let i = 0; i < blockHeaderList.length; i++) {
      const item = blockHeaderList[i];
      this.logger.debug(
        `update block from ${item.hash} to nostart, updateReorgChainTips`,
      );
      item.is_reorg = false;
      item.is_chaintips = false;
      item.processStatus = BlockProcessStatus.nostart;
    }
    this.logger.debug(
      `update chaintips ${blockHeaderList[0].hash} true in updateReorgChainTips`,
    );
    blockHeaderList[0].is_chaintips = true;
    return blockHeaderList;
  }

  private updateReorg(blockHeaderList: any[]) {
    for (let i = 0; i < blockHeaderList.length; i++) {
      const item = blockHeaderList[i];
      item.is_chaintips = false;
      item.is_tail = false;
      item.is_reorg = true;
    }
    return blockHeaderList;
  }

  private async doForward(prevHash: string, before: any[]) {
    while (true) {
      if (!prevHash) {
        break;
      }
      const bulkList = await this.forwardGetBlockInfo(prevHash, 100);
      if (bulkList.length == 0) {
        break;
      }
      const tail = bulkList[bulkList.length - 1];
      await this.blockEntityRepository.save(
        this.updateTail(before.concat(bulkList)),
      );
      tail.is_tail = true;
      await this.blockEntityRepository.save(tail);
      before = [tail];
      prevHash = tail.previousblockhash;
    }
  }

  private async forwardBlockLinked(blockHash: string) {
    let blockInfo = await this.getBlockHeaderResult(blockHash);
    const blockLinked = [];
    let dbRecord: BlockEntity;
    while (true) {
      dbRecord = await this.blockEntityRepository.findOne({
        where: {
          hash: blockInfo.hash,
        },
      });
      if (dbRecord) {
        break;
      }
      blockLinked.push(blockInfo);
      blockInfo = await this.getBlockHeaderResult(blockInfo.previousblockhash);
    }
    return {
      blockLinked,
      dbRecord,
    };
  }

  private async forwardReorg(newChainTipsBlock: BlockEntity) {
    const reorgList = [];
    let tempChainTipsBlock = newChainTipsBlock;
    while (true) {
      const afterBlock = await this.blockEntityRepository.findOne({
        where: {
          previousblockhash: tempChainTipsBlock.hash,
        },
      });
      if (afterBlock) {
        reorgList.push(afterBlock);
      } else {
        break;
      }
      tempChainTipsBlock = afterBlock;
    }
    return {
      reorgList: reorgList,
    };
  }

  private async forwardBlock() {
    // load from table
    const [chaintips, isTail] = await Promise.all([
      this.blockEntityRepository.findOne({
        where: {
          is_chaintips: true,
        },
        order: {
          cursor_id: 'desc',
        },
      }),
      this.blockEntityRepository.findOne({
        where: [
          {
            is_tail: true,
          },
          {
            previousblockhash: IsNull(),
          },
        ],
      }),
    ]);
    if (chaintips == null && isTail == null) {
      // init
      const resp = await this.rpcService.getBestBlockHash();
      const bestHash = resp.data.result;
      const chaintipsBlockHeader = await this.getBlockHeaderResult(bestHash);
      chaintipsBlockHeader['is_chaintips'] = true;
      await this.blockEntityRepository.save(chaintipsBlockHeader);
      const prevHash = chaintipsBlockHeader.previousblockhash;
      const before = [];
      await this.doForward(prevHash, before);
    }
    if (chaintips && isTail) {
      // restart process
      const before = [isTail];
      const prevHash = isTail.previousblockhash;
      // forward until previousblockhash is null
      await this.doForward(prevHash, before);
    }
    const newBestBlockHashResp = await this.rpcService.getBestBlockHash();
    // forward new tips
    //      blockLinked
    // [lastBlock -> -> ]-> dbRecord
    const { blockLinked, dbRecord } = await this.forwardBlockLinked(
      newBestBlockHashResp.data.result,
    );
    if (dbRecord.is_chaintips) {
      if (blockLinked.length > 0) {
        blockLinked.push(dbRecord);
        const reverseBlockLinked = blockLinked.reverse();
        const step = 10;
        for (let i = 0; i < reverseBlockLinked.length; i += step) {
          let start = i - 1;
          if (start < 0) {
            start = 0;
          }
          const end = i + step;
          const sub = reverseBlockLinked.slice(start, end);
          const saveList = this.updateChainTips(sub);
          await this.blockEntityRepository.save(saveList);
        }
      }
    } else {
      this.logger.debug('have reorg');
      const { reorgList }: { reorgList: BlockEntity[] } =
        await this.forwardReorg(dbRecord);
      const saveReorgList: BlockEntity[] = this.updateReorg(reorgList);
      const saveNewList: BlockEntity[] = this.updateReorgChainTips(blockLinked);
      const reorgHashList = saveReorgList
        .map((value) => {
          return value.hash;
        })
        .sort();
      const newHashList = saveNewList
        .map((value) => {
          return value.hash;
        })
        .sort();
      // find block coinbase tx
      const reorgCoinBaseTx = await this.transactionEntityRepository.find({
        where: {
          block_hash: In(reorgHashList),
          tx_in_coinbase: 1,
        },
      });
      const reorgCoinbaseTxHash = reorgCoinBaseTx.map((value) => {
        return value.txid;
      });
      await this.transactionEntityRepository.delete({
        txid: In(reorgCoinbaseTxHash),
      });
      await this.txOutEntityRepository.delete({
        txid: In(reorgCoinbaseTxHash),
      });
      await Promise.all([
        this.transactionEntityRepository.update(
          {
            block_hash: In(reorgHashList),
          },
          { is_deleted: true },
        ),
      ]);
      await Promise.all([
        this.transactionEntityRepository.update(
          {
            block_hash: In(newHashList),
          },
          { is_deleted: false },
        ),
      ]);
      await this.blockEntityRepository.save(saveNewList.concat(saveReorgList));
    }
  }

  private async daemonForwardBlock() {
    while (true) {
      try {
        await this.forwardBlock();
      } catch (e) {
        console.log('daemonForwardBlock error', e);
      }
      await sleep(this.blockTimeMS);
    }
  }

  private async daemonDownloadBlock() {
    while (true) {
      try {
        await this.downloadBlock();
      } catch (e) {
        console.log('daemonDownloadBlock error', e);
      }
      await sleep(this.blockDownloadMS);
    }
  }
  //
  private async daemonProcessBlock() {
    let l = 0;
    while (true) {
      try {
        l = await this.processBlock();
      } catch (e) {
        console.log('daemonProcessBlock error', e);
      }
      if (l === 0) {
        await sleep(this.blockDownloadMS);
      }
    }
  }

  private async doubleCheckBlock(completedBlock: BlockEntity) {
    if (completedBlock) {
      const records: {
        tx_in_num_total: string;
        tx_out_num_total: string;
        tx_out_0_satoshi_total: string;
      }[] = await this.transactionEntityRepository
        .createQueryBuilder('tx')
        .where(' block_hash = :block_hash', {
          block_hash: completedBlock.hash,
        })
        .select([])
        .addSelect('SUM(tx.tx_in_num)', 'tx_in_num_total')
        .addSelect('SUM(tx.tx_out_num)', 'tx_out_num_total')
        .addSelect('SUM(tx.tx_out_0_satoshi)', 'tx_out_0_satoshi_total')
        .getRawMany();
      const txInCountRaw: { ct: string }[] =
        await this.transactionEntityRepository.query(
          `
        SELECT COUNT(*) as ct FROM tx JOIN tx_in ON tx.txid = tx_in.txid WHERE block_hash = ?
      `,
          [completedBlock.hash],
        );
      const txOutCountRaw: { ct: string }[] =
        await this.transactionEntityRepository.query(
          `
            SELECT COUNT(*) as ct FROM tx JOIN tx_out ON tx.txid = tx_out.txid WHERE block_hash = ? `,
          [completedBlock.hash],
        );
      const record = records[0];
      const txInCount = Number(txInCountRaw[0].ct || '0');
      const txOutCount = Number(txOutCountRaw[0].ct || '0');
      const expectedTxInNumber = Number(record.tx_in_num_total || '1') - 1;
      const expectedTxOutNumber =
        Number(record.tx_out_num_total || '1') -
        Number(record.tx_out_0_satoshi_total || '0');
      const pass =
        expectedTxInNumber === txInCount && expectedTxOutNumber == txOutCount;
      if (pass) {
        await this.blockEntityRepository.update(
          { hash: completedBlock.hash },
          {
            processStatus: BlockProcessStatus.doubleCheck,
          },
        );
        await this.transactionEntityRepository.update(
          { block_hash: completedBlock.hash },
          { is_completed_check: true },
        );
        this.logger.debug(`block ${completedBlock.hash} double check pass`);
      } else {
        this.logger.debug(
          `update block from ${completedBlock.hash} to nostart, doubleCheckBlock`,
        );
        await this.blockEntityRepository.update(
          { hash: completedBlock.hash },
          {
            processStatus: BlockProcessStatus.nostart,
          },
        );
      }
      return true;
    } else {
      return false;
    }
  }

  private async daemonDoubleCheckBlock() {
    while (true) {
      try {
        const completedBlockList = await this.blockEntityRepository.find({
          where: {
            processStatus: BlockProcessStatus.completed,
            is_reorg: false,
          },
          take: 5,
        });
        await Promise.all(
          completedBlockList.map((value) => this.doubleCheckBlock(value)),
        );
        if (completedBlockList.length === 0) {
          await sleep(1000);
        }
      } catch (e) {
        console.log('daemonDoubleCheckBlock error', e);
      }
    }
  }

  async clearProcessingBlock() {
    await this.processPendingBlock();
    this.daemonProcessBlock().then();
  }
}

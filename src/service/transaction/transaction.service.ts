import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ZmqService } from '../zmq/zmq.service';
import { InjectRepository } from '@nestjs/typeorm';
import {
  IsNull,
  LessThan,
  MoreThan,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { TransactionEntity } from '../../entities/transaction.entity';
import * as mvc from 'mvc-lib';
import {
  arrayToChunks,
  isCoinBase,
  sleep,
  sortedObjectArrayByKey,
  trimEmptyBytes,
} from 'src/lib/utils';
import { BlockEntity, BlockProcessStatus } from '../../entities/block.entity';
import { RpcService } from '../rpc/rpc.service';
import { ConfigService } from '@nestjs/config';
import { In } from 'typeorm/find-options/operator/In';
import { TxInEntity } from '../../entities/txIn.entity';
import { TxOutEntity } from '../../entities/txOut.entity';
import { PromisePool } from '@supercharge/promise-pool';

// eslint-disable-next-line @typescript-eslint/no-var-requires
import { OutputType, TxDecoder } from 'meta-contract';
import { TxOutNftEntity } from '../../entities/txOutNftEntity';
import { TxOutFtEntity } from '../../entities/txOutFtEntity';

@Injectable()
export class TransactionService implements OnApplicationBootstrap {
  private readonly logger = new Logger(TransactionService.name);
  private txBlockQueue: any[];
  private readonly txMempoolQueueMax: number;
  private readonly callBackQueueAfterTxProcess: any[];
  private processRawTxQueue: any[];
  private readonly txProcessMS: number;

  constructor(
    @InjectRepository(TransactionEntity)
    private transactionEntityRepository: Repository<TransactionEntity>,
    @InjectRepository(TxInEntity)
    private txInEntityRepository: Repository<TxInEntity>,
    @InjectRepository(TxOutEntity)
    private txOutEntityRepository: Repository<TxOutEntity>,
    @InjectRepository(TxOutNftEntity)
    private txOutNftEntityRepository: Repository<TxOutNftEntity>,
    @InjectRepository(TxOutFtEntity)
    private txOutFtEntityRepository: Repository<TxOutFtEntity>,
    @InjectRepository(BlockEntity)
    private blockEntityRepository: Repository<BlockEntity>,
    private readonly configService: ConfigService,
    private readonly zmqService: ZmqService,
    private readonly rpcService: RpcService,
  ) {
    this.txBlockQueue = [];
    this.txMempoolQueueMax = 10000;
    this.zmqService.onRawTx(this.rawTxFromZmq.bind(this));
    this.callBackQueueAfterTxProcess = [];
    this.processRawTxQueue = [];
    this.txProcessMS = this.configService.get('txProcessMS');
  }

  onApplicationBootstrap(): any {
    this.txBlockProcessDaemon().then();
    this.txMempoolProcessDaemon().then();
    this.syncMemPoolDaemon().then();
    this.checkMemPoolDaemon().then();
    this.checkTxTimeoutDaemon().then();
    this.useTxoDaemon().then();
    this.doubleCheckTxoDaemon().then();
  }

  rawTxFromZmq(rawTx: Buffer) {
    this.processRawTxQueue.push(rawTx);
  }

  private async _txMempoolProcess(rawTx: Buffer) {
    const tx = mvc.Transaction(rawTx);
    const txid = tx.hash;
    try {
      await this.oneMempoolTxProcessor(tx, txid, rawTx.toString('hex'));
    } catch (e) {
      console.log('oneMempoolTxProcessor e', e);
    }
  }

  async txMempoolProcess() {
    while (true) {
      const rawTx = this.processRawTxQueue.shift();
      if (rawTx === undefined) {
        break;
      } else {
        await this._txMempoolProcess(rawTx);
      }
    }
  }

  async hashTxFromZmqSync(message: Buffer) {
    const txid = message.toString('hex');
    const resp = await this.rpcService.getRawTxByRest(txid);
    const _dataHex = resp.data;
    try {
      const dataHex = _dataHex.trim();
      const tx = mvc.Transaction(dataHex);
      await this.oneMempoolTxProcessor(tx, txid, dataHex);
    } catch (e) {
      console.log('getRawTxByRest', e);
    }
    this.logger.debug(`hashTxFromZmq ${txid}`);
  }

  isFull() {
    return this.txBlockQueue.length >= this.txMempoolQueueMax;
  }

  txFromBlock(
    blockHeight: number,
    blockHash: string,
    txCount: number,
    isLast: boolean,
    txid: string,
    txHex: string,
    clearBlockDataCache: any,
  ) {
    const item = {
      blockHeight,
      blockHash,
      txCount,
      isLast,
      txid,
      txHex,
      clearBlockDataCache,
    };
    this.txBlockQueue.push(item);
  }

  private async oneMempoolTxProcessor(tx: any, txid: string, txHex: string) {
    let transactionEntity = await this.transactionEntityRepository.findOne({
      where: {
        txid: txid,
        is_deleted: false,
      },
    });
    if (transactionEntity) {
      return;
    } else {
      transactionEntity = this.transactionEntityRepository.create();
      transactionEntity.txid = txid;
    }
    const txInEntityList = [];
    transactionEntity.tx_in_num = tx.inputs.length;
    transactionEntity.tx_out_num = tx.outputs.length;
    transactionEntity.tx_out_0_satoshi = 0;
    transactionEntity.is_deleted = false;
    for (let i = 0; i < tx.inputs.length; i++) {
      const input = tx.inputs[i];
      const preTxId = input.prevTxId.toString('hex');
      if (!isCoinBase(preTxId)) {
        const txIn = this.txInEntityRepository.create();
        txIn.txid = txid;
        txIn.inputIndex = i;
        txIn.outpoint = `${preTxId}_${input.outputIndex}`;
        txIn.is_deleted = false;
        txInEntityList.push(txIn);
      } else {
        transactionEntity.tx_in_coinbase = 1;
      }
    }
    const txOutEntityList = [];
    const nftOutEntityList = [];
    const ftOutEntityList = [];
    for (let i = 0; i < tx.outputs.length; i++) {
      const output = tx.outputs[i];
      const newUtxo = this.txOutEntityRepository.create();
      newUtxo.txid = txid;
      newUtxo.outpoint = `${txid}_${i}`;
      newUtxo.outputIndex = i;
      const outputInfo = TxDecoder.decodeOutput(output, null);
      newUtxo.script_type = outputInfo.type;
      newUtxo.is_deleted = false;
      if (outputInfo.type === OutputType.SENSIBLE_NFT) {
        const nftUtxo = this.txOutNftEntityRepository.create();
        nftUtxo.outpoint = newUtxo.outpoint;
        nftUtxo.codeHash = outputInfo.data.codehash;
        nftUtxo.genesis = outputInfo.data.genesis;
        nftUtxo.sensibleId = outputInfo.data.sensibleId;
        nftUtxo.metaTxid = outputInfo.data.metaidOutpoint.txid;
        nftUtxo.metaOutputIndex = outputInfo.data.metaidOutpoint.index;
        nftUtxo.tokenSupply = outputInfo.data.totalSupply.toString();
        nftUtxo.tokenIndex = outputInfo.data.tokenIndex.toString();
        nftUtxo.txid = txid;
        nftOutEntityList.push(nftUtxo);
        // address
        newUtxo.address_hex = new mvc.Address(
          outputInfo.data.nftAddress,
        ).hashBuffer.toString('hex');
      } else if (outputInfo.type === OutputType.SENSIBLE_FT) {
        const ftUtxo = this.txOutFtEntityRepository.create();
        ftUtxo.outpoint = newUtxo.outpoint;
        ftUtxo.codeHash = outputInfo.data.codehash;
        ftUtxo.genesis = outputInfo.data.genesis;
        ftUtxo.name = trimEmptyBytes(outputInfo.data.tokenName);
        ftUtxo.symbol = trimEmptyBytes(outputInfo.data.tokenSymbol);
        ftUtxo.sensibleId = outputInfo.data.sensibleId;
        ftUtxo.decimal = outputInfo.data.decimalNum;
        ftUtxo.value = outputInfo.data.tokenAmount.toString();
        ftUtxo.txid = txid;
        ftOutEntityList.push(ftUtxo);
        // address
        newUtxo.address_hex = new mvc.Address(
          outputInfo.data.tokenAddress,
        ).hashBuffer.toString('hex');
      } else if (outputInfo.type === OutputType.P2PKH) {
        newUtxo.address_hex = output.script
          .toAddress()
          .hashBuffer.toString('hex');
      } else if (outputInfo.type === OutputType.OP_RETURN) {
        newUtxo.address_hex = 'unknown';
      } else if (outputInfo.type === OutputType.UNKNOWN) {
        newUtxo.address_hex = 'unknown';
      } else {
        newUtxo.address_hex = 'unknown';
      }
      newUtxo.satoshis = output.satoshis;
      if (newUtxo.satoshis > 0) {
        txOutEntityList.push(newUtxo);
      } else {
        transactionEntity.tx_out_0_satoshi += 1;
      }
    }
    await this.transactionEntityRepository
      .upsert(transactionEntity, ['txid'])
      .catch();
    await Promise.all([
      (async () => {
        const txInEntityListSubSet = arrayToChunks(txInEntityList, 100);
        const { errors } = await PromisePool.withConcurrency(2)
          .for(txInEntityListSubSet)
          .process(async (txInEntityListSub) => {
            await this.txInEntityRepository.upsert(txInEntityListSub, [
              'outpoint',
            ]);
          });
        if (errors.length > 0) {
          console.log('mempool txIn save', errors);
        }
      })(),
      (async () => {
        const txOutEntityListSubSet = arrayToChunks(txOutEntityList, 100);
        await PromisePool.withConcurrency(2)
          .for(txOutEntityListSubSet)
          .process(async (txOutEntityListSub) => {
            await this.txOutEntityRepository.save(txOutEntityListSub);
          });
      })(),
    ]);
    if (nftOutEntityList.length > 0) {
      try {
        await this.txOutNftEntityRepository.save(nftOutEntityList);
      } catch (e) {}
    }
    if (ftOutEntityList.length > 0) {
      try {
        await this.txOutFtEntityRepository.save(ftOutEntityList);
      } catch (e) {}
    }
    for (const callBack of this.callBackQueueAfterTxProcess) {
      callBack(txid, tx, txHex, transactionEntity);
    }
    return true;
  }

  private async oneBlockTxProcessor(
    blockHash: string,
    txCount: number,
    isLast: boolean,
    txid: string,
    txHex: string,
    clearBlockDataCache: any,
  ) {
    const transactionEntity = this.transactionEntityRepository.create();
    transactionEntity.txid = txid;
    transactionEntity.block_hash = blockHash;
    const tx = new mvc.Transaction(txHex);
    const txInEntityList = [];
    transactionEntity.tx_in_num = tx.inputs.length;
    transactionEntity.tx_out_num = tx.outputs.length;
    transactionEntity.is_deleted = false;
    for (let i = 0; i < tx.inputs.length; i++) {
      const input = tx.inputs[i];
      const preTxId = input.prevTxId.toString('hex');
      if (!isCoinBase(preTxId)) {
        const txIn = this.txInEntityRepository.create();
        txIn.txid = txid;
        txIn.inputIndex = i;
        txIn.outpoint = `${preTxId}_${input.outputIndex}`;
        txIn.is_deleted = false;
        txInEntityList.push(txIn);
      } else {
        transactionEntity.tx_in_coinbase = 1;
      }
    }
    const txOutEntityList = [];
    const txOutNftEntityList = [];
    const txOutFtEntityList = [];
    let tx_out_0_satoshi = 0;
    for (let i = 0; i < tx.outputs.length; i++) {
      const output = tx.outputs[i];
      const newUtxo = this.txOutEntityRepository.create();
      newUtxo.txid = txid;
      newUtxo.outpoint = `${txid}_${i}`;
      newUtxo.outputIndex = i;
      const outputInfo = TxDecoder.decodeOutput(output, null);
      newUtxo.script_type = outputInfo.type;
      newUtxo.is_deleted = false;
      if (outputInfo.type === OutputType.SENSIBLE_NFT) {
        const nftUtxo = this.txOutNftEntityRepository.create();
        nftUtxo.outpoint = newUtxo.outpoint;
        nftUtxo.codeHash = outputInfo.data.codehash;
        nftUtxo.genesis = outputInfo.data.genesis;
        nftUtxo.sensibleId = outputInfo.data.sensibleId;
        nftUtxo.metaTxid = outputInfo.data.metaidOutpoint.txid;
        nftUtxo.metaOutputIndex = outputInfo.data.metaidOutpoint.index;
        nftUtxo.tokenSupply = outputInfo.data.totalSupply.toString();
        nftUtxo.tokenIndex = outputInfo.data.tokenIndex.toString();
        nftUtxo.txid = txid;
        txOutNftEntityList.push(nftUtxo);
        // address
        newUtxo.address_hex = new mvc.Address(
          outputInfo.data.nftAddress,
        ).hashBuffer.toString('hex');
      } else if (outputInfo.type === OutputType.SENSIBLE_FT) {
        const ftUtxo = this.txOutFtEntityRepository.create();
        ftUtxo.outpoint = newUtxo.outpoint;
        ftUtxo.codeHash = outputInfo.data.codehash;
        ftUtxo.genesis = outputInfo.data.genesis;
        ftUtxo.name = trimEmptyBytes(outputInfo.data.tokenName);
        ftUtxo.symbol = trimEmptyBytes(outputInfo.data.tokenSymbol);
        ftUtxo.sensibleId = outputInfo.data.sensibleId;
        ftUtxo.decimal = outputInfo.data.decimalNum;
        ftUtxo.value = outputInfo.data.tokenAmount.toString();
        ftUtxo.txid = txid;
        txOutFtEntityList.push(ftUtxo);
        // address
        newUtxo.address_hex = new mvc.Address(
          outputInfo.data.tokenAddress,
        ).hashBuffer.toString('hex');
      } else if (outputInfo.type === OutputType.P2PKH) {
        newUtxo.address_hex = output.script
          .toAddress()
          .hashBuffer.toString('hex');
      } else if (outputInfo.type === OutputType.OP_RETURN) {
        newUtxo.address_hex = 'unknown';
      } else if (outputInfo.type === OutputType.UNKNOWN) {
        newUtxo.address_hex = 'unknown';
      } else {
        newUtxo.address_hex = 'unknown';
      }
      newUtxo.satoshis = output.satoshis;
      if (newUtxo.satoshis > 0) {
        txOutEntityList.push(newUtxo);
      } else {
        tx_out_0_satoshi += 1;
      }
    }
    transactionEntity.tx_out_0_satoshi = tx_out_0_satoshi;
    return {
      transactionEntity,
      txInEntityList,
      txOutEntityList,
      txOutNftEntityList,
      txOutFtEntityList,
      blockHash,
      txCount,
      isLast,
      clearBlockDataCache,
      tx,
    };
  }

  async txBlockProcess(txItem: {
    blockHash: any;
    txCount: any;
    isLast: any;
    txid: any;
    txHex: any;
    clearBlockDataCache: any;
  }) {
    const { blockHash, txCount, isLast, txid, txHex, clearBlockDataCache } =
      txItem;
    return await this.oneBlockTxProcessor(
      blockHash,
      txCount,
      isLast,
      txid,
      txHex,
      clearBlockDataCache,
    );
  }

  async blockEndDo(
    isLast: any,
    txCount: any,
    blockHash: any,
    clearBlockDataCache: (arg0: any) => void,
  ) {
    if (isLast) {
      await this.blockEntityRepository.update(
        {
          hash: blockHash,
        },
        {
          process_count: txCount,
          processStatus: BlockProcessStatus.completed,
        },
      );
      this.logger.debug(`block ${blockHash} done`);
      clearBlockDataCache(blockHash);
    }
  }

  async transactionInOutCount(_hasTxIdList: string[]) {
    const txCountStatus = {};
    _hasTxIdList.map((value) => {
      txCountStatus[value] = {
        tx_in_num: 0,
        tx_out_num: 0,
      };
    });
    await PromisePool.withConcurrency(2)
      .for(arrayToChunks(_hasTxIdList, 100))
      .process(async (_hasTxIdListChunk) => {
        const p1 = this.txOutEntityRepository
          .createQueryBuilder('txOut')
          .where(' txid in (:..._hasTxIdList) and is_deleted = false', {
            _hasTxIdList: _hasTxIdListChunk,
          })
          .select([])
          .addSelect('txid')
          .addSelect('COUNT(*)', 'tx_out_num')
          .groupBy('txid')
          .getRawMany();
        const p2 = this.txInEntityRepository
          .createQueryBuilder('txIn')
          .where(' txid in (:..._hasTxIdList) and is_deleted = false', {
            _hasTxIdList: _hasTxIdListChunk,
          })
          .select([])
          .addSelect('txid')
          .addSelect('COUNT(*)', 'tx_in_num')
          .groupBy('txid')
          .getRawMany();
        const [txOutCountResp, txInCountResp] = await Promise.all([p1, p2]);
        txOutCountResp.map((value) => {
          txCountStatus[value.txid].tx_out_num = Number(value.tx_out_num);
        });
        txInCountResp.map((value) => {
          txCountStatus[value.txid].tx_in_num = Number(value.tx_in_num);
        });
      });
    return txCountStatus;
  }

  async checkMemPool() {
    // any time can run
    const step = 200;
    let cursorId = 0;
    const noCompletedTxidMap = {};
    const completedTxidMap = {};
    while (true) {
      // logic body
      const records = await this.transactionEntityRepository.find({
        where: {
          block_hash: IsNull(),
          is_deleted: false,
          is_completed_check: false,
          cursor_id: MoreThan(cursorId),
        },
        take: step,
        order: {
          cursor_id: 'asc',
        },
      });
      if (records.length > 0) {
        const recordsTxid = records.map((record) => {
          return record.txid;
        });
        const txInCountResp = await this.txInEntityRepository
          .createQueryBuilder('txIn')
          .where(' txid in (:..._hasTxIdList) and is_deleted = false', {
            _hasTxIdList: recordsTxid,
          })
          .select([])
          .addSelect('txid')
          .addSelect('COUNT(*)', 'tx_in_num')
          .groupBy('txid')
          .getRawMany();
        const txOutCountResp = await this.txOutEntityRepository
          .createQueryBuilder('txOut')
          .where(' txid in (:..._hasTxIdList) and is_deleted = false', {
            _hasTxIdList: recordsTxid,
          })
          .select([])
          .addSelect('txid')
          .addSelect('COUNT(*)', 'tx_out_num')
          .groupBy('txid')
          .getRawMany();
        const txInCountStatus = {};
        const txOutCountStatus = {};
        txInCountResp.map((value) => {
          txInCountStatus[value.txid] = Number(value.tx_in_num);
        });
        txOutCountResp.map((value) => {
          txOutCountStatus[value.txid] = Number(value.tx_out_num);
        });
        for (const record of records) {
          // check tx in
          const txInCount = txInCountStatus[record.txid] || 0;
          if (record.tx_in_num - record.tx_in_coinbase != txInCount) {
            noCompletedTxidMap[record.txid] = true;
            this.logger.debug(
              `noCompletedTxid txIn ${record.txid} ${record.tx_in_num} - ${record.tx_in_coinbase} = ${txInCount}`,
            );
          }
          // check tx out
          const txOutCount = txOutCountStatus[record.txid] || 0;
          if (record.tx_out_num - record.tx_out_0_satoshi != txOutCount) {
            noCompletedTxidMap[record.txid] = true;
            this.logger.debug(
              `noCompletedTxid txOut ${record.txid} ${record.tx_out_num} - ${record.tx_out_0_satoshi} = ${txOutCount}`,
            );
          }
          // is completed
          if (!noCompletedTxidMap[record.txid]) {
            completedTxidMap[record.txid] = true;
          }
        }
        cursorId = records[records.length - 1].cursor_id;
      } else {
        break;
      }
    }
    const noCompletedTxidList = Object.keys(noCompletedTxidMap);
    if (noCompletedTxidList.length > 0) {
      this.logger.debug(`noCompletedTxidList: ${noCompletedTxidList}`);
      await Promise.all([
        this.transactionEntityRepository.update(
          {
            txid: In(noCompletedTxidList.sort()),
          },
          { is_deleted: true },
        ),
        this.txOutEntityRepository.update(
          {
            txid: In(noCompletedTxidList.sort()),
          },
          { is_deleted: true },
        ),
        this.txInEntityRepository.update(
          {
            txid: In(noCompletedTxidList.sort()),
          },
          { is_deleted: true },
        ),
      ]);
    }
    const completedTxidList = Object.keys(completedTxidMap);
    if (completedTxidList.length > 0) {
      this.logger.debug(
        `completedTxidList: ${completedTxidList[0]} ${completedTxidList.length}`,
      );
      await Promise.all([
        this.transactionEntityRepository.update(
          {
            txid: In(completedTxidList.sort()),
          },
          { is_completed_check: true },
        ),
      ]);
    }
  }

  async checkTxTimeout() {
    const now = new Date();
    const timeOutMs = 14 * 24 * 60 * 60 * 1000;
    const timeout = new Date(now.getTime() - timeOutMs);
    // any time can run
    const step = 200;
    let cursorId = 0;
    const timeOutTxidList = [];
    while (true) {
      // logic body
      const records = await this.transactionEntityRepository.find({
        where: {
          block_hash: IsNull(),
          is_deleted: false,
          cursor_id: MoreThan(cursorId),
          created_at: LessThan(timeout),
        },
        take: step,
        order: {
          cursor_id: 'asc',
        },
      });
      if (records.length > 0) {
        for (const record of records) {
          timeOutTxidList.push(record.txid);
          this.logger.debug(`${record.txid} ${record.created_at}`);
        }
        cursorId = records[records.length - 1].cursor_id;
      } else {
        break;
      }
    }
    if (timeOutTxidList.length > 0) {
      this.logger.debug(`timeOutTxidList: ${timeout} ${timeOutTxidList}`);
      await Promise.all([
        this.transactionEntityRepository.update(
          {
            txid: In(timeOutTxidList.sort()),
          },
          { is_deleted: true },
        ),
        this.txOutEntityRepository.update(
          {
            txid: In(timeOutTxidList.sort()),
          },
          { is_deleted: true },
        ),
        this.txInEntityRepository.update(
          {
            txid: In(timeOutTxidList.sort()),
          },
          { is_deleted: true },
        ),
      ]);
    }
  }

  async syncMemPool() {
    const mempool = await this.rpcService.getRawMempool();
    const txidList = mempool.data.result;
    const dbCountStatusMap = await this.transactionInOutCount(txidList);
    const existsMap = {};

    txidList.map(
      (value: {
        TransactionEntity_txid: string | number;
        TransactionEntity_tx_in_num: number;
        TransactionEntity_tx_in_coinbase: number;
        TransactionEntity_tx_out_num: number;
        TransactionEntity_tx_out_0_satoshi: number;
      }) => {
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
            dbCountStatus.tx_out_num == value_tx_out_num
          ) {
            existsMap[value.TransactionEntity_txid] = true;
          }
        }
      },
    );

    const doTxidList = [];
    for (const txid of txidList) {
      if (!existsMap[txid]) {
        doTxidList.push(txid);
      }
    }
    await PromisePool.withConcurrency(5)
      .for(doTxidList)
      .process(async (txid) => {
        return await this.hashTxFromZmqSync(txid);
      });
  }

  async txBlockProcessDaemon() {
    while (true) {
      try {
        // save list
        let transactionEntityList = [];
        let txInEntityList = [];
        let txOutEntityList = [];
        let txOutNftEntityList = [];
        let txOutFtEntityList = [];
        // field list
        let txidList = [];
        let txList = [];
        let blockHashList = [];
        let txCountList = [];
        let isLastList = [];
        let clearBlockDataCacheList = [];
        let lastTxItem = { txHex: null };
        let beforeItemList = [];
        while (true) {
          if (this.txBlockQueue.length > 0) {
            const txItem = this.txBlockQueue.shift();
            beforeItemList.push(txItem);
            lastTxItem = txItem;
            const saveInfo = await this.txBlockProcess(txItem);
            if (saveInfo) {
              transactionEntityList.push(saveInfo.transactionEntity);
              txInEntityList.push(...saveInfo.txInEntityList);
              txOutEntityList.push(...saveInfo.txOutEntityList);
              txOutNftEntityList.push(...saveInfo.txOutNftEntityList);
              txOutFtEntityList.push(...saveInfo.txOutFtEntityList);
              //
              txidList.push(saveInfo.transactionEntity.txid);
              blockHashList.push(saveInfo.blockHash);
              txCountList.push(saveInfo.txCount);
              isLastList.push(saveInfo.isLast);
              clearBlockDataCacheList.push(saveInfo.clearBlockDataCache);
              txList.push(saveInfo.tx);
            }
            if (txInEntityList.length > 1000) {
              const concurrency = 5;
              const bulkNumber = 1000;
              const p1 = PromisePool.withConcurrency(concurrency)
                .for(arrayToChunks(transactionEntityList, bulkNumber))
                .process(async (chunk) => {
                  await this.transactionEntityRepository.upsert(
                    sortedObjectArrayByKey(chunk, 'txid'),
                    ['txid'],
                  );
                });
              const p2 = PromisePool.withConcurrency(concurrency)
                .for(arrayToChunks(txInEntityList, bulkNumber))
                .process(async (chunk) => {
                  await this.txInEntityRepository.upsert(
                    sortedObjectArrayByKey(chunk, 'outpoint'),
                    ['outpoint'],
                  );
                });
              const p3 = PromisePool.withConcurrency(concurrency)
                .for(arrayToChunks(txOutEntityList, bulkNumber))
                .process(async (chunk) => {
                  await this.txOutEntityRepository.upsert(
                    sortedObjectArrayByKey(chunk, 'outpoint'),
                    ['outpoint'],
                  );
                });
              const p4 = PromisePool.withConcurrency(concurrency)
                .for(arrayToChunks(txOutNftEntityList, bulkNumber))
                .process(async (chunk) => {
                  await this.txOutNftEntityRepository.upsert(
                    sortedObjectArrayByKey(chunk, 'outpoint'),
                    ['outpoint'],
                  );
                });
              const p5 = PromisePool.withConcurrency(concurrency)
                .for(arrayToChunks(txOutFtEntityList, bulkNumber))
                .process(async (chunk) => {
                  await this.txOutFtEntityRepository.upsert(
                    sortedObjectArrayByKey(chunk, 'outpoint'),
                    ['outpoint'],
                  );
                });
              const pResultList = await Promise.all([p1, p2, p3, p4, p5]);
              let errorsLength = 0;
              for (const pResult of pResultList) {
                errorsLength += pResult.errors.length;
                if (pResult.errors.length > 0) {
                  console.log(pResult.errors[0]);
                }
              }
              // end bulk do
              if (errorsLength === 0) {
                for (let j = 0; j < isLastList.length; j++) {
                  const txid = txidList[j];
                  const transactionEntity = transactionEntityList[j];
                  const isLast = isLastList[j];
                  const txCount = txCountList[j];
                  const blockHash = blockHashList[j];
                  const clearBlockDataCache = clearBlockDataCacheList[j];
                  const tx = txList[j];
                  await this.blockEndDo(
                    isLast,
                    txCount,
                    blockHash,
                    clearBlockDataCache,
                  );
                  for (const callBack of this.callBackQueueAfterTxProcess) {
                    callBack(txid, tx, lastTxItem.txHex, transactionEntity);
                  }
                }
              } else {
                this.logger.debug(`errorsLength ${errorsLength}`);
                this.txBlockQueue.push(...beforeItemList);
              }
              // save list
              transactionEntityList = [];
              txInEntityList = [];
              txOutEntityList = [];
              txOutNftEntityList = [];
              txOutFtEntityList = [];
              // field list
              txidList = [];
              txList = [];
              blockHashList = [];
              txCountList = [];
              isLastList = [];
              clearBlockDataCacheList = [];
            }
          } else {
            if (txidList.length > 0) {
              const concurrency = 5;
              const bulkNumber = 300;
              const p1 = PromisePool.withConcurrency(concurrency)
                .for(arrayToChunks(transactionEntityList, bulkNumber))
                .process(async (chunk) => {
                  await this.transactionEntityRepository.upsert(
                    sortedObjectArrayByKey(chunk, 'txid'),
                    ['txid'],
                  );
                });
              const p2 = PromisePool.withConcurrency(concurrency)
                .for(arrayToChunks(txInEntityList, bulkNumber))
                .process(async (chunk) => {
                  await this.txInEntityRepository.upsert(
                    sortedObjectArrayByKey(chunk, 'outpoint'),
                    ['outpoint'],
                  );
                });
              const p3 = PromisePool.withConcurrency(concurrency)
                .for(arrayToChunks(txOutEntityList, bulkNumber))
                .process(async (chunk) => {
                  await this.txOutEntityRepository.upsert(
                    sortedObjectArrayByKey(chunk, 'outpoint'),
                    ['outpoint'],
                  );
                });
              const p4 = PromisePool.withConcurrency(concurrency)
                .for(arrayToChunks(txOutNftEntityList, bulkNumber))
                .process(async (chunk) => {
                  await this.txOutNftEntityRepository.upsert(
                    sortedObjectArrayByKey(chunk, 'outpoint'),
                    ['outpoint'],
                  );
                });
              const p5 = PromisePool.withConcurrency(concurrency)
                .for(arrayToChunks(txOutFtEntityList, bulkNumber))
                .process(async (chunk) => {
                  await this.txOutFtEntityRepository.upsert(
                    sortedObjectArrayByKey(chunk, 'outpoint'),
                    ['outpoint'],
                  );
                });
              const pResultList = await Promise.all([p1, p2, p3, p4, p5]);
              let errorsLength = 0;
              for (const pResult of pResultList) {
                errorsLength += pResult.errors.length;
                if (pResult.errors.length > 0) {
                  console.log(pResult.errors[0]);
                }
              }
              // end bulk do
              if (errorsLength === 0) {
                for (let j = 0; j < isLastList.length; j++) {
                  const txid = txidList[j];
                  const transactionEntity = transactionEntityList[j];
                  const isLast = isLastList[j];
                  const txCount = txCountList[j];
                  const blockHash = blockHashList[j];
                  const clearBlockDataCache = clearBlockDataCacheList[j];
                  const tx = txList[j];
                  await this.blockEndDo(
                    isLast,
                    txCount,
                    blockHash,
                    clearBlockDataCache,
                  );
                  for (const callBack of this.callBackQueueAfterTxProcess) {
                    callBack(txid, tx, lastTxItem.txHex, transactionEntity);
                  }
                }
              } else {
                this.logger.debug(`errorsLength ${errorsLength}`);
                this.txBlockQueue.push(...beforeItemList);
              }

              // save list
              transactionEntityList = [];
              txInEntityList = [];
              txOutEntityList = [];
              txOutNftEntityList = [];
              txOutFtEntityList = [];
              // field list
              txidList = [];
              txList = [];
              blockHashList = [];
              txCountList = [];
              isLastList = [];
              clearBlockDataCacheList = [];
              beforeItemList = [];
            }
            await sleep(500);
          }
        }
      } catch (e) {
        console.log('txBlockProcessDaemon', e);
      }
      await sleep(this.txProcessMS);
    }
  }

  async txMempoolProcessDaemon() {
    while (true) {
      try {
        const parallel = 1;
        const pList = [];
        for (let i = 0; i < parallel; i++) {
          pList.push(this.txMempoolProcess());
        }
        await Promise.all(pList);
      } catch (e) {
        console.log('txMempoolProcessDaemon', e);
      }
      await sleep(this.txProcessMS);
    }
  }

  async syncMemPoolDaemon() {
    while (true) {
      // 30s sync once sync mempool
      try {
        await this.syncMemPool();
      } catch (e) {
        console.log('syncMemPoolDaemon', e);
      }
      await sleep(20 * 60 * 1000);
    }
  }

  async checkMemPoolDaemon() {
    while (true) {
      try {
        await this.checkMemPool();
      } catch (e) {
        console.log('checkMemPoolDaemon', e);
      }
      await sleep(5 * 1000);
    }
  }

  async checkTxTimeoutDaemon() {
    while (true) {
      try {
        await this.checkTxTimeout();
      } catch (e) {
        console.log('checkTxTimeoutDaemon', e);
      }
      await sleep(10 * 1000);
    }
  }

  async useTxo(lastCursorId: number) {
    const beforeQ = new Date();
    const bulkNumber = 10000;
    const lastCursorIdEntity = await this.txInEntityRepository.findOne({
      where: {
        is_processed: false,
        cursor_id: MoreThanOrEqual(lastCursorId),
      },
      order: {
        cursor_id: 'asc',
      },
    });
    const afterQ = new Date();
    let cursorId = lastCursorId;
    if (lastCursorIdEntity) {
      cursorId = lastCursorIdEntity.cursor_id;
    }
    const beforeU = new Date();
    const updateResult: { changedRows: number; info: string } =
      await this.txInEntityRepository.query(
        `
      UPDATE 
        tx_in JOIN tx_out ON (tx_in.outpoint = tx_out.outpoint)
      SET 
        tx_in.is_processed = TRUE, tx_out.is_used = TRUE
      WHERE
        tx_in.cursor_id >= ? AND tx_in.cursor_id  < ? AND tx_in.is_processed = FALSE;
    `,
        [cursorId, cursorId + bulkNumber],
      );
    const afterU = new Date();
    if (updateResult.changedRows > 0) {
      this.logger.debug(
        `timeQuery: ${afterQ.getTime() - beforeQ.getTime()}, timeUpdate: ${
          afterU.getTime() - beforeU.getTime()
        }, info: ${
          updateResult.info
        }, cursorId: ${cursorId}, lastCursorId: ${lastCursorId}`,
      );
    }
    return cursorId;
  }

  async doubleCheckTxo() {
    {
      const beforeU = new Date();
      const txOutCheck: { changedRows: number; info: string } =
        await this.txOutEntityRepository.query(
          `
      UPDATE 
        tx_out JOIN tx_in ON (tx_in.outpoint = tx_out.outpoint)
      SET 
        tx_out.is_used = TRUE
      WHERE
          tx_in.is_processed = TRUE
          AND tx_out.is_used = FALSE;
    `,
        );
      const afterU = new Date();
      if (txOutCheck.changedRows > 0) {
        this.logger.debug(
          `txOutCheck: timeUpdate: ${
            afterU.getTime() - beforeU.getTime()
          } info: ${txOutCheck.info}`,
        );
      }
    }
    {
      const beforeU = new Date();
      const txInCheck: { changedRows: number; info: string } =
        await this.txInEntityRepository.query(
          `
      UPDATE 
        tx_in JOIN tx_out ON (tx_in.outpoint = tx_out.outpoint)
      SET 
        tx_in.is_processed = TRUE
      WHERE
          tx_in.is_processed = FALSE
          AND tx_out.is_used = TRUE;
    `,
        );
      const afterU = new Date();
      if (txInCheck.changedRows > 0) {
        this.logger.debug(
          `txOutCheck: timeUpdate: ${
            afterU.getTime() - beforeU.getTime()
          } info: ${txInCheck.info}`,
        );
      }
    }
  }

  async useTxoDaemon() {
    let lastCursorId = 1;
    while (true) {
      try {
        lastCursorId = await this.useTxo(lastCursorId);
      } catch (e) {
        console.log('useTxoDaemon', e);
      }
      await sleep(1000);
    }
  }

  async doubleCheckTxoDaemon() {
    while (true) {
      try {
        await this.doubleCheckTxo();
      } catch (e) {
        console.log('doubleCheckTxoDaemon', e);
      }
      await sleep(20000);
    }
  }
}

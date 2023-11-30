import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TransactionEntity } from '../../entities/transaction.entity';
import { Repository } from 'typeorm';
import { TxInEntity } from '../../entities/txIn.entity';
import { TxoCheckStatus, TxOutEntity } from '../../entities/txOut.entity';
import { TxOutNftEntity } from '../../entities/txOutNftEntity';
import { TxOutFtEntity } from '../../entities/txOutFtEntity';
import { OutputType } from 'meta-contract';
import { sleep } from '../../lib/utils';
import { PromisePool } from '@supercharge/promise-pool';
import { parseSensibleId } from 'meta-contract/dist/helpers/transactionHelpers';
import { RpcService } from '../rpc/rpc.service';

@Injectable()
export class CheckTokenService {
  private readonly logger = new Logger(CheckTokenService.name);
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
    private readonly rpcService: RpcService,
  ) {
    this.checkFtDaemon().then();
  }

  verifyFtToken(
    txOut: TxOutFtEntity,
    usedTxo: TxOutFtEntity[],
    tokenHash: string,
    tokenCodeHash: string,
    genesisHash: string,
    genesisCodeHash: string,
    genesisTxId: string,
    sensibleId: string,
  ) {
    if (usedTxo && usedTxo.length > 0) {
      for (const txo of usedTxo) {
        if (
          (txo.genesis == txOut.genesis &&
            txo.codeHash == txOut.codeHash &&
            txo.sensibleId == txOut.sensibleId) ||
          (txo.genesis == tokenHash &&
            txo.codeHash == tokenCodeHash &&
            txo.sensibleId === sensibleId) ||
          (txo.genesis == genesisHash &&
            txo.codeHash == genesisCodeHash &&
            txo.sensibleId === sensibleId) ||
          txo.txid == genesisTxId
        ) {
          return true;
        }
      }
    }
    return false;
  }

  async checkFt(limit: number) {
    const txOuts = await this.txOutEntityRepository.find({
      where: {
        script_type: OutputType.SENSIBLE_FT,
        check_token: TxoCheckStatus.uncheck,
      },
      take: limit,
    });
    if (txOuts.length === 0) {
      // return txOuts.length;
      return {
        txOuts: txOuts.length,
        saveTxOuts: 0,
      };
    }
    const txOutPoints = [];
    const txidMap = {};
    for (const txOut of txOuts) {
      txOutPoints.push(txOut.outpoint);
      txidMap[txOut.txid] = true;
    }
    const txidList = Object.keys(txidMap).sort();
    const txInUseOutpointMap = {};
    const txInUseOutpointList = [];
    await PromisePool.withConcurrency(10)
      .for(txidList)
      .process(async (txid) => {
        const txInList = await this.txInEntityRepository.find({
          where: {
            txid: txid,
          },
        });
        txInList.map((value) => {
          txInUseOutpointMap[value.outpoint] = value.txid;
          txInUseOutpointList.push(value.outpoint);
        });
      });
    const usedTxOutFtList = [];
    await PromisePool.withConcurrency(10)
      .for(txInUseOutpointList)
      .process(async (outpoint) => {
        const txOutFt = await this.txOutFtEntityRepository.findOne({
          where: {
            outpoint: outpoint,
          },
        });
        if (txOutFt) {
          usedTxOutFtList.push(txOutFt);
        }
      });
    const usedTxOutFtMap = {};
    usedTxOutFtList.map((value) => {
      if (usedTxOutFtMap[txInUseOutpointMap[value.outpoint]]) {
        usedTxOutFtMap[txInUseOutpointMap[value.outpoint]].push(value);
      } else {
        usedTxOutFtMap[txInUseOutpointMap[value.outpoint]] = [value];
      }
    });
    const saveTxOuts = [];
    await PromisePool.withConcurrency(10)
      .for(txOuts)
      .process(async (txOut) => {
        const txOutFt = await this.txOutFtEntityRepository.findOne({
          where: {
            outpoint: txOut.outpoint,
          },
        });
        const { genesisTxId, genesisOutputIndex } = parseSensibleId(
          txOutFt.sensibleId,
        );
        const genesisOutpoint = `${genesisTxId}_${genesisOutputIndex}`;
        const txOutGenesis = await this.txOutFtEntityRepository.findOne({
          where: {
            outpoint: genesisOutpoint,
          },
        });
        const useGenesis = await this.txInEntityRepository.findOne({
          where: {
            outpoint: genesisOutpoint,
          },
        });
        let tokenHash: string;
        let tokenCodeHash: string;
        let genesisHash: string;
        let genesisCodeHash: string;
        let sensibleId: string;
        if (useGenesis) {
          const useGenesisTxOutList = await this.txOutFtEntityRepository.find({
            where: {
              txid: useGenesis.txid,
            },
          });
          for (const txOutFtEntity of useGenesisTxOutList) {
            // token
            if (txOutFtEntity.codeHash === txOutFt.codeHash) {
              tokenHash = txOutFtEntity.genesis;
              tokenCodeHash = txOutFtEntity.codeHash;
              sensibleId = txOutFtEntity.sensibleId;
            }
            // new genesis
            if (txOutFtEntity.value === '0') {
              genesisHash = txOutFtEntity.genesis;
              genesisCodeHash = txOutFtEntity.codeHash;
              sensibleId = txOutFtEntity.sensibleId;
            }
          }
        }
        if (
          usedTxOutFtMap[txOut.txid] &&
          usedTxOutFtMap[txOut.txid].length > 0 &&
          txOutFt &&
          txOutGenesis &&
          tokenHash &&
          tokenCodeHash
        ) {
          const isVerify = this.verifyFtToken(
            txOutFt,
            usedTxOutFtMap[txOut.txid],
            tokenHash,
            tokenCodeHash,
            genesisHash,
            genesisCodeHash,
            genesisTxId,
            sensibleId,
          );
          if (isVerify) {
            txOut.check_token = TxoCheckStatus.passed;
            saveTxOuts.push(txOut);
          } else {
            txOut.check_token = TxoCheckStatus.failed;
            saveTxOuts.push(txOut);
          }
        }
        if (
          txOutFt.sensibleId ===
          '000000000000000000000000000000000000000000000000000000000000000000000000'
        ) {
          txOut.check_token = TxoCheckStatus.passed;
          saveTxOuts.push(txOut);
        }
      });
    await this.txOutEntityRepository.save(saveTxOuts);
    this.logger.debug(`pass check ${txOuts.length} ${saveTxOuts.length}`);
    return {
      txOuts: txOuts.length,
      saveTxOuts: saveTxOuts.length,
    };
  }

  async checkFtDaemon() {
    const limit = 100;
    while (true) {
      try {
        const { txOuts, saveTxOuts } = await this.checkFt(limit);
        if (txOuts < limit) {
          await sleep(3000);
        }
        if (txOuts === limit && saveTxOuts == 0) {
          await sleep(3000);
        }
      } catch (e) {
        console.log('checkFtDaemon e', e);
      }
    }
  }
}

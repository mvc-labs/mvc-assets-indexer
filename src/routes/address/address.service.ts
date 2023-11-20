import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TransactionEntity } from '../../entities/transaction.entity';
import { Repository } from 'typeorm';
import * as mvc from 'mvc-lib';
import { TxOutEntity } from '../../entities/txOut.entity';

@Injectable()
export class AddressService {
  constructor(
    @InjectRepository(TransactionEntity)
    private transactionEntityRepository: Repository<TransactionEntity>,
    @InjectRepository(TxOutEntity)
    private txOutEntityRepository: Repository<TxOutEntity>,
  ) {}

  async balance(address: string) {
    const addressHex = mvc.Address(address).hashBuffer.toString('hex');
    const p1 = this.transactionEntityRepository.query(
      `
      SELECT 
          sum(tx_out.satoshis) as balance, count(*) as ct
      FROM 
          tx_out 
          LEFT JOIN tx_in ON tx_out.outpoint = tx_in.outpoint
          JOIN tx on tx.txid = tx_out.txid
      WHERE
          tx_out.address_hex = ?
          AND tx_in.outpoint is NULL
          AND tx_out.is_deleted = false
          AND tx.block_hash IS NOT NULL
          AND tx_out.script_type = 2
    `,
      [addressHex],
    );
    const p2 = this.transactionEntityRepository.query(
      `
      SELECT 
          sum(tx_out.satoshis) as balance, count(*) as ct
      FROM 
          tx_out
          LEFT JOIN tx_in ON tx_out.outpoint = tx_in.outpoint
          JOIN tx on tx.txid = tx_out.txid
      WHERE
          tx_out.address_hex = ?
          AND tx_in.outpoint is NULL
          AND tx_out.is_deleted = false 
          AND tx.block_hash IS NULL
          AND tx_out.script_type = 2
    `,
      [addressHex],
    );
    const [resp1, resp2] = await Promise.all([p1, p2]);
    let satoshi = 0;
    let pendingSatoshi = 0;
    let utxoCount = 0;
    if (resp1.length > 0) {
      satoshi += Number(resp1[0].balance || 0);
      utxoCount += Number(resp1[0].ct || 0);
    }
    if (resp2.length > 0) {
      pendingSatoshi += Number(resp2[0].balance) || 0;
      utxoCount += Number(resp2[0].ct || 0);
    }
    return {
      address: address,
      confirmed: satoshi,
      unconfirmed: pendingSatoshi,
      utxoCount: utxoCount,
    };
  }

  async utxo(address: string, flag: string) {
    const addressHex = mvc.Address(address).hashBuffer.toString('hex');
    let cursorId = 0;
    if (flag) {
      const flagRecord = await this.txOutEntityRepository.findOne({
        where: {
          outpoint: flag,
          is_deleted: false,
        },
      });
      if (flagRecord) {
        cursorId = flagRecord.cursor_id;
      }
    }
    const records = await this.transactionEntityRepository.query(
      `
            SELECT
                tx_out.outpoint as flag,
                tx_out.txid as txid,
                tx_out.outputIndex as outIndex,
                tx_out.satoshis as value,
                block.height as height
            FROM
                tx_out
                LEFT JOIN tx_in ON tx_out.outpoint = tx_in.outpoint
                JOIN tx ON tx_out.txid = tx.txid
                LEFT JOIN block ON tx.block_hash = block.hash
            WHERE
                tx_out.address_hex = ?
                AND tx_in.outpoint is NULL
                AND tx_out.is_deleted = false  
                AND tx_out.script_type = 2 
                AND tx_out.cursor_id > ?
                LIMIT 100;
        `,
      [addressHex, cursorId],
    );
    for (const record of records) {
      record['address'] = address;
    }
    return records;
  }
}

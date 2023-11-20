import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TransactionEntity } from '../../entities/transaction.entity';
import { Repository } from 'typeorm';
import * as mvc from 'mvc-lib';
import { mergeFtBalance } from '../../lib/utils';
import { TxOutEntity } from '../../entities/txOut.entity';

@Injectable()
export class ContractService {
  constructor(
    @InjectRepository(TransactionEntity)
    private transactionEntityRepository: Repository<TransactionEntity>,
    @InjectRepository(TxOutEntity)
    private txOutEntityRepository: Repository<TxOutEntity>,
  ) {}

  async ftAddressBalance(address: string, codeHash: string, genesis: string) {
    const addressHex = mvc.Address(address).hashBuffer.toString('hex');
    let sql: string;
    if (codeHash && genesis) {
      sql = `
SELECT
    tx_out_ft.codeHash,
    tx_out_ft.genesis,
    tx_out_ft.name,
    tx_out_ft.symbol,
    tx_out_ft.decimal,
    tx_out_ft.sensibleId,
    CASE
        WHEN tx.block_hash is NULL THEN 'unconfirmed'
        ELSE
            'confirmed'
    END AS is_confirm,
    COUNT(*) as utxoCount,
    CONCAT(SUM(tx_out_ft.value), '') AS balance
FROM
    tx_out
    LEFT JOIN tx_in ON tx_out.outpoint = tx_in.outpoint
    JOIN tx_out_ft ON tx_out.outpoint = tx_out_ft.outpoint
    JOIN tx on tx.txid = tx_out.txid
WHERE
    address_hex = ?
    AND tx_in.outpoint is NULL
    AND tx_out_ft.codeHash = ?
    AND tx_out_ft.genesis = ?
    AND tx_out.check_token = 1
GROUP BY
    tx_out_ft.codeHash,
    tx_out_ft.genesis,
    tx_out_ft.name,
    tx_out_ft.symbol,
    tx_out_ft.decimal,
    tx_out_ft.sensibleId,
    CASE
        WHEN tx.block_hash is NULL THEN 'unconfirmed'
        ELSE
            'confirmed'
    END;
`;
    } else {
      sql = `
SELECT
    tx_out_ft.codeHash,
    tx_out_ft.genesis,
    tx_out_ft.name,
    tx_out_ft.symbol,
    tx_out_ft.decimal,
    tx_out_ft.sensibleId,
    CASE
        WHEN tx.block_hash is NULL THEN 'unconfirmed'
        ELSE
            'confirmed'
    END AS is_confirm,
    COUNT(*) as utxoCount,
    CONCAT(SUM(tx_out_ft.value), '') AS balance
FROM
    tx_out
    LEFT JOIN tx_in ON tx_out.outpoint = tx_in.outpoint
    JOIN tx_out_ft ON tx_out.outpoint = tx_out_ft.outpoint
    JOIN tx on tx.txid = tx_out.txid
WHERE
    address_hex = ?
    AND tx_in.outpoint is NULL
    AND tx_out.check_token = 1
GROUP BY
    tx_out_ft.codeHash,
    tx_out_ft.genesis,
    tx_out_ft.name,
    tx_out_ft.symbol,
    tx_out_ft.decimal,
    tx_out_ft.sensibleId,
    CASE
        WHEN tx.block_hash is NULL THEN 'unconfirmed'
        ELSE
            'confirmed'
    END;
`;
    }
    const balanceList = await this.transactionEntityRepository.query(sql, [
      addressHex,
      codeHash,
      genesis,
    ]);
    for (const balanceListElement of balanceList) {
      balanceListElement['address'] = address;
    }
    return mergeFtBalance(balanceList);
  }

  async ftAddressUtxo(
    address: string,
    codeHash: string,
    genesis: string,
    flag: string,
  ) {
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
    let sql: string;
    if (codeHash && genesis) {
      sql = `SELECT
    tx_out_ft.codeHash,
    tx_out_ft.genesis,
    tx_out_ft.name,
    tx_out_ft.symbol,
    tx_out_ft.sensibleId,
    tx_out_ft.decimal,
    tx_out.txid,
    tx_out.outputIndex as txIndex,
    tx_out_ft.value as valueString,
    tx_out.satoshis as satoshiString,
    block.height as height,
    tx_out.outpoint as flag
FROM
    tx_out
    LEFT JOIN tx_in ON tx_out.outpoint = tx_in.outpoint
    JOIN tx_out_ft ON tx_out.outpoint = tx_out_ft.outpoint
    JOIN tx on tx.txid = tx_out.txid
    LEFT JOIN block on tx.block_hash = block.hash
WHERE
    address_hex = ?
    AND tx_in.outpoint is NULL
    AND tx_out.cursor_id > ?
    AND tx_out.check_token = 1
    AND tx_out_ft.codeHash = ?
    AND tx_out_ft.genesis = ?
    LIMIT 100;`;
    } else {
      sql = `SELECT
    tx_out_ft.codeHash,
    tx_out_ft.genesis,
    tx_out_ft.name,
    tx_out_ft.symbol,
    tx_out_ft.sensibleId,
    tx_out_ft.decimal,
    tx_out.txid,
    tx_out.outputIndex as txIndex,
    tx_out_ft.value as valueString,
    tx_out.satoshis as satoshiString,
    block.height as height,
    tx_out.outpoint as flag
FROM
    tx_out
    LEFT JOIN tx_in ON tx_out.outpoint = tx_in.outpoint
    JOIN tx_out_ft ON tx_out.outpoint = tx_out_ft.outpoint
    JOIN tx ON tx.txid = tx_out.txid
    LEFT JOIN block on tx.block_hash = block.hash
WHERE
    address_hex = ?
    AND tx_in.outpoint is NULL
    AND tx_out.cursor_id > ?
    AND tx_out.check_token = 1
    LIMIT 100;`;
    }
    const utxoList = await this.transactionEntityRepository.query(sql, [
      addressHex,
      cursorId,
      codeHash,
      genesis,
    ]);
    for (const utxoListElement of utxoList) {
      utxoListElement['value'] = Number(utxoListElement.valueString);
      utxoListElement['satoshi'] = Number(utxoListElement.satoshiString);
      utxoListElement['address'] = address;
    }
    return utxoList;
  }
}

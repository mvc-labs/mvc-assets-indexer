import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('tx_out_nft')
export class TxOutNftEntity {
  @PrimaryColumn({ length: 80, unique: true })
  outpoint: string;

  @Column({ length: 64 })
  @Index()
  txid: string;

  @Column({ length: 40 })
  @Index()
  codeHash: string;

  @Column({ length: 40 })
  @Index()
  genesis: string;

  @Column({ length: 72 })
  sensibleId: string;

  @Column({ length: 64 })
  metaTxid: string;

  @Column()
  metaOutputIndex: number;

  @Column({ length: 80 })
  tokenSupply: string;

  @Column({ length: 80 })
  tokenIndex: string;
}

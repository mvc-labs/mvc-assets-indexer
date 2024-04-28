import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('tx_out_ft')
export class TxOutFtEntity {
  @PrimaryColumn({ length: 80, unique: true })
  outpoint: string;

  @Column({ length: 64 })
  @Index()
  txid: string;

  @Column({ length: 40 })
  codeHash: string;

  @Column({ length: 40 })
  @Index()
  genesis: string;

  @Column({ length: 40 })
  name: string;

  @Column({ length: 20 })
  symbol: string;

  @Column({ length: 72 })
  sensibleId: string;

  @Column()
  decimal: number;

  @Column({ length: 80 })
  value: string;
}

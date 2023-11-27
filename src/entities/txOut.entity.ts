import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { OutputType } from 'meta-contract/dist/tx-decoder';

export enum TxoCheckStatus {
  uncheck,
  passed,
  failed,
}

@Entity('tx_out')
export class TxOutEntity {
  @PrimaryColumn({ length: 80, unique: true })
  outpoint: string;

  @Column('int', { generated: true })
  @Index()
  cursor_id: number;

  @Column()
  @Index()
  txid: string;

  @Column()
  outputIndex: number;

  @Column()
  @Index()
  script_type: OutputType;

  @Column({ default: TxoCheckStatus.uncheck })
  @Index()
  check_token: TxoCheckStatus;

  @Column({ nullable: true })
  @Index()
  address_hex: string;

  @Column({ nullable: true, type: 'bigint' })
  satoshis: number;

  @Column({ default: false })
  @Index()
  is_deleted: boolean;

  @Column({ default: false })
  @Index()
  is_used: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

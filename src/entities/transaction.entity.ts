import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('tx')
export class TransactionEntity {
  @PrimaryColumn({ length: 64 })
  txid: string;

  @Column({ nullable: true, length: 64 })
  @Index()
  block_hash: string;

  @Column({ nullable: true, default: 0 })
  tx_in_num: number;

  @Column({ nullable: true, default: 0 })
  tx_in_coinbase: number;

  @Column({ nullable: true, default: 0 })
  tx_out_num: number;

  @Column({ nullable: true, default: 0 })
  tx_out_0_satoshi: number;

  @Column({ default: false })
  is_completed_check: boolean;

  @Column('int', { generated: true })
  @Index()
  cursor_id: number;

  @Column({ default: false })
  is_deleted: boolean;

  @CreateDateColumn()
  created_at: Date;
}

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

@Entity('tx_in')
export class TxInEntity {
  @PrimaryColumn({ length: 80, unique: true })
  outpoint: string;

  @Column({ length: 64 })
  @Index()
  txid: string;

  @Column()
  inputIndex: number;

  @Column({ default: false })
  @Index()
  is_processed: boolean;

  @Column({ default: false })
  is_deleted: boolean;

  @CreateDateColumn()
  created_at: Date;
}

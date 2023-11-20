import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('tx_in')
export class TxInEntity {
  @Column({ length: 64 })
  @Index()
  txid: string;

  @Column()
  inputIndex: number;

  @PrimaryColumn({ length: 80, unique: true })
  outpoint: string;

  @Column({ default: false })
  @Index()
  is_deleted: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

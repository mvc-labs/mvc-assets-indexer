import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

export enum BlockProcessStatus {
  nostart,
  downloading,
  downloaded,
  processing,
  completed,
  doubleCheck,
}

@Entity('block')
export class BlockEntity {
  @PrimaryColumn({ unique: true, length: 64 })
  hash: string;

  @Column({ unsigned: true, default: 0 })
  size: number;

  @Column({ unsigned: true })
  @Index()
  height: number;

  @Column({ length: 8 })
  versionHex: string;

  @Column({ length: 64 })
  merkleroot: string;

  @Column({ unsigned: true })
  num_tx: number;

  @Column({ unsigned: true, default: 0 })
  process_count: number;

  @Column({ unsigned: true })
  time: number;

  @Column({ unsigned: true })
  mediantime: number;

  @Column({ unsigned: true })
  nonce: number;

  @Column({ length: 8 })
  bits: string;

  @Column({ type: 'double' })
  difficulty: number;

  @Column({ length: 64 })
  chainwork: string;

  @Column({ length: 64, nullable: true })
  @Index()
  previousblockhash: string;

  @Column({ type: 'json' })
  status: object;

  @Column('int', { generated: true })
  @Index()
  cursor_id: number;

  @Column({ default: false })
  @Index()
  is_chaintips: boolean;

  @Column({ default: false })
  is_tail: boolean;

  @Column({ default: false })
  is_reorg: boolean;

  @Column({
    type: 'tinyint',
    unsigned: true,
    default: BlockProcessStatus.nostart,
  })
  @Index()
  processStatus: BlockProcessStatus;
}

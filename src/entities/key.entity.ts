import { Column, Entity, PrimaryColumn } from 'typeorm';

export enum KeyRole {
  auth,
  listen,
}

@Entity()
export class KeyEntity {
  @PrimaryColumn({ unique: true })
  key: string;

  @Column()
  role: KeyRole;

  @Column({ nullable: true })
  callbackUrl: string;
}

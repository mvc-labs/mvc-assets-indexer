import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RpcModule } from '../rpc/rpc.module';
import { BlockEntity } from '../../entities/block.entity';
import { BlockService } from './block.service';
import { ConfigModule } from '@nestjs/config';
import { TransactionModule } from '../transaction/transaction.module';
import { ZmqModule } from '../zmq/zmq.module';
import { TransactionEntity } from '../../entities/transaction.entity';
import { TxInEntity } from '../../entities/txIn.entity';
import { TxOutEntity } from '../../entities/txOut.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BlockEntity,
      TransactionEntity,
      TxInEntity,
      TxOutEntity,
    ]),
    RpcModule,
    ConfigModule,
    TransactionModule,
    ZmqModule,
  ],
  providers: [BlockService],
  exports: [BlockService],
})
export class BlockModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RpcModule } from '../rpc/rpc.module';
import { TransactionService } from './transaction.service';
import { TransactionEntity } from '../../entities/transaction.entity';
import { ZmqModule } from '../zmq/zmq.module';
import { ConfigModule } from '@nestjs/config';
import { BlockEntity } from '../../entities/block.entity';
import { TxInEntity } from '../../entities/txIn.entity';
import { TxOutEntity } from '../../entities/txOut.entity';
import { TxOutNftEntity } from '../../entities/txOutNftEntity';
import { TxOutFtEntity } from '../../entities/txOutFtEntity';
import { AdminModule } from '../../routes/admin/admin.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BlockEntity,
      TransactionEntity,
      TxInEntity,
      TxOutEntity,
      TxOutNftEntity,
      TxOutFtEntity,
    ]),
    ConfigModule,
    RpcModule,
    ZmqModule,
    AdminModule,
  ],
  providers: [TransactionService],
  exports: [TransactionService],
})
export class TransactionModule {}

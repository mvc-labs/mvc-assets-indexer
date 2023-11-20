import { Module } from '@nestjs/common';
import { CheckTokenService } from './checkToken.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionEntity } from '../../entities/transaction.entity';
import { TxInEntity } from '../../entities/txIn.entity';
import { TxOutEntity } from '../../entities/txOut.entity';
import { TxOutNftEntity } from '../../entities/txOutNftEntity';
import { TxOutFtEntity } from '../../entities/txOutFtEntity';
import { RpcModule } from '../rpc/rpc.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TransactionEntity,
      TxInEntity,
      TxOutEntity,
      TxOutNftEntity,
      TxOutFtEntity,
    ]),
    RpcModule,
  ],
  providers: [CheckTokenService],
  exports: [CheckTokenService],
})
export class CheckTokenModule {}

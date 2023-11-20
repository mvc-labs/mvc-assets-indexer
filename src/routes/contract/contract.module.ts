import { Module } from '@nestjs/common';
import { ContractService } from './contract.service';
import { ContractController } from './contract.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionEntity } from '../../entities/transaction.entity';
import { TxOutEntity } from '../../entities/txOut.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TransactionEntity, TxOutEntity])],
  controllers: [ContractController],
  providers: [ContractService],
})
export class ContractModule {}

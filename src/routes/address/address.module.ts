import { Module } from '@nestjs/common';
import { AddressService } from './address.service';
import { AddressController } from './address.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionEntity } from '../../entities/transaction.entity';
import { TxOutEntity } from '../../entities/txOut.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TransactionEntity, TxOutEntity])],
  controllers: [AddressController],
  providers: [AddressService],
})
export class AddressModule {}

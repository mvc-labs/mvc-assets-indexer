import { Module } from '@nestjs/common';
import { DefaultService } from './default.service';
import { DefaultController } from './default.controller';
import { RpcModule } from '../../service/rpc/rpc.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BlockEntity } from '../../entities/block.entity';
import { TransactionEntity } from '../../entities/transaction.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([BlockEntity, TransactionEntity]),
    RpcModule,
  ],
  providers: [DefaultService],
  controllers: [DefaultController],
})
export class DefaultModule {}

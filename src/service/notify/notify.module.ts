import { Module } from '@nestjs/common';
import { NotifyService } from './notify.service';
import { ConfigModule } from '@nestjs/config';
import { AdminModule } from '../../routes/admin/admin.module';
import { TransactionModule } from '../transaction/transaction.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionEntity } from '../../entities/transaction.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([TransactionEntity]),
    AdminModule,
    ConfigModule,
    TransactionModule,
  ],
  providers: [NotifyService],
  exports: [NotifyService],
})
export class NotifyModule {}

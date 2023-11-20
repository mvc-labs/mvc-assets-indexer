import { Module } from '@nestjs/common';
import * as process from 'process';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
// config
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
//  service
import { RpcModule } from './service/rpc/rpc.module';
import { ZmqModule } from './service/zmq/zmq.module';
import { BlockModule } from './service/block/block.module';
import { TransactionModule } from './service/transaction/transaction.module';
import { CheckTokenModule } from './service/checkToken/checkToken.module';
// entities
import { BlockEntity } from './entities/block.entity';
import { TransactionEntity } from './entities/transaction.entity';
import { TxInEntity } from './entities/txIn.entity';
import { TxOutEntity } from './entities/txOut.entity';
import { TxOutNftEntity } from './entities/txOutNftEntity';
import { TxOutFtEntity } from './entities/txOutFtEntity';
// routes
import { DefaultModule } from './routes/default/default.module';
import { TxModule } from './routes/tx/tx.module';
import { AddressModule } from './routes/address/address.module';
import { ContractModule } from './routes/contract/contract.module';

// eslint-disable-next-line @typescript-eslint/no-var-requires
require('dotenv').config();

@Module({
  imports: [
    TypeOrmModule.forRoot({
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      type: process.env.DATABASE_TYPE,
      host: process.env.DATABASE_HOST,
      port: parseInt(process.env.DATABASE_PORT),
      username: process.env.DATABASE_USERNAME,
      password: process.env.DATABASE_PASSWORD,
      database: process.env.DATABASE_DB,
      entities: [
        BlockEntity,
        TransactionEntity,
        TxInEntity,
        TxOutEntity,
        TxOutNftEntity,
        TxOutFtEntity,
      ],
      synchronize: true,
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: 60,
        limit: 30,
      },
    ]),
    ConfigModule.forRoot({
      load: [configuration],
    }),
    DefaultModule,
    RpcModule,
    BlockModule,
    TransactionModule,
    ZmqModule,
    TxModule,
    AddressModule,
    ContractModule,
    CheckTokenModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}

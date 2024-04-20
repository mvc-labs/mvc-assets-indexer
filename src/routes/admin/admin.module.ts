import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigEntity } from '../../entities/config.entity';
import { KeyEntity } from '../../entities/key.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ConfigEntity, KeyEntity])],
  providers: [AdminService],
  controllers: [AdminController],
  exports: [AdminService],
})
export class AdminModule {}

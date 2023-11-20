import { Controller, Get, Param, Query } from '@nestjs/common';
import { DefaultService } from './default.service';
import { ApiTags } from '@nestjs/swagger';

@Controller()
export class DefaultController {
  constructor(private readonly defaultService: DefaultService) {}

  @ApiTags('block')
  @Get('/block/:q/tx')
  async blockTxPage(
    @Param('q') q: string,
    @Query('cursor') cursor: number,
    @Query('size') size: number,
  ) {
    return this.defaultService.blockTxPage(q, cursor, size);
  }
}

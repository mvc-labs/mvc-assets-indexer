import { Controller, Get, Param, Query } from '@nestjs/common';
import { ContractService } from './contract.service';
import { ApiQuery, ApiTags } from '@nestjs/swagger';

@Controller('contract')
export class ContractController {
  constructor(private readonly contractService: ContractService) {}

  @ApiTags('contract')
  @Get('/ft/address/:address/utxo')
  @ApiQuery({ name: 'codeHash', required: false, type: String })
  @ApiQuery({ name: 'genesis', required: false, type: String })
  @ApiQuery({ name: 'flag', required: false, type: String })
  ftAddressUtxo(
    @Param('address') address: string,
    @Query('codeHash') codeHash: string,
    @Query('genesis') genesis: string,
    @Query('flag') flag: string,
  ) {
    return this.contractService.ftAddressUtxo(address, codeHash, genesis, flag);
  }

  @ApiTags('contract')
  @Get('/ft/address/:address/balance')
  @ApiQuery({ name: 'codeHash', required: false, type: String })
  @ApiQuery({ name: 'genesis', required: false, type: String })
  ftAddressBalance(
    @Param('address') address: string,
    @Query('codeHash') codeHash: string,
    @Query('genesis') genesis: string,
  ) {
    return this.contractService.ftAddressBalance(address, codeHash, genesis);
  }
}

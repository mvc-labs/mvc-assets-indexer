import { Controller, Get, Param, Query } from '@nestjs/common';
import { AddressService } from './address.service';
import { ApiQuery, ApiTags } from '@nestjs/swagger';

@Controller('address')
export class AddressController {
  constructor(private readonly addressService: AddressService) {}

  @ApiTags('address')
  @Get(':address/balance')
  balance(@Param('address') address: string) {
    return this.addressService.balance(address);
  }

  @ApiTags('address')
  @Get(':address/utxo')
  @ApiQuery({ name: 'flag', required: false, type: String })
  utxo(@Param('address') address: string, @Query('flag') flag: string) {
    return this.addressService.utxo(address, flag);
  }
}

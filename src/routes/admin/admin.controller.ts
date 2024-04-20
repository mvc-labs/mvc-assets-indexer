import { Body, Controller, Get, Logger, Post } from '@nestjs/common';
import { AdminService } from './admin.service';
import { PubkeyNotifyDto } from './dto';
import { commonResponse } from '../../lib/commonResponse';

@Controller('admin')
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(private readonly adminService: AdminService) {}
  @Get('/info')
  async info() {
    return this.adminService.info();
  }

  @Post('/commitInit')
  async commitInit(@Body() body: { pubkey: string; sig: string }) {
    this.logger.debug(body.pubkey);
    this.logger.debug(body.sig);
    const saveInfo = await this.adminService.commitInit(body.pubkey, body.sig);

    if (saveInfo) {
      return commonResponse(0, 'admin key init', null);
    } else {
      return commonResponse(-1, 'sig check error', null);
    }
  }

  @Post('/updateAdminPub')
  async updateAdminPub(@Body() body: { sig: string; data: any }) {
    if (
      await this.adminService.checkAdminSig(body.sig, JSON.stringify(body.data))
    ) {
      const [pass, msg] = await this.adminService.updateAdminPub(body.data);
      //   return isMember ? '$2.00' : '$10.00';
      const code = pass ? 0 : -1;
      return commonResponse(code, msg as unknown as string, null);
    } else {
      return commonResponse(-1, 'sig error', null);
    }
  }

  @Post('/addAuthPubkey')
  async addAuthPubkey(@Body() pubkeyNotifyDto: PubkeyNotifyDto) {
    return await this.adminService.addAuthPubkey(pubkeyNotifyDto);
  }

  @Post('/addListenPubkey')
  async addListenPubkey(@Body() pubkeyNotifyDto: PubkeyNotifyDto) {
    return await this.adminService.addListenPubkey(pubkeyNotifyDto);
  }
}

import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigEntity } from '../../entities/config.entity';
import { KeyEntity, KeyRole } from '../../entities/key.entity';
import { hash160, verifyWithPubKey } from '../../lib/hash';
import { GlobalConfigKey } from '../../constants/Global';
import { PubkeyNotifyDto } from './dto';
import { commonResponse } from '../../lib/commonResponse';

@Injectable()
export class AdminService implements OnModuleInit {
  private readonly logger = new Logger(AdminService.name);
  public pubkeyMap: Map<string, boolean>;
  public addressHexMap: Map<string, boolean>;
  constructor(
    @InjectRepository(ConfigEntity)
    private configEntityRepository: Repository<ConfigEntity>,
    @InjectRepository(KeyEntity)
    private keyEntityRepository: Repository<KeyEntity>,
  ) {
    this.pubkeyMap = new Map<string, boolean>();
    this.addressHexMap = new Map<string, boolean>();
  }

  async onModuleInit(): Promise<void> {
    await this.presetConfig();
    await this.loadAllKey();
  }

  private async presetConfig() {}

  public async addKey(pubkey: string, role: KeyRole, save: boolean) {
    this.pubkeyMap.set(pubkey, true);
    this.addressHexMap.set(hash160(pubkey).toString('hex'), true);
    if (save) {
      const notifyEntity = this.keyEntityRepository.create();
      notifyEntity.key = pubkey;
      notifyEntity.role = role;
      await this.keyEntityRepository.save(notifyEntity);
    }
  }

  public isExistsAddress(addressHex: string) {
    return this.addressHexMap.get(addressHex) || false;
  }

  private async loadAllKey() {
    const keys = await this.keyEntityRepository.find({
      where: {
        role: KeyRole.listen,
      },
    });
    for (const key of keys) {
      await this.addKey(key.key, key.role, false);
    }
  }

  async info() {
    const value = await this.configEntityRepository.findOneBy({
      key: GlobalConfigKey.adminPub,
    });
    if (!value) {
      return commonResponse(0, '', {
        status: 'Uninitialized',
        adminPub: '',
      });
    } else {
      return commonResponse(0, '', {
        status: 'Initialization',
        adminPub: value.value,
      });
    }
  }

  async commitInit(pubkey: string, sig: string) {
    const isPass = verifyWithPubKey(pubkey, sig, pubkey);
    if (isPass) {
      const config = this.configEntityRepository.create();
      config.key = GlobalConfigKey.adminPub;
      config.value = pubkey;
      await this.configEntityRepository.save(config);
      return true;
    } else {
      return false;
    }
  }

  async checkSig(msg: string, sig: string, pubkey: string) {
    const entity = await this.keyEntityRepository.findOne({
      where: {
        key: pubkey,
        role: KeyRole.auth,
      },
    });
    if (entity) {
      if (verifyWithPubKey(msg, sig, pubkey)) {
        return true;
      }
    }
    return await this.checkAdminSig(sig, msg);
  }

  async checkAdminSig(sig: string, data: string) {
    const admin = await this.configEntityRepository.findOneBy({
      key: GlobalConfigKey.adminPub,
    });
    if (!admin || !sig) {
      return false;
    }
    return verifyWithPubKey(data, sig, admin.value);
  }

  async updateAdminPub(data: any) {
    const { newPubkey, newAdminSig } = data;
    if (verifyWithPubKey(newPubkey, newAdminSig, newPubkey)) {
      const adminEntity = this.configEntityRepository.create();
      adminEntity.key = GlobalConfigKey.adminPub;
      adminEntity.value = newPubkey;
      await this.configEntityRepository.save(adminEntity);
      return [true, 'ok'];
    } else {
      return [false, 'new admin sig error'];
    }
  }

  async addAuthPubkey(pubkeyNotifyDto: PubkeyNotifyDto) {
    const { publicKey, publicKeySign, notifyPubkey } = pubkeyNotifyDto;
    if (await this.checkSig(notifyPubkey, publicKeySign, publicKey)) {
      await this.addKey(notifyPubkey, KeyRole.auth, true);
      return commonResponse(0, 'success', null);
    }
    return commonResponse(-1, 'sig error', null);
  }

  async addListenPubkey(pubkeyNotifyDto: PubkeyNotifyDto) {
    const { publicKey, publicKeySign, notifyPubkey } = pubkeyNotifyDto;
    if (await this.checkSig(notifyPubkey, publicKeySign, publicKey)) {
      await this.addKey(notifyPubkey, KeyRole.listen, true);
      return commonResponse(0, 'success', null);
    }
    return commonResponse(-1, 'sig error', null);
  }
}

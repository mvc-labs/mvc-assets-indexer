import { IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PubkeyNotifyDto {
  @IsNotEmpty({ message: 'require notifyPubkey' })
  @ApiProperty()
  readonly notifyPubkey: string;
  @ApiProperty()
  readonly callbackUrl: string | null;
  @IsNotEmpty({ message: 'require publicKey' })
  @ApiProperty()
  readonly publicKey: string;
  @IsNotEmpty({ message: 'require publicKeySign' })
  @ApiProperty()
  readonly publicKeySign: string;
}

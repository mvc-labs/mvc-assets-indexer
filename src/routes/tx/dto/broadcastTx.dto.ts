import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BroadcastTxDto {
  @IsNotEmpty({ message: 'hex is not empty' })
  @IsString()
  @ApiProperty()
  readonly hex: string;
}

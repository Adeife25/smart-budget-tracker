import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PayCycle } from '@prisma/client';

export class UpdateSettingsDto {
  @ApiPropertyOptional({ example: 'NGN', description: 'ISO currency code' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  currencyPreference?: string;

  @ApiPropertyOptional({ enum: PayCycle })
  @IsOptional()
  @IsEnum(PayCycle)
  payCyclePreference?: PayCycle;
}

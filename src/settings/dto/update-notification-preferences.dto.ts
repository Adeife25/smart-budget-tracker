import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateNotificationPreferencesDto {
  @ApiPropertyOptional({
    example: true,
    description: 'Get notified when a budget hits 90%',
  })
  @IsOptional()
  @IsBoolean()
  budgetAlerts?: boolean;

  @ApiPropertyOptional({
    example: true,
    description: 'Receive a weekly summary of your finances',
  })
  @IsOptional()
  @IsBoolean()
  weeklyDigest?: boolean;

  @ApiPropertyOptional({
    example: true,
    description: 'Receive personalized advice based on your spending',
  })
  @IsOptional()
  @IsBoolean()
  moneyTips?: boolean;
}

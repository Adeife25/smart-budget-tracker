import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class DateRangeQueryDto {
  @ApiPropertyOptional({
    description:
      'Range start (ISO 8601). Defaults to the first day of the current month.',
    example: '2026-08-01',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description:
      'Range end (ISO 8601). Defaults to now. Date-only values are treated as end of day.',
    example: '2026-08-21',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

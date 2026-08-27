import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ReportQueryDto {
  @ApiPropertyOptional({
    description:
      'Number of months the report covers, ending with the current month.',
    example: 6,
    default: 6,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  months?: number;
}

export class ReportFormatQueryDto extends ReportQueryDto {
  @ApiPropertyOptional({ enum: ['pdf', 'docx', 'csv'], default: 'pdf' })
  @IsOptional()
  @IsIn(['pdf', 'docx', 'csv'])
  format?: 'pdf' | 'docx' | 'csv';
}

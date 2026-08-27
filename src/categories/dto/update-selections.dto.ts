import { ArrayMaxSize, IsArray, IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateSelectionsDto {
  @ApiPropertyOptional({
    description:
      'All selected INCOME category ids (replaces the current set; [] clears)',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  incomeCategoryIds?: string[];

  @ApiPropertyOptional({
    description:
      'All selected EXPENSE category ids (replaces the current set; [] clears)',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  expenseCategoryIds?: string[];
}

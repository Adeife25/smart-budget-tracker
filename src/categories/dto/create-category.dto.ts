import { IsString, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TransactionType, CategoryGroup } from '@prisma/client';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Groceries' })
  @IsString()
  name: string;

  @ApiProperty({ enum: TransactionType })
  @IsEnum(TransactionType)
  type: TransactionType;

  @ApiProperty({ enum: CategoryGroup })
  @IsEnum(CategoryGroup)
  group: CategoryGroup;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  parentCategoryId?: string;
}

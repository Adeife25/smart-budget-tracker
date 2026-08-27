import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PayCycle } from '@prisma/client';

export class UpdateBudgetDto {
  @ApiPropertyOptional({
    example: '2f7f876b-c216-475e-9033-5886dc4f09a8',
    description:
      'Id of an existing category — fetch valid ids from GET /api/categories',
  })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ enum: PayCycle })
  @IsOptional()
  @IsEnum(PayCycle)
  payCycle?: PayCycle;

  @ApiPropertyOptional({ example: 50000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;
}

import { IsString, IsNumber, IsEnum, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PayCycle } from '@prisma/client';

export class CreateBudgetDto {
  @ApiProperty({
    example: '2f7f876b-c216-475e-9033-5886dc4f09a8',
    description:
      'Id of an existing category — fetch valid ids from GET /api/categories',
  })
  @IsString()
  categoryId: string;

  @ApiProperty({ enum: PayCycle })
  @IsEnum(PayCycle)
  payCycle: PayCycle;

  @ApiProperty({ example: 50000 })
  @IsNumber()
  @Min(0)
  amount: number;
}

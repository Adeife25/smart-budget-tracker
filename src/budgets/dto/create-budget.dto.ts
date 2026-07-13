import { IsString, IsNumber, IsEnum, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PayCycle } from '@prisma/client';

export class CreateBudgetDto {
  @ApiProperty()
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

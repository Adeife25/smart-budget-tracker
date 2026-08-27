import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { TransactionType } from '@prisma/client';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateSelectionsDto } from './dto/update-selections.dto';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RedisCacheInterceptor } from '../common/interceptors/redis-cache.interceptor';

@ApiTags('Categories')
@Controller('categories')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @UseInterceptors(RedisCacheInterceptor)
  @ApiOperation({
    summary:
      'Categories grouped by income/expense with totals and the user selection state',
  })
  @ApiQuery({ name: 'type', required: false, enum: TransactionType })
  findAll(
    @Request() req: { user: { id: string } },
    @Query('type') type?: TransactionType,
  ) {
    if (type === 'INCOME' || type === 'EXPENSE') {
      return this.categoriesService.findByType(req.user.id, type);
    }
    return this.categoriesService.findAll(req.user.id);
  }

  @Put('selections')
  @ApiOperation({
    summary:
      "Replace the logged-in user's selected categories (the choices offered when logging transactions)",
  })
  updateSelections(
    @Request() req: { user: { id: string } },
    @Body() dto: UpdateSelectionsDto,
  ) {
    return this.categoriesService.updateSelections(req.user.id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a category by id' })
  findOne(@Param('id') id: string) {
    return this.categoriesService.findOne(id);
  }

  @Post()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Create a private custom category (auto-selected for you)',
  })
  create(
    @Request() req: { user: { id: string } },
    @Body() dto: CreateCategoryDto,
  ) {
    return this.categoriesService.create(req.user.id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete one of your own custom categories' })
  remove(@Param('id') id: string, @Request() req: { user: { id: string } }) {
    return this.categoriesService.remove(id, req.user.id);
  }
}

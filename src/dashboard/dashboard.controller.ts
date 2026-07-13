import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/auth.guard';

@ApiTags('Dashboard')
@Controller('dashboard')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Get financial summary for a date range' })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  getSummary(
    @Request() req: { user: { id: string } },
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate
      ? new Date(startDate)
      : new Date(new Date().setDate(1));
    const end = endDate ? new Date(endDate) : new Date();
    return this.dashboardService.getSummary(req.user.id, start, end);
  }

  @Get('spend-by-category')
  @ApiOperation({ summary: 'Get spending breakdown by category' })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  getSpendByCategory(
    @Request() req: { user: { id: string } },
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate
      ? new Date(startDate)
      : new Date(new Date().setDate(1));
    const end = endDate ? new Date(endDate) : new Date();
    return this.dashboardService.getSpendByCategory(req.user.id, start, end);
  }

  @Get('budget-vs-actual')
  @ApiOperation({ summary: 'Get budget vs actual spending' })
  getBudgetVsActual(@Request() req: { user: { id: string } }) {
    return this.dashboardService.getBudgetVsActual(req.user.id);
  }
}

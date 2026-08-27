import {
  Body,
  Controller,
  Get,
  Put,
  Request,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { EmergencyFundService } from './emergency-fund.service';
import { UpdateEmergencyFundDto } from './dto/update-emergency-fund.dto';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RedisCacheInterceptor } from '../common/interceptors/redis-cache.interceptor';

@ApiTags('Emergency Fund')
@Controller('emergency-fund')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class EmergencyFundController {
  constructor(private readonly emergencyFundService: EmergencyFundService) {}

  @Get()
  @UseInterceptors(RedisCacheInterceptor)
  @ApiOperation({ summary: 'Get your emergency fund progress' })
  get(@Request() req: { user: { id: string } }) {
    return this.emergencyFundService.get(req.user.id);
  }

  @Put()
  @ApiOperation({
    summary: 'Set or update the emergency fund target and saved amount',
  })
  update(
    @Request() req: { user: { id: string } },
    @Body() dto: UpdateEmergencyFundDto,
  ) {
    return this.emergencyFundService.update(req.user.id, dto);
  }
}

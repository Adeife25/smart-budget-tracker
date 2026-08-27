import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';
import { JwtAuthGuard } from '../auth/auth.guard';

@ApiTags('Settings')
@Controller('settings')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Get your app preferences' })
  get(@Request() req: { user: { id: string } }) {
    return this.settingsService.get(req.user.id);
  }

  @Patch()
  @ApiOperation({ summary: 'Update currency and/or pay cycle preference' })
  update(
    @Request() req: { user: { id: string } },
    @Body() dto: UpdateSettingsDto,
  ) {
    return this.settingsService.update(req.user.id, dto);
  }

  @Put('password')
  @ApiOperation({
    summary: 'Change password (revokes all active sessions)',
  })
  changePassword(
    @Request() req: { user: { id: string } },
    @Body() dto: ChangePasswordDto,
  ) {
    return this.settingsService.changePassword(req.user.id, dto);
  }

  @Get('notifications')
  @ApiOperation({ summary: 'Get notification preferences' })
  getNotificationPreferences(@Request() req: { user: { id: string } }) {
    return this.settingsService.getNotificationPreferences(req.user.id);
  }

  @Patch('notifications')
  @ApiOperation({ summary: 'Update notification preferences' })
  updateNotificationPreferences(
    @Request() req: { user: { id: string } },
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    return this.settingsService.updateNotificationPreferences(req.user.id, dto);
  }

  @Delete('account')
  @ApiOperation({ summary: 'Permanently delete your account and all data' })
  deleteAccount(@Request() req: { user: { id: string } }) {
    return this.settingsService.deleteAccount(req.user.id);
  }
}

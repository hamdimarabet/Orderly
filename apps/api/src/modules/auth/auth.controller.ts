import { Controller, Post, Body, Get } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}
  @Get('seed-stores')
seedStores() {
  return this.auth.seedStores();
}

  @Post('login')
  login(@Body() body: { email: string; password: string }) {
    return this.auth.login(body.email, body.password);
  }

  @Get('seed')
  seed() {
    return this.auth.seedAdmin();
  }
  
}
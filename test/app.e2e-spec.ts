import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

interface AuthResponse {
  user: { id: string; name: string; email: string; emailVerified: boolean };
  accessToken: string;
  refreshToken: string;
}

interface ProfileResponse {
  id: string;
  email: string;
  name: string;
}

interface CategoriesResponse {
  income: {
    total: number;
    selectedCount: number;
    categories: { id: string; name: string; type: string; selected: boolean }[];
  };
  expense: {
    total: number;
    selectedCount: number;
    categories: { id: string; name: string; type: string; selected: boolean }[];
  };
  totalCategories: number;
}

describe('App (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  it('/api/auth/profile (GET) - should return 401 without token', () => {
    return request(app.getHttpServer()).get('/api/auth/profile').expect(401);
  });

  it('/api/categories (GET) - should require authentication', () => {
    return request(app.getHttpServer()).get('/api/categories').expect(401);
  });

  it('/api/auth (POST) - register, profile, refresh, logout flow', async () => {
    const httpServer = app.getHttpServer();
    const email = `e2e-${Date.now()}@example.com`;

    const registerResponse = await request(httpServer)
      .post('/api/auth/register')
      .send({ name: 'Test User', email, password: 'password123' })
      .expect(201);

    const registerBody = registerResponse.body as AuthResponse;

    expect(registerBody.user).toEqual({
      id: expect.any(String) as string,
      name: 'Test User',
      email,
      emailVerified: false,
    });
    expect(registerBody.accessToken).toBeDefined();
    expect(registerBody.refreshToken).toBeDefined();

    const { accessToken, refreshToken } = registerBody;

    const profileResponse = await request(httpServer)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const profileBody = profileResponse.body as ProfileResponse;
    expect(profileBody.email).toBe(email);

    const refreshResponse = await request(httpServer)
      .post('/api/auth/refresh')
      .send({ refreshToken })
      .expect(201);

    const refreshBody = refreshResponse.body as AuthResponse;
    expect(refreshBody.accessToken).toBeDefined();
    expect(refreshBody.refreshToken).toBeDefined();

    await request(httpServer)
      .post('/api/auth/logout')
      .send({ refreshToken: refreshBody.refreshToken })
      .expect(201);

    await request(httpServer)
      .post('/api/auth/refresh')
      .send({ refreshToken: refreshBody.refreshToken })
      .expect(401);
  }, 15_000);

  describe('categories & notifications (authenticated)', () => {
    let accessToken: string;

    beforeEach(async () => {
      const email = `flow-${Date.now()}@example.com`;
      const registerResponse = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ name: 'Flow User', email, password: 'password123' })
        .expect(201);
      accessToken = (registerResponse.body as AuthResponse).accessToken;
    });

    it('lists grouped categories and syncs selections', async () => {
      const listResponse = await request(app.getHttpServer())
        .get('/api/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const list = listResponse.body as CategoriesResponse;
      expect(list.income.total).toBeGreaterThan(0);
      expect(list.expense.total).toBeGreaterThan(0);
      expect(list.totalCategories).toBe(list.income.total + list.expense.total);
      expect(list.income.selectedCount).toBe(0);
      expect(list.expense.selectedCount).toBe(0);

      const salary = list.income.categories.find((c) => c.name === 'Salary');
      const food = list.expense.categories.find(
        (c) => c.name === 'Food & Groceries',
      );
      expect(salary).toBeDefined();
      expect(food).toBeDefined();

      await request(app.getHttpServer())
        .put('/api/categories/selections')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          incomeCategoryIds: [salary!.id],
          expenseCategoryIds: [food!.id],
        })
        .expect(200);

      const updatedResponse = await request(app.getHttpServer())
        .get('/api/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const updated = updatedResponse.body as CategoriesResponse;
      expect(updated.income.selectedCount).toBe(1);
      expect(updated.expense.selectedCount).toBe(1);
      expect(
        updated.income.categories.find((c) => c.id === salary!.id)?.selected,
      ).toBe(true);
      expect(
        updated.income.categories.find((c) => c.id !== salary!.id)?.selected,
      ).toBe(false);

      await request(app.getHttpServer())
        .put('/api/categories/selections')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ incomeCategoryIds: ['not-a-uuid'] })
        .expect(400);
    });

    it('starts with an empty notification list and zero unread count', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/notifications')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const body = response.body as {
        data: unknown[];
        meta: { unreadCount: number; total: number };
      };
      expect(body.data).toEqual([]);
      expect(body.meta.unreadCount).toBe(0);
      expect(body.meta.total).toBe(0);
    });
  });

  afterEach(async () => {
    await app.close();
  });
});

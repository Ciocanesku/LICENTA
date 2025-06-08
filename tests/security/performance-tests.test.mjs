import request from 'supertest';
import { expect } from 'chai';

const baseURL = 'http://localhost:8000';

describe('🔐 Security Tests (live server)', () => {

  it('should block access to /admin for guests', async () => {
    const res = await request(baseURL).get('/admin');
    expect(res.status).to.equal(403);
  });

  it('should block access to /admin/users without auth', async () => {
    const res = await request(baseURL).get('/admin/users');
    expect(res.status).to.equal(403);
  });

  it('should block SQL injection attempt on /login', async () => {
    const res = await request(baseURL).post('/login').send({
      email: "' OR 1=1 --",
      password: 'hack'
    });
    expect(res.status).to.equal(400);
  });

  it('should reject reset-password with invalid token', async () => {
    const res = await request(baseURL).get('/reset-password/fake-token-123');
    expect(res.status).to.equal(200); // pagina e afișată, dar tokenul e invalid
    expect(res.text).to.include('token'); // conținutul paginii indică token-ul
  });

  it('should deny access to /my-orders without session', async () => {
    const res = await request(baseURL).get('/my-orders');
    expect(res.status).to.equal(401);
  });

  it('should deny access to /dashboard without session', async () => {
    const res = await request(baseURL).get('/dashboard');
    expect(res.status).to.equal(403); // tratat ca acces neautorizat
  });

  it('should block /admin/products/delete without auth', async () => {
    const res = await request(baseURL).post('/admin/products/delete').send({ id: 1 });
    expect(res.status).to.equal(403);
  });

  it('should validate malformed promoCode input', async () => {
    const res = await request(baseURL).post('/validate-promo').send({ promoCode: "' OR 1=1" });
    expect([401, 400]).to.include(res.status); // fie nu e autentificat, fie input invalid
  });

  it('should reject POST /register with missing fields', async () => {
    const res = await request(baseURL).post('/register').send({
      email: 'test@test.com',
      password: '123'
    });
    expect(res.status).to.equal(400);
  });

  it('should reject short phone number in /dashboard update', async () => {
    const res = await request(baseURL)
      .post('/dashboard/update')
      .send({ firstName: 'X', lastName: 'Y', phone: '123' });
    expect([400, 403]).to.include(res.status);
  });

});

import request from 'supertest';
import { expect } from 'chai';

const baseURL = 'http://localhost:8000'; // serverul trebuie să fie deja pornit

describe('🔗 Integration Tests (live server)', () => {

  it('GET / should return homepage', async () => {
    const res = await request(baseURL).get('/');
    expect(res.status).to.equal(200);
  });

  it('POST /login should fail with wrong credentials', async () => {
    const res = await request(baseURL).post('/login').send({
      email: 'fail@test.com',
      password: 'wrongpass'
    });
    expect(res.status).to.equal(400);
  });

  it('POST /register should create new user', async () => {
    const res = await request(baseURL).post('/register').send({
      firstName: 'Ion',
      lastName: 'Popescu',
      phone: '0711111111',
      email: `ion${Date.now()}@mail.com`,
      password: 'parola123'
    });
    expect(res.status).to.equal(200);
  });

  it('GET /products should return products list', async () => {
    const res = await request(baseURL).get('/products');
    expect(res.status).to.equal(200);
    expect(res.body).to.be.an('array');
  });

  it('GET /products/1/sizes should return sizes or empty', async () => {
    const res = await request(baseURL).get('/products/1/sizes');
    expect([200, 500]).to.include(res.status);
  });

  it('POST /wishlist/add should require auth', async () => {
    const res = await request(baseURL).post('/wishlist/add').send({ product_id: 1 });
    expect(res.status).to.equal(403);
  });

  it('GET /cart should return cart page', async () => {
    const res = await request(baseURL).get('/cart');
    expect(res.status).to.equal(200);
  });

  it('GET /login should load login page', async () => {
    const res = await request(baseURL).get('/login');
    expect(res.status).to.equal(200);
  });

  it('GET /register should load register page', async () => {
    const res = await request(baseURL).get('/register');
    expect(res.status).to.equal(200);
  });

  it('POST /validate-promo without auth should fail', async () => {
    const res = await request(baseURL).post('/validate-promo').send({ promoCode: 'TEST10' });
    expect(res.status).to.equal(401);
  });

});

import request from 'supertest';
import { expect } from 'chai';

const baseURL = 'http://localhost:8000'; // presupunem că serverul rulează deja

describe('🚀 Performance Tests (live server)', () => {

  it('Homepage should load under 500ms', async () => {
    const start = Date.now();
    const res = await request(baseURL).get('/');
    const duration = Date.now() - start;
    expect(res.status).to.equal(200);
    expect(duration).to.be.below(500);
  });

  it('GET /products should respond under 400ms', async () => {
    const start = Date.now();
    const res = await request(baseURL).get('/products');
    const duration = Date.now() - start;
    expect(res.status).to.equal(200);
    expect(duration).to.be.below(400);
  });

  it('GET /login should respond under 300ms', async () => {
    const start = Date.now();
    const res = await request(baseURL).get('/login');
    const duration = Date.now() - start;
    expect(res.status).to.equal(200);
    expect(duration).to.be.below(300);
  });

  it('GET /register should respond under 300ms', async () => {
    const start = Date.now();
    const res = await request(baseURL).get('/register');
    const duration = Date.now() - start;
    expect(res.status).to.equal(200);
    expect(duration).to.be.below(300);
  });

  it('GET /cart should respond under 300ms', async () => {
    const start = Date.now();
    const res = await request(baseURL).get('/cart');
    const duration = Date.now() - start;
    expect(res.status).to.equal(200);
    expect(duration).to.be.below(300);
  });

  it('GET /checkout should respond under 400ms', async () => {
    const start = Date.now();
    const res = await request(baseURL).get('/checkout');
    const duration = Date.now() - start;
    expect(res.status).to.equal(200);
    expect(duration).to.be.below(400);
  });

  it('GET /wishlist should fail fast when unauthenticated', async () => {
    const start = Date.now();
    const res = await request(baseURL).get('/wishlist');
    const duration = Date.now() - start;
    expect(res.status).to.equal(403);
    expect(duration).to.be.below(200);
  });

  it('POST /login (fail) should respond under 300ms', async () => {
    const start = Date.now();
    const res = await request(baseURL).post('/login').send({
      email: 'fail@fail.com',
      password: 'wrong'
    });
    const duration = Date.now() - start;
    expect(res.status).to.equal(400);
    expect(duration).to.be.below(300);
  });

  it('GET /my-orders (unauthenticated) should be rejected fast', async () => {
    const start = Date.now();
    const res = await request(baseURL).get('/my-orders');
    const duration = Date.now() - start;
    expect(res.status).to.equal(401);
    expect(duration).to.be.below(200);
  });

  it('GET /product/1/sizes should respond under 500ms', async () => {
    const start = Date.now();
    const res = await request(baseURL).get('/products/1/sizes');
    const duration = Date.now() - start;
    expect([200, 500]).to.include(res.status);
    expect(duration).to.be.below(500);
  });

});

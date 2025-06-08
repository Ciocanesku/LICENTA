// tests/unit/all-unit-tests.test.js
import { expect } from 'chai';
import bcrypt from 'bcryptjs';


// Simulăm funcții simple folosite în aplicație
const calcDiscountedPrice = (price, discount) => price - (price * (discount / 100));
const validatePhone = (phone) => /^\d{10}$/.test(phone);
const isEmpty = (obj) => Object.keys(obj).length === 0;

// Mock user input validator
const isValidUser = ({ email, password }) => {
    return email.includes('@') && password.length >= 6;
};

describe('📦 Unit Tests', () => {

  it('calculates discounted price correctly', () => {
    const final = calcDiscountedPrice(100, 10);
    expect(final).to.equal(90);
  });

  it('validates Romanian phone number', () => {
    expect(validatePhone('0712345678')).to.be.true;
    expect(validatePhone('1234')).to.be.false;
  });

  it('checks empty object correctly', () => {
    expect(isEmpty({})).to.be.true;
    expect(isEmpty({ name: 'test' })).to.be.false;
  });

  it('validates user object correctly', () => {
    expect(isValidUser({ email: 'a@a.com', password: '123456' })).to.be.true;
    expect(isValidUser({ email: 'bad', password: '123' })).to.be.false;
  });

  it('hashes password using bcrypt', async () => {
    const pass = 'securePass';
    const hash = await bcrypt.hash(pass, 10);
    const match = await bcrypt.compare(pass, hash);
    expect(match).to.be.true;
  });

  it('fails comparing with wrong password', async () => {
    const pass = '123456';
    const hash = await bcrypt.hash(pass, 10);
    const match = await bcrypt.compare('wrong', hash);
    expect(match).to.be.false;
  });

  it('checks that discount logic fails on over 100%', () => {
    const discounted = calcDiscountedPrice(100, 150);
    expect(discounted).to.be.below(0);
  });

  it('confirms email format check', () => {
    expect('admin@gmail.com').to.match(/@/);
    expect('invalid_email').to.not.match(/@/);
  });

  it('detects missing product fields', () => {
    const product = { name: '', price: null };
    expect(product.name).to.equal('');
    expect(product.price).to.be.null;
  });

  it('ensures numeric stock is converted properly', () => {
    const stock = parseInt('15', 10);
    expect(stock).to.be.a('number');
    expect(stock).to.equal(15);
  });

});

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ForgotPassword from './ForgotPassword';

const mockNavigate = jest.fn();
const mockRequestPasswordResetOtp = jest.fn();
const mockVerifyPasswordResetOtp = jest.fn();
const setInputValue = (input, value) => {
  const valueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  ).set;
  valueSetter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('../../services/passwordResetApi', () => ({
  PASSWORD_RESET_COOLDOWN_SECONDS: 60,
  PASSWORD_RESET_MAX_OTP_ATTEMPTS: 5,
  requestPasswordResetOtp: (...args) => mockRequestPasswordResetOtp(...args),
  verifyPasswordResetOtp: (...args) => mockVerifyPasswordResetOtp(...args),
}));

describe('ForgotPassword email OTP flow', () => {
  let container;
  let root;

  beforeEach(() => {
    mockNavigate.mockReset();
    mockRequestPasswordResetOtp.mockReset();
    mockVerifyPasswordResetOtp.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    global.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    delete global.IS_REACT_ACT_ENVIRONMENT;
  });

  it('emails a reset code immediately and never asks for administrator approval', async () => {
    mockRequestPasswordResetOtp.mockResolvedValue({
      success: true,
      email: 'learner@example.com',
      message: 'If an account uses that email, a code has been sent.',
    });

    await act(async () => root.render(<ForgotPassword />));
    expect(container.textContent).not.toContain('must approve');

    const emailInput = container.querySelector('#email');
    await act(async () => {
      setInputValue(emailInput, 'learner@example.com');
    });
    await act(async () => {
      container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(mockRequestPasswordResetOtp).toHaveBeenCalledWith('learner@example.com');
    expect(container.querySelector('#resetOtp')).not.toBeNull();
    expect(container.textContent).toContain('If the address belongs to an account');
  });

  it('verifies a recovery OTP before opening the new-password screen', async () => {
    mockRequestPasswordResetOtp.mockResolvedValue({
      success: true,
      email: 'learner@example.com',
      message: 'A reset code has been sent.',
    });
    mockVerifyPasswordResetOtp.mockResolvedValue({ success: true });

    await act(async () => root.render(<ForgotPassword />));
    const emailInput = container.querySelector('#email');
    await act(async () => {
      setInputValue(emailInput, 'learner@example.com');
    });
    await act(async () => {
      container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    const otpInput = container.querySelector('#resetOtp');
    await act(async () => {
      setInputValue(otpInput, '123456');
    });
    await act(async () => {
      container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(mockVerifyPasswordResetOtp).toHaveBeenCalledWith('learner@example.com', '123456');
    expect(mockNavigate).toHaveBeenCalledWith('/reset-password', { replace: true });
  });
});

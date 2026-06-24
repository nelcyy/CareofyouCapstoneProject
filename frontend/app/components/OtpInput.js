'use client';

import { useRef, useState } from 'react';

const OTP_LENGTH = 6;

export default function OtpInput({ onChange }) {
  const [digits, setDigits] = useState(Array(OTP_LENGTH).fill(''));
  const inputsRef = useRef([]);

  function emit(nextDigits) {
    setDigits(nextDigits);
    onChange(nextDigits.join(''));
  }

  function focusInput(index) {
    inputsRef.current[index]?.focus();
    inputsRef.current[index]?.select?.();
  }

  function handleChange(raw, index) {
    const digit = raw.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[index] = digit;
    emit(next);
    if (digit && index < OTP_LENGTH - 1) focusInput(index + 1);
  }

  function handleKeyDown(event, index) {
    if (event.key === 'Backspace') {
      event.preventDefault();
      if (digits[index]) {
        const next = [...digits];
        next[index] = '';
        emit(next);
        return;
      }
      if (index > 0) {
        const next = [...digits];
        next[index - 1] = '';
        emit(next);
        focusInput(index - 1);
      }
    }
    if (event.key === 'ArrowLeft' && index > 0) focusInput(index - 1);
    if (event.key === 'ArrowRight' && index < OTP_LENGTH - 1) focusInput(index + 1);
  }

  function handlePaste(event) {
    event.preventDefault();
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!pasted) return;
    const next = Array(OTP_LENGTH).fill('');
    pasted.split('').forEach((digit, index) => {
      next[index] = digit;
    });
    emit(next);
    focusInput(Math.min(pasted.length, OTP_LENGTH) - 1);
  }

  return (
    <div className="otp-input-row">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(element) => {
            inputsRef.current[index] = element;
          }}
          className="otp-input"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          value={digit}
          onChange={(event) => handleChange(event.target.value, index)}
          onKeyDown={(event) => handleKeyDown(event, index)}
          onPaste={handlePaste}
          aria-label={`OTP digit ${index + 1}`}
        />
      ))}
    </div>
  );
}

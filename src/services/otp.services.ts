const OTP_LENGTH = 6;

export const generateOtp = (): string => {
  const min = 10 ** (OTP_LENGTH - 1);
  const max = 10 ** OTP_LENGTH - 1;
  return Math.floor(min + Math.random() * (max - min + 1)).toString();
};

/**
 * Sends a one-time verification code to the merchant's email.
 *
 * This is a placeholder for the real email provider integration. It returns the
 * generated code so callers (and tests) can assert that an OTP was triggered.
 */
export const sendOtpEmail = async (email: string): Promise<string> => {
  const otp = generateOtp();
  console.log(`[OTP] Verification code ${otp} queued for ${email}`);
  return otp;
};

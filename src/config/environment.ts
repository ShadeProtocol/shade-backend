import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '../../.env') });

export type EmailProvider = 'console' | 'resend' | 'smtp';

const EMAIL_PROVIDERS: EmailProvider[] = ['console', 'resend', 'smtp'];

const parseEmailProvider = (value: string | undefined): EmailProvider => {
  const provider = value || 'console';
  if (!EMAIL_PROVIDERS.includes(provider as EmailProvider)) {
    console.warn(`Invalid EMAIL_PROVIDER "${provider}", falling back to console`);
    return 'console';
  }
  return provider as EmailProvider;
};

export const environment = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  jwtSecret: process.env.JWT_SECRET || 'dev-jwt-secret-change-in-production',
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DATABASE || 'postgres',
  },
  email: {
    from: process.env.EMAIL_FROM || 'noreply@shade.local',
    provider: parseEmailProvider(process.env.EMAIL_PROVIDER),
    resendApiKey: process.env.RESEND_API_KEY || '',
    smtp: {
      host: process.env.SMTP_HOST || '',
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
      secure: process.env.SMTP_SECURE === 'true',
    },
  },
};

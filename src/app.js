import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import routes from './routes/index.js';
const app = express();
// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Routes
app.use('/api/v1/', routes);
export default app;

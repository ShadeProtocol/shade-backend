import app from './app';
import { environment } from './config/environment';

const startServer = async () => {
  try {
    // Start Express server
    app.listen(environment.port, () => {
      console.log(`Server running on port ${environment.port} in ${environment.nodeEnv} mode`);
    });
  } catch (error) {
    console.error('Error starting server:', error);
    process.exit(1);
  }
};

startServer();

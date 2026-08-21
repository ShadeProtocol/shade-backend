import { Router } from 'express';
import { listAuditLogsController } from '../../controllers/admin-log.controllers.js';

const router = Router();

router.get('/', listAuditLogsController);

export default router;

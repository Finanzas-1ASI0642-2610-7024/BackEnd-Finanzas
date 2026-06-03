const express = require('express');
const router = express.Router();
const creditController = require('../controllers/creditController');

router.post('/simulate', creditController.simularCredito);
router.get('/history', creditController.getHistorial);
router.get('/metrics', creditController.getAdminMetrics);
router.get('/:id', creditController.getSimulacionById);
router.post('/:id/otorgar', creditController.otorgarCredito);
router.get('/:id/excel', creditController.exportarExcel);

module.exports = router;

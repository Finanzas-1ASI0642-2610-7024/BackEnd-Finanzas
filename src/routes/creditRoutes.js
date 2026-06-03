const express = require('express');
const router = express.Router();
const creditController = require('../controllers/creditController');

// Endpoint de simulación
router.post('/simulate', creditController.simularCredito);

module.exports = router;

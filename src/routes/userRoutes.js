const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

// Auth
router.post('/login', userController.login);

// Admin user management
router.get('/', userController.getUsers);
router.post('/', userController.createUser);
router.delete('/:id', userController.deleteUser);

module.exports = router;

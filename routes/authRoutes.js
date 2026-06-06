const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const {
    registerVendor,
    registerBuyer,
    login,
    getMe,
    logout,
    refreshToken,
    changePassword,
    forgotPassword,
    resetPassword
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

// Validation rules
const validateRegister = [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('full_name').optional().isLength({ min: 2 }),
    body('company_name').optional().isLength({ min: 2 })
];

// Public routes
router.post('/register/vendor', registerVendor);
router.post('/register/buyer', registerBuyer);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// Protected routes
router.get('/me', protect, getMe);
router.post('/logout', protect, logout);
router.post('/refresh-token', protect, refreshToken);
router.post('/change-password', protect, changePassword);

module.exports = router;
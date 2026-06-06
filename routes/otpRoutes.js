const express = require('express');
const router = express.Router();
const {
    sendLoginOTP,
    verifyOTPAndLogin,
    resendOTP,
    getOTPStatus
} = require('../controllers/otpController');

// Public OTP routes
router.post('/send-otp', sendLoginOTP);
router.post('/verify-otp', verifyOTPAndLogin);
router.post('/resend-otp', resendOTP);
router.get('/otp-status', getOTPStatus);

module.exports = router;
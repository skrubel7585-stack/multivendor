const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware'); // ✅ এটা যোগ করুন
const {
    createRazorpayOrder,
    verifyPayment,
    getPaymentStatus,
    getAllPayments,
    razorpayWebhook,
    createCODOrder
} = require('../controllers/paymentController');

// Payment routes
router.post('/create-razorpay-order', protect, authorize('buyer'), createRazorpayOrder);
router.post('/verify-payment', protect, authorize('buyer'), verifyPayment);
router.post('/cod-order', protect, authorize('buyer'), createCODOrder);
router.get('/payment-status/:orderId', protect, getPaymentStatus);
router.get('/payments', protect, authorize('admin'), getAllPayments);
router.post('/razorpay-webhook', express.json(), razorpayWebhook);

module.exports = router;
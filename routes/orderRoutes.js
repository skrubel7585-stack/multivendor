const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const {
    createOrder,
    getMyOrders,
    getOrderDetails,
    cancelOrder,
    updateOrderStatus,
    getVendorOrders,
    updateVendorOrderStatus,
    getAllOrdersAdmin
} = require('../controllers/orderController');

// Buyer routes
router.post('/create', protect, authorize('buyer'), createOrder);
router.get('/my-orders', protect, authorize('buyer'), getMyOrders);
router.get('/:id', protect, getOrderDetails);
router.put('/:id/cancel', protect, authorize('buyer'), cancelOrder);

// Vendor routes
router.get('/vendor/orders', protect, authorize('vendor'), getVendorOrders);
router.put('/vendor/order/:id/status', protect, authorize('vendor'), updateVendorOrderStatus);

// Admin routes
router.get('/admin/all', protect, authorize('admin'), getAllOrdersAdmin);
router.put('/admin/order/:id/status', protect, authorize('admin'), updateOrderStatus);

module.exports = router;
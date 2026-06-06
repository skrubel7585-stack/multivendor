const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const adminController = require('../controllers/adminController');

// All routes require authentication and admin role
router.use(protect);
router.use(authorize('admin'));

// Dashboard
router.get('/stats', adminController.getAdminStats);
router.get('/subcategories/category/:categoryId', adminController.getSubcategoriesByCategory);
router.post('/subcategories', adminController.addSubcategory);
router.put('/subcategories/:id', adminController.updateSubcategory);
router.delete('/subcategories/:id', adminController.deleteSubcategory);
// Vendor Management
router.get('/vendors', adminController.getVendors);
router.get('/vendors/:id', adminController.getVendorById);
router.put('/vendors/:id/approve', adminController.approveVendor);
router.put('/vendors/:id/reject', adminController.rejectVendor);
router.put('/vendors/:id/suspend', adminController.suspendVendor);
router.put('/vendors/:id/activate', adminController.activateVendor);

// Buyer Management
router.get('/buyers', adminController.getBuyers);
router.get('/buyers/:id', adminController.getBuyerById);
router.put('/buyers/:id/suspend', adminController.suspendBuyer);
router.put('/buyers/:id/activate', adminController.activateBuyer);

// Product Management
router.get('/products', adminController.getAdminProducts);
router.put('/products/:id/approve', adminController.approveProduct);
router.put('/products/:id/reject', adminController.rejectProduct);
router.delete('/products/:id', adminController.deleteProduct);

// Order Management
router.get('/orders', adminController.getAdminOrders);
router.get('/orders/:id', adminController.getOrderDetails);
router.put('/orders/:id/status', adminController.updateOrderStatus);

// Category Management
router.get('/categories', adminController.getCategories);
router.post('/categories', adminController.addCategory);
router.put('/categories/:id', adminController.updateCategory);
router.delete('/categories/:id', adminController.deleteCategory);

// Banner Management
router.get('/banners', adminController.getBanners);
router.post('/banners', adminController.addBanner);
router.put('/banners/:id', adminController.updateBanner);
router.delete('/banners/:id', adminController.deleteBanner);

// Commission Management
router.get('/commissions', adminController.getCommissionSettings);
router.put('/commissions', adminController.updateCommissionSettings);
router.get('/commissions/vendors', adminController.getVendorCommissions);
router.put('/commissions/vendors/:vendorId', adminController.updateVendorCommission);

// Reports
router.get('/reports/orders', adminController.getOrderReports);
router.get('/reports/payments', adminController.getPaymentReports);

// Settings
router.get('/settings', adminController.getSettings);
router.put('/settings', adminController.updateSettings);

module.exports = router;
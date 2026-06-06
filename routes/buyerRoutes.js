const express = require('express');
const router = express.Router();
const { 
    getAllBuyers, 
    getBuyerProfile, 
    updateBuyerProfile,
    getCategories,
    getSubcategories,
    getCategoryById,
    getProducts,
    getProductById,
    getProductsByCategory,
    getNotifications,
    markNotificationAsRead,
} = require('../controllers/buyerController');
const { protect, authorize } = require('../middleware/authMiddleware');
const db = require('../config/db');

// ============ BUYER ROUTES ============

// Get all buyers (Admin only)
router.get('/', protect, authorize('admin'), getAllBuyers);

// Get buyer profile (Buyer only)
router.get('/profile', protect, authorize('buyer'), getBuyerProfile);

// Update buyer profile (Buyer only)
router.put('/profile', protect, authorize('buyer'), updateBuyerProfile);

// ============ CATEGORY ROUTES (Public) ============

// Get all categories
router.get('/categories', getCategories);

// Get category by ID
router.get('/categories/:id', getCategoryById);

// Get subcategories by category ID
router.get('/categories/:categoryId/subcategories', getSubcategories);

// ============ PRODUCT ROUTES (Public) ============

// Get all products with filters
router.get('/products', getProducts);

// Get single product by ID
router.get('/products/:id', getProductById);

// Get products by category
router.get('/products/category/:categoryId', getProductsByCategory);

// ============ NOTIFICATION ROUTES ============

// Get notifications
router.get('/notifications', protect, authorize('buyer'), getNotifications);

// Mark notification as read
router.put('/notifications/:id/read', protect, authorize('buyer'), markNotificationAsRead);

// ============ URGENT REQUIREMENT ROUTE ============

// Submit urgent requirement
router.post('/urgent-requirement', protect, async (req, res) => {
  try {
    const {
      productId,
      productName,
      productPrice,
      productImage,
      vendorId,
      vendorName,
      customerName,
      customerEmail,
      customerPhone,
      quantity,
      message
    } = req.body;
    
    const userId = req.user.id;
    
    // Save to database
    const [result] = await db.execute(
      `INSERT INTO urgent_requirements 
      (user_id, product_id, product_name, product_price, product_image, 
       vendor_id, vendor_name, customer_name, customer_email, customer_phone, 
       quantity, message, status, created_at) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NOW())`,
      [userId, productId, productName, productPrice, productImage,
       vendorId, vendorName, customerName, customerEmail, customerPhone,
       quantity, message]
    );
    
    // Create notification for vendor
    if (vendorId) {
      await db.execute(
        `INSERT INTO notifications 
        (user_id, user_type, title, message, type, is_read, created_at) 
        VALUES (?, 'vendor', ?, ?, 'urgent_requirement', false, NOW())`,
        [vendorId, 
         `Urgent Requirement for ${productName}`,
         `${customerName} urgently needs ${quantity} x ${productName}. Contact: ${customerPhone}`]
      );
    }
    
    // Create notification for admin
    await db.execute(
      `INSERT INTO notifications 
      (user_id, user_type, title, message, type, is_read, created_at) 
      VALUES (1, 'admin', 'New Urgent Requirement', 
       '${customerName} urgently needs ${quantity} x ${productName} from ${vendorName || 'Vendor'}', 
       'urgent_requirement', false, NOW())`
    );
    
    res.json({
      success: true,
      message: 'Urgent requirement submitted successfully',
      data: { id: result.insertId }
    });
    
  } catch (error) {
    console.error('Urgent requirement error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

module.exports = router;
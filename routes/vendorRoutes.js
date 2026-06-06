const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../config/db');
const {
    getAllVendors,
    getVendorProfile,
    updateVendorProfile,
    approveVendor,
    rejectVendor,
    suspendVendor,
    activateVendor,
    getVendorStats,
    getVendorOrders,
    getRecentOrders,        // ✅ আছে
    getOrderDetail,         // ✅ এই ফাংশনটি কন্ট্রোলারে থাকতে হবে
    updateOrderStatus,
    getVendorProducts,
    addProduct,
    updateProduct,
    deleteProduct,
    updateProductStock,
    getLowStockProducts,
    verifyGST,
    getVendorAnalytics,
    getVendorNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    deleteNotification,
    uploadCatalog,
    getVendorCommissions,
    getVendorDetails,
    getAllCategories,
    getSubcategoriesByCategory,
    getProductById,
} = require('../controllers/vendorController');
const { protect, authorize } = require('../middleware/authMiddleware');

// ✅ Ensure uploads directory exists
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log('✅ Uploads directory created at:', uploadDir);
}

// ✅ Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        console.log('📁 Saving file to:', uploadDir);
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        const filename = uniqueSuffix + ext;
        console.log('📄 Generated filename:', filename);
        cb(null, filename);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
        cb(null, true);
    } else {
        console.log('❌ File rejected:', file.originalname, 'Type:', file.mimetype);
        cb(new Error('Only image files are allowed (jpeg, jpg, png, gif, webp)'));
    }
};

const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: { 
        fileSize: 5 * 1024 * 1024,
        files: 10
    }
});

// ============ ADMIN ROUTES ============
router.get('/', protect, authorize('admin'), getAllVendors);
router.get('/:id/details', protect, authorize('admin'), getVendorDetails);
router.post('/:id/approve', protect, authorize('admin'), approveVendor);
router.post('/:id/reject', protect, authorize('admin'), rejectVendor);
router.post('/:id/suspend', protect, authorize('admin'), suspendVendor);
router.post('/:id/activate', protect, authorize('admin'), activateVendor);

// ============ VENDOR ROUTES ============
// Profile
router.get('/profile', protect, authorize('vendor'), getVendorProfile);
router.put('/profile', protect, authorize('vendor'), updateVendorProfile);

// Categories (Public)
router.get('/categories', getAllCategories);
router.get('/categories/:categoryId/subcategories', getSubcategoriesByCategory);

// Stats & Analytics
router.get('/stats', protect, authorize('vendor'), getVendorStats);
router.get('/analytics', protect, authorize('vendor'), getVendorAnalytics);
router.get('/commissions', protect, authorize('vendor'), getVendorCommissions);

// ✅ Earnings route - এই রুটটি যোগ করুন
// Vendor Earnings Route (সংশোধিত - vendor_id ছাড়া)
// ব্যাকএন্ডে - এই রাউটটি ব্যবহার করুন
router.get('/earnings', protect, authorize('vendor'), async (req, res) => {
  try {
    const vendorId = req.user.id;
    
    console.log('Fetching earnings for vendor:', vendorId);
    
    // 1. মোট আয় (ডেলিভারি হওয়া অর্ডার থেকে)
    const [totalResult] = await db.execute(
      `SELECT COALESCE(SUM(oi.price * oi.quantity), 0) as total
       FROM order_items oi
       JOIN orders o ON oi.order_id = o.id
       WHERE oi.vendor_id = ? AND o.status = 'delivered'`,
      [vendorId]
    );
    
    // 2. পেন্ডিং আয় (শিপ্পড/প্রসেসিং অর্ডার থেকে)
    const [pendingResult] = await db.execute(
      `SELECT COALESCE(SUM(oi.price * oi.quantity), 0) as pending
       FROM order_items oi
       JOIN orders o ON oi.order_id = o.id
       WHERE oi.vendor_id = ? AND o.status IN ('processing', 'shipped')`,
      [vendorId]
    );
    
    // 3. মোট কমিশন (অ্যাডমিনের জন্য)
    const [commissionResult] = await db.execute(
      `SELECT COALESCE(SUM(commission_earned), 0) as total_commission
       FROM orders
       WHERE vendor_id = ? AND status = 'delivered'`,
      [vendorId]
    );
    
    // 4. ইতিমধ্যে উত্তোলন করা টাকা
    const [withdrawnResult] = await db.execute(
      `SELECT COALESCE(SUM(amount), 0) as withdrawn
       FROM withdrawals
       WHERE vendor_id = ? AND status = 'completed'`,
      [vendorId]
    );
    
    const totalEarnings = parseFloat(totalResult[0].total) || 0;
    const pendingEarnings = parseFloat(pendingResult[0].pending) || 0;
    const totalCommission = parseFloat(commissionResult[0].total_commission) || 0;
    const withdrawnAmount = parseFloat(withdrawnResult[0].withdrawn) || 0;
    
    // ভেন্ডর পাবে: মোট আয় - কমিশন - ইতিমধ্যে উত্তোলন করা টাকা
    const netEarnings = totalEarnings - totalCommission;
    const withdrawable = netEarnings - withdrawnAmount;
    
    console.log('Calculated Earnings:', {
      totalEarnings,
      pendingEarnings,
      totalCommission,
      withdrawnAmount,
      netEarnings,
      withdrawable
    });
    
    // 5. লেনদেনের ইতিহাস
    const [transactions] = await db.execute(
      `SELECT 
        o.order_id,
        o.created_at as date,
        oi.quantity,
        oi.price,
        (oi.price * oi.quantity) as amount,
        o.commission_earned as commission,
        p.name as product_name,
        'sale' as type
       FROM order_items oi
       JOIN orders o ON oi.order_id = o.id
       JOIN products p ON oi.product_id = p.id
       WHERE oi.vendor_id = ? AND o.status = 'delivered'
       ORDER BY o.created_at DESC
       LIMIT 20`,
      [vendorId]
    );
    
    // 6. উইথড্র লেনদেন
    const [withdrawals] = await db.execute(
      `SELECT 
        created_at as date,
        amount,
        'withdrawal' as type,
        status
       FROM withdrawals
       WHERE vendor_id = ? AND status IN ('completed', 'pending')
       ORDER BY created_at DESC
       LIMIT 10`,
      [vendorId]
    );
    
    const allTransactions = [...transactions, ...withdrawals].sort((a, b) => 
      new Date(b.date) - new Date(a.date)
    );
    
    res.json({
      success: true,
      data: {
        total: totalEarnings,
        pending: pendingEarnings,
        withdrawable: withdrawable,
        commission: totalCommission,
        transactions: allTransactions
      }
    });
    
  } catch (error) {
    console.error('Earnings error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ✅ Withdrawal request route
router.post('/withdraw', protect, authorize('vendor'), async (req, res) => {
    try {
        const db = require('../config/db');
        const { amount } = req.body;
        const vendorId = req.user.id;
        
        if (!amount || amount <= 0) {
            return res.status(400).json({ success: false, error: 'Invalid amount' });
        }
        
        // Check if vendor has enough balance
        const [earningsResult] = await db.query(
            `SELECT COALESCE(SUM(commission), 0) as total 
             FROM orders 
             WHERE vendor_id = ? AND status = 'delivered'`,
            [vendorId]
        );
        
        const [withdrawnResult] = await db.query(
            `SELECT COALESCE(SUM(amount), 0) as withdrawn 
             FROM withdrawals 
             WHERE vendor_id = ? AND status = 'completed'`,
            [vendorId]
        );
        
        const available = parseFloat(earningsResult[0]?.total || 0) - parseFloat(withdrawnResult[0]?.withdrawn || 0);
        
        if (amount > available) {
            return res.status(400).json({ success: false, error: 'Insufficient balance' });
        }
        
        // Create withdrawal request
        await db.query(
            `INSERT INTO withdrawals (vendor_id, amount, status, created_at) 
             VALUES (?, ?, 'pending', NOW())`,
            [vendorId, amount]
        );
        
        // Create transaction record
        await db.query(
            `INSERT INTO transactions (vendor_id, amount, type, description, created_at) 
             VALUES (?, ?, 'debit', 'Withdrawal request', NOW())`,
            [vendorId, amount]
        );
        
        res.json({ success: true, message: 'Withdrawal request submitted successfully' });
    } catch (error) {
        console.error('Withdrawal error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ✅ Orders (সঠিক ক্রমে রাখা হয়েছে)
router.get('/orders', protect, authorize('vendor'), getVendorOrders);
router.get('/orders/recent', protect, authorize('vendor'), getRecentOrders);
router.get('/orders/:orderId', protect, authorize('vendor'), getOrderDetail);
router.patch('/orders/:orderId/status', protect, authorize('vendor'), updateOrderStatus);

// Products
router.get('/products', protect, authorize('vendor'), getVendorProducts);
router.get('/products/low-stock', protect, authorize('vendor'), getLowStockProducts);
router.get('/products/:productId', protect, authorize('vendor'), getProductById);
router.post('/products', protect, authorize('vendor'), upload.array('images', 10), addProduct);
router.put('/products/:productId', protect, authorize('vendor'), upload.array('images', 10), updateProduct);
router.delete('/products/:productId', protect, authorize('vendor'), deleteProduct);
router.patch('/products/:productId/stock', protect, authorize('vendor'), updateProductStock);

// GST Verification
router.post('/verify-gst', protect, authorize('vendor'), verifyGST);

// Notifications
router.get('/notifications', protect, authorize('vendor'), getVendorNotifications);
router.patch('/notifications/read-all', protect, authorize('vendor'), markAllNotificationsRead);
router.patch('/notifications/:notificationId/read', protect, authorize('vendor'), markNotificationRead);
router.delete('/notifications/:notificationId', protect, authorize('vendor'), deleteNotification);

// Catalog Upload
router.post('/upload-catalog', protect, authorize('vendor'), upload.single('catalog'), uploadCatalog);

// ✅ Debug route
router.get('/debug/images', (req, res) => {
    const uploadDir = path.join(__dirname, '../uploads');
    
    fs.readdir(uploadDir, (err, files) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({
            success: true,
            uploadPath: uploadDir,
            fileCount: files.length,
            files: files,
            imageUrls: files.map(f => `http://localhost:5000/uploads/${f}`)
        });
    });
});

module.exports = router;
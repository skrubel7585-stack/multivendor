const Vendor = require('../models/Vendor');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Notification = require('../models/Notification');
const fs = require('fs');
const path = require('path');
const db = require('../config/db');

// ============ DATABASE HELPER ============
const query = async (sql, params = []) => {
    try {
        const [rows] = await db.execute(sql, params);
        return rows;
    } catch (error) {
        console.error('Query error:', error);
        throw error;
    }
};

// ============ ADMIN CONTROLLERS ============

// Get all vendors (Admin only)
const getAllVendors = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        const { status, search } = req.query;
        
        const vendors = await Vendor.getAll(limit, offset, status, search);
        const total = await Vendor.getCount(status, search);
        
        res.json({
            success: true,
            data: vendors,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Get all vendors error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Get vendor details by ID (Admin)
const getVendorDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const vendor = await Vendor.findById(id);
        
        if (!vendor) {
            return res.status(404).json({ success: false, message: 'Vendor not found' });
        }
        
        const stats = await Vendor.getStats(id);
        const recentProducts = await Product.getByVendor(id, 5, 0);
        const recentOrders = await Order.getByVendor(id, 5, 0);
        
        res.json({
            success: true,
            data: {
                ...vendor,
                stats,
                recentProducts,
                recentOrders
            }
        });
    } catch (error) {
        console.error('Get vendor details error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Approve vendor (Admin)
const approveVendor = async (req, res) => {
    try {
        const { id } = req.params;
        
        await Vendor.updateStatus(id, 'active', null);
        
        await Notification.create({
            user_id: id,
            user_type: 'vendor',
            title: '✅ Account Approved',
            message: 'Congratulations! Your vendor account has been approved. You can now start selling your products.',
            type: 'vendor'
        });
        
        res.json({ success: true, message: 'Vendor approved successfully' });
    } catch (error) {
        console.error('Approve vendor error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Reject vendor (Admin)
const rejectVendor = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        
        await Vendor.updateStatus(id, 'rejected', reason);
        
        await Notification.create({
            user_id: id,
            user_type: 'vendor',
            title: '❌ Account Rejected',
            message: `Your vendor application has been rejected. Reason: ${reason || 'Please contact support for more information.'}`,
            type: 'vendor'
        });
        
        res.json({ success: true, message: 'Vendor rejected successfully' });
    } catch (error) {
        console.error('Reject vendor error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Suspend vendor (Admin)
const suspendVendor = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        
        await Vendor.updateStatus(id, 'suspended', reason);
        
        await Notification.create({
            user_id: id,
            user_type: 'vendor',
            title: '⚠️ Account Suspended',
            message: `Your account has been suspended. Reason: ${reason || 'Please contact support for more information.'}`,
            type: 'vendor'
        });
        
        res.json({ success: true, message: 'Vendor suspended successfully' });
    } catch (error) {
        console.error('Suspend vendor error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Activate vendor (Admin)
const activateVendor = async (req, res) => {
    try {
        const { id } = req.params;
        
        await Vendor.updateStatus(id, 'active', null);
        
        await Notification.create({
            user_id: id,
            user_type: 'vendor',
            title: '✅ Account Activated',
            message: 'Your account has been activated. You can now continue selling.',
            type: 'vendor'
        });
        
        res.json({ success: true, message: 'Vendor activated successfully' });
    } catch (error) {
        console.error('Activate vendor error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// ============ VENDOR PROFILE CONTROLLERS ============

// Get vendor profile
const getVendorProfile = async (req, res) => {
    try {
        const vendor = await Vendor.findByUserId(req.user.id);
        
        if (!vendor) {
            return res.status(404).json({ success: false, message: 'Vendor not found' });
        }
        
        res.json({
            success: true,
            data: vendor
        });
    } catch (error) {
        console.error('Get vendor profile error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Update vendor profile
const updateVendorProfile = async (req, res) => {
    try {
        const allowedUpdates = [
            'company_name', 'gst_number', 'pan_number', 'address',
            'city', 'state', 'pincode', 'phone', 'website', 'business_type'
        ];
        
        const updates = {};
        allowedUpdates.forEach(field => {
            if (req.body[field] !== undefined) {
                updates[field] = req.body[field];
            }
        });
        
        await Vendor.update(req.user.id, updates);
        
        const updatedVendor = await Vendor.findByUserId(req.user.id);
        
        res.json({
            success: true,
            data: updatedVendor,
            message: 'Profile updated successfully'
        });
    } catch (error) {
        console.error('Update vendor profile error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// ============ STATS & ANALYTICS CONTROLLERS ============

// Get vendor stats
// getVendorStats ফাংশনটিও আপডেট করুন
const getVendorStats = async (req, res) => {
  try {
    const vendorId = req.user.id;
    
    console.log(`📊 Fetching stats for vendor: ${vendorId}`);
    
    // Total Products
    const [productResult] = await db.execute(
      'SELECT COUNT(*) as total FROM products WHERE vendor_id = ?',
      [vendorId]
    );
    
    // Total Orders & Pending Orders
    const [orderResult] = await db.execute(
      `
      SELECT 
          COUNT(DISTINCT o.id) as totalOrders,
          SUM(CASE WHEN o.status = 'pending' THEN 1 ELSE 0 END) as pendingOrders,
          COALESCE(SUM(oi.price * oi.quantity), 0) as totalEarnings
      FROM orders o
      INNER JOIN order_items oi ON o.id = oi.order_id
      WHERE oi.vendor_id = ?
      `,
      [vendorId]
    );

    // Pending Earnings (orders that are not yet delivered)
    const [pendingEarningsResult] = await db.execute(
      `
      SELECT COALESCE(SUM(oi.price * oi.quantity), 0) as pendingEarnings
      FROM orders o
      INNER JOIN order_items oi ON o.id = oi.order_id
      WHERE oi.vendor_id = ? AND o.status IN ('pending', 'processing', 'shipped')
      `,
      [vendorId]
    );
    
    // Low Stock Products (stock < 10)
    const [lowStockResult] = await db.execute(
      'SELECT COUNT(*) as lowStock FROM products WHERE vendor_id = ? AND stock < 10',
      [vendorId]
    );
    
    // Total Views (from products)
    const [viewsResult] = await db.execute(
      'SELECT COALESCE(SUM(views), 0) as totalViews FROM products WHERE vendor_id = ?',
      [vendorId]
    );
    
    const stats = {
      totalProducts: productResult[0]?.total || 0,
      totalOrders: orderResult[0]?.totalOrders || 0,
      totalEarnings: parseFloat(orderResult[0]?.totalEarnings) || 0,
      pendingOrders: orderResult[0]?.pendingOrders || 0,
      lowStockProducts: lowStockResult[0]?.lowStock || 0,
      totalViews: viewsResult[0]?.totalViews || 0,
    };
    
    console.log('📊 Stats calculated:', stats);
    
    res.json({
      success: true,
      data: stats
    });
    
  } catch (error) {
    console.error('❌ Get vendor stats error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// Get vendor analytics
const getVendorAnalytics = async (req, res) => {
    try {
        const { period = 'month' } = req.query;
        const analytics = await Vendor.getAnalytics(req.user.id, period);
        
        res.json({
            success: true,
            data: analytics
        });
    } catch (error) {
        console.error('Get vendor analytics error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Get vendor commissions
const getVendorCommissions = async (req, res) => {
    try {
        const commissions = await Vendor.getCommissions(req.user.id);
        
        res.json({
            success: true,
            data: commissions
        });
    } catch (error) {
        console.error('Get vendor commissions error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// ============ EARNINGS CONTROLLER ============

// Get vendor earnings
const getVendorEarnings = async (req, res) => {
    try {
        const vendorId = req.user.id;
        
        // Total earnings from delivered orders
        const [totalResult] = await db.execute(`
            SELECT COALESCE(SUM(oi.price * oi.quantity * 0.85), 0) as total
            FROM orders o
            INNER JOIN order_items oi ON o.id = oi.order_id
            INNER JOIN products p ON oi.product_id = p.id
            WHERE p.vendor_id = ? AND o.status = 'delivered'
        `, [vendorId]);
        
        // Pending earnings
        const [pendingResult] = await db.execute(`
            SELECT COALESCE(SUM(oi.price * oi.quantity * 0.85), 0) as pending
            FROM orders o
            INNER JOIN order_items oi ON o.id = oi.order_id
            INNER JOIN products p ON oi.product_id = p.id
            WHERE p.vendor_id = ? AND o.status IN ('pending', 'processing', 'shipped')
        `, [vendorId]);
        
        // Withdrawn amount
        const [withdrawnResult] = await db.execute(`
            SELECT COALESCE(SUM(amount), 0) as withdrawn
            FROM withdrawals
            WHERE vendor_id = ? AND status = 'completed'
        `, [vendorId]);
        
        const total = parseFloat(totalResult[0]?.total || 0);
        const pending = parseFloat(pendingResult[0]?.pending || 0);
        const withdrawable = total - parseFloat(withdrawnResult[0]?.withdrawn || 0);
        
        // Recent transactions
        const [transactions] = await db.execute(`
            SELECT id, created_at as date, description, amount, type
            FROM transactions
            WHERE vendor_id = ?
            ORDER BY created_at DESC
            LIMIT 20
        `, [vendorId]);
        
        res.json({
            success: true,
            data: {
                total: total,
                pending: pending,
                withdrawable: withdrawable,
                transactions: transactions.map(t => ({
                    id: t.id,
                    date: t.date,
                    description: t.description,
                    amount: parseFloat(t.amount),
                    type: t.type
                }))
            }
        });
    } catch (error) {
        console.error('Get vendor earnings error:', error);
        // Return dummy data for development
        res.json({
            success: true,
            data: {
                total: 12500,
                pending: 3500,
                withdrawable: 9000,
                transactions: [
                    { id: 1, date: new Date().toISOString(), description: "Order #ORD123", amount: 2500, type: "credit" },
                    { id: 2, date: new Date(Date.now() - 86400000).toISOString(), description: "Order #ORD122", amount: 1800, type: "credit" },
                    { id: 3, date: new Date(Date.now() - 172800000).toISOString(), description: "Commission Credit", amount: 500, type: "credit" }
                ]
            }
        });
    }
};

// Request withdrawal
const requestWithdrawal = async (req, res) => {
    try {
        const { amount } = req.body;
        const vendorId = req.user.id;
        
        if (!amount || amount <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid amount' });
        }
        
        // Check balance
        const [totalResult] = await db.execute(`
            SELECT COALESCE(SUM(oi.price * oi.quantity * 0.85), 0) as total
            FROM orders o
            INNER JOIN order_items oi ON o.id = oi.order_id
            INNER JOIN products p ON oi.product_id = p.id
            WHERE p.vendor_id = ? AND o.status = 'delivered'
        `, [vendorId]);
        
        const [withdrawnResult] = await db.execute(`
            SELECT COALESCE(SUM(amount), 0) as withdrawn
            FROM withdrawals
            WHERE vendor_id = ? AND status = 'completed'
        `, [vendorId]);
        
        const available = parseFloat(totalResult[0]?.total || 0) - parseFloat(withdrawnResult[0]?.withdrawn || 0);
        
        if (amount > available) {
            return res.status(400).json({ success: false, message: 'Insufficient balance' });
        }
        
        // Create withdrawal request
        await db.execute(
            `INSERT INTO withdrawals (vendor_id, amount, status, created_at) 
             VALUES (?, ?, 'pending', NOW())`,
            [vendorId, amount]
        );
        
        // Create transaction record
        await db.execute(
            `INSERT INTO transactions (vendor_id, amount, type, description, created_at) 
             VALUES (?, ?, 'debit', 'Withdrawal request', NOW())`,
            [vendorId, amount]
        );
        
        res.json({ success: true, message: 'Withdrawal request submitted successfully' });
    } catch (error) {
        console.error('Withdrawal error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// ============ ORDER CONTROLLERS ============

// Get vendor orders with pagination
const getVendorOrders = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        const { status } = req.query;
        
        const orders = await Order.getByVendor(req.user.id, limit, offset, status);
        const total = await Order.getCountByVendor(req.user.id, status);
        
        res.json({
            success: true,
            data: orders,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Get vendor orders error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Get recent orders for dashboard
// getRecentOrders ফাংশনটি আপডেট করুন
const getRecentOrders = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const limit = parseInt(req.query.limit) || 5;
    
    console.log(`🔍 Fetching recent ${limit} orders for vendor: ${vendorId}`);
    
    const [orders] = await db.execute(
      `
      SELECT 
          o.id,
          o.order_id as orderNumber,
          o.total,
          o.status,
          o.created_at as date,
          COALESCE(b.full_name, 'Customer') as customerName
      FROM orders o
      INNER JOIN order_items oi ON o.id = oi.order_id
      INNER JOIN products p ON oi.product_id = p.id
      LEFT JOIN buyers b ON o.user_id = b.user_id
      WHERE p.vendor_id = ?
      GROUP BY o.id
      ORDER BY o.created_at DESC
      LIMIT ?
      `,
      [vendorId, limit]
    );
    
    console.log(`✅ Found ${orders.length} recent orders`);
    
    res.json({
      success: true,
      data: orders
    });
    
  } catch (error) {
    console.error('❌ Get recent orders error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// Get single order details
const getOrderDetail = async (req, res) => {
    try {
        const vendorId = req.user.id;
        const orderId = req.params.orderId;
        
        console.log(`🔍 Fetching order detail for ID: ${orderId}, vendor: ${vendorId}`);
        
        // Get order main info with customer details
        const [orders] = await db.execute(`
            SELECT 
                o.id,
                o.order_id as orderNumber,
                o.total,
                o.status,
                o.payment_status,
                o.payment_method,
                o.shipping_address,
                o.created_at as createdAt,
                COALESCE(u.name, 'Customer') as customer_name,
                COALESCE(u.email, 'N/A') as customer_email,
                COALESCE(u.phone, 'N/A') as customer_phone,
                oa.address_line1,
                oa.address_line2,
                oa.city,
                oa.state,
                oa.pincode
            FROM orders o
            INNER JOIN order_items oi ON o.id = oi.order_id
            INNER JOIN products p ON oi.product_id = p.id
            LEFT JOIN users u ON o.user_id = u.id
            LEFT JOIN order_addresses oa ON o.id = oa.order_id
            WHERE p.vendor_id = ? AND o.id = ?
            GROUP BY o.id
        `, [vendorId, orderId]);
        
        if (orders.length === 0) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }
        
        // Get order items
        const [items] = await db.execute(`
            SELECT 
                oi.id,
                oi.product_id,
                oi.product_name as name,
                oi.quantity,
                oi.price,
                (oi.price * oi.quantity) as total
            FROM order_items oi
            WHERE oi.order_id = ?
        `, [orderId]);
        
        const order = orders[0];
        
        const response = {
            success: true,
            data: {
                id: order.id,
                orderNumber: order.orderNumber || `ORD_${order.id}`,
                status: order.status || 'pending',
                total: parseFloat(order.total) || 0,
                payment_status: order.payment_status,
                payment_method: order.payment_method,
                createdAt: order.createdAt,
                customer: {
                    name: order.customer_name || 'N/A',
                    email: order.customer_email || 'N/A',
                    phone: order.customer_phone || 'N/A'
                },
                shipping: {
                    address: order.address_line1 || order.shipping_address || 'N/A',
                    address_line2: order.address_line2 || '',
                    city: order.city || 'N/A',
                    state: order.state || 'N/A',
                    pincode: order.pincode || 'N/A'
                },
                items: items.map(item => ({
                    id: item.id,
                    productId: item.product_id,
                    name: item.name || 'Product',
                    quantity: parseInt(item.quantity) || 0,
                    price: parseFloat(item.price) || 0,
                    total: parseFloat(item.total) || 0
                }))
            }
        };
        
        console.log(`✅ Order detail fetched successfully`);
        res.json(response);
        
    } catch (error) {
        console.error('❌ Get order detail error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error'
        });
    }
};

// Update order status with notification
const updateOrderStatus = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { status } = req.body;
        const vendorId = req.user.id;
        
        const [check] = await db.execute(`
            SELECT o.id, o.user_id as customer_id, o.order_id as order_number, o.total
            FROM orders o
            INNER JOIN order_items oi ON o.id = oi.order_id
            INNER JOIN products p ON oi.product_id = p.id
            WHERE o.id = ? AND p.vendor_id = ?
        `, [orderId, vendorId]);
        
        if (check.length === 0) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }
        
        await db.execute(
            'UPDATE orders SET status = ? WHERE id = ?',
            [status, orderId]
        );
        
        const statusMessages = {
            'processing': '🔄 Your order is being processed',
            'shipped': '🚚 Your order has been shipped',
            'delivered': '✅ Your order has been delivered',
            'cancelled': '❌ Your order has been cancelled'
        };
        
        await Notification.create({
            user_id: check[0].customer_id,
            user_type: 'buyer',
            title: `Order ${status.toUpperCase()}`,
            message: `${statusMessages[status] || `Your order #${check[0].order_number} status is now ${status}`}. Total: ₹${parseFloat(check[0].total).toFixed(2)}`,
            type: 'order'
        });
        
        res.json({
            success: true,
            message: 'Order status updated successfully'
        });
    } catch (error) {
        console.error('Update order status error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// ============ PRODUCT CONTROLLERS ============

// Get vendor products
const getVendorProducts = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        const { status } = req.query;
        
        const products = await Product.getByVendor(req.user.id, limit, offset, status);
        const total = await Product.getCountByVendor(req.user.id, status);
        
        res.json({
            success: true,
            data: products,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Get vendor products error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Get all categories
const getAllCategories = async (req, res) => {
    try {
        const { status, limit = 100 } = req.query;
        
        let query = `
            SELECT 
                id,
                name,
                slug,
                image,
                status,
                \`order\`,
                created_at,
                updated_at
            FROM categories
            WHERE 1=1
        `;
        
        const params = [];
        
        if (status) {
            query += ` AND status = ?`;
            params.push(status);
        }
        
        query += ` ORDER BY \`order\` ASC, name ASC LIMIT ?`;
        params.push(parseInt(limit));
        
        const [categories] = await db.execute(query, params);
        
        const categoriesWithSubcategories = await Promise.all(categories.map(async (category) => {
            const [subcategories] = await db.execute(
                `SELECT id, name, slug, status 
                 FROM subcategories 
                 WHERE category_id = ? AND status = 'active'
                 ORDER BY name ASC`,
                [category.id]
            );
            return {
                ...category,
                subcategories: subcategories
            };
        }));
        
        res.json({
            success: true,
            data: categoriesWithSubcategories,
            count: categoriesWithSubcategories.length
        });
    } catch (error) {
        console.error('Get categories error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Get subcategories by category ID
const getSubcategoriesByCategory = async (req, res) => {
    try {
        const { categoryId } = req.params;
        
        const [subcategories] = await db.execute(
            `SELECT id, name, slug, category_id, status, created_at
             FROM subcategories 
             WHERE category_id = ? AND status = 'active'
             ORDER BY name ASC`,
            [categoryId]
        );
        
        res.json({
            success: true,
            data: subcategories,
            count: subcategories.length
        });
    } catch (error) {
        console.error('Get subcategories error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Add product with multiple images
const addProduct = async (req, res) => {
    try {
        console.log('Received product data:', req.body);
        console.log('Files:', req.files ? req.files.length : 0, 'images received');
        
        const getJSONData = (data) => {
            if (!data) return null;
            if (typeof data === 'object' && data !== null) return data;
            if (typeof data === 'string') {
                try {
                    return JSON.parse(data);
                } catch (e) {
                    console.error('JSON parse error:', e.message);
                    return null;
                }
            }
            return null;
        };
        
        let specifications = getJSONData(req.body.specifications);
        let machineCompatibility = getJSONData(req.body.machine_compatibility);
        
        const productData = {
            vendor_id: req.user.id,
            name: req.body.name,
            description: req.body.description || '',
            price: parseFloat(req.body.price),
            compare_price: req.body.compare_price ? parseFloat(req.body.compare_price) : parseFloat(req.body.price),
            sku: req.body.sku || req.body.part_number || `SKU_${Date.now()}`,
            category_id: parseInt(req.body.category_id),
            subcategory_id: req.body.subcategory_id ? parseInt(req.body.subcategory_id) : null,
            stock: parseInt(req.body.stock) || 0,
            moq: parseInt(req.body.moq) || 1,
            delivery_time: req.body.delivery_time || '',
            specifications: specifications,
            machine_compatibility: machineCompatibility,
            gst: parseFloat(req.body.gst) || 0,
            size: req.body.size || '',
            capacity: req.body.capacity || '',
            city: req.body.city || '',
            brand_name: req.body.brand_name || '',
            status: 'pending'
        };
        
        if (req.files && req.files.length > 0) {
            const imageUrls = req.files.map(file => `/uploads/${file.filename}`);
            productData.images = imageUrls;
            productData.image = imageUrls[0];
            console.log(`✅ ${imageUrls.length} images uploaded`);
        }
        
        const productId = await Product.create(productData);
        const product = await Product.findById(productId);
        
        res.status(201).json({
            success: true,
            data: product,
            message: 'Product added successfully'
        });
    } catch (error) {
        console.error('❌ Add product error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error: ' + error.message 
        });
    }
};

// Get single product by ID
const getProductById = async (req, res) => {
    try {
        const { productId } = req.params;
        
        const [products] = await db.execute(
            `SELECT p.*, 
                    c.name as category_name,
                    s.name as subcategory_name
             FROM products p
             LEFT JOIN categories c ON p.category_id = c.id
             LEFT JOIN subcategories s ON p.subcategory_id = s.id
             WHERE p.id = ? AND p.vendor_id = ?`,
            [productId, req.user.id]
        );
        
        if (products.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Product not found' 
            });
        }
        
        const product = products[0];
        
        // Parse JSON fields
        product.images = product.images ? (typeof product.images === 'string' ? JSON.parse(product.images) : product.images) : [];
        product.specifications = product.specifications ? (typeof product.specifications === 'string' ? JSON.parse(product.specifications) : product.specifications) : [];
        product.machine_compatibility = product.machine_compatibility ? (typeof product.machine_compatibility === 'string' ? JSON.parse(product.machine_compatibility) : product.machine_compatibility) : [];
        
        res.json({
            success: true,
            data: product
        });
        
    } catch (error) {
        console.error('❌ Error fetching product:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error: ' + error.message 
        });
    }
};

// Update product
const updateProduct = async (req, res) => {
    try {
        const { productId } = req.params;
        
        const existingProduct = await Product.findById(productId);
        if (!existingProduct || existingProduct.vendor_id !== req.user.id) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }
        
        const updateData = {
            name: req.body.name,
            description: req.body.description,
            price: req.body.price,
            compare_price: req.body.compare_price,
            sku: req.body.sku,
            category_id: req.body.category_id,
            subcategory_id: req.body.subcategory_id || null,
            stock: req.body.stock,
            moq: req.body.moq,
            delivery_time: req.body.delivery_time,
            specifications: req.body.specifications ? JSON.parse(req.body.specifications) : null,
            gst: req.body.gst,
            size: req.body.size,
            capacity: req.body.capacity,
            city: req.body.city,
            brand_name: req.body.brand_name
        };
        
        if (req.files && req.files.length > 0) {
            const newImages = req.files.map(file => `/uploads/${file.filename}`);
            let existingImages = [];
            try {
                existingImages = JSON.parse(existingProduct.images || '[]');
            } catch {
                existingImages = [];
            }
            updateData.images = JSON.stringify([...existingImages, ...newImages]);
            updateData.image = newImages[0];
        }
        
        await Product.update(productId, updateData);
        const updatedProduct = await Product.findById(productId);
        
        res.json({
            success: true,
            data: updatedProduct,
            message: 'Product updated successfully'
        });
    } catch (error) {
        console.error('Update product error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Delete product
const deleteProduct = async (req, res) => {
    try {
        const { productId } = req.params;
        
        const product = await Product.findById(productId);
        if (!product || product.vendor_id !== req.user.id) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }
        
        await Product.delete(productId);
        
        res.json({
            success: true,
            message: 'Product deleted successfully'
        });
    } catch (error) {
        console.error('Delete product error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Update product stock
const updateProductStock = async (req, res) => {
    try {
        const { productId } = req.params;
        let { quantity } = req.body;
        
        if (quantity === undefined || quantity === null) {
            return res.status(400).json({ 
                success: false, 
                message: 'Quantity is required' 
            });
        }
        
        const parsedQuantity = parseInt(quantity);
        
        if (isNaN(parsedQuantity)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Quantity must be a valid number' 
            });
        }
        
        const [products] = await db.execute(
            `SELECT id, name, stock, vendor_id 
             FROM products 
             WHERE id = ?`,
            [productId]
        );
        
        if (products.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Product not found' 
            });
        }
        
        const product = products[0];
        
        if (product.vendor_id !== req.user.id) {
            return res.status(403).json({ 
                success: false, 
                message: 'Unauthorized' 
            });
        }
        
        const currentStock = parseInt(product.stock) || 0;
        const newStock = currentStock + parsedQuantity;
        
        if (newStock < 0) {
            return res.status(400).json({ 
                success: false, 
                message: `Cannot reduce stock below zero. Current stock: ${currentStock}` 
            });
        }
        
        await db.execute(
            'UPDATE products SET stock = ? WHERE id = ? AND vendor_id = ?',
            [newStock, productId, req.user.id]
        );
        
        // Send low stock notification
        if (newStock <= 10 && newStock > 0) {
            await Notification.create({
                user_id: req.user.id,
                user_type: 'vendor',
                title: '⚠️ Low Stock Alert',
                message: `${product.name} has only ${newStock} units left.`,
                type: 'inventory'
            });
        } else if (newStock <= 0) {
            await Notification.create({
                user_id: req.user.id,
                user_type: 'vendor',
                title: '❗ Out of Stock Alert',
                message: `${product.name} is now out of stock.`,
                type: 'inventory'
            });
        }
        
        res.json({
            success: true,
            data: {
                id: parseInt(productId),
                previous_stock: currentStock,
                new_stock: newStock,
                quantity_added: parsedQuantity
            },
            message: `Stock updated successfully. New stock: ${newStock}`
        });
        
    } catch (error) {
        console.error('❌ Update stock error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error: ' + error.message 
        });
    }
};

// Get low stock products
const getLowStockProducts = async (req, res) => {
    try {
        const products = await Product.getLowStock(req.user.id);
        
        res.json({
            success: true,
            data: products
        });
    } catch (error) {
        console.error('Get low stock products error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// ============ GST VERIFICATION ============

const verifyGST = async (req, res) => {
    try {
        const { gstNumber } = req.body;
        
        const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
        const isValid = gstRegex.test(gstNumber);
        
        const gstDetails = isValid ? {
            legalName: 'Sample Business Name',
            tradeName: 'Sample Trade Name',
            constitution: 'Private Limited Company',
            state: 'Maharashtra',
            status: 'Active'
        } : null;
        
        res.json({
            success: true,
            isValid,
            gstDetails
        });
    } catch (error) {
        console.error('GST verification error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// ============ NOTIFICATION CONTROLLERS ============

const getVendorNotifications = async (req, res) => {
    try {
        const notifications = await Notification.getByUser(req.user.id, 'vendor');
        const unreadCount = await Notification.getUnreadCount(req.user.id, 'vendor');
        
        res.json({
            success: true,
            data: notifications,
            unreadCount: unreadCount,
            total: notifications.length
        });
    } catch (error) {
        console.error('Get vendor notifications error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

const markNotificationRead = async (req, res) => {
    try {
        const { notificationId } = req.params;
        
        await Notification.markAsRead(notificationId, req.user.id);
        
        res.json({
            success: true,
            message: 'Notification marked as read'
        });
    } catch (error) {
        console.error('Mark notification read error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

const markAllNotificationsRead = async (req, res) => {
    try {
        await Notification.markAllAsRead(req.user.id, 'vendor');
        
        res.json({
            success: true,
            message: 'All notifications marked as read'
        });
    } catch (error) {
        console.error('Mark all notifications read error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

const deleteNotification = async (req, res) => {
    try {
        const { notificationId } = req.params;
        
        await Notification.delete(notificationId, req.user.id);
        
        res.json({
            success: true,
            message: 'Notification deleted successfully'
        });
    } catch (error) {
        console.error('Delete notification error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// ============ CATALOG UPLOAD ============

const uploadCatalog = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }
        
        const catalogUrl = `/uploads/${req.file.filename}`;
        await Vendor.updateCatalog(req.user.id, catalogUrl);
        
        res.json({
            success: true,
            data: { catalogUrl },
            message: 'Catalog uploaded successfully'
        });
    } catch (error) {
        console.error('Upload catalog error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// ============ EXPORTS ============

module.exports = {
    // Admin
    getAllVendors,
    getVendorDetails,
    approveVendor,
    rejectVendor,
    suspendVendor,
    activateVendor,
    
    // Profile
    getVendorProfile,
    updateVendorProfile,
    
    // Stats
    getVendorStats,
    getVendorAnalytics,
    getVendorCommissions,
    
    // Earnings
    getVendorEarnings,
    requestWithdrawal,
    
    // Orders
    getVendorOrders,
    getRecentOrders,
    getOrderDetail,
    updateOrderStatus,
    
    // Products
    getVendorProducts,
    addProduct,
    updateProduct,
    deleteProduct,
    updateProductStock,
    getLowStockProducts,
    getProductById,
    
    // GST
    verifyGST,
    
    // Notifications
    getVendorNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    deleteNotification,
    
    // Catalog
    uploadCatalog,
    
    // Categories
    getAllCategories,
    getSubcategoriesByCategory
};
const express = require('express');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const db = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const vendorRoutes = require('./routes/vendorRoutes');
const buyerRoutes = require('./routes/buyerRoutes');
const adminRoutes = require('./routes/adminRoutes');
const otpRoutes = require('./routes/otpRoutes');
const OrderRoutes = require('./routes/orderRoutes');
const PaymentRoutes = require('./routes/paymentRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const cors = require('cors');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// CORS middleware
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.options('/*path', cors());

// ✅ Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_So6KmspUKegbd3',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'XXOLd8zK5xPXiqYj0Pg45M98'
});

console.log('✅ Razorpay initialized with key:', razorpay.key_id);

// Create uploads directory
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('✅ Uploads directory created');
}

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static('uploads'));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database connection test
(async () => {
    try {
        const connection = await db.getConnection();
        console.log('✅ MySQL database connected successfully');
        connection.release();
    } catch (err) {
        console.error("❌ Database not Connected", err.message);
    }
})();

// ==================== ADD MISSING COLUMNS ====================
const addMissingColumns = async () => {
    try {
        // Add vendor_id to orders table
        try {
            await db.query(`
                ALTER TABLE orders 
                ADD COLUMN IF NOT EXISTS vendor_id VARCHAR(255) AFTER user_id
            `);
            console.log('✅ vendor_id column added to orders table');
        } catch (err) {
            console.log('vendor_id column may already exist in orders');
        }

        // Add vendor_id to order_items table
        try {
            await db.query(`
                ALTER TABLE order_items 
                ADD COLUMN IF NOT EXISTS vendor_id INT AFTER product_id
            `);
            console.log('✅ vendor_id column added to order_items table');
        } catch (err) {
            console.log('vendor_id column may already exist in order_items');
        }

        // Add indexes
        try {
            await db.query(`CREATE INDEX IF NOT EXISTS idx_orders_vendor ON orders(vendor_id)`);
            await db.query(`CREATE INDEX IF NOT EXISTS idx_order_items_vendor ON order_items(vendor_id)`);
            console.log('✅ Indexes created successfully');
        } catch (err) {
            console.log('Indexes may already exist');
        }

        console.log('✅ Database schema check completed');
    } catch (error) {
        console.error('Error adding missing columns:', error);
    }
};

// Call the function
addMissingColumns();

// ==================== RAZORPAY PAYMENT ROUTES ====================

// ✅ Create Razorpay Order
app.post('/api/create-razorpay-order', async (req, res) => {
    let connection;
    try {
        const { 
            amount, 
            orderId, 
            cartItems, 
            userId, 
            customerName, 
            customerEmail, 
            customerPhone,
            shippingAddress,
            billingAddress
        } = req.body;
        
        console.log('📦 Creating Razorpay order:', { 
            amount, orderId, userId, 
            cartItems: cartItems?.length,
            shippingAddress: shippingAddress ? 'Yes' : 'No'
        });
        
        if (!amount || !orderId) {
            return res.status(400).json({ 
                success: false, 
                error: 'Amount and Order ID are required' 
            });
        }
        
        const options = {
            amount: Math.round(amount * 100),
            currency: 'INR',
            receipt: orderId,
            payment_capture: 1,
            notes: {
                order_id: orderId,
                user_id: userId || 'guest',
                cart_items: JSON.stringify(cartItems || []),
                customer_name: customerName || 'Guest',
                customer_email: customerEmail || 'guest@example.com',
                customer_phone: customerPhone || '9999999999',
                shipping_address: shippingAddress || '',
                billing_address: billingAddress || ''
            }
        };
        
        const order = await razorpay.orders.create(options);
        
        console.log('✅ Razorpay order created:', order.id);
        
        res.json({
            success: true,
            order: order,
            key_id: razorpay.key_id,
            amount: order.amount,
            currency: order.currency,
            order_id: order.id
        });
        
    } catch (error) {
        console.error('❌ Error creating Razorpay order:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message,
            details: error.error?.description || 'Failed to create order'
        });
    }
});

// ✅ Verify Razorpay Payment - Complete with vendor tracking
app.post('/api/verify-payment', async (req, res) => {
    let connection;
    try {
        const { 
            razorpay_order_id, 
            razorpay_payment_id, 
            razorpay_signature,
            user_id,
            cart_items,
            total_amount,
            shipping_address,
            billing_address,
            customer_name,
            customer_email,
            customer_phone,
            city,
            state,
            pincode
        } = req.body;
        
        console.log('🔐 Verifying payment:', { 
            razorpay_order_id, 
            razorpay_payment_id, 
            user_id,
            cart_items: cart_items?.length,
            shipping_address: shipping_address ? 'Yes' : 'No'
        });
        
        // Verify signature
        const body = razorpay_order_id + '|' + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', razorpay.key_secret)
            .update(body.toString())
            .digest('hex');
        
        if (expectedSignature !== razorpay_signature) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid payment signature' 
            });
        }
        
        connection = await db.getConnection();
        await connection.beginTransaction();
        
        console.log('✅ Payment signature verified');
        
        const razorpayOrder = await razorpay.orders.fetch(razorpay_order_id);
        const orderAmount = razorpayOrder.amount / 100;
        const finalUserID = user_id || 1;
        
        // Format shipping address
        let formattedShippingAddress = shipping_address;
        if (typeof shipping_address === 'object') {
            formattedShippingAddress = JSON.stringify(shipping_address);
        }
        
        // Generate unique order ID
        const orderId = `ORD_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        
        // Parse cart items
        let parsedCart = cart_items;
        if (typeof cart_items === 'string') {
            parsedCart = JSON.parse(cart_items);
        }
        
        // Get unique vendors from cart
        const vendorIds = new Set();
        for (const item of parsedCart) {
            const [productRows] = await connection.query(
                `SELECT vendor_id FROM products WHERE id = ?`,
                [item.id]
            );
            if (productRows.length > 0) {
                vendorIds.add(productRows[0].vendor_id);
            }
        }
        const vendorIdString = Array.from(vendorIds).join(',');
        
        // 1️⃣ Insert into orders table with vendor_id
        const [orderResult] = await connection.query(
            `INSERT INTO orders (
                order_id, user_id, vendor_id, total, amount, razorpay_order_id, 
                razorpay_payment_id, payment_method, payment_status, 
                status, shipping_address, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'razorpay', 'completed', 'processing', ?, NOW())`,
            [orderId, finalUserID, vendorIdString, orderAmount, orderAmount, razorpay_order_id, 
             razorpay_payment_id, formattedShippingAddress || null]
        );
        
        console.log('✅ Order saved with ID:', orderResult.insertId);
        if (formattedShippingAddress) {
            console.log('📦 Shipping address saved:', formattedShippingAddress);
        }
        
        // 2️⃣ Process cart items and update stock
        let totalCommission = 0;
        const vendorCommissionMap = new Map();
        
        if (parsedCart && parsedCart.length > 0) {
            for (const item of parsedCart) {
                const [productRows] = await connection.query(
                    `SELECT p.id, p.vendor_id, p.price, p.stock, p.name 
                     FROM products p WHERE p.id = ?`,
                    [item.id]
                );
                
                if (productRows.length === 0) {
                    throw new Error(`Product not found: ${item.id}`);
                }
                
                const product = productRows[0];
                
                if (product.stock < item.quantity) {
                    throw new Error(`Insufficient stock for ${product.name}. Available: ${product.stock}`);
                }
                
                const newStock = product.stock - item.quantity;
                await connection.query(
                    'UPDATE products SET stock = ?, updated_at = NOW() WHERE id = ?',
                    [newStock, item.id]
                );
                
                // ✅ Insert with vendor_id
                await connection.query(
                    `INSERT INTO order_items (order_id, product_id, vendor_id, quantity, price, created_at) 
                     VALUES (?, ?, ?, ?, ?, NOW())`,
                    [orderResult.insertId, item.id, product.vendor_id, item.quantity, product.price]
                );
                
                // Calculate commission
                const [commissionSetting] = await connection.query(
                    'SELECT defaultRate FROM commission_settings WHERE id = 1'
                );
                const commissionRate = commissionSetting[0]?.defaultRate || 10;
                const itemCommission = (product.price * item.quantity * commissionRate) / 100;
                totalCommission += itemCommission;
                
                if (vendorCommissionMap.has(product.vendor_id)) {
                    vendorCommissionMap.set(product.vendor_id, 
                        vendorCommissionMap.get(product.vendor_id) + itemCommission
                    );
                } else {
                    vendorCommissionMap.set(product.vendor_id, itemCommission);
                }
                
                // Low stock notification
                if (newStock <= 5) {
                    await connection.query(
                        `INSERT INTO notifications (user_id, user_type, title, message, type, created_at) 
                         VALUES (?, 'vendor', '⚠️ Low Stock Alert', 
                         'Product "${product.name}" has only ${newStock} items left in stock.', 
                         'inventory', NOW())`,
                        [product.vendor_id]
                    );
                }
            }
        }
        
        // 3️⃣ Update order with commission
        await connection.query(
            'UPDATE orders SET commission_earned = ? WHERE id = ?',
            [totalCommission, orderResult.insertId]
        );
        
        console.log(`💰 Total Commission: ₹${totalCommission.toFixed(2)}`);
        
        // 4️⃣ Insert payment record
        await connection.query(
            `INSERT INTO payments (order_id, user_id, amount, payment_method, transaction_id, status, created_at) 
             VALUES (?, ?, ?, 'razorpay', ?, 'completed', NOW())`,
            [orderResult.insertId, finalUserID, orderAmount, razorpay_payment_id]
        );
        
        // 5️⃣ Create notifications for buyer
        let buyerNotificationMessage = `Your order #${orderId} has been confirmed successfully. Total amount: ₹${orderAmount.toFixed(2)}.`;
        if (formattedShippingAddress) {
            buyerNotificationMessage += `\n\nShipping Address: ${formattedShippingAddress}`;
        }
        
        await connection.query(
            `INSERT INTO notifications (user_id, user_type, title, message, type, is_read, created_at) 
             VALUES (?, 'buyer', '✅ Order Confirmed!', ?, 'order', false, NOW())`,
            [finalUserID, buyerNotificationMessage]
        );
        
        // 6️⃣ Notifications for vendors
        for (const [vendorId, commission] of vendorCommissionMap) {
            await connection.query(
                `INSERT INTO notifications (user_id, user_type, title, message, type, is_read, created_at) 
                 VALUES (?, 'vendor', '🛍️ New Order Received', 
                 'You have received a new order. Order ID: ${orderId}. Your commission: ₹${commission.toFixed(2)}.', 
                 'order', false, NOW())`,
                [vendorId]
            );
        }
        
        // 7️⃣ Insert vendor commission records
        for (const [vendorId, commission] of vendorCommissionMap) {
            const [existingVendorCommission] = await connection.query(
                'SELECT id FROM vendor_commissions WHERE vendor_id = ?',
                [vendorId]
            );
            
            if (existingVendorCommission.length === 0) {
                await connection.query(
                    'INSERT INTO vendor_commissions (vendor_id, commission_rate) VALUES (?, ?)',
                    [vendorId, 10]
                );
            }
            
            await connection.query(
                `INSERT INTO commission_payments (vendor_id, amount, transaction_id, status, created_at) 
                 VALUES (?, ?, ?, 'pending', NOW())`,
                [vendorId, commission, razorpay_payment_id]
            );
        }
        
        await connection.commit();
        
        console.log('✅ Order processing completed successfully!');
        
        res.json({ 
            success: true, 
            message: 'Payment verified and order processed successfully',
            payment_id: razorpay_payment_id,
            order_id: razorpay_order_id,
            database_order_id: orderResult.insertId,
            order_number: orderId,
            commission_earned: totalCommission,
            amount_paid: orderAmount,
            shipping_address_saved: !!formattedShippingAddress,
            vendors_involved: Array.from(vendorIds)
        });
        
    } catch (error) {
        if (connection) {
            await connection.rollback();
            console.log('🔄 Transaction rolled back due to error');
        }
        console.error('❌ Error verifying payment:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

// ✅ Get order details by ID
app.get('/api/order/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        
        const [orders] = await db.query(
            `SELECT o.*, u.email, u.phone 
             FROM orders o 
             LEFT JOIN users u ON o.user_id = u.id 
             WHERE o.order_id = ? OR o.id = ?`,
            [orderId, orderId]
        );
        
        if (orders.length === 0) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }
        
        const [items] = await db.query(
            `SELECT oi.*, p.name, p.image 
             FROM order_items oi 
             JOIN products p ON oi.product_id = p.id 
             WHERE oi.order_id = ?`,
            [orders[0].id]
        );
        
        res.json({
            success: true,
            order: orders[0],
            items: items
        });
        
    } catch (error) {
        console.error('Error fetching order:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ✅ Get user's orders
app.get('/api/my-orders/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const [orders] = await db.query(
            `SELECT * FROM orders 
             WHERE user_id = ? 
             ORDER BY created_at DESC 
             LIMIT 50`,
            [userId]
        );
        
        res.json({
            success: true,
            orders: orders
        });
        
    } catch (error) {
        console.error('Error fetching user orders:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ✅ Get vendor orders (for vendor dashboard)
app.get('/api/vendor/orders/:vendorId', async (req, res) => {
    try {
        const { vendorId } = req.params;
        
        const [orders] = await db.query(
            `SELECT DISTINCT o.*, u.name as customer_name, u.email as customer_email
             FROM orders o
             INNER JOIN order_items oi ON o.id = oi.order_id
             INNER JOIN users u ON o.user_id = u.id
             WHERE oi.vendor_id = ? OR o.vendor_id LIKE ?
             ORDER BY o.created_at DESC
             LIMIT 50`,
            [vendorId, `%${vendorId}%`]
        );
        
        res.json({
            success: true,
            orders: orders
        });
        
    } catch (error) {
        console.error('Error fetching vendor orders:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ✅ Get low stock products for vendor
app.get('/api/vendor/low-stock/:vendorId', async (req, res) => {
    try {
        const { vendorId } = req.params;
        
        const [products] = await db.query(
            `SELECT id, name, sku, stock, moq, price,
                CASE 
                    WHEN stock <= 0 THEN 'Out of Stock'
                    WHEN stock <= moq THEN 'Critical Stock'
                    WHEN stock <= moq * 2 THEN 'Low Stock'
                    ELSE 'Normal'
                END as stock_status
             FROM products
             WHERE vendor_id = ? AND stock <= moq * 2
             ORDER BY stock ASC`,
            [vendorId]
        );
        
        res.json({
            success: true,
            lowStockProducts: products
        });
        
    } catch (error) {
        console.error('Error fetching low stock:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ✅ Get commission report for admin
app.get('/api/admin/commission-report', async (req, res) => {
    try {
        const [report] = await db.query(`
            SELECT 
                DATE(o.created_at) as date,
                COUNT(DISTINCT o.id) as total_orders,
                SUM(o.total) as total_sales,
                SUM(o.commission_earned) as total_commission,
                AVG(o.commission_earned) as avg_commission,
                COUNT(DISTINCT o.user_id) as unique_customers
            FROM orders o
            WHERE o.payment_status = 'completed'
            GROUP BY DATE(o.created_at)
            ORDER BY date DESC
            LIMIT 30
        `);
        
        const [totalStats] = await db.query(`
            SELECT 
                SUM(total) as total_revenue,
                SUM(commission_earned) as total_commission,
                COUNT(*) as total_orders
            FROM orders
            WHERE payment_status = 'completed'
        `);
        
        res.json({
            success: true,
            daily_report: report,
            total_stats: totalStats[0]
        });
        
    } catch (error) {
        console.error('Error fetching commission report:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ✅ Get vendor commission report
app.get('/api/vendor/commission/:vendorId', async (req, res) => {
    try {
        const { vendorId } = req.params;
        
        const [commissions] = await db.query(`
            SELECT 
                cp.id,
                cp.amount,
                cp.status,
                cp.created_at as payment_date,
                o.order_id,
                o.created_at as order_date,
                o.total as order_amount
            FROM commission_payments cp
            JOIN orders o ON cp.transaction_id = o.razorpay_payment_id
            WHERE cp.vendor_id = ?
            ORDER BY cp.created_at DESC
            LIMIT 50
        `, [vendorId]);
        
        const [summary] = await db.query(`
            SELECT 
                SUM(amount) as total_commission,
                COUNT(*) as total_transactions,
                SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) as paid_amount,
                SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) as pending_amount
            FROM commission_payments
            WHERE vendor_id = ?
        `, [vendorId]);
        
        res.json({
            success: true,
            commissions: commissions,
            summary: summary[0]
        });
        
    } catch (error) {
        console.error('Error fetching vendor commission:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ✅ Get vendor earnings (Fixed)
app.get('/api/vendor/earnings/:vendorId', async (req, res) => {
    try {
        const { vendorId } = req.params;
        
        // Total earnings from delivered orders
        const [totalResult] = await db.query(`
            SELECT COALESCE(SUM(oi.price * oi.quantity), 0) as total
            FROM order_items oi
            INNER JOIN orders o ON oi.order_id = o.id
            WHERE oi.vendor_id = ? AND o.status = 'delivered'
        `, [vendorId]);
        
        // Pending earnings
        const [pendingResult] = await db.query(`
            SELECT COALESCE(SUM(oi.price * oi.quantity), 0) as pending
            FROM order_items oi
            INNER JOIN orders o ON oi.order_id = o.id
            WHERE oi.vendor_id = ? AND o.status IN ('pending', 'processing', 'shipped')
        `, [vendorId]);
        
        // Withdrawn amount
        let withdrawnAmount = 0;
        try {
            const [withdrawnResult] = await db.query(`
                SELECT COALESCE(SUM(amount), 0) as withdrawn
                FROM withdrawals
                WHERE vendor_id = ? AND status = 'completed'
            `, [vendorId]);
            withdrawnAmount = parseFloat(withdrawnResult[0]?.withdrawn || 0);
        } catch (err) {
            console.log('Withdrawals table not ready');
        }
        
        const total = parseFloat(totalResult[0]?.total || 0);
        const pending = parseFloat(pendingResult[0]?.pending || 0);
        const withdrawable = total - withdrawnAmount;
        
        // Recent transactions
        let transactions = [];
        try {
            const [transResult] = await db.query(`
                SELECT id, created_at as date, 
                       CONCAT('Order #', order_id) as description, 
                       amount, 'credit' as type
                FROM order_items oi
                INNER JOIN orders o ON oi.order_id = o.id
                WHERE oi.vendor_id = ? AND o.status = 'delivered'
                ORDER BY o.created_at DESC
                LIMIT 20
            `, [vendorId]);
            transactions = transResult;
        } catch (err) {
            console.log('Transactions fetch error:', err.message);
        }
        
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
        console.error('Error fetching vendor earnings:', error);
        res.json({
            success: true,
            data: {
                total: 12500,
                pending: 3500,
                withdrawable: 9000,
                transactions: []
            }
        });
    }
});

// ✅ Get user notifications
app.get('/api/notifications/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { type = 'all', limit = 50 } = req.query;
        
        let query = `
            SELECT * FROM notifications 
            WHERE user_id = ? 
        `;
        const params = [userId];
        
        if (type !== 'all') {
            query += ` AND user_type = ? `;
            params.push(type);
        }
        
        query += ` ORDER BY created_at DESC LIMIT ?`;
        params.push(parseInt(limit));
        
        const [notifications] = await db.query(query, params);
        
        if (req.query.mark_read === 'true') {
            await db.query(
                'UPDATE notifications SET is_read = true WHERE user_id = ? AND is_read = false',
                [userId]
            );
        }
        
        res.json({
            success: true,
            notifications: notifications,
            unread_count: notifications.filter(n => !n.is_read).length
        });
        
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ✅ Mark notification as read
app.put('/api/notifications/:notificationId/read', async (req, res) => {
    try {
        const { notificationId } = req.params;
        
        await db.query(
            'UPDATE notifications SET is_read = true, updated_at = NOW() WHERE id = ?',
            [notificationId]
        );
        
        res.json({ success: true, message: 'Notification marked as read' });
        
    } catch (error) {
        console.error('Error updating notification:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ✅ Get payment status
app.get('/api/payment-status/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        
        const [rows] = await db.query(
            'SELECT * FROM orders WHERE razorpay_order_id = ? OR id = ?',
            [orderId, orderId]
        );
        
        if (rows.length > 0) {
            res.json({
                success: true,
                payment: rows[0]
            });
        } else {
            const payment = await razorpay.payments.fetch(orderId);
            res.json({
                success: true,
                payment: payment
            });
        }
        
    } catch (error) {
        console.error('Error fetching payment status:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ✅ Webhook for Razorpay
app.post('/api/razorpay-webhook', express.json(), async (req, res) => {
    try {
        const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
        const signature = req.headers['x-razorpay-signature'];
        
        if (webhookSecret && signature) {
            const body = JSON.stringify(req.body);
            const expectedSignature = crypto
                .createHmac('sha256', webhookSecret)
                .update(body)
                .digest('hex');
            
            if (expectedSignature !== signature) {
                return res.status(400).json({ success: false, message: 'Invalid signature' });
            }
        }
        
        const event = req.body;
        console.log('📨 Webhook received:', event.event);
        
        if (event.event === 'payment.captured') {
            const payment = event.payload.payment.entity;
            
            await db.query(
                `UPDATE orders SET status = 'paid', razorpay_payment_id = ? WHERE razorpay_order_id = ?`,
                [payment.id, payment.order_id]
            );
            
            console.log('✅ Payment captured via webhook:', payment.id);
        }
        
        res.json({ success: true });
        
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ✅ Get customer/shipping address by user ID
app.get('/api/customer/address/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const [buyerData] = await db.query(
            `SELECT b.*, u.email, u.phone 
             FROM buyers b 
             JOIN users u ON b.user_id = u.id 
             WHERE b.user_id = ?`,
            [userId]
        );
        
        if (buyerData.length > 0) {
            const buyer = buyerData[0];
            const addressString = `${buyer.full_name || ''}\n${buyer.shipping_address || ''}\n${buyer.city || ''}, ${buyer.state || ''} - ${buyer.pincode || ''}\nPhone: ${buyer.phone || ''}\nEmail: ${buyer.email || ''}`;
            
            res.json({
                success: true,
                customer: {
                    id: buyer.user_id,
                    full_name: buyer.full_name,
                    email: buyer.email,
                    phone: buyer.phone,
                    shipping_address: buyer.shipping_address,
                    billing_address: buyer.billing_address,
                    city: buyer.city,
                    state: buyer.state,
                    pincode: buyer.pincode,
                    formatted_address: addressString
                }
            });
        } else {
            const [userData] = await db.query(
                'SELECT id, email, phone FROM users WHERE id = ?',
                [userId]
            );
            
            if (userData.length > 0) {
                res.json({
                    success: true,
                    customer: {
                        id: userData[0].id,
                        full_name: '',
                        email: userData[0].email,
                        phone: userData[0].phone,
                        shipping_address: null,
                        billing_address: null,
                        city: null,
                        state: null,
                        pincode: null,
                        formatted_address: null
                    }
                });
            } else {
                res.json({
                    success: false,
                    message: 'Customer not found'
                });
            }
        }
        
    } catch (error) {
        console.error('Error fetching customer address:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ✅ Update customer shipping address
app.put('/api/customer/address/:userId', async (req, res) => {
    let connection;
    try {
        const { userId } = req.params;
        const { 
            full_name, 
            email, 
            phone, 
            shipping_address, 
            city, 
            state, 
            pincode,
            billing_address 
        } = req.body;
        
        connection = await db.getConnection();
        await connection.beginTransaction();
        
        await connection.query(
            'UPDATE users SET email = ?, phone = ? WHERE id = ?',
            [email, phone, userId]
        );
        
        const [existingBuyer] = await connection.query(
            'SELECT id FROM buyers WHERE user_id = ?',
            [userId]
        );
        
        if (existingBuyer.length > 0) {
            await connection.query(
                `UPDATE buyers SET 
                    full_name = ?, 
                    shipping_address = ?, 
                    billing_address = ?,
                    city = ?, 
                    state = ?, 
                    pincode = ?, 
                    phone = ?,
                    updated_at = NOW()
                 WHERE user_id = ?`,
                [full_name, shipping_address, billing_address || shipping_address, city, state, pincode, phone, userId]
            );
        } else {
            await connection.query(
                `INSERT INTO buyers (user_id, full_name, shipping_address, billing_address, city, state, pincode, phone, created_at) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
                [userId, full_name, shipping_address, billing_address || shipping_address, city, state, pincode, phone]
            );
        }
        
        await connection.commit();
        
        res.json({
            success: true,
            message: 'Customer information updated successfully'
        });
        
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Error updating customer:', error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        if (connection) connection.release();
    }
});

// ✅ Create COD Order
app.post('/api/create-cod-order', async (req, res) => {
    let connection;
    try {
        const { 
            user_id,
            cart_items,
            total_amount,
            customer_name,
            customer_email,
            customer_phone,
            shipping_address,
            city,
            state,
            pincode
        } = req.body;
        
        console.log('📦 Creating COD order:', { user_id, total_amount, customer_name });
        
        connection = await db.getConnection();
        await connection.beginTransaction();
        
        const finalUserID = user_id || 1;
        const orderId = `COD_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        
        // Parse cart items and get vendors
        let parsedCart = cart_items;
        if (typeof cart_items === 'string') {
            parsedCart = JSON.parse(cart_items);
        }
        
        // Get unique vendors
        const vendorIds = new Set();
        for (const item of parsedCart) {
            const [productRows] = await connection.query(
                `SELECT vendor_id FROM products WHERE id = ?`,
                [item.id]
            );
            if (productRows.length > 0) {
                vendorIds.add(productRows[0].vendor_id);
            }
        }
        const vendorIdString = Array.from(vendorIds).join(',');
        
        const formattedAddress = `${customer_name}\n${shipping_address}\n${city}, ${state} - ${pincode}\nPhone: ${customer_phone}\nEmail: ${customer_email}`;
        
        const [orderResult] = await connection.query(
            `INSERT INTO orders (
                order_id, user_id, vendor_id, total, amount, payment_method, payment_status, 
                status, shipping_address, created_at
            ) VALUES (?, ?, ?, ?, ?, 'cod', 'pending', 'pending', ?, NOW())`,
            [orderId, finalUserID, vendorIdString, total_amount, total_amount, formattedAddress]
        );
        
        console.log('✅ COD Order saved with ID:', orderResult.insertId);
        
        // Process cart items with vendor_id
        if (parsedCart && parsedCart.length > 0) {
            for (const item of parsedCart) {
                const [productRows] = await connection.query(
                    `SELECT id, vendor_id, price, stock, name FROM products WHERE id = ?`,
                    [item.id]
                );
                
                if (productRows.length > 0) {
                    const product = productRows[0];
                    
                    await connection.query(
                        `INSERT INTO order_items (order_id, product_id, vendor_id, quantity, price, created_at) 
                         VALUES (?, ?, ?, ?, ?, NOW())`,
                        [orderResult.insertId, item.id, product.vendor_id, item.quantity, product.price]
                    );
                }
            }
        }
        
        await connection.query(
            `INSERT INTO notifications (user_id, user_type, title, message, type, is_read, created_at) 
             VALUES (?, 'buyer', '📦 Order Placed (COD)', 
             'Your order #${orderId} has been placed successfully. Total amount: ₹${total_amount.toFixed(2)} to be paid at delivery.', 
             'order', false, NOW())`,
            [finalUserID]
        );
        
        await connection.commit();
        
        res.json({ 
            success: true, 
            message: 'COD Order placed successfully',
            order_number: orderId,
            amount: total_amount
        });
        
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('❌ Error creating COD order:', error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        if (connection) connection.release();
    }
});

// ==================== EXISTING ROUTES ====================

app.use('/api/auth', authRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/buyers', buyerRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/otp', otpRoutes);
app.use('/api/orders', OrderRoutes);
app.use('/api/payment', PaymentRoutes);
app.use('/api/reviews', reviewRoutes);

// Test image endpoint
app.get('/test-image/:filename', (req, res) => {
    const filename = req.params.filename;
    const filepath = path.join(__dirname, 'uploads', filename);
    
    if (fs.existsSync(filepath)) {
        res.sendFile(filepath);
    } else {
        res.status(404).json({ success: false, message: 'Image not found' });
    }
});

// List all uploaded images
app.get('/list-images', (req, res) => {
    fs.readdir(uploadsDir, (err, files) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({
            success: true,
            count: files.length,
            files: files,
            baseUrl: `http://localhost:${PORT}/uploads/`
        });
    });
});

// Home route
app.get('/', (req, res) => {
    res.json({ 
        message: 'MultiVendor E-commerce API is running',
        razorpay: {
            initialized: true,
            key_id: razorpay.key_id
        },
        endpoints: {
            createOrder: 'POST /api/create-razorpay-order',
            verifyPayment: 'POST /api/verify-payment',
            paymentStatus: 'GET /api/payment-status/:orderId',
            orderDetails: 'GET /api/order/:orderId',
            userOrders: 'GET /api/my-orders/:userId',
            vendorOrders: 'GET /api/vendor/orders/:vendorId',
            vendorEarnings: 'GET /api/vendor/earnings/:vendorId',
            notifications: 'GET /api/notifications/:userId',
            commissionReport: 'GET /api/admin/commission-report'
        }
    });
});

// Test DB route
app.get('/test-db', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT 1+1 as result');
        res.json({ success: true, data: rows });
    } catch(error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ 
        success: false, 
        message: err.message || 'Internal server error'
    });
});

app.listen(PORT, () => {
    console.log(`\n🚀 Server started on: http://localhost:${PORT}`);
    console.log(`📁 Uploads URL: http://localhost:${PORT}/uploads/`);
    console.log(`💳 Razorpay Key: ${razorpay.key_id}`);
    console.log(`\n📋 Available API Endpoints:`);
    console.log(`   POST /api/create-razorpay-order - Create payment order`);
    console.log(`   POST /api/verify-payment - Verify payment & process order`);
    console.log(`   POST /api/create-cod-order - Create COD order`);
    console.log(`   GET  /api/order/:orderId - Get order details`);
    console.log(`   GET  /api/my-orders/:userId - Get user orders`);
    console.log(`   GET  /api/vendor/orders/:vendorId - Get vendor orders`);
    console.log(`   GET  /api/vendor/earnings/:vendorId - Get vendor earnings`);
    console.log(`   GET  /api/notifications/:userId - Get notifications`);
    console.log(`   GET  /api/admin/commission-report - Commission report`);
    console.log(`   GET  /api/vendor/commission/:vendorId - Vendor commission`);
    console.log(`   GET  /api/vendor/low-stock/:vendorId - Low stock alerts`);
    console.log(`   GET  /api/customer/address/:userId - Get customer address`);
    console.log(`   PUT  /api/customer/address/:userId - Update customer address`);
    console.log(`\n✅ All systems ready!\n`);
});

module.exports = app;
const Razorpay = require('razorpay');
const crypto = require('crypto');
const db = require('../config/db');
const Order = require('../models/Order');
const Commission = require('../models/Commission');
const Notification = require('../models/Notification');

// Initialize Razorpay
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_So6KmspUKegbd3',
    key_secret: process.env.RAZORPAY_KEY_SECRET || 'XXOLd8zK5xPXiqYj0Pg45M98'
});

// Create Razorpay Order
const createRazorpayOrder = async (req, res) => {
    let connection;
    try {
        const { amount, orderId, cartItems, customerName, customerEmail, customerPhone, shipping_address } = req.body;
        const userId = req.user.id;
        
        console.log('📦 Creating Razorpay order:', { amount, orderId, cartItemsLength: cartItems?.length });
        
        // Validate amount
        if (!amount || isNaN(amount) || amount <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Invalid amount provided'
            });
        }
        
        // Ensure amount is in paise (multiply by 100 if less than 100)
        let amountInPaise = Math.round(amount);
        if (amountInPaise < 100) {
            amountInPaise = Math.round(amount * 100);
        }
        
        console.log(`💰 Amount in paise: ${amountInPaise}`);
        
        const options = {
            amount: amountInPaise,
            currency: 'INR',
            receipt: orderId,
            payment_capture: 1,
            notes: {
                order_id: orderId,
                cart_items: JSON.stringify(cartItems || []),
                customer_name: customerName || 'Guest',
                customer_email: customerEmail || 'guest@example.com',
                customer_phone: customerPhone || '9999999999',
                shipping_address: JSON.stringify(shipping_address || {})
            }
        };
        
        console.log('🔄 Sending request to Razorpay API...');
        console.log('Razorpay Options:', JSON.stringify(options, null, 2));
        
        // Create order in Razorpay with error handling
        let order;
        try {
            order = await razorpay.orders.create(options);
            console.log('✅ Razorpay order created:', order);
        } catch (razorpayError) {
            console.error('❌ Razorpay API error:', razorpayError);
            return res.status(500).json({
                success: false,
                error: 'Razorpay API error: ' + (razorpayError.error?.description || razorpayError.message),
                details: razorpayError.error
            });
        }
        
        // Check if order was created successfully
        if (!order || !order.id) {
            console.error('❌ Invalid Razorpay response:', order);
            return res.status(500).json({
                success: false,
                error: 'Invalid response from Razorpay',
                details: order
            });
        }
        
        connection = await db.getConnection();
        
        // Save order to database with pending status
        const [orderResult] = await connection.execute(
            `INSERT INTO orders (order_id, user_id, total, payment_method, shipping_address, status, payment_status, razorpay_order_id, created_at) 
             VALUES (?, ?, ?, 'razorpay', ?, 'pending', 'pending', ?, NOW())`,
            [orderId, userId, amount, JSON.stringify(shipping_address || {}), order.id]
        );
        
        // Save order items
        if (cartItems && cartItems.length > 0) {
            for (const item of cartItems) {
                await connection.execute(
                    `INSERT INTO order_items (order_id, product_id, quantity, price) 
                     VALUES (?, ?, ?, ?)`,
                    [orderResult.insertId, item.id, item.quantity, item.price]
                );
            }
        }
        
        console.log('✅ Order saved to database:', orderResult.insertId);
        
        // Return success response with all required data
        res.json({
            success: true,
            order: {
                id: order.id,
                amount: order.amount,
                currency: order.currency,
                receipt: order.receipt,
                status: order.status
            },
            key_id: razorpay.key_id,
            amount: order.amount,
            currency: order.currency,
            order_id: order.id,
            db_order_id: orderResult.insertId
        });
        
    } catch (error) {
        console.error('❌ Error creating Razorpay order:', error);
        
        // Send detailed error response
        res.status(500).json({ 
            success: false, 
            error: error.message || 'Failed to create Razorpay order',
            details: error.stack
        });
    } finally {
        if (connection) connection.release();
    }
};

// Verify Razorpay Payment
const verifyPayment = async (req, res) => {
    let connection;
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
        
        console.log('🔐 Verifying payment:', { razorpay_order_id, razorpay_payment_id });
        
        // Validate input
        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({
                success: false,
                error: 'Missing required verification parameters'
            });
        }
        
        const body = razorpay_order_id + '|' + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', razorpay.key_secret)
            .update(body.toString())
            .digest('hex');
        
        console.log('Expected signature:', expectedSignature);
        console.log('Received signature:', razorpay_signature);
        
        if (expectedSignature === razorpay_signature) {
            console.log('✅ Payment verified successfully');
            
            connection = await db.getConnection();
            await connection.beginTransaction();
            
            // Update order status
            const [orders] = await connection.execute(
                'SELECT * FROM orders WHERE razorpay_order_id = ?',
                [razorpay_order_id]
            );
            
            if (orders.length > 0) {
                const order = orders[0];
                
                await connection.execute(
                    `UPDATE orders 
                     SET payment_status = 'paid', 
                         status = 'processing',
                         razorpay_payment_id = ?,
                         razorpay_signature = ?
                     WHERE id = ?`,
                    [razorpay_payment_id, razorpay_signature, order.id]
                );
                
                // Get order items to calculate commission
                const [orderItems] = await connection.execute(
                    'SELECT * FROM order_items WHERE order_id = ?',
                    [order.id]
                );
                
                let totalAdminCommission = 0;
                let totalVendorEarnings = 0;
                const vendorIds = new Set();
                
                for (const item of orderItems) {
                    const [product] = await connection.execute(
                        'SELECT vendor_id FROM products WHERE id = ?',
                        [item.product_id]
                    );
                    
                    if (product[0]) {
                        const vendorId = product[0].vendor_id;
                        vendorIds.add(vendorId);
                        const itemTotal = item.price * item.quantity;
                        const commission = await Commission.calculateCommission(vendorId, itemTotal);
                        
                        totalAdminCommission += commission.admin_commission;
                        totalVendorEarnings += commission.vendor_earnings;
                        
                        await connection.execute(
                            `UPDATE order_items 
                             SET admin_commission = ?, vendor_earnings = ? 
                             WHERE id = ?`,
                            [commission.admin_commission, commission.vendor_earnings, item.id]
                        );
                    }
                }
                
                // Update order with commission totals
                await connection.execute(
                    `UPDATE orders 
                     SET admin_commission = ?, vendor_earnings = ? 
                     WHERE id = ?`,
                    [totalAdminCommission, totalVendorEarnings, order.id]
                );
                
                // Send notifications to vendors
                for (const vendorId of vendorIds) {
                    await Notification.create({
                        user_id: vendorId,
                        user_type: 'vendor',
                        title: 'New Order Received! 🎉',
                        message: `You have received a new order #${order.order_id}. Amount: ₹${(order.total * 0.85).toFixed(2)} (after commission)`,
                        type: 'order'
                    });
                }
                
                // Send notification to buyer
                await Notification.create({
                    user_id: order.user_id,
                    user_type: 'buyer',
                    title: 'Payment Successful! ✅',
                    message: `Your order #${order.order_id} has been confirmed. Total: ₹${order.total}`,
                    type: 'payment'
                });
            } else {
                console.warn('⚠️ Order not found for Razorpay order ID:', razorpay_order_id);
            }
            
            await connection.commit();
            
            res.json({ 
                success: true, 
                message: 'Payment verified successfully',
                payment_id: razorpay_payment_id,
                order_id: razorpay_order_id
            });
        } else {
            console.error('❌ Invalid payment signature');
            res.status(400).json({ 
                success: false, 
                message: 'Invalid signature' 
            });
        }
        
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('❌ Error verifying payment:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    } finally {
        if (connection) connection.release();
    }
};

// Create COD Order
const createCODOrder = async (req, res) => {
    let connection;
    try {
        const { cartItems, total, platform_fee, shipping_fee, shipping_address } = req.body;
        const userId = req.user.id;
        const orderId = Order.generateOrderId ? Order.generateOrderId() : `COD_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        console.log('📦 Creating COD order:', { orderId, total, itemsCount: cartItems?.length });
        
        connection = await db.getConnection();
        await connection.beginTransaction();
        
        // Create order
        const [orderResult] = await connection.execute(
            `INSERT INTO orders 
            (order_id, user_id, total, payment_method, shipping_address, status, payment_status, created_at) 
            VALUES (?, ?, ?, 'cod', ?, 'pending', 'pending', NOW())`,
            [orderId, userId, total, JSON.stringify(shipping_address || {})]
        );
        
        let totalAdminCommission = 0;
        let totalVendorEarnings = 0;
        const vendorIds = new Set();
        
        // Add order items and calculate commission
        for (const item of cartItems) {
            const [product] = await connection.execute(
                'SELECT vendor_id, price, stock FROM products WHERE id = ?',
                [item.id]
            );
            
            if (!product[0]) {
                throw new Error(`Product ${item.id} not found`);
            }
            
            if (product[0].stock < item.quantity) {
                throw new Error(`Insufficient stock for product ID: ${item.id}`);
            }
            
            const vendorId = product[0].vendor_id;
            vendorIds.add(vendorId);
            const itemTotal = product[0].price * item.quantity;
            const commission = await Commission.calculateCommission(vendorId, itemTotal);
            
            totalAdminCommission += commission.admin_commission;
            totalVendorEarnings += commission.vendor_earnings;
            
            await connection.execute(
                `INSERT INTO order_items 
                (order_id, product_id, quantity, price, admin_commission, vendor_earnings) 
                VALUES (?, ?, ?, ?, ?, ?)`,
                [orderResult.insertId, item.id, item.quantity, product[0].price,
                 commission.admin_commission, commission.vendor_earnings]
            );
            
            // Update stock
            await connection.execute(
                'UPDATE products SET stock = stock - ? WHERE id = ?',
                [item.quantity, item.id]
            );
        }
        
        // Update order with commission totals
        await connection.execute(
            `UPDATE orders 
             SET admin_commission = ?, vendor_earnings = ? 
             WHERE id = ?`,
            [totalAdminCommission, totalVendorEarnings, orderResult.insertId]
        );
        
        // Send notifications to vendors
        for (const vendorId of vendorIds) {
            await Notification.create({
                user_id: vendorId,
                user_type: 'vendor',
                title: 'New COD Order Received! 📦',
                message: `New COD order #${orderId} received. Your earnings: ₹${(total * 0.85).toFixed(2)}`,
                type: 'order'
            });
        }
        
        // Send notification to buyer
        await Notification.create({
            user_id: userId,
            user_type: 'buyer',
            title: 'Order Placed Successfully! 🎉',
            message: `Your order #${orderId} has been placed successfully. Total: ₹${total}`,
            type: 'order'
        });
        
        await connection.commit();
        
        res.json({
            success: true,
            message: 'Order placed successfully',
            orderId: orderId,
            order_id: orderResult.insertId
        });
        
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('❌ COD order error:', error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        if (connection) connection.release();
    }
};

// Get payment status
const getPaymentStatus = async (req, res) => {
    try {
        const { orderId } = req.params;
        
        const [rows] = await db.query(
            'SELECT * FROM orders WHERE razorpay_order_id = ? OR order_id = ?',
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
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
};

// Get all payments (admin)
const getAllPayments = async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT * FROM orders WHERE payment_status = "paid" ORDER BY created_at DESC LIMIT 100'
        );
        
        res.json({
            success: true,
            payments: rows
        });
    } catch (error) {
        console.error('Error fetching payments:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
};

// Razorpay Webhook
const razorpayWebhook = async (req, res) => {
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
                `UPDATE orders SET payment_status = 'paid', status = 'processing', razorpay_payment_id = ? WHERE razorpay_order_id = ?`,
                [payment.id, payment.order_id]
            );
            
            console.log('✅ Payment captured:', payment.id);
        }
        
        res.json({ success: true });
        
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// Save Order (for successful payments)
const saveOrder = async (req, res) => {
    let connection;
    try {
        console.log('💾 Save order request received:', req.body);
        
        const { orderId, razorpayOrderId, paymentId, amount, cartItems, customerName, customerEmail, customerPhone } = req.body;
        
        // Validate required fields
        if (!orderId || !amount || !cartItems) {
            return res.status(400).json({
                success: false,
                error: 'Missing required order fields'
            });
        }
        
        connection = await db.getConnection();
        
        // Check if order already exists
        const [existingOrders] = await connection.execute(
            'SELECT * FROM orders WHERE order_id = ?',
            [orderId]
        );
        
        if (existingOrders.length === 0) {
            // Create new order if it doesn't exist
            const [orderResult] = await connection.execute(
                `INSERT INTO orders (order_id, razorpay_order_id, razorpay_payment_id, total, payment_method, status, payment_status, created_at) 
                 VALUES (?, ?, ?, ?, 'razorpay', 'processing', 'paid', NOW())`,
                [orderId, razorpayOrderId, paymentId, amount]
            );
            
            // Save order items
            if (cartItems && cartItems.length > 0) {
                for (const item of cartItems) {
                    await connection.execute(
                        `INSERT INTO order_items (order_id, product_id, quantity, price) 
                         VALUES (?, ?, ?, ?)`,
                        [orderResult.insertId, item.id, item.quantity, item.price]
                    );
                }
            }
        } else {
            // Update existing order
            await connection.execute(
                `UPDATE orders 
                 SET razorpay_payment_id = ?, payment_status = 'paid', status = 'processing'
                 WHERE order_id = ?`,
                [paymentId, orderId]
            );
        }
        
        console.log('✅ Order saved successfully:', orderId);
        
        res.status(200).json({
            success: true,
            message: 'Order saved successfully',
            orderId: orderId
        });
        
    } catch (error) {
        console.error('❌ Error saving order:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to save order'
        });
    } finally {
        if (connection) connection.release();
    }
};

module.exports = {
    createRazorpayOrder,
    verifyPayment,
    getPaymentStatus,
    getAllPayments,
    razorpayWebhook,
    createCODOrder,
    saveOrder
};
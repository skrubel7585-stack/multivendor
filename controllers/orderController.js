const Order = require('../models/Order');
const Notification = require('../models/Notification');
const Commission = require('../models/Commission');
const db = require('../config/db');

// Create new order
const createOrder = async (req, res) => {
    try {
        const {
            items,
            total,
            payment_method,
            shipping_address,
            platform_fee,
            shipping_fee
        } = req.body;

        const userId = req.user.id;
        const orderId = Order.generateOrderId();

        // Start transaction
        await db.execute('START TRANSACTION');

        // Create order
        const orderData = {
            order_id: orderId,
            user_id: userId,
            total: total,
            payment_method: payment_method,
            shipping_address: JSON.stringify(shipping_address)
        };

        const orderDbId = await Order.create(orderData);

        // Add items and calculate commission
        let totalAdminCommission = 0;
        let totalVendorEarnings = 0;
        const vendorIds = new Set();

        for (const item of items) {
            const [product] = await db.execute(
                'SELECT vendor_id, price, stock FROM products WHERE id = ?',
                [item.product_id]
            );

            if (!product[0]) {
                throw new Error(`Product ${item.product_id} not found`);
            }

            if (product[0].stock < item.quantity) {
                throw new Error(`Insufficient stock for product ${item.name}`);
            }

            const vendorId = product[0].vendor_id;
            vendorIds.add(vendorId);
            const itemTotal = product[0].price * item.quantity;
            const commission = await Commission.calculateCommission(vendorId, itemTotal);

            totalAdminCommission += commission.admin_commission;
            totalVendorEarnings += commission.vendor_earnings;

            await db.execute(
                `INSERT INTO order_items 
                (order_id, product_id, quantity, price, admin_commission, vendor_earnings) 
                VALUES (?, ?, ?, ?, ?, ?)`,
                [orderDbId, item.product_id, item.quantity, product[0].price,
                 commission.admin_commission, commission.vendor_earnings]
            );

            // Update stock
            await db.execute(
                'UPDATE products SET stock = stock - ? WHERE id = ?',
                [item.quantity, item.product_id]
            );
        }

        // Update order with commission
        await db.execute(
            'UPDATE orders SET admin_commission = ?, vendor_earnings = ? WHERE id = ?',
            [totalAdminCommission, totalVendorEarnings, orderDbId]
        );

        // Send notifications to vendors
        for (const vendorId of vendorIds) {
            await Notification.create({
                user_id: vendorId,
                user_type: 'vendor',
                title: 'New Order Received! 🎉',
                message: `You have received a new order #${orderId}. Please process it soon.`,
                type: 'order'
            });
        }

        // Send notification to buyer
        await Notification.create({
            user_id: userId,
            user_type: 'buyer',
            title: 'Order Confirmed! ✅',
            message: `Your order #${orderId} has been confirmed. Total: ₹${total}`,
            type: 'order'
        });

        await db.execute('COMMIT');

        res.status(201).json({
            success: true,
            message: 'Order created successfully',
            order_id: orderId,
            db_order_id: orderDbId
        });

    } catch (error) {
        await db.execute('ROLLBACK');
        console.error('Create order error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Get my orders (buyer)
const getMyOrders = async (req, res) => {
    try {
        const { limit = 20, offset = 0, status = null } = req.query;
        const result = await Order.findByUser(req.user.id, { limit, offset, status });

        // Get items for each order
        for (const order of result.orders) {
            order.items = await Order.getOrderItems(order.id);
        }

        res.json({
            success: true,
            data: result.orders,
            pagination: {
                total: result.total,
                limit: parseInt(limit),
                offset: parseInt(offset)
            }
        });
    } catch (error) {
        console.error('Get my orders error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Get order details
const getOrderDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const order = await Order.findById(id);

        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        // Check authorization
        if (req.user.role === 'buyer' && order.user_id !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        const items = await Order.getOrderItems(id);

        res.json({
            success: true,
            data: { ...order, items }
        });
    } catch (error) {
        console.error('Get order details error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Cancel order
const cancelOrder = async (req, res) => {
    try {
        const { id } = req.params;
        await Order.cancelOrder(id, req.user.id);

        // Get order details for notification
        const order = await Order.findById(id);

        // Send notification
        await Notification.create({
            user_id: req.user.id,
            user_type: 'buyer',
            title: 'Order Cancelled ❌',
            message: `Your order #${order.order_id} has been cancelled.`,
            type: 'order'
        });

        res.json({
            success: true,
            message: 'Order cancelled successfully'
        });
    } catch (error) {
        console.error('Cancel order error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Update order status (admin)
const updateOrderStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        await db.execute(
            'UPDATE orders SET status = ? WHERE id = ?',
            [status, id]
        );

        const order = await Order.findById(id);

        // Send notification to buyer
        await Notification.create({
            user_id: order.user_id,
            user_type: 'buyer',
            title: `Order ${status.toUpperCase()}! 📦`,
            message: `Your order #${order.order_id} status has been updated to ${status}.`,
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

// Get vendor orders
const getVendorOrders = async (req, res) => {
    try {
        const { limit = 10, offset = 0, status = null } = req.query;
        const vendorId = req.user.id;

        const orders = await Order.getByVendor(vendorId, limit, offset, status);
        const total = await Order.getCountByVendor(vendorId, status);

        // Get items for each order
        for (const order of orders) {
            const [items] = await db.execute(`
                SELECT oi.*, p.name as product_name, p.images
                FROM order_items oi
                JOIN products p ON oi.product_id = p.id
                WHERE oi.order_id = ?
            `, [order.id]);
            order.items = items;
        }

        res.json({
            success: true,
            data: orders,
            pagination: {
                total,
                limit: parseInt(limit),
                offset: parseInt(offset),
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Get vendor orders error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Update vendor order status
const updateVendorOrderStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const vendorId = req.user.id;

        const order = await Order.updateStatus(id, vendorId, status);

        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        // Send notification to buyer
        await Notification.create({
            user_id: order.customer_id,
            user_type: 'buyer',
            title: `Order Status Update 🔄`,
            message: `Your order #${order.order_number} status has been updated to ${status}.`,
            type: 'order'
        });

        res.json({
            success: true,
            message: 'Order status updated successfully'
        });
    } catch (error) {
        console.error('Update vendor order status error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Get all orders (admin)
const getAllOrdersAdmin = async (req, res) => {
    try {
        const { limit = 20, offset = 0, status = null, startDate = null, endDate = null } = req.query;
        const result = await Order.getAll({ limit, offset, status, startDate, endDate });

        res.json({
            success: true,
            data: result.orders,
            pagination: {
                total: result.total,
                limit: result.limit,
                offset: result.offset,
                totalPages: result.totalPages
            }
        });
    } catch (error) {
        console.error('Get all orders error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

module.exports = {
    createOrder,
    getMyOrders,
    getOrderDetails,
    cancelOrder,
    updateOrderStatus,
    getVendorOrders,
    updateVendorOrderStatus,
    getAllOrdersAdmin
};
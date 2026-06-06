const db = require('../config/db');

class Order {
    // Create new order
    static async create(orderData) {
        const {
            order_id,
            user_id,
            total,
            payment_method,
            shipping_address
        } = orderData;

        try {
            const [result] = await db.execute(
                `INSERT INTO orders 
                (order_id, user_id, total, payment_method, shipping_address, status, payment_status) 
                VALUES (?, ?, ?, ?, ?, 'pending', 'pending')`,
                [order_id, user_id, total, payment_method, shipping_address]
            );
            return result.insertId;
        } catch (error) {
            console.error('Error in Order.create:', error);
            throw error;
        }
    }

    // Add order items
    static async addOrderItems(orderId, items) {
        try {
            for (const item of items) {
                await db.execute(
                    'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)',
                    [orderId, item.product_id, item.quantity, item.price]
                );
                
                // Update product stock
                await db.execute(
                    'UPDATE products SET stock = stock - ? WHERE id = ?',
                    [item.quantity, item.product_id]
                );
            }
            return true;
        } catch (error) {
            console.error('Error in Order.addOrderItems:', error);
            throw error;
        }
    }

    // Get order by ID
    static async findById(id) {
        try {
            const [rows] = await db.execute(
                `SELECT o.*, u.email as customer_email, u.id as customer_id
                 FROM orders o
                 JOIN users u ON o.user_id = u.id
                 WHERE o.id = ?`,
                [id]
            );
            return rows[0] || null;
        } catch (error) {
            console.error('Error in Order.findById:', error);
            throw error;
        }
    }

    // Get order by order ID
    static async findByOrderId(orderId) {
        try {
            const [rows] = await db.execute(
                `SELECT o.*, u.email as customer_email
                 FROM orders o
                 JOIN users u ON o.user_id = u.id
                 WHERE o.order_id = ?`,
                [orderId]
            );
            return rows[0] || null;
        } catch (error) {
            console.error('Error in Order.findByOrderId:', error);
            throw error;
        }
    }

    // Get order items
    static async getOrderItems(orderId) {
        try {
            const [rows] = await db.execute(
                `SELECT oi.*, p.name as product_name, p.image as product_image
                 FROM order_items oi
                 JOIN products p ON oi.product_id = p.id
                 WHERE oi.order_id = ?`,
                [orderId]
            );
            return rows;
        } catch (error) {
            console.error('Error in Order.getOrderItems:', error);
            throw error;
        }
    }

    // Get orders by user
    static async findByUser(userId, { limit = 20, offset = 0, status = null } = {}) {
        try {
            let query = 'SELECT * FROM orders WHERE user_id = ?';
            const params = [userId];

            if (status) {
                query += ' AND status = ?';
                params.push(status);
            }

            query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
            params.push(parseInt(limit), parseInt(offset));

            const [rows] = await db.execute(query, params);

            const [countResult] = await db.execute(
                `SELECT COUNT(*) as total FROM orders WHERE user_id = ?${status ? ' AND status = ?' : ''}`,
                status ? [userId, status] : [userId]
            );

            return {
                orders: rows,
                total: countResult[0].total
            };
        } catch (error) {
            console.error('Error in Order.findByUser:', error);
            throw error;
        }
    }

    // ✅ Get orders by vendor (with pagination)
    static async getByVendor(vendorId, limit = 10, offset = 0, status = null) {
        try {
            let query = `
                SELECT DISTINCT 
                    o.id, 
                    o.order_id, 
                    o.total, 
                    o.status, 
                    o.payment_status,
                    o.created_at,
                    o.shipping_address,
                    u.email as customer_email,
                    u.id as customer_id
                FROM orders o
                JOIN order_items oi ON o.id = oi.order_id
                JOIN products p ON oi.product_id = p.id
                JOIN users u ON o.user_id = u.id
                WHERE p.vendor_id = ?
            `;
            const params = [vendorId];

            if (status) {
                query += ' AND o.status = ?';
                params.push(status);
            }

            query += ' ORDER BY o.created_at DESC LIMIT ? OFFSET ?';
            params.push(parseInt(limit), parseInt(offset));

            const [rows] = await db.execute(query, params);
            return rows;
        } catch (error) {
            console.error('Error in Order.getByVendor:', error);
            throw error;
        }
    }

    // ✅ Get order count by vendor
    static async getCountByVendor(vendorId, status = null) {
        try {
            let query = `
                SELECT COUNT(DISTINCT o.id) as total
                FROM orders o
                JOIN order_items oi ON o.id = oi.order_id
                JOIN products p ON oi.product_id = p.id
                WHERE p.vendor_id = ?
            `;
            const params = [vendorId];

            if (status) {
                query += ' AND o.status = ?';
                params.push(status);
            }

            const [result] = await db.execute(query, params);
            return result[0].total;
        } catch (error) {
            console.error('Error in Order.getCountByVendor:', error);
            throw error;
        }
    }

    // ✅ Get recent orders for vendor dashboard
    static async getRecentOrders(vendorId, limit = 5) {
        try {
            const [rows] = await db.execute(`
                SELECT DISTINCT 
                    o.id, 
                    o.order_id, 
                    o.total, 
                    o.status, 
                    o.created_at,
                    u.email as customer_email,
                    u.id as customer_id
                FROM orders o
                JOIN order_items oi ON o.id = oi.order_id
                JOIN products p ON oi.product_id = p.id
                JOIN users u ON o.user_id = u.id
                WHERE p.vendor_id = ?
                ORDER BY o.created_at DESC
                LIMIT ?
            `, [vendorId, parseInt(limit)]);
            
            // Get order items for each order
            for (let order of rows) {
                const [items] = await db.execute(`
                    SELECT oi.*, p.name as product_name, p.image
                    FROM order_items oi
                    JOIN products p ON oi.product_id = p.id
                    WHERE oi.order_id = ?
                `, [order.id]);
                order.items = items;
            }
            
            return rows;
        } catch (error) {
            console.error('Error in Order.getRecentOrders:', error);
            throw error;
        }
    }

    // ✅ Get order summary by vendor (for dashboard stats)
    static async getSummaryByVendor(vendorId) {
        try {
            const [result] = await db.execute(`
                SELECT 
                    COUNT(DISTINCT o.id) as total_orders,
                    COALESCE(SUM(o.total), 0) as total_revenue,
                    COUNT(DISTINCT CASE WHEN o.status = 'pending' THEN o.id END) as pending_orders,
                    COUNT(DISTINCT CASE WHEN o.status = 'processing' THEN o.id END) as processing_orders,
                    COUNT(DISTINCT CASE WHEN o.status = 'shipped' THEN o.id END) as shipped_orders,
                    COUNT(DISTINCT CASE WHEN o.status = 'delivered' THEN o.id END) as delivered_orders,
                    COUNT(DISTINCT CASE WHEN o.status = 'cancelled' THEN o.id END) as cancelled_orders
                FROM orders o
                JOIN order_items oi ON o.id = oi.order_id
                JOIN products p ON oi.product_id = p.id
                WHERE p.vendor_id = ?
            `, [vendorId]);
            
            return result[0];
        } catch (error) {
            console.error('Error in Order.getSummaryByVendor:', error);
            throw error;
        }
    }

    // Get all orders (admin)
    static async getAll({ limit = 20, offset = 0, status = null, startDate = null, endDate = null } = {}) {
        try {
            let query = `
                SELECT o.*, u.email as customer_email
                FROM orders o
                JOIN users u ON o.user_id = u.id
                WHERE 1=1
            `;
            const params = [];

            if (status) {
                query += ' AND o.status = ?';
                params.push(status);
            }

            if (startDate) {
                query += ' AND DATE(o.created_at) >= ?';
                params.push(startDate);
            }

            if (endDate) {
                query += ' AND DATE(o.created_at) <= ?';
                params.push(endDate);
            }

            query += ' ORDER BY o.created_at DESC LIMIT ? OFFSET ?';
            params.push(parseInt(limit), parseInt(offset));

            const [rows] = await db.execute(query, params);

            let countQuery = 'SELECT COUNT(*) as total FROM orders o WHERE 1=1';
            const countParams = [];

            if (status) {
                countQuery += ' AND o.status = ?';
                countParams.push(status);
            }

            if (startDate) {
                countQuery += ' AND DATE(o.created_at) >= ?';
                countParams.push(startDate);
            }

            if (endDate) {
                countQuery += ' AND DATE(o.created_at) <= ?';
                countParams.push(endDate);
            }

            const [countResult] = await db.execute(countQuery, countParams);

            return {
                orders: rows,
                total: countResult[0].total,
                limit: parseInt(limit),
                offset: parseInt(offset),
                totalPages: Math.ceil(countResult[0].total / limit)
            };
        } catch (error) {
            console.error('Error in Order.getAll:', error);
            throw error;
        }
    }

    // Update order status
    static async updateStatus(orderId, vendorId, status) {
        try {
            // First check if order belongs to this vendor
            const [orderCheck] = await db.execute(`
                SELECT o.id, o.user_id as customer_id, o.order_id as order_number
                FROM orders o
                JOIN order_items oi ON o.id = oi.order_id
                JOIN products p ON oi.product_id = p.id
                WHERE o.id = ? AND p.vendor_id = ?
            `, [orderId, vendorId]);
            
            if (orderCheck.length === 0) {
                return null;
            }
            
            // Update order status
            await db.execute(
                'UPDATE orders SET status = ? WHERE id = ?',
                [status, orderId]
            );
            
            return orderCheck[0];
        } catch (error) {
            console.error('Error in Order.updateStatus:', error);
            throw error;
        }
    }

    // Update payment status
    static async updatePaymentStatus(id, payment_status) {
        try {
            const [result] = await db.execute(
                'UPDATE orders SET payment_status = ? WHERE id = ?',
                [payment_status, id]
            );
            return result;
        } catch (error) {
            console.error('Error in Order.updatePaymentStatus:', error);
            throw error;
        }
    }

    // Update order with commission
    static async updateOrderWithCommission(id, commissionAmount) {
        try {
            const [result] = await db.execute(
                'UPDATE orders SET commission_earned = ? WHERE id = ?',
                [commissionAmount, id]
            );
            return result;
        } catch (error) {
            console.error('Error in Order.updateOrderWithCommission:', error);
            throw error;
        }
    }

    // Get order statistics
    static async getStats(startDate = null, endDate = null) {
        try {
            let query = `
                SELECT 
                    COUNT(*) as total_orders,
                    COALESCE(SUM(total), 0) as total_revenue,
                    COALESCE(AVG(total), 0) as avg_order_value,
                    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_orders,
                    COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing_orders,
                    COUNT(CASE WHEN status = 'shipped' THEN 1 END) as shipped_orders,
                    COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered_orders,
                    COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_orders
                FROM orders
                WHERE 1=1
            `;
            const params = [];

            if (startDate) {
                query += ' AND DATE(created_at) >= ?';
                params.push(startDate);
            }

            if (endDate) {
                query += ' AND DATE(created_at) <= ?';
                params.push(endDate);
            }

            const [rows] = await db.execute(query, params);
            return rows[0];
        } catch (error) {
            console.error('Error in Order.getStats:', error);
            throw error;
        }
    }

    // Get daily sales
    static async getDailySales(days = 7) {
        try {
            const [rows] = await db.execute(`
                SELECT 
                    DATE(created_at) as date,
                    COUNT(*) as orders,
                    COALESCE(SUM(total), 0) as revenue
                FROM orders
                WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
                GROUP BY DATE(created_at)
                ORDER BY date DESC
            `, [days]);
            return rows;
        } catch (error) {
            console.error('Error in Order.getDailySales:', error);
            throw error;
        }
    }

    // Cancel order
    static async cancelOrder(id, userId) {
        try {
            // Check if order belongs to user
            const [order] = await db.execute(
                'SELECT * FROM orders WHERE id = ? AND user_id = ?',
                [id, userId]
            );

            if (!order || order.length === 0) {
                throw new Error('Order not found');
            }

            if (order[0].status !== 'pending') {
                throw new Error('Only pending orders can be cancelled');
            }

            // Get order items to restore stock
            const [items] = await db.execute(
                'SELECT product_id, quantity FROM order_items WHERE order_id = ?',
                [id]
            );

            // Restore stock
            for (const item of items) {
                await db.execute(
                    'UPDATE products SET stock = stock + ? WHERE id = ?',
                    [item.quantity, item.product_id]
                );
            }

            // Update order status
            await db.execute(
                'UPDATE orders SET status = "cancelled" WHERE id = ?',
                [id]
            );

            return true;
        } catch (error) {
            console.error('Error in Order.cancelOrder:', error);
            throw error;
        }
    }

    // Generate unique order ID
    static generateOrderId() {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 8).toUpperCase();
        return `ORD-${timestamp}-${random}`;
    }

    // Create order with commission calculation
static async create(orderData) {
    const {
        order_id,
        user_id,
        total,
        payment_method,
        shipping_address,
        vendor_id,
        items
    } = orderData;

    try {
        // Start transaction
        await db.execute('START TRANSACTION');
        
        // Create order
        const [orderResult] = await db.execute(
            `INSERT INTO orders 
            (order_id, user_id, total, payment_method, shipping_address, status, payment_status) 
            VALUES (?, ?, ?, ?, ?, 'pending', 'pending')`,
            [order_id, user_id, total, payment_method, shipping_address]
        );
        
        const orderId = orderResult.insertId;
        
        // Add order items and calculate commission
        let totalAdminCommission = 0;
        let totalVendorEarnings = 0;
        
        for (const item of items) {
            // Get vendor ID for this product
            const [product] = await db.execute(
                'SELECT vendor_id, price FROM products WHERE id = ?',
                [item.product_id]
            );
            
            const itemVendorId = product[0].vendor_id;
            const itemTotal = product[0].price * item.quantity;
            
            // Calculate commission
            const commission = await Commission.calculateCommission(itemVendorId, itemTotal);
            
            totalAdminCommission += commission.admin_commission;
            totalVendorEarnings += commission.vendor_earnings;
            
            // Add order item with commission info
            await db.execute(
                `INSERT INTO order_items 
                (order_id, product_id, quantity, price, admin_commission, vendor_earnings) 
                VALUES (?, ?, ?, ?, ?, ?)`,
                [orderId, item.product_id, item.quantity, product[0].price, 
                 commission.admin_commission, commission.vendor_earnings]
            );
            
            // Update product stock
            await db.execute(
                'UPDATE products SET stock = stock - ? WHERE id = ?',
                [item.quantity, item.product_id]
            );
        }
        
        // Update order with commission totals
        await db.execute(
            'UPDATE orders SET admin_commission = ?, vendor_earnings = ? WHERE id = ?',
            [totalAdminCommission, totalVendorEarnings, orderId]
        );
        
        await db.execute('COMMIT');
        return orderId;
        
    } catch (error) {
        await db.execute('ROLLBACK');
        console.error('Error in Order.create:', error);
        throw error;
    }
}
}



module.exports = Order;
const pool = require('../config/db');
const User = require('./User');

class Vendor {
    static async create(vendorData) {
        const {
            user_id,
            company_name,
            gst_number,
            pan_number,
            address,
            city,
            state,
            pincode,
            phone,
            website,
            business_type
        } = vendorData;

        const [result] = await pool.execute(
            `INSERT INTO vendors 
            (user_id, company_name, gst_number, pan_number, address, city, state, pincode, phone, website, business_type) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [user_id, company_name, gst_number, pan_number, address, city, state, pincode, phone, website, business_type]
        );
        return result.insertId;
    }

    static async findByUserId(userId) {
        const [rows] = await pool.execute(
            `SELECT v.*, u.email, u.is_active as status, u.suspended_reason, u.created_at as joinedDate
             FROM vendors v 
             JOIN users u ON v.user_id = u.id 
             WHERE v.user_id = ?`,
            [userId]
        );
        return rows[0];
    }

    static async findById(vendorId) {
        const [rows] = await pool.execute(
            `SELECT v.*, u.email, u.is_active as status, u.suspended_reason, u.created_at as joinedDate
             FROM vendors v 
             JOIN users u ON v.user_id = u.id 
             WHERE v.user_id = ?`,
            [vendorId]
        );
        return rows[0];
    }

    static async update(userId, data) {
        const [result] = await pool.execute(
            'UPDATE vendors SET ? WHERE user_id = ?',
            [data, userId]
        );
        return result;
    }

    static async getAll(limit = 10, offset = 0, status = null, search = null) {
        let query = `
            SELECT v.*, u.email, u.is_active as status, u.suspended_reason, u.created_at as joinedDate,
                   COUNT(DISTINCT p.id) as totalProducts,
                   COALESCE(SUM(CASE WHEN o.status = 'delivered' THEN o.total ELSE 0 END), 0) as totalSales
            FROM vendors v 
            JOIN users u ON v.user_id = u.id 
            LEFT JOIN products p ON p.vendor_id = u.id AND p.status != 'rejected'
            LEFT JOIN orders o ON o.user_id = u.id
            WHERE u.role = 'vendor'
        `;
        
        const params = [];
        
        if (status && status !== 'all') {
            const isActive = status === 'active' ? 1 : 0;
            query += ` AND u.is_active = ?`;
            params.push(isActive);
        }
        
        if (search) {
            query += ` AND (v.company_name LIKE ? OR u.email LIKE ? OR v.gst_number LIKE ? OR v.phone LIKE ?)`;
            const searchPattern = `%${search}%`;
            params.push(searchPattern, searchPattern, searchPattern, searchPattern);
        }
        
        query += ` GROUP BY v.id, u.id`;
        query += ` ORDER BY u.created_at DESC LIMIT ? OFFSET ?`;
        params.push(limit, offset);
        
        const [rows] = await pool.execute(query, params);
        return rows;
    }

    static async getCount(status = null, search = null) {
        let query = `
            SELECT COUNT(*) as total 
            FROM vendors v 
            JOIN users u ON v.user_id = u.id 
            WHERE u.role = 'vendor'
        `;
        
        const params = [];
        
        if (status && status !== 'all') {
            const isActive = status === 'active' ? 1 : 0;
            query += ` AND u.is_active = ?`;
            params.push(isActive);
        }
        
        if (search) {
            query += ` AND (v.company_name LIKE ? OR u.email LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`);
        }
        
        const [rows] = await pool.execute(query, params);
        return rows[0].total;
    }

    static async findByEmail(email) {
        const [rows] = await pool.execute(
            `SELECT v.*, u.id as user_id, u.email, u.password, u.role, u.is_active as status, u.suspended_reason
             FROM vendors v 
             JOIN users u ON v.user_id = u.id 
             WHERE u.email = ?`,
            [email]
        );
        return rows[0];
    }

    // Update vendor status
    static async updateStatus(vendorId, status, reason = null) {
        const isActive = status === 'active' ? 1 : 0;
        const [result] = await pool.execute(
            'UPDATE users SET is_active = ?, suspended_reason = ? WHERE id = ? AND role = "vendor"',
            [isActive, reason, vendorId]
        );
        return result;
    }

    // Get vendor statistics
    static async getStats(vendorId) {
        const [products] = await pool.execute(
            'SELECT COUNT(*) as total FROM products WHERE vendor_id = ? AND status != "rejected"',
            [vendorId]
        );
        
        const [orders] = await pool.execute(`
            SELECT 
                COUNT(*) as totalOrders,
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pendingOrders,
                COUNT(CASE WHEN status = 'processing' THEN 1 END) as processingOrders,
                COUNT(CASE WHEN status = 'shipped' THEN 1 END) as shippedOrders,
                COUNT(CASE WHEN status = 'delivered' THEN 1 END) as deliveredOrders,
                COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelledOrders,
                COALESCE(SUM(CASE WHEN status = 'delivered' THEN total ELSE 0 END), 0) as totalEarnings
            FROM orders
            WHERE user_id = ?
        `, [vendorId]);
        
        const [lowStock] = await pool.execute(
            'SELECT COUNT(*) as total FROM products WHERE vendor_id = ? AND stock <= 10 AND status != "rejected"',
            [vendorId]
        );
        
        const [views] = await pool.execute(
            'SELECT COALESCE(SUM(views), 0) as total FROM products WHERE vendor_id = ?',
            [vendorId]
        );
        
        const [rating] = await pool.execute(`
            SELECT COALESCE(AVG(r.rating), 0) as average, COUNT(r.id) as total
            FROM reviews r
            JOIN products p ON p.id = r.product_id
            WHERE p.vendor_id = ?
        `, [vendorId]);
        
        return {
            totalProducts: products[0].total,
            totalOrders: orders[0].totalOrders,
            totalEarnings: parseFloat(orders[0].totalEarnings),
            pendingOrders: orders[0].pendingOrders,
            processingOrders: orders[0].processingOrders,
            shippedOrders: orders[0].shippedOrders,
            deliveredOrders: orders[0].deliveredOrders,
            cancelledOrders: orders[0].cancelledOrders,
            lowStockProducts: lowStock[0].total,
            totalViews: views[0].total,
            averageRating: parseFloat(rating[0].average).toFixed(1),
            totalReviews: rating[0].total
        };
    }

    // Get vendor analytics by period
    static async getAnalytics(vendorId, period = 'month') {
        let groupBy;
        let dateFormat;
        
        switch(period) {
            case 'week':
                groupBy = 'DATE(created_at)';
                dateFormat = '%Y-%m-%d';
                break;
            case 'month':
                groupBy = 'DATE_FORMAT(created_at, "%Y-%m")';
                dateFormat = '%Y-%m';
                break;
            case 'year':
                groupBy = 'DATE_FORMAT(created_at, "%Y")';
                dateFormat = '%Y';
                break;
            default:
                groupBy = 'DATE_FORMAT(created_at, "%Y-%m")';
                dateFormat = '%Y-%m';
        }
        
        const [salesAnalytics] = await pool.execute(`
            SELECT 
                ${groupBy} as period,
                COUNT(*) as orderCount,
                COALESCE(SUM(total), 0) as totalSales,
                COALESCE(AVG(total), 0) as averageOrderValue
            FROM orders
            WHERE user_id = ? AND status = 'delivered'
            GROUP BY period
            ORDER BY period DESC
            LIMIT 12
        `, [vendorId]);
        
        const [topProducts] = await pool.execute(`
            SELECT 
                p.id, 
                p.name, 
                p.price,
                COUNT(oi.id) as orderCount, 
                COALESCE(SUM(oi.quantity), 0) as totalSold,
                COALESCE(SUM(oi.quantity * oi.price), 0) as totalRevenue
            FROM products p
            LEFT JOIN order_items oi ON oi.product_id = p.id
            LEFT JOIN orders o ON o.id = oi.order_id AND o.status = 'delivered'
            WHERE p.vendor_id = ?
            GROUP BY p.id
            ORDER BY totalSold DESC
            LIMIT 5
        `, [vendorId]);
        
        const [categoryAnalytics] = await pool.execute(`
            SELECT 
                c.name as category,
                COUNT(DISTINCT p.id) as productCount,
                COALESCE(SUM(oi.quantity), 0) as totalSold
            FROM categories c
            LEFT JOIN products p ON p.category_id = c.id AND p.vendor_id = ?
            LEFT JOIN order_items oi ON oi.product_id = p.id
            LEFT JOIN orders o ON o.id = oi.order_id AND o.status = 'delivered'
            GROUP BY c.id
            ORDER BY totalSold DESC
            LIMIT 5
        `, [vendorId]);
        
        return {
            salesAnalytics,
            topProducts,
            categoryAnalytics
        };
    }

    // Get vendor commissions
    static async getCommissions(vendorId) {
        const [commissions] = await pool.execute(`
            SELECT cp.id, cp.amount, cp.transaction_id, cp.status, cp.created_at,
                   DATE_FORMAT(cp.created_at, '%Y-%m-%d') as date
            FROM commission_payments cp
            WHERE cp.vendor_id = ?
            ORDER BY cp.created_at DESC
        `, [vendorId]);
        
        const [totalEarned] = await pool.execute(`
            SELECT COALESCE(SUM(amount), 0) as total
            FROM commission_payments
            WHERE vendor_id = ? AND status = 'paid'
        `, [vendorId]);
        
        const [pendingAmount] = await pool.execute(`
            SELECT COALESCE(SUM(amount), 0) as total
            FROM commission_payments
            WHERE vendor_id = ? AND status = 'pending'
        `, [vendorId]);
        
        // Get commission rate
        const [commissionRate] = await pool.execute(`
            SELECT COALESCE(vc.commission_rate, cs.defaultRate) as rate
            FROM commission_settings cs
            LEFT JOIN vendor_commissions vc ON vc.vendor_id = ?
            LIMIT 1
        `, [vendorId]);
        
        return {
            commissions,
            totalEarned: parseFloat(totalEarned[0].total),
            pendingAmount: parseFloat(pendingAmount[0].total),
            commissionRate: parseFloat(commissionRate[0]?.rate || 10)
        };
    }

    // Update catalog URL
    static async updateCatalog(vendorId, catalogUrl) {
        const [result] = await pool.execute(
            'UPDATE vendors SET catalog_url = ? WHERE user_id = ?',
            [catalogUrl, vendorId]
        );
        return result;
    }

    // Get catalog URL
    static async getCatalog(vendorId) {
        const [rows] = await pool.execute(
            'SELECT catalog_url FROM vendors WHERE user_id = ?',
            [vendorId]
        );
        return rows[0]?.catalog_url || null;
    }

    // Update GST verification status
    static async updateGSTStatus(vendorId, isVerified, gstDetails = null) {
        const [result] = await pool.execute(
            'UPDATE vendors SET gst_verified = ?, gst_details = ? WHERE user_id = ?',
            [isVerified, gstDetails ? JSON.stringify(gstDetails) : null, vendorId]
        );
        return result;
    }

    // Get vendor by GST number
    static async findByGST(gstNumber) {
        const [rows] = await pool.execute(
            `SELECT v.*, u.email, u.is_active as status
             FROM vendors v 
             JOIN users u ON v.user_id = u.id 
             WHERE v.gst_number = ?`,
            [gstNumber]
        );
        return rows[0];
    }

    // Get vendor performance metrics
    static async getPerformanceMetrics(vendorId) {
        const [metrics] = await pool.execute(`
            SELECT 
                DATE_FORMAT(o.created_at, '%Y-%m') as month,
                COUNT(DISTINCT o.id) as orders,
                COALESCE(SUM(o.total), 0) as revenue,
                COALESCE(AVG(r.rating), 0) as rating
            FROM orders o
            LEFT JOIN products p ON p.vendor_id = o.user_id
            LEFT JOIN reviews r ON r.product_id = p.id
            WHERE o.user_id = ? AND o.status = 'delivered'
            GROUP BY month
            ORDER BY month DESC
            LIMIT 6
        `, [vendorId]);
        
        return metrics;
    }

    // Get dashboard summary
    static async getDashboardSummary(vendorId) {
        const stats = await this.getStats(vendorId);
        const recentOrders = await this.getRecentOrders(vendorId);
        const recentProducts = await this.getRecentProducts(vendorId);
        const notifications = await this.getUnreadNotifications(vendorId);
        
        return {
            stats,
            recentOrders,
            recentProducts,
            unreadNotifications: notifications.length,
            notifications: notifications.slice(0, 5)
        };
    }

    // Get recent orders for vendor
    static async getRecentOrders(vendorId, limit = 5) {
        const [rows] = await pool.execute(`
            SELECT o.id, o.order_id, o.total, o.status, o.created_at,
                   u.name as customer_name
            FROM orders o
            JOIN users u ON u.id = o.customer_id
            WHERE o.user_id = ?
            ORDER BY o.created_at DESC
            LIMIT ?
        `, [vendorId, limit]);
        return rows;
    }

    // Get recent products for vendor
    static async getRecentProducts(vendorId, limit = 5) {
        const [rows] = await pool.execute(`
            SELECT id, name, price, stock, status, created_at, image
            FROM products
            WHERE vendor_id = ?
            ORDER BY created_at DESC
            LIMIT ?
        `, [vendorId, limit]);
        return rows;
    }

    // Get unread notifications
    static async getUnreadNotifications(vendorId) {
        const [rows] = await pool.execute(`
            SELECT * FROM notifications
            WHERE user_id = ? AND user_type = 'vendor' AND is_read = 0
            ORDER BY created_at DESC
        `, [vendorId]);
        return rows;
    }

    // Get total earnings by date range
    static async getEarningsByDateRange(vendorId, startDate, endDate) {
        const [rows] = await pool.execute(`
            SELECT 
                DATE(created_at) as date,
                COUNT(*) as orderCount,
                COALESCE(SUM(total), 0) as earnings
            FROM orders
            WHERE user_id = ? AND status = 'delivered' 
                AND DATE(created_at) BETWEEN ? AND ?
            GROUP BY DATE(created_at)
            ORDER BY date ASC
        `, [vendorId, startDate, endDate]);
        return rows;
    }

    // Check if vendor can add more products (based on plan)
    static async canAddProduct(vendorId) {
        const [count] = await pool.execute(
            'SELECT COUNT(*) as total FROM products WHERE vendor_id = ?',
            [vendorId]
        );
        // Assuming free plan allows 50 products
        return count[0].total < 50;
    }

    // Get vendor subscription/plan details
    static async getPlanDetails(vendorId) {
        const [rows] = await pool.execute(`
            SELECT plan_type, product_limit, commission_rate, expires_at
            FROM vendor_subscriptions
            WHERE vendor_id = ? AND status = 'active'
            ORDER BY created_at DESC
            LIMIT 1
        `, [vendorId]);
        return rows[0] || { plan_type: 'free', product_limit: 50, commission_rate: 10 };
    }
}

module.exports = Vendor;
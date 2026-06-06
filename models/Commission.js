const pool = require('../config/db');

class Commission {
    // Get default commission rate (Admin gets this percentage)
    static async getDefaultRate() {
        try {
            const [rows] = await pool.execute(
                'SELECT defaultRate FROM commission_settings WHERE id = 1',
                []
            );
            return rows[0]?.defaultRate || 15; // Changed to 15%
        } catch (error) {
            console.error('Error in Commission.getDefaultRate:', error);
            return 15;
        }
    }

    // Update default commission rate
    static async updateDefaultRate(rate) {
        try {
            const [result] = await pool.execute(
                `INSERT INTO commission_settings (id, defaultRate) 
                 VALUES (1, ?) 
                 ON DUPLICATE KEY UPDATE defaultRate = ?`,
                [rate, rate]
            );
            return result;
        } catch (error) {
            console.error('Error in Commission.updateDefaultRate:', error);
            throw error;
        }
    }

    // Get vendor commission rate (Admin's commission percentage)
    static async getVendorRate(vendorId) {
        try {
            const [rows] = await pool.execute(
                `SELECT commission_rate 
                 FROM vendor_commissions 
                 WHERE vendor_id = ?`,
                [vendorId]
            );
            
            if (rows[0]) {
                return rows[0].commission_rate;
            }
            
            return await this.getDefaultRate();
        } catch (error) {
            console.error('Error in Commission.getVendorRate:', error);
            throw error;
        }
    }

    // Set vendor commission rate
    static async setVendorRate(vendorId, rate) {
        try {
            const [result] = await pool.execute(
                `INSERT INTO vendor_commissions (vendor_id, commission_rate) 
                 VALUES (?, ?) 
                 ON DUPLICATE KEY UPDATE commission_rate = ?`,
                [vendorId, rate, rate]
            );
            return result;
        } catch (error) {
            console.error('Error in Commission.setVendorRate:', error);
            throw error;
        }
    }

    // Calculate commission for an order
    // admin_commission = admin's share, vendor_earnings = vendor's share
    static async calculateCommission(vendorId, amount) {
        try {
            const adminRate = await this.getVendorRate(vendorId);
            const vendorRate = 100 - adminRate;
            
            const adminCommission = (amount * adminRate) / 100;
            const vendorEarnings = (amount * vendorRate) / 100;
            
            return {
                admin_rate: adminRate,
                vendor_rate: vendorRate,
                admin_commission: adminCommission,
                vendor_earnings: vendorEarnings,
                total_amount: amount
            };
        } catch (error) {
            console.error('Error in Commission.calculateCommission:', error);
            throw error;
        }
    }

    // Calculate commission for order items (with product-specific rates)
    static async calculateItemCommission(vendorId, productPrice, quantity) {
        try {
            const amount = productPrice * quantity;
            const adminRate = await this.getVendorRate(vendorId);
            const vendorRate = 100 - adminRate;
            
            return {
                amount: amount,
                admin_rate: adminRate,
                vendor_rate: vendorRate,
                admin_commission: (amount * adminRate) / 100,
                vendor_earnings: (amount * vendorRate) / 100
            };
        } catch (error) {
            console.error('Error in Commission.calculateItemCommission:', error);
            throw error;
        }
    }

    // Get all vendor commissions (for admin)
    static async getAllVendorCommissions() {
        try {
            const [rows] = await pool.execute(`
                SELECT 
                    v.user_id as vendor_id,
                    v.company_name as vendor_name,
                    v.phone,
                    v.email,
                    COALESCE(vc.commission_rate, cs.defaultRate) as admin_commission_rate,
                    100 - COALESCE(vc.commission_rate, cs.defaultRate) as vendor_commission_rate,
                    COALESCE(SUM(CASE WHEN o.status = 'delivered' THEN (oi.price * oi.quantity) ELSE 0 END), 0) as total_sales,
                    COALESCE(SUM(CASE WHEN o.status = 'delivered' THEN (oi.price * oi.quantity * COALESCE(vc.commission_rate, cs.defaultRate) / 100) ELSE 0 END), 0) as total_admin_earned,
                    COALESCE(SUM(CASE WHEN o.status = 'delivered' THEN (oi.price * oi.quantity * (100 - COALESCE(vc.commission_rate, cs.defaultRate)) / 100) ELSE 0 END), 0) as total_vendor_earned,
                    COALESCE(SUM(CASE WHEN o.status = 'delivered' AND cp.status = 'paid' THEN (oi.price * oi.quantity * COALESCE(vc.commission_rate, cs.defaultRate) / 100) ELSE 0 END), 0) as paid_to_admin,
                    COALESCE(SUM(CASE WHEN o.status = 'delivered' AND cp.status != 'paid' THEN (oi.price * oi.quantity * COALESCE(vc.commission_rate, cs.defaultRate) / 100) ELSE 0 END), 0) as pending_admin_commission
                FROM users u
                JOIN vendors v ON u.id = v.user_id
                CROSS JOIN (SELECT defaultRate FROM commission_settings WHERE id = 1) cs
                LEFT JOIN vendor_commissions vc ON v.user_id = vc.vendor_id
                LEFT JOIN products p ON v.user_id = p.vendor_id
                LEFT JOIN order_items oi ON p.id = oi.product_id
                LEFT JOIN orders o ON oi.order_id = o.id
                LEFT JOIN commission_payments cp ON cp.vendor_id = v.user_id AND cp.order_id = o.id
                WHERE u.role = 'vendor'
                GROUP BY v.user_id, v.company_name
            `);
            return rows;
        } catch (error) {
            console.error('Error in Commission.getAllVendorCommissions:', error);
            throw error;
        }
    }

    // Get commission summary for a vendor
    static async getVendorSummary(vendorId) {
        try {
            const [rows] = await pool.execute(`
                SELECT 
                    COALESCE(SUM(CASE WHEN o.status = 'delivered' THEN (oi.price * oi.quantity) ELSE 0 END), 0) as total_sales,
                    COALESCE(SUM(CASE WHEN o.status = 'delivered' THEN (oi.price * oi.quantity * COALESCE(vc.commission_rate, cs.defaultRate) / 100) ELSE 0 END), 0) as admin_commission,
                    COALESCE(SUM(CASE WHEN o.status = 'delivered' THEN (oi.price * oi.quantity * (100 - COALESCE(vc.commission_rate, cs.defaultRate)) / 100) ELSE 0 END), 0) as vendor_earnings,
                    COALESCE(SUM(CASE WHEN o.status = 'delivered' AND cp.status = 'paid' THEN (oi.price * oi.quantity * COALESCE(vc.commission_rate, cs.defaultRate) / 100) ELSE 0 END), 0) as commission_paid,
                    COALESCE(SUM(CASE WHEN o.status = 'delivered' AND cp.status != 'paid' THEN (oi.price * oi.quantity * COALESCE(vc.commission_rate, cs.defaultRate) / 100) ELSE 0 END), 0) as pending_commission,
                    COALESCE(vc.commission_rate, cs.defaultRate) as admin_commission_rate,
                    100 - COALESCE(vc.commission_rate, cs.defaultRate) as vendor_commission_rate
                FROM (SELECT defaultRate FROM commission_settings WHERE id = 1) cs
                LEFT JOIN vendor_commissions vc ON vc.vendor_id = ?
                LEFT JOIN products p ON p.vendor_id = ?
                LEFT JOIN order_items oi ON p.id = oi.product_id
                LEFT JOIN orders o ON oi.order_id = o.id
                LEFT JOIN commission_payments cp ON cp.vendor_id = ? AND cp.order_id = o.id
            `, [vendorId, vendorId, vendorId]);
            
            return rows[0] || {
                total_sales: 0,
                admin_commission: 0,
                vendor_earnings: 0,
                commission_paid: 0,
                pending_commission: 0,
                admin_commission_rate: 15,
                vendor_commission_rate: 85
            };
        } catch (error) {
            console.error('Error in Commission.getVendorSummary:', error);
            throw error;
        }
    }

    // Get commission transactions for a vendor
    static async getTransactions(vendorId, { limit = 50, offset = 0 } = {}) {
        try {
            const adminRate = await this.getVendorRate(vendorId);
            const vendorRate = 100 - adminRate;
            
            const [rows] = await pool.execute(`
                SELECT 
                    o.id as order_id,
                    o.order_id as order_number,
                    o.created_at as date,
                    oi.price * oi.quantity as sale_amount,
                    (oi.price * oi.quantity * ? / 100) as admin_commission,
                    (oi.price * oi.quantity * ? / 100) as vendor_earnings,
                    o.payment_status,
                    o.status as order_status,
                    cp.status as commission_status,
                    cp.transaction_id,
                    cp.created_at as paid_date
                FROM products p
                JOIN order_items oi ON p.id = oi.product_id
                JOIN orders o ON oi.order_id = o.id
                LEFT JOIN commission_payments cp ON cp.order_id = o.id AND cp.vendor_id = p.vendor_id
                WHERE p.vendor_id = ? AND o.status = 'delivered'
                ORDER BY o.created_at DESC
                LIMIT ? OFFSET ?
            `, [adminRate, vendorRate, vendorId, parseInt(limit), parseInt(offset)]);

            const [countResult] = await pool.execute(`
                SELECT COUNT(*) as total
                FROM products p
                JOIN order_items oi ON p.id = oi.product_id
                JOIN orders o ON oi.order_id = o.id
                WHERE p.vendor_id = ? AND o.status = 'delivered'
            `, [vendorId]);

            return {
                transactions: rows,
                total: countResult[0].total,
                admin_rate: adminRate,
                vendor_rate: vendorRate
            };
        } catch (error) {
            console.error('Error in Commission.getTransactions:', error);
            throw error;
        }
    }

    // Mark commission as paid (for admin payout)
    static async markAsPaid(vendorId, orderId, amount, transactionId = null) {
        try {
            const [result] = await pool.execute(
                `INSERT INTO commission_payments (vendor_id, order_id, amount, transaction_id, status) 
                 VALUES (?, ?, ?, ?, 'paid')`,
                [vendorId, orderId, amount, transactionId]
            );
            return result;
        } catch (error) {
            console.error('Error in Commission.markAsPaid:', error);
            throw error;
        }
    }

    // Get payment history for a vendor
    static async getPaymentHistory(vendorId, { limit = 50, offset = 0 } = {}) {
        try {
            const [rows] = await pool.execute(`
                SELECT 
                    cp.*,
                    o.order_id as order_number,
                    o.total as order_total
                FROM commission_payments cp
                JOIN orders o ON cp.order_id = o.id
                WHERE cp.vendor_id = ?
                ORDER BY cp.created_at DESC
                LIMIT ? OFFSET ?
            `, [vendorId, parseInt(limit), parseInt(offset)]);

            const [countResult] = await pool.execute(
                'SELECT COUNT(*) as total FROM commission_payments WHERE vendor_id = ?',
                [vendorId]
            );

            return {
                payments: rows,
                total: countResult[0].total
            };
        } catch (error) {
            console.error('Error in Commission.getPaymentHistory:', error);
            throw error;
        }
    }

    // Get admin commission summary
    static async getAdminCommissionSummary() {
        try {
            const [rows] = await pool.execute(`
                SELECT 
                    COALESCE(SUM(CASE WHEN o.status = 'delivered' THEN (oi.price * oi.quantity * cs.defaultRate / 100) ELSE 0 END), 0) as total_commission_earned,
                    COALESCE(SUM(CASE WHEN o.status = 'delivered' AND cp.status = 'paid' THEN (oi.price * oi.quantity * cs.defaultRate / 100) ELSE 0 END), 0) as total_commission_paid,
                    COALESCE(SUM(CASE WHEN o.status = 'delivered' AND cp.status != 'paid' THEN (oi.price * oi.quantity * cs.defaultRate / 100) ELSE 0 END), 0) as total_commission_pending,
                    COUNT(DISTINCT o.id) as total_orders_with_commission,
                    COUNT(DISTINCT p.vendor_id) as active_vendors
                FROM commission_settings cs
                LEFT JOIN vendor_commissions vc ON 1=1
                LEFT JOIN products p ON 1=1
                LEFT JOIN order_items oi ON p.id = oi.product_id
                LEFT JOIN orders o ON oi.order_id = o.id
                LEFT JOIN commission_payments cp ON cp.order_id = o.id
                WHERE cs.id = 1
            `);
            return rows[0];
        } catch (error) {
            console.error('Error in Commission.getAdminCommissionSummary:', error);
            throw error;
        }
    }

    // Get monthly commission report
    static async getMonthlyCommissionReport(year, month) {
        try {
            const [rows] = await pool.execute(`
                SELECT 
                    DATE(o.created_at) as date,
                    COUNT(DISTINCT o.id) as orders_count,
                    COALESCE(SUM(oi.price * oi.quantity), 0) as total_sales,
                    COALESCE(SUM(oi.price * oi.quantity * cs.defaultRate / 100), 0) as commission_earned,
                    COALESCE(SUM(CASE WHEN cp.status = 'paid' THEN (oi.price * oi.quantity * cs.defaultRate / 100) ELSE 0 END), 0) as commission_paid
                FROM commission_settings cs
                LEFT JOIN orders o ON YEAR(o.created_at) = ? AND MONTH(o.created_at) = ? AND o.status = 'delivered'
                LEFT JOIN order_items oi ON o.id = oi.order_id
                LEFT JOIN products p ON oi.product_id = p.id
                LEFT JOIN commission_payments cp ON cp.order_id = o.id
                WHERE cs.id = 1
                GROUP BY DATE(o.created_at)
                ORDER BY date DESC
            `, [year, month]);
            return rows;
        } catch (error) {
            console.error('Error in Commission.getMonthlyCommissionReport:', error);
            throw error;
        }
    }
}

module.exports = Commission;
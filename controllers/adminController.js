const User = require('../models/User');
const Vendor = require('../models/Vendor');
const Buyer = require('../models/Buyer');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Category = require('../models/Category');
const Banner = require('../models/Banner');
const Commission = require('../models/Commission');
const pool = require('../config/db');

// ==================== Dashboard Stats ====================
const getAdminStats = async (req, res) => {
    try {
        // Get total users
        const [userStats] = await pool.execute(`
            SELECT 
                COUNT(*) as totalUsers,
                SUM(CASE WHEN role = 'vendor' THEN 1 ELSE 0 END) as totalVendors,
                SUM(CASE WHEN role = 'buyer' THEN 1 ELSE 0 END) as totalBuyers,
                SUM(CASE WHEN role = 'vendor' AND is_active = 0 THEN 1 ELSE 0 END) as pendingVendors
            FROM users
        `);

        // Get total products
        const [productStats] = await pool.execute(`
            SELECT 
                COUNT(*) as totalProducts,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pendingProducts,
                SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approvedProducts
            FROM products
        `);

        // Get total orders and revenue
        const [orderStats] = await pool.execute(`
            SELECT 
                COUNT(*) as totalOrders,
                COALESCE(SUM(total), 0) as totalRevenue,
                COALESCE(SUM(CASE WHEN status = 'pending' THEN total ELSE 0 END), 0) as pendingAmount
            FROM orders
        `);

        // Get recent orders
        const [recentOrders] = await pool.execute(`
            SELECT o.*, u.email as customerEmail 
            FROM orders o
            JOIN users u ON o.user_id = u.id
            ORDER BY o.created_at DESC
            LIMIT 5
        `);

        res.json({
            success: true,
            data: {
                stats: {
                    totalVendors: userStats[0].totalVendors || 0,
                    totalBuyers: userStats[0].totalBuyers || 0,
                    pendingVendors: userStats[0].pendingVendors || 0,
                    totalProducts: productStats[0].totalProducts || 0,
                    pendingProducts: productStats[0].pendingProducts || 0,
                    totalOrders: orderStats[0].totalOrders || 0,
                    totalRevenue: orderStats[0].totalRevenue || 0,
                    pendingAmount: orderStats[0].pendingAmount || 0
                },
                recentOrders
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// ==================== Vendor Management ====================
// Get all vendors with pagination and filters
const getVendors = async (req, res) => {
    try {
        const { status, page = 1, limit = 10 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        
        let query = `
            SELECT 
                u.id, 
                u.email, 
                u.is_active as status, 
                u.created_at as joinedDate,
                v.company_name as companyName, 
                v.gst_number as gstNumber, 
                v.phone, 
                v.city, 
                v.state,
                v.address,
                v.pan_number as panNumber,
                v.website,
                v.business_type as businessType,
                COUNT(DISTINCT p.id) as totalProducts,
                COALESCE(SUM(oi.price * oi.quantity), 0) as totalSales
            FROM users u
            INNER JOIN vendors v ON u.id = v.user_id
            LEFT JOIN products p ON u.id = p.vendor_id
            LEFT JOIN order_items oi ON p.id = oi.product_id
            LEFT JOIN orders o ON oi.order_id = o.id AND o.status = 'delivered'
            WHERE u.role = 'vendor'
        `;
        
        const params = [];
        
        if (status === 'pending') {
            query += ` AND u.is_active = 0`;
        } else if (status === 'active') {
            query += ` AND u.is_active = 1`;
        } else if (status === 'suspended') {
            query += ` AND u.is_active = 0 AND u.suspended_reason IS NOT NULL`;
        }
        
        query += ` GROUP BY u.id, v.id ORDER BY u.created_at DESC LIMIT ? OFFSET ?`;
        params.push(parseInt(limit), offset);
        
        const [vendors] = await pool.execute(query, params);
        
        // Get total count
        let countQuery = `SELECT COUNT(*) as total FROM users WHERE role = 'vendor'`;
        if (status === 'pending') {
            countQuery += ` AND is_active = 0`;
        } else if (status === 'active') {
            countQuery += ` AND is_active = 1`;
        }
        
        const [countResult] = await pool.execute(countQuery);
        
        res.json({
            success: true,
            data: vendors,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: countResult[0].total,
                totalPages: Math.ceil(countResult[0].total / limit)
            }
        });
    } catch (error) {
        console.error('Get vendors error:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// Get vendor by ID with products and orders
const getVendorById = async (req, res) => {
    try {
        const { id } = req.params;
        
        console.log('Fetching vendor with ID:', id);
        
        // প্রথমে চেক করুন ইউজার আছে কিনা
        const [userCheck] = await pool.execute(`
            SELECT id, email, role, is_active 
            FROM users 
            WHERE id = ? AND role = 'vendor'
        `, [id]);
        
        console.log('User check result:', userCheck);
        
        if (!userCheck || userCheck.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Vendor not found. No user with this ID exists.' 
            });
        }
        
        // ভেন্ডরের বিস্তারিত তথ্য
        const [vendor] = await pool.execute(`
            SELECT 
                u.id, 
                u.email, 
                u.is_active as status, 
                u.created_at as joinedDate,
                v.company_name as companyName, 
                v.gst_number as gstNumber, 
                v.pan_number as panNumber,
                v.address, 
                v.city, 
                v.state, 
                v.pincode, 
                v.phone, 
                v.website, 
                v.business_type as businessType,
                COUNT(DISTINCT p.id) as totalProducts,
                COALESCE(SUM(oi.price * oi.quantity), 0) as totalSales,
                COUNT(DISTINCT o.id) as totalOrders
            FROM users u
            LEFT JOIN vendors v ON u.id = v.user_id
            LEFT JOIN products p ON u.id = p.vendor_id
            LEFT JOIN order_items oi ON p.id = oi.product_id
            LEFT JOIN orders o ON oi.order_id = o.id AND o.status = 'delivered'
            WHERE u.id = ? AND u.role = 'vendor'
            GROUP BY u.id, v.id
        `, [id]);
        
        console.log('Vendor query result:', vendor);
        
        if (!vendor || vendor.length === 0 || !vendor[0].companyName) {
            return res.status(404).json({ 
                success: false, 
                message: 'Vendor profile not found. Please check if vendor has completed registration.' 
            });
        }
        
        // ভেন্ডরের প্রোডাক্ট লিস্ট
        const [products] = await pool.execute(`
            SELECT 
                id, 
                name, 
                price, 
                stock, 
                status, 
                created_at,
                image
            FROM products
            WHERE vendor_id = ?
            ORDER BY created_at DESC
            LIMIT 10
        `, [id]);
        
        // ভেন্ডরের অর্ডার লিস্ট
        const [orders] = await pool.execute(`
            SELECT DISTINCT
                o.id, 
                o.order_id, 
                o.total, 
                o.status, 
                o.created_at, 
                u.email as customerEmail,
                u.id as customerId
            FROM orders o
            JOIN users u ON o.user_id = u.id
            JOIN order_items oi ON o.id = oi.order_id
            JOIN products p ON oi.product_id = p.id
            WHERE p.vendor_id = ?
            ORDER BY o.created_at DESC
            LIMIT 10
        `, [id]);
        
        res.json({
            success: true,
            data: {
                ...vendor[0],
                products: products || [],
                orders: orders || []
            }
        });
        
    } catch (error) {
        console.error('Get vendor by id error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error', 
            error: error.message 
        });
    }
};

const approveVendor = async (req, res) => {
    try {
        const { id } = req.params;
        
        await pool.execute('UPDATE users SET is_active = 1 WHERE id = ? AND role = "vendor"', [id]);
        
        res.json({ success: true, message: 'Vendor approved successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

const rejectVendor = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        
        // Delete the vendor
        await pool.execute('DELETE FROM users WHERE id = ? AND role = "vendor"', [id]);
        
        // TODO: Send rejection email with reason
        
        res.json({ success: true, message: 'Vendor rejected successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

const suspendVendor = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        
        await pool.execute('UPDATE users SET is_active = 0, suspended_reason = ? WHERE id = ? AND role = "vendor"', [reason, id]);
        
        res.json({ success: true, message: 'Vendor suspended successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

const activateVendor = async (req, res) => {
    try {
        const { id } = req.params;
        
        await pool.execute('UPDATE users SET is_active = 1, suspended_reason = NULL WHERE id = ? AND role = "vendor"', [id]);
        
        res.json({ success: true, message: 'Vendor activated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// ==================== Buyer Management ====================
const getBuyers = async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;
        
        const [buyers] = await pool.execute(`
            SELECT u.id, u.email, u.is_active as status, u.created_at as joinedDate,
                   b.full_name as name, b.phone, b.city, b.state,
                   COUNT(DISTINCT o.id) as totalOrders,
                   COALESCE(SUM(o.total), 0) as totalSpent
            FROM users u
            JOIN buyers b ON u.id = b.user_id
            LEFT JOIN orders o ON u.id = o.user_id
            WHERE u.role = 'buyer'
            GROUP BY u.id
            ORDER BY u.created_at DESC
            LIMIT ? OFFSET ?
        `, [parseInt(limit), parseInt(offset)]);
        
        const [countResult] = await pool.execute('SELECT COUNT(*) as total FROM users WHERE role = "buyer"');
        
        res.json({
            success: true,
            data: buyers,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: countResult[0].total,
                totalPages: Math.ceil(countResult[0].total / limit)
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

const getBuyerById = async (req, res) => {
    try {
        const { id } = req.params;
        
        const [buyer] = await pool.execute(`
            SELECT u.id, u.email, u.is_active as status, u.created_at as joinedDate,
                   b.full_name as name, b.phone, b.city, b.state, b.pincode,
                   b.shipping_address as shippingAddress, b.billing_address as billingAddress,
                   b.date_of_birth as dateOfBirth, b.preferences,
                   COUNT(DISTINCT o.id) as totalOrders,
                   COALESCE(SUM(o.total), 0) as totalSpent
            FROM users u
            JOIN buyers b ON u.id = b.user_id
            LEFT JOIN orders o ON u.id = o.user_id
            WHERE u.id = ? AND u.role = 'buyer'
            GROUP BY u.id
        `, [id]);
        
        if (!buyer || buyer.length === 0) {
            return res.status(404).json({ success: false, message: 'Buyer not found' });
        }
        
        // Get buyer orders
        const [orders] = await pool.execute(`
            SELECT o.*
            FROM orders o
            WHERE o.user_id = ?
            ORDER BY o.created_at DESC
            LIMIT 10
        `, [id]);
        
        res.json({
            success: true,
            data: {
                ...buyer[0],
                orders
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

const suspendBuyer = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        
        await pool.execute('UPDATE users SET is_active = 0, suspended_reason = ? WHERE id = ? AND role = "buyer"', [reason, id]);
        
        res.json({ success: true, message: 'Buyer suspended successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

const activateBuyer = async (req, res) => {
    try {
        const { id } = req.params;
        
        await pool.execute('UPDATE users SET is_active = 1, suspended_reason = NULL WHERE id = ? AND role = "buyer"', [id]);
        
        res.json({ success: true, message: 'Buyer activated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// ==================== Product Management (Admin) ====================
const getAdminProducts = async (req, res) => {
    try {
        const { status, page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;
        
        let query = `
            SELECT p.*, v.company_name as vendorName, u.email as vendorEmail,
                   c.name as categoryName
            FROM products p
            JOIN vendors v ON p.vendor_id = v.user_id
            JOIN users u ON v.user_id = u.id
            LEFT JOIN categories c ON p.category_id = c.id
            WHERE 1=1
        `;
        
        const params = [];
        
        if (status) {
            query += ` AND p.status = ?`;
            params.push(status);
        }
        
        query += ` ORDER BY p.created_at DESC LIMIT ? OFFSET ?`;
        params.push(parseInt(limit), parseInt(offset));
        
        const [products] = await pool.execute(query, params);
        
        const [countResult] = await pool.execute(`
            SELECT COUNT(*) as total FROM products
            ${status ? 'WHERE status = ?' : ''}
        `, status ? [status] : []);
        
        res.json({
            success: true,
            data: products,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: countResult[0].total,
                totalPages: Math.ceil(countResult[0].total / limit)
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

const approveProduct = async (req, res) => {
    try {
        const { id } = req.params;
        
        await pool.execute('UPDATE products SET status = "approved" WHERE id = ?', [id]);
        
        res.json({ success: true, message: 'Product approved successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

const rejectProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        
        await pool.execute('UPDATE products SET status = "rejected", rejection_reason = ? WHERE id = ?', [reason, id]);
        
        res.json({ success: true, message: 'Product rejected successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

const deleteProduct = async (req, res) => {
    try {
        const { id } = req.params;
        
        await pool.execute('DELETE FROM products WHERE id = ?', [id]);
        
        res.json({ success: true, message: 'Product deleted successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// ==================== Order Management (Admin) ====================
const getAdminOrders = async (req, res) => {
    try {
        const { status, page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;
        
        let query = `
            SELECT o.*, u.email as customerEmail, u.id as customerId
            FROM orders o
            JOIN users u ON o.user_id = u.id
            WHERE 1=1
        `;
        
        const params = [];
        
        if (status) {
            query += ` AND o.status = ?`;
            params.push(status);
        }
        
        query += ` ORDER BY o.created_at DESC LIMIT ? OFFSET ?`;
        params.push(parseInt(limit), parseInt(offset));
        
        const [orders] = await pool.execute(query, params);
        
        const [countResult] = await pool.execute(`
            SELECT COUNT(*) as total FROM orders
            ${status ? 'WHERE status = ?' : ''}
        `, status ? [status] : []);
        
        res.json({
            success: true,
            data: orders,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: countResult[0].total,
                totalPages: Math.ceil(countResult[0].total / limit)
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

const getOrderDetails = async (req, res) => {
    try {
        const { id } = req.params;
        
        const [order] = await pool.execute(`
            SELECT o.*, u.email as customerEmail, u.id as customerId
            FROM orders o
            JOIN users u ON o.user_id = u.id
            WHERE o.id = ?
        `, [id]);
        
        if (!order || order.length === 0) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }
        
        const [items] = await pool.execute(`
            SELECT oi.*, p.name as productName, p.image as productImage
            FROM order_items oi
            JOIN products p ON oi.product_id = p.id
            WHERE oi.order_id = ?
        `, [id]);
        
        res.json({
            success: true,
            data: {
                ...order[0],
                items
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

const updateOrderStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        await pool.execute('UPDATE orders SET status = ? WHERE id = ?', [status, id]);
        
        res.json({ success: true, message: 'Order status updated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// ==================== Category Management ====================
const getCategories = async (req, res) => {
    try {
        const [categories] = await pool.execute(`
            SELECT c.*, COUNT(p.id) as productCount
            FROM categories c
            LEFT JOIN products p ON c.id = p.category_id
            GROUP BY c.id
            ORDER BY c.order ASC
        `);
        
        res.json({ success: true, data: categories });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

const addCategory = async (req, res) => {
    try {
        // FormData থেকে ডাটা নিন
        const { name, order = 0 } = req.body;
        let image = null;
        
        // যদি ফাইল আপলোড করা থাকে
        if (req.file) {
            image = `/uploads/categories/${req.file.filename}`;
        }
        
        if (!name || name.trim() === '') {
            return res.status(400).json({ success: false, message: 'Category name is required' });
        }
        
        // Create slug from name
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        
        console.log('Adding category:', { name, slug, image, order });
        
        const [result] = await pool.execute(
            'INSERT INTO categories (name, slug, image, `order`) VALUES (?, ?, ?, ?)',
            [name.trim(), slug, image, parseInt(order) || 0]
        );
        
        res.json({ 
            success: true, 
            data: { id: result.insertId, name, slug, image, order },
            message: 'Category added successfully'
        });
    } catch (error) {
        console.error('Add category error:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

const updateCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, image, order, status } = req.body;
        
        const updates = [];
        const params = [];
        
        if (name) {
            updates.push('name = ?');
            params.push(name);
            updates.push('slug = ?');
            params.push(name.toLowerCase().replace(/ /g, '-'));
        }
        if (image !== undefined) {
            updates.push('image = ?');
            params.push(image);
        }
        if (order !== undefined) {
            updates.push('`order` = ?');
            params.push(order);
        }
        if (status !== undefined) {
            updates.push('status = ?');
            params.push(status);
        }
        
        params.push(id);
        
        await pool.execute(`UPDATE categories SET ${updates.join(', ')} WHERE id = ?`, params);
        
        res.json({ success: true, message: 'Category updated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// Get subcategories by category
const getSubcategoriesByCategory = async (req, res) => {
    try {
        const { categoryId } = req.params;
        
        const [subcategories] = await pool.execute(`
            SELECT * FROM subcategories 
            WHERE category_id = ? AND status = 'active'
            ORDER BY name ASC
        `, [categoryId]);
        
        res.json({ success: true, data: subcategories });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// Add new subcategory
const addSubcategory = async (req, res) => {
    try {
        const { name, category_id, status = 'active' } = req.body;
        
        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, message: 'Subcategory name is required' });
        }
        
        if (!category_id) {
            return res.status(400).json({ success: false, message: 'Category is required' });
        }
        
        // Create slug from name
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        
        // Check if category exists
        const [categoryExists] = await pool.execute('SELECT id FROM categories WHERE id = ?', [category_id]);
        if (categoryExists.length === 0) {
            return res.status(404).json({ success: false, message: 'Category not found' });
        }
        
        // Check if subcategory already exists in this category
        const [existing] = await pool.execute(
            'SELECT id FROM subcategories WHERE category_id = ? AND slug = ?',
            [category_id, slug]
        );
        
        if (existing.length > 0) {
            return res.status(400).json({ success: false, message: 'Subcategory already exists in this category' });
        }
        
        const [result] = await pool.execute(
            'INSERT INTO subcategories (name, slug, category_id, status) VALUES (?, ?, ?, ?)',
            [name.trim(), slug, category_id, status]
        );
        
        res.json({ 
            success: true, 
            data: { id: result.insertId, name, slug, category_id, status },
            message: 'Subcategory added successfully'
        });
    } catch (error) {
        console.error('Add subcategory error:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// Update subcategory
const updateSubcategory = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, status } = req.body;
        
        const updates = [];
        const params = [];
        
        if (name) {
            updates.push('name = ?');
            params.push(name);
            updates.push('slug = ?');
            params.push(name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
        }
        if (status !== undefined) {
            updates.push('status = ?');
            params.push(status);
        }
        
        if (updates.length === 0) {
            return res.status(400).json({ success: false, message: 'No fields to update' });
        }
        
        params.push(id);
        
        await pool.execute(`UPDATE subcategories SET ${updates.join(', ')} WHERE id = ?`, params);
        
        res.json({ success: true, message: 'Subcategory updated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// Delete subcategory
const deleteSubcategory = async (req, res) => {
    try {
        const { id } = req.params;
        
        await pool.execute('DELETE FROM subcategories WHERE id = ?', [id]);
        
        res.json({ success: true, message: 'Subcategory deleted successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

const deleteCategory = async (req, res) => {
    try {
        const { id } = req.params;
        
        await pool.execute('DELETE FROM categories WHERE id = ?', [id]);
        
        res.json({ success: true, message: 'Category deleted successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// ==================== Banner Management ====================
const getBanners = async (req, res) => {
    try {
        const [banners] = await pool.execute('SELECT * FROM banners ORDER BY `order` ASC');
        
        res.json({ success: true, data: banners });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

const addBanner = async (req, res) => {
    try {
        const { title, image, link, order = 0 } = req.body;
        
        const [result] = await pool.execute(
            'INSERT INTO banners (title, image, link, `order`) VALUES (?, ?, ?, ?)',
            [title, image, link, order]
        );
        
        res.json({ success: true, data: { id: result.insertId, title, image, link, order } });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

const updateBanner = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, image, link, order, status } = req.body;
        
        const updates = [];
        const params = [];
        
        if (title) {
            updates.push('title = ?');
            params.push(title);
        }
        if (image !== undefined) {
            updates.push('image = ?');
            params.push(image);
        }
        if (link !== undefined) {
            updates.push('link = ?');
            params.push(link);
        }
        if (order !== undefined) {
            updates.push('`order` = ?');
            params.push(order);
        }
        if (status !== undefined) {
            updates.push('status = ?');
            params.push(status);
        }
        
        params.push(id);
        
        await pool.execute(`UPDATE banners SET ${updates.join(', ')} WHERE id = ?`, params);
        
        res.json({ success: true, message: 'Banner updated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

const deleteBanner = async (req, res) => {
    try {
        const { id } = req.params;
        
        await pool.execute('DELETE FROM banners WHERE id = ?', [id]);
        
        res.json({ success: true, message: 'Banner deleted successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// ==================== Commission Management ====================
const getCommissionSettings = async (req, res) => {
    try {
        const [settings] = await pool.execute('SELECT * FROM commission_settings WHERE id = 1');
        
        res.json({ success: true, data: settings[0] || { defaultRate: 10 } });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

const updateCommissionSettings = async (req, res) => {
    try {
        const { defaultRate } = req.body;
        
        await pool.execute(`
            INSERT INTO commission_settings (id, defaultRate) 
            VALUES (1, ?) 
            ON DUPLICATE KEY UPDATE defaultRate = ?
        `, [defaultRate, defaultRate]);
        
        res.json({ success: true, message: 'Commission settings updated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

const getVendorCommissions = async (req, res) => {
    try {
        const [commissions] = await pool.execute(`
            SELECT v.user_id as vendorId, v.company_name as vendorName,
                   COALESCE(vc.commission_rate, cs.defaultRate) as commissionRate,
                   COALESCE(SUM(o.commission_earned), 0) as totalEarned,
                   0 as totalPaid,
                   COALESCE(SUM(o.commission_earned), 0) as pendingAmount
            FROM vendors v
            CROSS JOIN (SELECT defaultRate FROM commission_settings WHERE id = 1) cs
            LEFT JOIN vendor_commissions vc ON v.user_id = vc.vendor_id
            LEFT JOIN products p ON v.user_id = p.vendor_id
            LEFT JOIN orders o ON p.id = o.product_id
            GROUP BY v.user_id
        `);
        
        res.json({ success: true, data: commissions });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

const updateVendorCommission = async (req, res) => {
    try {
        const { vendorId } = req.params;
        const { rate } = req.body;
        
        await pool.execute(`
            INSERT INTO vendor_commissions (vendor_id, commission_rate) 
            VALUES (?, ?) 
            ON DUPLICATE KEY UPDATE commission_rate = ?
        `, [vendorId, rate, rate]);
        
        res.json({ success: true, message: 'Vendor commission updated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// ==================== Reports ====================
const getOrderReports = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        const [reports] = await pool.execute(`
            SELECT 
                DATE(created_at) as date,
                COUNT(*) as totalOrders,
                COALESCE(SUM(total), 0) as totalRevenue,
                COALESCE(AVG(total), 0) as averageOrderValue
            FROM orders
            WHERE DATE(created_at) BETWEEN ? AND ?
            GROUP BY DATE(created_at)
            ORDER BY date DESC
        `, [startDate, endDate]);
        
        res.json({ success: true, data: reports });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

const getPaymentReports = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        const [reports] = await pool.execute(`
            SELECT 
                DATE(created_at) as date,
                payment_method as method,
                COUNT(*) as totalPayments,
                COALESCE(SUM(amount), 0) as totalAmount
            FROM payments
            WHERE DATE(created_at) BETWEEN ? AND ? AND status = 'completed'
            GROUP BY DATE(created_at), payment_method
            ORDER BY date DESC
        `, [startDate, endDate]);
        
        res.json({ success: true, data: reports });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// ==================== Settings ====================
const getSettings = async (req, res) => {
    try {
        const [settings] = await pool.execute('SELECT * FROM system_settings WHERE id = 1');
        
        res.json({ success: true, data: settings[0] || {} });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

const updateSettings = async (req, res) => {
    try {
        const settings = req.body;
        
        await pool.execute(`
            INSERT INTO system_settings (id, settings) 
            VALUES (1, ?) 
            ON DUPLICATE KEY UPDATE settings = ?
        `, [JSON.stringify(settings), JSON.stringify(settings)]);
        
        res.json({ success: true, message: 'Settings updated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

module.exports = {
    // Dashboard
    getAdminStats,
    
    // Vendor Management
    getVendors,
    getVendorById,
    approveVendor,
    rejectVendor,
    suspendVendor,
    activateVendor,
    
    // Buyer Management
    getBuyers,
    getBuyerById,
    suspendBuyer,
    activateBuyer,
    
    // Product Management
    getAdminProducts,
    approveProduct,
    rejectProduct,
    deleteProduct,
    
    // Order Management
    getAdminOrders,
    getOrderDetails,
    updateOrderStatus,
    
    // Category Management
    getCategories,
    addCategory,
    updateCategory,
    deleteCategory,
    
    // Banner Management
    getBanners,
    addBanner,
    updateBanner,
    deleteBanner,
    
    // Commission Management
    getCommissionSettings,
    updateCommissionSettings,
    getVendorCommissions,
    updateVendorCommission,
    
    // Reports
    getOrderReports,
    getPaymentReports,
    
    // Settings
    getSettings,
    updateSettings,
    getSubcategoriesByCategory,
    addSubcategory,
    updateSubcategory,
    deleteSubcategory
};
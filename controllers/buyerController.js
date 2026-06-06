const Buyer = require('../models/Buyer');
const db = require('../config/db');

// ============ BUYER MANAGEMENT ============

// Get all buyers (Admin only)
const getAllBuyers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        
        const buyers = await Buyer.getAll(limit, offset);
        
        res.json({
            success: true,
            data: buyers,
            page,
            limit
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Get buyer profile
const getBuyerProfile = async (req, res) => {
    try {
        const buyer = await Buyer.findByUserId(req.user.id);
        
        if (!buyer) {
            return res.status(404).json({ message: 'Buyer not found' });
        }
        
        res.json({
            success: true,
            data: buyer
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

// ✅ FIXED Update buyer profile
const updateBuyerProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        
        console.log('Updating buyer profile for user_id:', userId);
        console.log('Request body:', req.body);
        
        const allowedUpdates = [
            'full_name', 'shipping_address', 'billing_address',
            'city', 'state', 'pincode', 'phone', 'date_of_birth', 'preferences'
        ];
        
        const updates = {};
        allowedUpdates.forEach(field => {
            if (req.body[field] !== undefined && req.body[field] !== null) {
                updates[field] = req.body[field];
            }
        });
        
        console.log('Updates to apply:', updates);
        
        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid fields to update'
            });
        }
        
        // Check if buyer exists
        const existingBuyer = await Buyer.findByUserId(userId);
        
        if (!existingBuyer) {
            // Create new buyer profile if doesn't exist
            console.log('Buyer profile not found, creating new...');
            updates.user_id = userId;
            updates.full_name = updates.full_name || `User_${userId}`;
            await Buyer.create(updates);
        } else {
            // Update existing buyer
            console.log('Updating existing buyer profile...');
            await Buyer.update(userId, updates);
        }
        
        // Get updated profile
        const updatedBuyer = await Buyer.findByUserId(userId);
        
        res.json({
            success: true,
            message: 'Profile updated successfully',
            data: updatedBuyer
        });
        
    } catch (error) {
        console.error('Error in updateBuyerProfile:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Server error'
        });
    }
};

// ============ CATEGORY FUNCTIONS ============

// Get all categories
const getCategories = async (req, res) => {
    try {
        const [categories] = await db.execute(`
            SELECT c.*, 
                   COUNT(p.id) as product_count
            FROM categories c
            LEFT JOIN products p ON c.id = p.category_id AND p.status = 'approved'
            WHERE c.status = 'active'
            GROUP BY c.id
            ORDER BY c.order ASC, c.name ASC
        `);
        
        res.json({
            success: true,
            data: categories
        });
    } catch (error) {
        console.error('Get categories error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Get subcategories by category ID
const getSubcategories = async (req, res) => {
    try {
        const { categoryId } = req.params;
        
        const [subcategories] = await db.execute(`
            SELECT id, name, slug, status
            FROM subcategories 
            WHERE category_id = ? AND status = 'active'
            ORDER BY name ASC
        `, [categoryId]);
        
        res.json({
            success: true,
            data: subcategories
        });
    } catch (error) {
        console.error('Get subcategories error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Get category by ID
const getCategoryById = async (req, res) => {
    try {
        const { id } = req.params;
        
        const [categories] = await db.execute(`
            SELECT c.*, 
                   COUNT(p.id) as product_count
            FROM categories c
            LEFT JOIN products p ON c.id = p.category_id AND p.status = 'approved'
            WHERE c.id = ? AND c.status = 'active'
            GROUP BY c.id
        `, [id]);
        
        if (categories.length === 0) {
            return res.status(404).json({ success: false, message: 'Category not found' });
        }
        
        res.json({
            success: true,
            data: categories[0]
        });
    } catch (error) {
        console.error('Get category error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// ============ PRODUCT FUNCTIONS ============

// Get all products with filters
const getProducts = async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 20, 
            category_id, 
            subcategory_id,
            search,
            min_price,
            max_price,
            vendor_id,
            sort_by = 'created_at',
            sort_order = 'DESC'
        } = req.query;
        
        const offset = (parseInt(page) - 1) * parseInt(limit);
        
        let query = `
            SELECT 
                p.*,
                c.name as category_name,
                s.name as subcategory_name,
                v.company_name as vendor_name,
                v.city as vendor_city
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN subcategories s ON p.subcategory_id = s.id
            LEFT JOIN vendors v ON p.vendor_id = v.user_id
            WHERE p.status = 'approved'
        `;
        
        const params = [];
        
        if (category_id) {
            query += ` AND p.category_id = ?`;
            params.push(category_id);
        }
        
        if (subcategory_id) {
            query += ` AND p.subcategory_id = ?`;
            params.push(subcategory_id);
        }
        
        if (vendor_id) {
            query += ` AND p.vendor_id = ?`;
            params.push(vendor_id);
        }
        
        if (search) {
            query += ` AND (p.name LIKE ? OR p.description LIKE ? OR p.brand_name LIKE ? OR p.sku LIKE ? OR p.part_number LIKE ?)`;
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
        }
        
        if (min_price) {
            query += ` AND p.price >= ?`;
            params.push(min_price);
        }
        
        if (max_price) {
            query += ` AND p.price <= ?`;
            params.push(max_price);
        }
        
        const allowedSortFields = ['price', 'created_at', 'name', 'views'];
        const sortField = allowedSortFields.includes(sort_by) ? sort_by : 'created_at';
        const sortOrder = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
        query += ` ORDER BY p.${sortField} ${sortOrder}`;
        
        query += ` LIMIT ? OFFSET ?`;
        params.push(parseInt(limit), offset);
        
        const [products] = await db.execute(query, params);
        
        // Get total count
        let countQuery = `
            SELECT COUNT(*) as total 
            FROM products p
            WHERE p.status = 'approved'
        `;
        const countParams = [];
        
        if (category_id) {
            countQuery += ` AND p.category_id = ?`;
            countParams.push(category_id);
        }
        
        if (search) {
            countQuery += ` AND (p.name LIKE ? OR p.description LIKE ?)`;
            countParams.push(`%${search}%`, `%${search}%`);
        }
        
        const [countResult] = await db.execute(countQuery, countParams);
        
        // Parse JSON fields
        const processedProducts = products.map(product => {
            try {
                if (product.images && typeof product.images === 'string') {
                    product.images = JSON.parse(product.images);
                } else if (!product.images) {
                    product.images = [];
                }
                
                if (product.specifications && typeof product.specifications === 'string') {
                    product.specifications = JSON.parse(product.specifications);
                } else if (!product.specifications) {
                    product.specifications = [];
                }
                
                if (product.machine_compatibility && typeof product.machine_compatibility === 'string') {
                    product.machine_compatibility = JSON.parse(product.machine_compatibility);
                } else if (!product.machine_compatibility) {
                    product.machine_compatibility = [];
                }
            } catch (e) {
                console.error('JSON parse error:', e.message);
            }
            return product;
        });
        
        res.json({
            success: true,
            data: processedProducts,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: countResult[0].total,
                totalPages: Math.ceil(countResult[0].total / limit)
            }
        });
        
    } catch (error) {
        console.error('Get products error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Get single product by ID
const getProductById = async (req, res) => {
    try {
        const { id } = req.params;
        
        const [products] = await db.execute(`
            SELECT 
                p.*,
                c.name as category_name,
                s.name as subcategory_name,
                v.company_name as vendor_name,
                v.city as vendor_city,
                v.phone as vendor_phone,
                u.email as vendor_email
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN subcategories s ON p.subcategory_id = s.id
            LEFT JOIN vendors v ON p.vendor_id = v.user_id
            LEFT JOIN users u ON p.vendor_id = u.id
            WHERE p.id = ? AND p.status = 'approved'
        `, [id]);
        
        if (products.length === 0) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }
        
        const product = products[0];
        
        try {
            if (product.images && typeof product.images === 'string') {
                product.images = JSON.parse(product.images);
            } else if (!product.images) {
                product.images = [];
            }
            
            if (product.specifications && typeof product.specifications === 'string') {
                product.specifications = JSON.parse(product.specifications);
            } else if (!product.specifications) {
                product.specifications = [];
            }
            
            if (product.machine_compatibility && typeof product.machine_compatibility === 'string') {
                product.machine_compatibility = JSON.parse(product.machine_compatibility);
            } else if (!product.machine_compatibility) {
                product.machine_compatibility = [];
            }
        } catch (e) {
            console.error('JSON parse error:', e.message);
        }
        
        // Update view count
        await db.execute('UPDATE products SET views = views + 1 WHERE id = ?', [id]);
        
        res.json({
            success: true,
            data: product
        });
        
    } catch (error) {
        console.error('Get product error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Get products by category
const getProductsByCategory = async (req, res) => {
    try {
        const { categoryId } = req.params;
        const { limit = 20, page = 1 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        
        const [products] = await db.execute(`
            SELECT p.*, c.name as category_name
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            WHERE p.category_id = ? AND p.status = 'approved'
            ORDER BY p.created_at DESC
            LIMIT ? OFFSET ?
        `, [categoryId, parseInt(limit), offset]);
        
        res.json({
            success: true,
            data: products
        });
        
    } catch (error) {
        console.error('Get products by category error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Get user notifications
const getNotifications = async (req, res) => {
  try {
    // Check if req.user exists
    if (!req.user) {
      console.error('getNotifications: req.user is undefined');
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }
    
    const userId = req.user.id;
    
    if (!userId) {
      console.error('getNotifications: userId is undefined');
      return res.status(400).json({
        success: false,
        message: 'User ID not found'
      });
    }
    
    console.log('Fetching notifications for user:', userId);
    
    // Check if notifications table exists, if not return empty array
    try {
      const [notifications] = await db.execute(
        `SELECT * FROM notifications 
         WHERE user_id = ? 
         ORDER BY created_at DESC 
         LIMIT 50`,
        [userId]
      );
      
      console.log(`Found ${notifications.length} notifications`);
      
      res.json({
        success: true,
        data: notifications
      });
    } catch (dbError) {
      // If table doesn't exist, return empty array
      console.log('Notifications table might not exist:', dbError.message);
      res.json({
        success: true,
        data: []
      });
    }
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications',
      data: []
    });
  }
};

// Mark notification as read
const markNotificationAsRead = async (req, res) => {
  try {
    // Check if req.user exists
    if (!req.user) {
      console.error('markNotificationAsRead: req.user is undefined');
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }
    
    const userId = req.user.id;
    const notificationId = req.params.id;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID not found'
      });
    }
    
    if (!notificationId) {
      return res.status(400).json({
        success: false,
        message: 'Notification ID is required'
      });
    }
    
    console.log(`Marking notification ${notificationId} as read for user ${userId}`);
    
    try {
      const [result] = await db.execute(
        `UPDATE notifications 
         SET is_read = true, read_at = NOW() 
         WHERE id = ? AND user_id = ?`,
        [notificationId, userId]
      );
      
      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: 'Notification not found'
        });
      }
      
      res.json({
        success: true,
        message: 'Notification marked as read'
      });
    } catch (dbError) {
      // If table doesn't exist, return success (mock)
      console.log('Notifications table might not exist:', dbError.message);
      res.json({
        success: true,
        message: 'Notification marked as read (mock)'
      });
    }
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark notification as read'
    });
  }
};



module.exports = {
    // Buyer functions
    getAllBuyers,
    getBuyerProfile,
    updateBuyerProfile,
    // Category functions
    getCategories,
    getSubcategories,
    getCategoryById,
    // Product functions
    getProducts,
    getProductById,
    getProductsByCategory,  
    getNotifications,
    markNotificationAsRead,
};
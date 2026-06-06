const pool = require('../config/db');

class Product {
    // Create new product
    static async create(productData) {
        const {
            vendor_id,
            category_id,
            subcategory_id,
            name,
            slug,
            description,
            price,
            compare_price,
            sku,
            stock,
            moq,
            delivery_time,
            image,
            images,
            specifications,
            machine_compatibility,
            gst,
            size,
            capacity,
            city,
            brand_name,
            status = 'pending'
        } = productData;

        if (!vendor_id || !name || !price) {
            throw new Error('vendor_id, name and price are required');
        }

        try {
            const productSlug = slug || name.toLowerCase().replace(/ /g, '-').replace(/[^\w-]+/g, '');
            
            // Ensure JSON fields are properly stringified
            const imagesStr = images ? (typeof images === 'string' ? images : JSON.stringify(images)) : null;
            const specsStr = specifications ? (typeof specifications === 'string' ? specifications : JSON.stringify(specifications)) : null;
            const machineStr = machine_compatibility ? (typeof machine_compatibility === 'string' ? machine_compatibility : JSON.stringify(machine_compatibility)) : null;
            
            const [result] = await pool.execute(
                `INSERT INTO products 
                (vendor_id, category_id, subcategory_id, name, slug, description, 
                 price, compare_price, sku, stock, moq, delivery_time, 
                 image, images, specifications, machine_compatibility, 
                 gst, size, capacity, city, brand_name, status) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    vendor_id, 
                    category_id || null, 
                    subcategory_id || null,
                    name, 
                    productSlug, 
                    description || null,
                    price, 
                    compare_price || price, 
                    sku || null, 
                    stock || 0, 
                    moq || 1, 
                    delivery_time || null,
                    image || null, 
                    imagesStr,
                    specsStr,
                    machineStr,
                    gst || 0, 
                    size || null, 
                    capacity || null, 
                    city || null, 
                    brand_name || null, 
                    status
                ]
            );
            
            return result.insertId;
        } catch (error) {
            console.error('Error in Product.create:', error);
            throw error;
        }
    }

    // Get product by ID
    static async findById(id) {
        try {
            const [rows] = await pool.execute(
                `SELECT p.*, 
                        v.company_name as vendor_name, 
                        c.name as category_name,
                        s.name as subcategory_name,
                        u.email as vendor_email
                 FROM products p
                 LEFT JOIN vendors v ON p.vendor_id = v.user_id
                 LEFT JOIN users u ON p.vendor_id = u.id
                 LEFT JOIN categories c ON p.category_id = c.id
                 LEFT JOIN subcategories s ON p.subcategory_id = s.id
                 WHERE p.id = ?`,
                [id]
            );
            
            if (rows[0]) {
                // Parse JSON fields safely
                rows[0].images = this.safeParseJSON(rows[0].images, []);
                rows[0].specifications = this.safeParseJSON(rows[0].specifications, []);
                rows[0].machine_compatibility = this.safeParseJSON(rows[0].machine_compatibility, []);
            }
            
            return rows[0] || null;
        } catch (error) {
            console.error('Error in Product.findById:', error);
            throw error;
        }
    }

    // Safe JSON parser helper
    static safeParseJSON(data, defaultValue = null) {
        if (!data) return defaultValue;
        if (typeof data === 'object') return data;
        try {
            return JSON.parse(data);
        } catch(e) {
            console.error('JSON Parse error:', e.message);
            return defaultValue;
        }
    }

    // Get products by vendor
    static async getByVendor(vendorId, limit = 10, offset = 0, status = null) {
        try {
            let query = `
                SELECT p.*, 
                       c.name as category_name,
                       s.name as subcategory_name
                FROM products p
                LEFT JOIN categories c ON p.category_id = c.id
                LEFT JOIN subcategories s ON p.subcategory_id = s.id
                WHERE p.vendor_id = ?
            `;
            const params = [vendorId];

            if (status) {
                query += ' AND p.status = ?';
                params.push(status);
            }

            query += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
            params.push(parseInt(limit), parseInt(offset));

            const [rows] = await pool.execute(query, params);
            
            // Parse JSON fields for each product
            rows.forEach(product => {
                product.images = this.safeParseJSON(product.images, []);
                product.specifications = this.safeParseJSON(product.specifications, []);
                product.machine_compatibility = this.safeParseJSON(product.machine_compatibility, []);
            });

            return rows;
        } catch (error) {
            console.error('Error in Product.getByVendor:', error);
            throw error;
        }
    }

    // Get products by vendor with pagination
    static async findByVendor(vendorId, { limit = 20, offset = 0, status = null } = {}) {
        try {
            let query = 'SELECT * FROM products WHERE vendor_id = ?';
            const params = [vendorId];

            if (status) {
                query += ' AND status = ?';
                params.push(status);
            }

            query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
            params.push(parseInt(limit), parseInt(offset));

            const [rows] = await pool.execute(query, params);
            
            // Parse JSON fields
            rows.forEach(product => {
                product.images = this.safeParseJSON(product.images, []);
                product.specifications = this.safeParseJSON(product.specifications, []);
                product.machine_compatibility = this.safeParseJSON(product.machine_compatibility, []);
            });
            
            const [countResult] = await pool.execute(
                `SELECT COUNT(*) as total FROM products WHERE vendor_id = ?${status ? ' AND status = ?' : ''}`,
                status ? [vendorId, status] : [vendorId]
            );

            return {
                products: rows,
                total: countResult[0].total,
                limit: parseInt(limit),
                offset: parseInt(offset)
            };
        } catch (error) {
            console.error('Error in Product.findByVendor:', error);
            throw error;
        }
    }

    // Get products by subcategory
    static async getBySubcategory(subcategoryId, limit = 20, offset = 0, status = 'approved') {
        try {
            const [rows] = await pool.execute(
                `SELECT p.*, 
                        v.company_name as vendor_name,
                        c.name as category_name
                 FROM products p
                 LEFT JOIN vendors v ON p.vendor_id = v.user_id
                 LEFT JOIN categories c ON p.category_id = c.id
                 WHERE p.subcategory_id = ? AND p.status = ?
                 ORDER BY p.created_at DESC
                 LIMIT ? OFFSET ?`,
                [subcategoryId, status, parseInt(limit), parseInt(offset)]
            );

            rows.forEach(product => {
                product.images = this.safeParseJSON(product.images, []);
            });

            const [countResult] = await pool.execute(
                `SELECT COUNT(*) as total 
                 FROM products 
                 WHERE subcategory_id = ? AND status = ?`,
                [subcategoryId, status]
            );

            return {
                products: rows,
                total: countResult[0].total
            };
        } catch (error) {
            console.error('Error in Product.getBySubcategory:', error);
            throw error;
        }
    }

    // Get count by vendor
    static async getCountByVendor(vendorId, status = null) {
        try {
            let query = 'SELECT COUNT(*) as total FROM products WHERE vendor_id = ?';
            const params = [vendorId];
            
            if (status) {
                query += ' AND status = ?';
                params.push(status);
            }
            
            const [result] = await pool.execute(query, params);
            return result[0].total;
        } catch (error) {
            console.error('Error in Product.getCountByVendor:', error);
            throw error;
        }
    }

    // Get all products with filters
    static async getAll({ 
        limit = 20, 
        offset = 0, 
        category_id = null, 
        subcategory_id = null,
        status = 'approved',
        min_price = null,
        max_price = null,
        search = null,
        vendor_id = null
    } = {}) {
        try {
            let query = `
                SELECT p.*, 
                       v.company_name as vendor_name, 
                       c.name as category_name,
                       s.name as subcategory_name,
                       (SELECT AVG(rating) FROM reviews WHERE product_id = p.id) as avg_rating
                FROM products p
                LEFT JOIN vendors v ON p.vendor_id = v.user_id
                LEFT JOIN categories c ON p.category_id = c.id
                LEFT JOIN subcategories s ON p.subcategory_id = s.id
                WHERE p.status = ?
            `;
            const params = [status];

            if (category_id) {
                query += ' AND p.category_id = ?';
                params.push(category_id);
            }

            if (subcategory_id) {
                query += ' AND p.subcategory_id = ?';
                params.push(subcategory_id);
            }

            if (vendor_id) {
                query += ' AND p.vendor_id = ?';
                params.push(vendor_id);
            }

            if (min_price) {
                query += ' AND p.price >= ?';
                params.push(min_price);
            }

            if (max_price) {
                query += ' AND p.price <= ?';
                params.push(max_price);
            }

            if (search) {
                query += ' AND (p.name LIKE ? OR p.description LIKE ?)';
                params.push(`%${search}%`, `%${search}%`);
            }

            query += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
            params.push(parseInt(limit), parseInt(offset));

            const [rows] = await pool.execute(query, params);

            // Parse JSON fields
            rows.forEach(product => {
                product.images = this.safeParseJSON(product.images, []);
                product.specifications = this.safeParseJSON(product.specifications, []);
                product.machine_compatibility = this.safeParseJSON(product.machine_compatibility, []);
            });

            // Get total count
            let countQuery = 'SELECT COUNT(*) as total FROM products WHERE status = ?';
            const countParams = [status];

            if (category_id) {
                countQuery += ' AND category_id = ?';
                countParams.push(category_id);
            }

            if (subcategory_id) {
                countQuery += ' AND subcategory_id = ?';
                countParams.push(subcategory_id);
            }

            if (vendor_id) {
                countQuery += ' AND vendor_id = ?';
                countParams.push(vendor_id);
            }

            if (search) {
                countQuery += ' AND (name LIKE ? OR description LIKE ?)';
                countParams.push(`%${search}%`, `%${search}%`);
            }

            const [countResult] = await pool.execute(countQuery, countParams);

            return {
                products: rows,
                total: countResult[0].total,
                limit: parseInt(limit),
                offset: parseInt(offset),
                totalPages: Math.ceil(countResult[0].total / limit)
            };
        } catch (error) {
            console.error('Error in Product.getAll:', error);
            throw error;
        }
    }

    // Update product
static async update(id, data) {
    try {
        // Handle JSON fields safely
        const updateData = { ...data };
        
        if (updateData.images && typeof updateData.images !== 'string') {
            updateData.images = JSON.stringify(updateData.images);
        }
        if (updateData.specifications && typeof updateData.specifications !== 'string') {
            updateData.specifications = JSON.stringify(updateData.specifications);
        }
        if (updateData.machine_compatibility && typeof updateData.machine_compatibility !== 'string') {
            updateData.machine_compatibility = JSON.stringify(updateData.machine_compatibility);
        }
        
        // Build SET clause dynamically
        const fields = [];
        const values = [];
        
        Object.keys(updateData).forEach(key => {
            if (updateData[key] !== undefined && key !== 'id') {
                fields.push(`${key} = ?`);
                values.push(updateData[key]);
            }
        });
        
        if (fields.length === 0) {
            return { affectedRows: 0 };
        }
        
        values.push(id);
        
        const query = `UPDATE products SET ${fields.join(', ')} WHERE id = ?`;
        console.log('Update query:', query);
        console.log('Update values:', values);
        
        const [result] = await pool.execute(query, values);
        return result;
    } catch (error) {
        console.error('Error in Product.update:', error);
        throw error;
    }
}

    // Update stock
    static async updateStock(id, vendorId, quantity) {
        try {
            const [result] = await pool.execute(
                'UPDATE products SET stock = ? WHERE id = ? AND vendor_id = ?',
                [quantity, id, vendorId]
            );
            
            if (result.affectedRows > 0) {
                const [product] = await pool.execute(
                    'SELECT name, stock FROM products WHERE id = ?',
                    [id]
                );
                return product[0];
            }
            return null;
        } catch (error) {
            console.error('Error in Product.updateStock:', error);
            throw error;
        }
    }

    // Get low stock products
    static async getLowStock(vendorId, threshold = 10) {
        try {
            const [rows] = await pool.execute(
                `SELECT id, name, sku, stock, price 
                 FROM products 
                 WHERE vendor_id = ? AND stock <= ? AND status = 'approved'
                 ORDER BY stock ASC`,
                [vendorId, threshold]
            );
            return rows;
        } catch (error) {
            console.error('Error in Product.getLowStock:', error);
            throw error;
        }
    }

    // Delete product
    static async delete(id) {
        try {
            const [result] = await pool.execute('DELETE FROM products WHERE id = ?', [id]);
            return result;
        } catch (error) {
            console.error('Error in Product.delete:', error);
            throw error;
        }
    }

    // Get products by category
    static async findByCategory(categoryId, { limit = 20, offset = 0 } = {}) {
        try {
            const [rows] = await pool.execute(
                `SELECT p.*, v.company_name as vendor_name
                 FROM products p
                 LEFT JOIN vendors v ON p.vendor_id = v.user_id
                 WHERE p.category_id = ? AND p.status = 'approved'
                 ORDER BY p.created_at DESC
                 LIMIT ? OFFSET ?`,
                [categoryId, parseInt(limit), parseInt(offset)]
            );

            rows.forEach(product => {
                product.images = this.safeParseJSON(product.images, []);
            });

            const [countResult] = await pool.execute(
                'SELECT COUNT(*) as total FROM products WHERE category_id = ? AND status = "approved"',
                [categoryId]
            );

            return {
                products: rows,
                total: countResult[0].total
            };
        } catch (error) {
            console.error('Error in Product.findByCategory:', error);
            throw error;
        }
    }

    // Search products
    static async search(keyword, { limit = 20, offset = 0 } = {}) {
        try {
            const [rows] = await pool.execute(
                `SELECT p.*, v.company_name as vendor_name,
                        MATCH(p.name, p.description) AGAINST(?) as relevance
                 FROM products p
                 LEFT JOIN vendors v ON p.vendor_id = v.user_id
                 WHERE MATCH(p.name, p.description) AGAINST(?) AND p.status = 'approved'
                 ORDER BY relevance DESC
                 LIMIT ? OFFSET ?`,
                [keyword, keyword, parseInt(limit), parseInt(offset)]
            );

            rows.forEach(product => {
                product.images = this.safeParseJSON(product.images, []);
            });

            const [countResult] = await pool.execute(
                'SELECT COUNT(*) as total FROM products WHERE MATCH(name, description) AGAINST(?) AND status = "approved"',
                [keyword]
            );

            return {
                products: rows,
                total: countResult[0].total
            };
        } catch (error) {
            console.error('Error in Product.search:', error);
            throw error;
        }
    }

    // Get popular products
    static async getPopular(limit = 10) {
        try {
            const [rows] = await pool.execute(`
                SELECT p.*, v.company_name as vendor_name,
                       COUNT(o.id) as order_count
                FROM products p
                LEFT JOIN vendors v ON p.vendor_id = v.user_id
                LEFT JOIN order_items oi ON p.id = oi.product_id
                LEFT JOIN orders o ON oi.order_id = o.id
                WHERE p.status = 'approved'
                GROUP BY p.id
                ORDER BY order_count DESC
                LIMIT ?
            `, [parseInt(limit)]);
            
            rows.forEach(product => {
                product.images = this.safeParseJSON(product.images, []);
            });
            
            return rows;
        } catch (error) {
            console.error('Error in Product.getPopular:', error);
            throw error;
        }
    }

    // Get featured products
    static async getFeatured(limit = 10) {
        try {
            const [rows] = await pool.execute(
                `SELECT p.*, v.company_name as vendor_name
                 FROM products p
                 LEFT JOIN vendors v ON p.vendor_id = v.user_id
                 WHERE p.status = 'approved' AND p.featured = 1
                 ORDER BY p.created_at DESC
                 LIMIT ?`,
                [parseInt(limit)]
            );
            
            rows.forEach(product => {
                product.images = this.safeParseJSON(product.images, []);
            });
            
            return rows;
        } catch (error) {
            console.error('Error in Product.getFeatured:', error);
            throw error;
        }
    }

    // Get product statistics for vendor
    static async getVendorStats(vendorId) {
        try {
            const [stats] = await pool.execute(`
                SELECT 
                    COUNT(*) as total_products,
                    SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_products,
                    SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_products,
                    SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected_products,
                    COALESCE(SUM(stock), 0) as total_stock,
                    COALESCE(AVG(price), 0) as avg_price
                FROM products
                WHERE vendor_id = ?
            `, [vendorId]);
            return stats[0];
        } catch (error) {
            console.error('Error in Product.getVendorStats:', error);
            throw error;
        }
    }
}

module.exports = Product;
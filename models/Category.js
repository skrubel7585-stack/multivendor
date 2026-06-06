const pool = require('../config/db');

class Category {
    // Create category
    static async create(categoryData) {
        const { name, slug, image, order = 0 } = categoryData;

        if (!name) {
            throw new Error('Category name is required');
        }

        try {
            const categorySlug = slug || name.toLowerCase().replace(/ /g, '-').replace(/[^\w-]+/g, '');
            
            const [result] = await pool.execute(
                'INSERT INTO categories (name, slug, image, `order`) VALUES (?, ?, ?, ?)',
                [name, categorySlug, image || null, order]
            );
            
            return result.insertId;
        } catch (error) {
            console.error('Error in Category.create:', error);
            throw error;
        }
    }

    // Get category by ID
    static async findById(id) {
        try {
            const [rows] = await pool.execute(
                `SELECT c.*, COUNT(p.id) as product_count
                 FROM categories c
                 LEFT JOIN products p ON c.id = p.category_id AND p.status = 'approved'
                 WHERE c.id = ?
                 GROUP BY c.id`,
                [id]
            );
            return rows[0] || null;
        } catch (error) {
            console.error('Error in Category.findById:', error);
            throw error;
        }
    }

    // Get category by slug
    static async findBySlug(slug) {
        try {
            const [rows] = await pool.execute(
                `SELECT c.*, COUNT(p.id) as product_count
                 FROM categories c
                 LEFT JOIN products p ON c.id = p.category_id AND p.status = 'approved'
                 WHERE c.slug = ?
                 GROUP BY c.id`,
                [slug]
            );
            return rows[0] || null;
        } catch (error) {
            console.error('Error in Category.findBySlug:', error);
            throw error;
        }
    }

    // Get all categories
    static async getAll({ status = null, limit = 100, offset = 0 } = {}) {
        try {
            let query = `
                SELECT c.*, COUNT(p.id) as product_count
                FROM categories c
                LEFT JOIN products p ON c.id = p.category_id AND p.status = 'approved'
                WHERE 1=1
            `;
            const params = [];

            if (status) {
                query += ' AND c.status = ?';
                params.push(status);
            }

            query += ' GROUP BY c.id ORDER BY c.order ASC, c.name ASC LIMIT ? OFFSET ?';
            params.push(parseInt(limit), parseInt(offset));

            const [rows] = await pool.execute(query, params);

            const [countResult] = await pool.execute(
                `SELECT COUNT(*) as total FROM categories${status ? ' WHERE status = ?' : ''}`,
                status ? [status] : []
            );

            return {
                categories: rows,
                total: countResult[0].total
            };
        } catch (error) {
            console.error('Error in Category.getAll:', error);
            throw error;
        }
    }

    // Get active categories
    static async getActive() {
        try {
            const [rows] = await pool.execute(
                `SELECT c.*, COUNT(p.id) as product_count
                 FROM categories c
                 LEFT JOIN products p ON c.id = p.category_id AND p.status = 'approved'
                 WHERE c.status = 'active'
                 GROUP BY c.id
                 ORDER BY c.order ASC`,
                []
            );
            return rows;
        } catch (error) {
            console.error('Error in Category.getActive:', error);
            throw error;
        }
    }

    // Update category
    static async update(id, data) {
        try {
            const updates = [];
            const params = [];

            if (data.name) {
                updates.push('name = ?');
                params.push(data.name);
                updates.push('slug = ?');
                params.push(data.name.toLowerCase().replace(/ /g, '-'));
            }
            if (data.image !== undefined) {
                updates.push('image = ?');
                params.push(data.image);
            }
            if (data.order !== undefined) {
                updates.push('`order` = ?');
                params.push(data.order);
            }
            if (data.status !== undefined) {
                updates.push('status = ?');
                params.push(data.status);
            }

            if (updates.length === 0) {
                throw new Error('No data to update');
            }

            params.push(id);
            const [result] = await pool.execute(
                `UPDATE categories SET ${updates.join(', ')} WHERE id = ?`,
                params
            );
            
            return result;
        } catch (error) {
            console.error('Error in Category.update:', error);
            throw error;
        }
    }

    // Delete category
    static async delete(id) {
        try {
            // Check if category has products
            const [products] = await pool.execute(
                'SELECT COUNT(*) as count FROM products WHERE category_id = ?',
                [id]
            );

            if (products[0].count > 0) {
                throw new Error('Cannot delete category with existing products');
            }

            const [result] = await pool.execute('DELETE FROM categories WHERE id = ?', [id]);
            return result;
        } catch (error) {
            console.error('Error in Category.delete:', error);
            throw error;
        }
    }

    // Get category tree with subcategories
    static async getTree() {
        try {
            const [rows] = await pool.execute(`
                SELECT c.*, COUNT(p.id) as product_count
                FROM categories c
                LEFT JOIN products p ON c.id = p.category_id AND p.status = 'approved'
                WHERE c.status = 'active'
                GROUP BY c.id
                ORDER BY c.order ASC
            `);
            return rows;
        } catch (error) {
            console.error('Error in Category.getTree:', error);
            throw error;
        }
    }
}

module.exports = Category;
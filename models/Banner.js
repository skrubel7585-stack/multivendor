const pool = require('../config/db');

class Banner {
    // Create banner
    static async create(bannerData) {
        const { title, image, link, order = 0, status = 'active' } = bannerData;

        if (!image) {
            throw new Error('Banner image is required');
        }

        try {
            const [result] = await pool.execute(
                'INSERT INTO banners (title, image, link, `order`, status) VALUES (?, ?, ?, ?, ?)',
                [title || null, image, link || null, order, status]
            );
            
            return result.insertId;
        } catch (error) {
            console.error('Error in Banner.create:', error);
            throw error;
        }
    }

    // Get banner by ID
    static async findById(id) {
        try {
            const [rows] = await pool.execute('SELECT * FROM banners WHERE id = ?', [id]);
            return rows[0] || null;
        } catch (error) {
            console.error('Error in Banner.findById:', error);
            throw error;
        }
    }

    // Get all banners
    static async getAll({ status = null, limit = 50, offset = 0 } = {}) {
        try {
            let query = 'SELECT * FROM banners WHERE 1=1';
            const params = [];

            if (status) {
                query += ' AND status = ?';
                params.push(status);
            }

            query += ' ORDER BY `order` ASC, created_at DESC LIMIT ? OFFSET ?';
            params.push(parseInt(limit), parseInt(offset));

            const [rows] = await pool.execute(query, params);

            const [countResult] = await pool.execute(
                `SELECT COUNT(*) as total FROM banners${status ? ' WHERE status = ?' : ''}`,
                status ? [status] : []
            );

            return {
                banners: rows,
                total: countResult[0].total
            };
        } catch (error) {
            console.error('Error in Banner.getAll:', error);
            throw error;
        }
    }

    // Get active banners
    static async getActive() {
        try {
            const [rows] = await pool.execute(
                'SELECT * FROM banners WHERE status = "active" ORDER BY `order` ASC',
                []
            );
            return rows;
        } catch (error) {
            console.error('Error in Banner.getActive:', error);
            throw error;
        }
    }

    // Update banner
    static async update(id, data) {
        try {
            const updates = [];
            const params = [];

            if (data.title !== undefined) {
                updates.push('title = ?');
                params.push(data.title);
            }
            if (data.image !== undefined) {
                updates.push('image = ?');
                params.push(data.image);
            }
            if (data.link !== undefined) {
                updates.push('link = ?');
                params.push(data.link);
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
                `UPDATE banners SET ${updates.join(', ')} WHERE id = ?`,
                params
            );
            
            return result;
        } catch (error) {
            console.error('Error in Banner.update:', error);
            throw error;
        }
    }

    // Delete banner
    static async delete(id) {
        try {
            const [result] = await pool.execute('DELETE FROM banners WHERE id = ?', [id]);
            return result;
        } catch (error) {
            console.error('Error in Banner.delete:', error);
            throw error;
        }
    }

    // Update banner order
    static async updateOrder(orders) {
        try {
            for (const item of orders) {
                await pool.execute(
                    'UPDATE banners SET `order` = ? WHERE id = ?',
                    [item.order, item.id]
                );
            }
            return true;
        } catch (error) {
            console.error('Error in Banner.updateOrder:', error);
            throw error;
        }
    }
}

module.exports = Banner;
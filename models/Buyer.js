const pool = require('../config/db');

class Buyer {
    static async create(buyerData) {
        const {
            user_id,
            full_name,
            shipping_address,
            billing_address,
            city,
            state,
            pincode,
            phone,
            date_of_birth,
            preferences
        } = buyerData;

        // Validate required fields
        if (!user_id) {
            throw new Error('user_id is required');
        }
        
        if (!full_name) {
            throw new Error('full_name is required');
        }

        try {
            // Convert undefined to null for SQL
            const [result] = await pool.execute(
                `INSERT INTO buyers 
                (user_id, full_name, shipping_address, billing_address, city, state, pincode, phone, date_of_birth, preferences) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    user_id, 
                    full_name, 
                    shipping_address !== undefined ? shipping_address : null, 
                    billing_address !== undefined ? billing_address : null, 
                    city !== undefined ? city : null, 
                    state !== undefined ? state : null, 
                    pincode !== undefined ? pincode : null, 
                    phone !== undefined ? phone : null, 
                    date_of_birth !== undefined ? date_of_birth : null, 
                    preferences !== undefined ? preferences : null
                ]
            );
            
            console.log(`Buyer profile created successfully for user_id: ${user_id}`);
            return result.insertId;
        } catch (error) {
            console.error('Error in Buyer.create:', error);
            if (error.code === 'ER_DUP_ENTRY') {
                throw new Error('Buyer profile already exists for this user');
            }
            throw error;
        }
    }

    static async findByUserId(userId) {
        if (!userId) {
            throw new Error('User ID is required');
        }

        try {
            const [rows] = await pool.execute(
                `SELECT b.*, u.email, u.role, u.is_active, u.created_at as user_created_at
                 FROM buyers b 
                 JOIN users u ON b.user_id = u.id 
                 WHERE b.user_id = ?`,
                [userId]
            );
            return rows[0] || null;
        } catch (error) {
            console.error('Error in Buyer.findByUserId:', error);
            throw error;
        }
    }

    // ✅ FIXED UPDATE METHOD
    static async update(userId, data) {
        if (!userId) {
            throw new Error('User ID is required');
        }

        if (!data || Object.keys(data).length === 0) {
            throw new Error('Update data is required');
        }

        try {
            // Define allowed fields for update
            const allowedFields = [
                'full_name', 
                'shipping_address', 
                'billing_address', 
                'city', 
                'state', 
                'pincode', 
                'phone', 
                'date_of_birth', 
                'preferences'
            ];
            
            // Build dynamic SET clause
            const updates = [];
            const values = [];
            
            for (const field of allowedFields) {
                if (data[field] !== undefined) {
                    updates.push(`${field} = ?`);
                    values.push(data[field] === null || data[field] === '' ? null : data[field]);
                }
            }
            
            // If no fields to update
            if (updates.length === 0) {
                throw new Error('No valid fields to update');
            }
            
            // Build query
            const query = `UPDATE buyers SET ${updates.join(', ')} WHERE user_id = ?`;
            values.push(userId);
            
            console.log('Update query:', query);
            console.log('Update values:', values);
            
            const [result] = await pool.execute(query, values);
            
            if (result.affectedRows === 0) {
                // Check if buyer exists
                const buyer = await this.findByUserId(userId);
                if (!buyer) {
                    throw new Error('Buyer profile not found');
                }
            }
            
            console.log(`Buyer profile updated successfully for user_id: ${userId}`);
            console.log(`Affected rows: ${result.affectedRows}`);
            
            return result;
        } catch (error) {
            console.error('Error in Buyer.update:', error);
            throw error;
        }
    }

    static async getAll(limit = 10, offset = 0) {
        try {
            const [rows] = await pool.execute(
                `SELECT b.*, u.email, u.is_active 
                 FROM buyers b 
                 JOIN users u ON b.user_id = u.id 
                 LIMIT ? OFFSET ?`,
                [parseInt(limit), parseInt(offset)]
            );
            return rows;
        } catch (error) {
            console.error('Error in Buyer.getAll:', error);
            throw error;
        }
    }
}

module.exports = Buyer;
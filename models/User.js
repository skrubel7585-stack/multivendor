const pool = require('../config/db');
const bcrypt = require('bcryptjs');

class User {
    static async create(userData) {
        const { email, password, role, phone } = userData;
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const [result] = await pool.execute(
            'INSERT INTO users (email, phone, password, role) VALUES (?, ?, ?, ?)',
            [email, phone, hashedPassword, role]
        );
        return result.insertId;
    }

    static async findByEmail(email) {
        const [rows] = await pool.execute(
            'SELECT * FROM users WHERE email = ?',
            [email]
        );
        return rows[0];
    }

    static async findById(id) {
        const [rows] = await pool.execute(
            'SELECT id, email, role, is_active, created_at FROM users WHERE id = ?',
            [id]
        );
        return rows[0];
    }

    static async update(id, data) {
        const [result] = await pool.execute(
            'UPDATE users SET ? WHERE id = ?',
            [data, id]
        );
        return result;
    }
}

module.exports = User;
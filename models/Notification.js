const pool = require('../config/db');

class Notification {
    // Create a notification
    static async create(notificationData) {
        const {
            user_id,
            user_type,
            title,
            message,
            type = 'system'
        } = notificationData;

        const [result] = await pool.execute(
            `INSERT INTO notifications (user_id, user_type, title, message, type, is_read, created_at) 
             VALUES (?, ?, ?, ?, ?, 0, NOW())`,
            [user_id, user_type, title, message, type]
        );
        return result.insertId;
    }

    // Get notifications for a user
    static async getByUser(userId, userType, limit = 20, offset = 0) {
        const [rows] = await pool.execute(
            `SELECT * FROM notifications 
             WHERE user_id = ? AND user_type = ? 
             ORDER BY created_at DESC 
             LIMIT ? OFFSET ?`,
            [userId, userType, limit, offset]
        );
        return rows;
    }

    // Get unread notification count
    static async getUnreadCount(userId, userType) {
        const [rows] = await pool.execute(
            `SELECT COUNT(*) as count FROM notifications 
             WHERE user_id = ? AND user_type = ? AND is_read = 0`,
            [userId, userType]
        );
        return rows[0].count;
    }

    // Mark notification as read
    static async markAsRead(notificationId, userId) {
        const [result] = await pool.execute(
            `UPDATE notifications 
             SET is_read = 1 
             WHERE id = ? AND user_id = ?`,
            [notificationId, userId]
        );
        return result;
    }

    // Mark all notifications as read for a user
    static async markAllAsRead(userId, userType) {
        const [result] = await pool.execute(
            `UPDATE notifications 
             SET is_read = 1 
             WHERE user_id = ? AND user_type = ? AND is_read = 0`,
            [userId, userType]
        );
        return result;
    }

    // Delete notification
    static async delete(notificationId, userId) {
        const [result] = await pool.execute(
            `DELETE FROM notifications WHERE id = ? AND user_id = ?`,
            [notificationId, userId]
        );
        return result;
    }

    // Delete old notifications (older than days)
    static async deleteOld(days = 30) {
        const [result] = await pool.execute(
            `DELETE FROM notifications 
             WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
            [days]
        );
        return result;
    }

    // Get notification by ID
    static async findById(notificationId) {
        const [rows] = await pool.execute(
            `SELECT * FROM notifications WHERE id = ?`,
            [notificationId]
        );
        return rows[0];
    }

    // Create bulk notifications
    static async createBulk(notifications) {
        if (!notifications.length) return [];
        
        const values = notifications.map(n => 
            `(${n.user_id}, '${n.user_type}', '${n.title.replace(/'/g, "''")}', '${n.message.replace(/'/g, "''")}', '${n.type}', 0, NOW())`
        ).join(',');
        
        const [result] = await pool.execute(
            `INSERT INTO notifications (user_id, user_type, title, message, type, is_read, created_at) 
             VALUES ${values}`
        );
        return result;
    }
}

module.exports = Notification;